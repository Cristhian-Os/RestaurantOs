-- Módulo G (prompt maestro Resti): multi-sede. Un restaurante = una sede; una cuenta (un dueño) agrupa 1 o más sedes.
-- Diseño: la sede ACTIVA sigue siendo profiles.restaurant_id (así current_restaurant_id() y todas las políticas RLS
-- existentes siguen funcionando sin reescribirse). Solo cambiar_sede() la mueve, y solo entre sedes de las cuentas
-- que el usuario posee; el trigger prevent_self_role_escalation sigue impidiendo cambiarla por UPDATE directo.
-- Aditiva: tablas nuevas, una columna nueva en restaurants y otra en planes. No toca filas existentes.
-- Premium sigue NO disponible (planes.disponible = false) hasta que este módulo esté en producción y probado.
-- Reversa: supabase/rollback/20261022004544_multi_sede_down.sql

CREATE TABLE IF NOT EXISTS public.cuentas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id),
  nombre     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo se usa con las funciones de abajo

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas(id);
CREATE INDEX IF NOT EXISTS restaurants_cuenta_idx ON public.restaurants (cuenta_id) WHERE cuenta_id IS NOT NULL;

-- Cobro adicional por sede desde la 3 (precio en planes.precio_sede_extra_cop). Aquí solo se REGISTRA; el cobro
-- real por Wompi lo toma de esta tabla cuando se conecte.
CREATE TABLE IF NOT EXISTS public.sede_cargos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL REFERENCES public.cuentas(id),
  restaurant_id      uuid NOT NULL UNIQUE REFERENCES public.restaurants(id),
  monto_mensual_cop  integer NOT NULL CHECK (monto_mensual_cop > 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sede_cargos ENABLE ROW LEVEL SECURITY;

-- Tope de sedes por plan, validado en el servidor. NULL = sin tope.
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS max_sedes integer CHECK (max_sedes IS NULL OR max_sedes > 0);
UPDATE public.planes SET max_sedes = 1 WHERE id IN ('emprende', 'pro') AND max_sedes IS NULL;

-- Sedes que el usuario puede ver: la suya y las de cuentas que posee. El administrador de una sola sede ve solo la suya.
CREATE OR REPLACE FUNCTION public.mis_sedes()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.name, 'slug', r.slug, 'activa', r.active,
           'actual', r.id = public.current_restaurant_id()) ORDER BY r.created_at), '[]'::jsonb)
  FROM restaurants r
  WHERE auth.uid() IS NOT NULL
    AND (r.id = public.current_restaurant_id()
         OR r.cuenta_id IN (SELECT c.id FROM cuentas c WHERE c.owner_id = auth.uid()));
$function$;

-- Cambia la sede activa del dueño. El navegador solo elige entre las que el servidor autoriza aquí.
CREATE OR REPLACE FUNCTION public.cambiar_sede(p_restaurant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede cambiar de sede'; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurants r JOIN cuentas c ON c.id = r.cuenta_id
                  WHERE r.id = p_restaurant_id AND c.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Esa sede no es de tu cuenta';
  END IF;
  UPDATE profiles SET restaurant_id = p_restaurant_id WHERE id = auth.uid();
  RETURN public.mis_sedes();
END;
$function$;

-- El dueño crea una sede nueva (solo plan con varias sedes). Desde la 3.ª se registra el cobro adicional.
CREATE OR REPLACE FUNCTION public.crear_sede(p_nombre text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_rid uuid := public.current_restaurant_id();
  v_r restaurants%ROWTYPE; v_cuenta uuid; v_plan text; v_max integer; v_extra integer;
  v_n integer; v_base text; v_slug text; v_i integer := 1; v_new uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede crear sedes'; END IF;
  IF length(trim(coalesce(p_nombre, ''))) < 2 THEN RAISE EXCEPTION 'Nombre de sede muy corto'; END IF;

  SELECT * INTO v_r FROM restaurants WHERE id = v_rid FOR UPDATE;   -- evita dos creaciones a la vez
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  v_cuenta := v_r.cuenta_id;
  IF v_cuenta IS NULL THEN
    IF v_r.owner_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Solo el dueño de la cuenta puede crear sedes'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM cuentas WHERE id = v_cuenta AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Solo el dueño de la cuenta puede crear sedes';
  END IF;

  SELECT s.plan INTO v_plan FROM subscriptions s WHERE s.restaurant_id = v_rid;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Tu restaurante no tiene suscripcion'; END IF;
  SELECT max_sedes, precio_sede_extra_cop INTO v_max, v_extra FROM planes WHERE id = v_plan;
  v_n := CASE WHEN v_cuenta IS NULL THEN 1 ELSE (SELECT count(*) FROM restaurants WHERE cuenta_id = v_cuenta) END;
  IF v_max IS NOT NULL AND v_n + 1 > v_max THEN RAISE EXCEPTION 'Tu plan no permite mas sedes'; END IF;
  IF v_n + 1 >= 3 AND v_extra IS NULL THEN RAISE EXCEPTION 'No hay precio de sede adicional configurado'; END IF;

  IF v_cuenta IS NULL THEN
    INSERT INTO cuentas (owner_id, nombre) VALUES (v_uid, v_r.name) RETURNING id INTO v_cuenta;
    UPDATE restaurants SET cuenta_id = v_cuenta WHERE id = v_rid;
  END IF;

  v_base := public.generate_slug(p_nombre);
  IF v_base = '' THEN v_base := 'sede'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM restaurants WHERE slug = v_slug) LOOP v_i := v_i + 1; v_slug := v_base || v_i::text; END LOOP;

  INSERT INTO restaurants (name, slug, email_domain, plan, is_promo, trial_ends_at, owner_id, cuenta_id)
  VALUES (trim(p_nombre), v_slug, v_slug || '.com', v_r.plan, false, NULL, v_uid, v_cuenta) RETURNING id INTO v_new;
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES (trim(p_nombre), v_new) ON CONFLICT (restaurant_id) DO NOTHING;
  INSERT INTO subscriptions (restaurant_id, plan, status, amount_in_cents, is_promo, trial_ends_at)
  VALUES (v_new, v_plan, 'active', NULL, false, NULL);

  IF v_n + 1 >= 3 THEN
    INSERT INTO sede_cargos (cuenta_id, restaurant_id, monto_mensual_cop) VALUES (v_cuenta, v_new, v_extra);
  END IF;

  INSERT INTO platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (v_uid, 'crear_sede', v_new, jsonb_build_object('cuenta_id', v_cuenta, 'sede_numero', v_n + 1, 'nombre', trim(p_nombre)));

  RETURN jsonb_build_object('restaurant_id', v_new, 'slug', v_slug, 'sede_numero', v_n + 1, 'cargo_adicional_cop', CASE WHEN v_n + 1 >= 3 THEN v_extra END);
END;
$function$;

REVOKE ALL ON FUNCTION public.mis_sedes(), public.cambiar_sede(uuid), public.crear_sede(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_sedes(), public.cambiar_sede(uuid), public.crear_sede(text) TO authenticated;
