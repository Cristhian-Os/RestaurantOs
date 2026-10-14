-- TV de cocina por restaurante (reemplaza la lectura anonima de orders que se cerro en el Bloque 3).
-- La pagina public/kitchen-tv.html ya no consulta tablas: llama a 3 funciones que reciben una clave
-- secreta POR RESTAURANTE y solo devuelven / modifican pedidos de ese restaurante.
-- Reversa: supabase/rollback/20261014182846_tv_cocina_clave_por_restaurante_down.sql

CREATE TABLE IF NOT EXISTS public.kitchen_tv_tokens (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE
                DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at    timestamptz NOT NULL DEFAULT now(),
  rotated_at    timestamptz
);

ALTER TABLE public.kitchen_tv_tokens ENABLE ROW LEVEL SECURITY;

-- Solo el admin de ese restaurante (o super admin) puede ver la clave; nadie la escribe directo.
CREATE POLICY "Admin ve la clave de TV de su restaurante" ON public.kitchen_tv_tokens
  FOR SELECT TO authenticated
  USING (
    (( SELECT public.is_admin()) AND restaurant_id = ( SELECT public.current_restaurant_id()))
    OR ( SELECT public.is_super_admin())
  );

-- Una clave para cada restaurante que ya existe
INSERT INTO public.kitchen_tv_tokens (restaurant_id)
SELECT id FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;

-- Los restaurantes nuevos nacen con su clave
CREATE OR REPLACE FUNCTION public.tg_crear_clave_tv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.kitchen_tv_tokens (restaurant_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crear_clave_tv ON public.restaurants;
CREATE TRIGGER crear_clave_tv AFTER INSERT ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.tg_crear_clave_tv();

-- Resuelve la clave -> restaurante. Mismo mensaje si no existe (no revela nada).
CREATE OR REPLACE FUNCTION public._tv_restaurante(p_token text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'Clave de TV no valida'; END IF;
  SELECT restaurant_id INTO v FROM public.kitchen_tv_tokens WHERE token = p_token;
  IF v IS NULL THEN RAISE EXCEPTION 'Clave de TV no valida'; END IF;
  RETURN v;
END $$;

-- Pedidos activos + categorias de platos + tema/colores, todo de UN restaurante.
CREATE OR REPLACE FUNCTION public.tv_cocina_datos(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._tv_restaurante(p_token);
BEGIN
  RETURN jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'status', o.status, 'tipo_pedido', o.tipo_pedido, 'table_num', o.table_num,
        'items', o.items, 'notes', o.notes, 'paid_at', o.paid_at, 'created_at', o.created_at,
        'customer_name', o.customer_name, 'order_number_today', o.order_number_today
      ) ORDER BY o.created_at)
      FROM public.orders o
      WHERE o.restaurant_id = rid AND o.status IN ('pending','cooking','ready')), '[]'::jsonb),
    'dishes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'category', d.category))
                        FROM public.dishes d WHERE d.restaurant_id = rid), '[]'::jsonb),
    'modules_enabled', (SELECT c.modules_enabled FROM public.restaurant_config c WHERE c.restaurant_id = rid LIMIT 1)
  );
END $$;

-- Solo los pasos de cocina: pending -> cooking -> ready. Nunca completa ni cobra.
CREATE OR REPLACE FUNCTION public.tv_cocina_avanzar(p_token text, p_order_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._tv_restaurante(p_token); n int;
BEGIN
  IF p_status NOT IN ('cooking','ready') THEN RAISE EXCEPTION 'Estado no permitido desde la TV'; END IF;
  UPDATE public.orders SET status = p_status, updated_at = now()
   WHERE id = p_order_id AND restaurant_id = rid
     AND ((p_status = 'cooking' AND status = 'pending') OR (p_status = 'ready' AND status = 'cooking'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('status', CASE WHEN n = 1 THEN 'ok' ELSE 'sin_cambio' END);
END $$;

-- Cancelar desde la TV: solo pedidos de ese restaurante que no esten cerrados.
CREATE OR REPLACE FUNCTION public.tv_cocina_cancelar(p_token text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._tv_restaurante(p_token); n int;
BEGIN
  UPDATE public.orders SET status = 'cancelled', updated_at = now()
   WHERE id = p_order_id AND restaurant_id = rid AND status IN ('pending','cooking','ready');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('status', CASE WHEN n = 1 THEN 'ok' ELSE 'sin_cambio' END);
END $$;

-- Para el admin: ver / cambiar su clave sin tocar la base a mano.
CREATE OR REPLACE FUNCTION public.mi_clave_tv(p_rotar boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public.current_restaurant_id(); t text;
BEGIN
  IF NOT public.is_admin() OR rid IS NULL THEN RAISE EXCEPTION 'Solo el administrador'; END IF;
  IF p_rotar THEN
    UPDATE public.kitchen_tv_tokens
       SET token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), rotated_at = now()
     WHERE restaurant_id = rid RETURNING token INTO t;
  END IF;
  IF t IS NULL THEN
    INSERT INTO public.kitchen_tv_tokens (restaurant_id) VALUES (rid) ON CONFLICT (restaurant_id) DO NOTHING;
    SELECT token INTO t FROM public.kitchen_tv_tokens WHERE restaurant_id = rid;
  END IF;
  RETURN t;
END $$;

REVOKE ALL ON FUNCTION public._tv_restaurante(text), public.tg_crear_clave_tv() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_cocina_datos(text), public.tv_cocina_avanzar(text, uuid, text),
  public.tv_cocina_cancelar(text, uuid), public.mi_clave_tv(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_cocina_datos(text), public.tv_cocina_avanzar(text, uuid, text),
  public.tv_cocina_cancelar(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mi_clave_tv(boolean) TO authenticated;
