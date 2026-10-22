-- Bloque 6: planes y precios en base de datos (una sola fuente), ciclo mensual/anual y desglose base + IVA.
-- Aditiva: tabla nueva, una columna nueva con valor por defecto, funciones nuevas. No toca filas existentes.
-- Precios en pesos COP con IVA incluido (decisión de Cristhian, 2026-10-20): Esencial 160.000, Pro 260.000, Premium 375.000,
-- sede extra 70.000. Anual = 10,5 meses. Prueba gratis: 7 días (la fija crear_restaurante, no cambia).
-- Premium queda NO disponible: incluye multi-sede y eso todavía no existe (regla "no vender lo que no existe").

CREATE TABLE IF NOT EXISTS public.planes (
  id                    text PRIMARY KEY CHECK (id IN ('emprende','pro','premium')),
  nombre                text NOT NULL,
  precio_mensual_cop    integer NOT NULL CHECK (precio_mensual_cop > 0),   -- con IVA incluido
  precio_sede_extra_cop integer CHECK (precio_sede_extra_cop IS NULL OR precio_sede_extra_cop > 0),
  max_mesas             integer CHECK (max_mesas IS NULL OR max_mesas > 0),   -- NULL = sin límite
  max_usuarios          integer CHECK (max_usuarios IS NULL OR max_usuarios > 0),
  max_docs_dian         integer CHECK (max_docs_dian IS NULL OR max_docs_dian > 0),
  disponible            boolean NOT NULL DEFAULT true,
  orden                 integer NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo se lee con las funciones de abajo

INSERT INTO public.planes (id, nombre, precio_mensual_cop, precio_sede_extra_cop, max_mesas, max_usuarios, max_docs_dian, disponible, orden) VALUES
  ('emprende', 'Esencial', 160000, NULL,  15,   5,    300,  true,  1),
  ('pro',      'Pro',      260000, NULL,  NULL, NULL, 1000, true,  2),
  ('premium',  'Premium',  375000, 70000, NULL, NULL, NULL, false, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_settings (clave, valor, descripcion) VALUES
  ('anual_meses', 10.5, 'Plan anual: cuántos meses se pagan por 12 de uso')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'mensual' CHECK (ciclo IN ('mensual','anual'));

-- Desglose de un total con IVA incluido: base = total / (1 + IVA), iva = lo que sobra.
CREATE OR REPLACE FUNCTION public.desglose_cobro(p_total_cop numeric)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('base_cop', b.base, 'iva_cop', p_total_cop - b.base, 'total_cop', p_total_cop)
  FROM (SELECT round(p_total_cop / (1 + coalesce((SELECT valor FROM platform_settings WHERE clave = 'iva_pct'), 19) / 100.0)) AS base) b;
$function$;

-- Total de un plan y ciclo (con IVA) y su desglose.
CREATE OR REPLACE FUNCTION public.precio_plan(p_plan text, p_ciclo text DEFAULT 'mensual')
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE v_mensual integer; v_total numeric;
BEGIN
  SELECT precio_mensual_cop INTO v_mensual FROM planes WHERE id = p_plan;
  IF v_mensual IS NULL THEN RAISE EXCEPTION 'Plan no valido'; END IF;
  IF p_ciclo NOT IN ('mensual','anual') THEN RAISE EXCEPTION 'Ciclo no valido (mensual o anual)'; END IF;
  v_total := CASE WHEN p_ciclo = 'anual'
                  THEN round(v_mensual * coalesce((SELECT valor FROM platform_settings WHERE clave = 'anual_meses'), 10.5))
                  ELSE v_mensual END;
  RETURN public.desglose_cobro(v_total);
END;
$function$;

-- Lista pública de planes (la usan la página de inicio, el panel del restaurante y el chatbot).
CREATE OR REPLACE FUNCTION public.planes_publicos()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nombre', p.nombre, 'disponible', p.disponible,
      'sede_extra_cop', p.precio_sede_extra_cop,
      'max_mesas', p.max_mesas, 'max_usuarios', p.max_usuarios, 'max_docs_dian', p.max_docs_dian,
      'mensual', public.precio_plan(p.id, 'mensual'),
      'anual',   public.precio_plan(p.id, 'anual')
    ) ORDER BY p.orden), '[]'::jsonb)
  FROM planes p;
$function$;

-- El administrador del restaurante elige plan y ciclo; el servidor calcula el monto (nunca el navegador).
CREATE OR REPLACE FUNCTION public.elegir_plan(p_plan text, p_ciclo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid; v_precio jsonb;
BEGIN
  SELECT restaurant_id INTO v_rid FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF v_rid IS NULL THEN RAISE EXCEPTION 'Solo el administrador del restaurante puede elegir el plan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM planes WHERE id = p_plan AND disponible) THEN RAISE EXCEPTION 'Ese plan todavia no esta disponible'; END IF;
  IF EXISTS (SELECT 1 FROM subscriptions WHERE restaurant_id = v_rid AND is_promo)
     OR EXISTS (SELECT 1 FROM restaurants WHERE id = v_rid AND is_founder) THEN RAISE EXCEPTION 'Tu restaurante tiene un acuerdo especial; el plan lo cambia el equipo de RestaurantOS'; END IF;
  v_precio := public.precio_plan(p_plan, p_ciclo);
  UPDATE subscriptions SET plan = p_plan, ciclo = p_ciclo, amount_in_cents = ((v_precio->>'total_cop')::numeric * 100)::integer
   WHERE restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tu restaurante no tiene suscripcion'; END IF;
  RETURN v_precio || jsonb_build_object('plan', p_plan, 'ciclo', p_ciclo);
END;
$function$;

-- El dueño cambia precios, límites o disponibilidad de un plan (queda en el registro de cambios).
CREATE OR REPLACE FUNCTION public.plataforma_guardar_plan(p_id text, p_datos jsonb, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_antes jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Escribe el motivo del cambio'; END IF;
  SELECT to_jsonb(p) INTO v_antes FROM planes p WHERE id = p_id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Plan no valido'; END IF;
  UPDATE planes SET
    nombre                = coalesce(p_datos->>'nombre', nombre),
    precio_mensual_cop    = coalesce((p_datos->>'precio_mensual_cop')::integer, precio_mensual_cop),
    precio_sede_extra_cop = CASE WHEN p_datos ? 'precio_sede_extra_cop' THEN (p_datos->>'precio_sede_extra_cop')::integer ELSE precio_sede_extra_cop END,
    max_mesas             = CASE WHEN p_datos ? 'max_mesas' THEN (p_datos->>'max_mesas')::integer ELSE max_mesas END,
    max_usuarios          = CASE WHEN p_datos ? 'max_usuarios' THEN (p_datos->>'max_usuarios')::integer ELSE max_usuarios END,
    max_docs_dian         = CASE WHEN p_datos ? 'max_docs_dian' THEN (p_datos->>'max_docs_dian')::integer ELSE max_docs_dian END,
    disponible            = coalesce((p_datos->>'disponible')::boolean, disponible),
    updated_at            = now()
  WHERE id = p_id;
  PERFORM public._auditar('guardar_plan', 'planes', NULL, v_antes, (SELECT to_jsonb(p) FROM planes p WHERE id = p_id), p_motivo);
  RETURN public.planes_publicos();
END;
$function$;

REVOKE ALL ON FUNCTION public.desglose_cobro(numeric), public.precio_plan(text, text), public.planes_publicos(),
  public.elegir_plan(text, text), public.plataforma_guardar_plan(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planes_publicos() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.elegir_plan(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_guardar_plan(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desglose_cobro(numeric), public.precio_plan(text, text) TO service_role;
