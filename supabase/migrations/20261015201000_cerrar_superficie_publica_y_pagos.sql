-- Cierra la superficie publica que la auditoria 2026-10-15 encontro abierta.
--  * Crea config_publica(uuid) e ingredientes_publicos(uuid): lectura publica minima de UN restaurante, para reemplazar
--    la lectura anonima de toda la tabla restaurant_config y de la vista ingredientes_menu_publico (se cierran en
--    20261015206000, fase B).
--  * order_total_cents, enforce_subscription_lifecycle y purge_restaurant eran ejecutables por anon/authenticated.
--  * Funciones de trigger ejecutables por anon/authenticated y funciones nuevas publicas por defecto.
--  * orders: el personal podia reescribir total/items/paid_at con un UPDATE directo. Ahora solo status y delivered_at,
--    y solo sobre pedidos activos (no se puede resucitar un pedido cancelado/completado).
--  * payments y subscriptions (con el JSON crudo de Wompi) las leia cualquier empleado: ahora solo admin.
--  * set_module_config: escritura atomica de una clave de modules_enabled (evita pisar categorias/agotados al
--    guardar el tema).
-- Reversa: supabase/rollback/20261015201000_cerrar_superficie_publica_y_pagos_down.sql

-- 1) Funciones que solo debe llamar el backend (service_role) ---------------------------------------------------
REVOKE ALL ON FUNCTION public.order_total_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_restaurant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_total_cents(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_lifecycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_restaurant(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.platform_billing_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_active() TO authenticated, service_role;

-- Las funciones de trigger no necesitan EXECUTE de nadie para dispararse.
DO $$
DECLARE r regprocedure;
BEGIN
  FOR r IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'pg_catalog.trigger'::regtype LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r);
  END LOOP;
END $$;

-- Las funciones nuevas ya no nacen ejecutables por anon: cada migracion concede lo que necesite expresamente.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- 2) Higiene de privilegios de tabla -------------------------------------------------------------------------------
--    TRUNCATE/REFERENCES/TRIGGER no los usa PostgREST ni deben existir. Y anon no escribe NUNCA directamente en una tabla
--    (el menu publico y la TV de cocina solo usan RPC): hoy solo la RLS lo impide; ahora tampoco tiene el privilegio.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m') LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t.relname);
  END LOOP;
END $$;

-- 3) Lectura publica minima del menu ------------------------------------------------------------------------------
-- (El cierre de la lectura anonima de restaurant_config y de la vista va en 20261015206000, que se aplica DESPUES de
--  publicar el frontend nuevo: el menu publico en cache sigue leyendo esas tablas hasta entonces.)
CREATE OR REPLACE FUNCTION public.config_publica(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(c) FROM (
    SELECT display_name, modules_enabled, logo_url, color_primario, promo_texto, promo_activo, whatsapp_numero,
           direccion, instagram_url, facebook_url, propina_sugerida_pct, portada_url, horario_activo,
           horario_apertura, horario_cierre, cerrado_manual, cerrado_mensaje
      FROM public.restaurant_config WHERE restaurant_id = p_restaurant_id LIMIT 1
  ) c;
$function$;

CREATE OR REPLACE FUNCTION public.ingredientes_publicos(p_restaurant_id uuid)
 RETURNS SETOF public.ingredientes_menu_publico
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.ingredientes_menu_publico WHERE restaurant_id = p_restaurant_id;
$function$;

REVOKE ALL ON FUNCTION public.config_publica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingredientes_publicos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.config_publica(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingredientes_publicos(uuid) TO anon, authenticated, service_role;

-- 4) orders: el personal solo avanza el estado; nada de reescribir total/items/pagos --------------------------------
REVOKE INSERT, UPDATE ON public.orders FROM anon, authenticated;
GRANT UPDATE (status, delivered_at) ON public.orders TO authenticated;

DROP POLICY IF EXISTS "Staff update order status" ON public.orders;
CREATE POLICY "Staff update order status" ON public.orders FOR UPDATE
  USING (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier'])
         AND restaurant_id = current_restaurant_id()
         AND status = ANY (ARRAY['pending','cooking','ready']))
  WITH CHECK (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier'])
         AND restaurant_id = current_restaurant_id()
         AND status = ANY (ARRAY['pending','cooking','ready']));

-- 5) Datos de pago visibles solo para el administrador ------------------------------------------------------------
DROP POLICY IF EXISTS pay_select_own ON public.payments;
CREATE POLICY pay_select_admin ON public.payments FOR SELECT
  USING (((restaurant_id = (SELECT current_restaurant_id())) AND (SELECT is_admin())) OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS subs_select_own ON public.subscriptions;
CREATE POLICY subs_select_admin ON public.subscriptions FOR SELECT
  USING (((restaurant_id = (SELECT current_restaurant_id())) AND (SELECT is_admin())) OR (SELECT is_super_admin()));

-- 6) Escritura atomica de una clave de modules_enabled -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_module_config(p_key text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid := public.current_restaurant_id(); v_res jsonb;
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede cambiar la configuración';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-zA-Z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Clave de configuración inválida';
  END IF;
  UPDATE public.restaurant_config
     SET modules_enabled = jsonb_set(COALESCE(modules_enabled, '{}'::jsonb), ARRAY[p_key], COALESCE(p_value, 'null'::jsonb), true),
         updated_at = now()
   WHERE restaurant_id = v_rid
  RETURNING modules_enabled INTO v_res;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontré la configuración del restaurante'; END IF;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_module_config(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_module_config(text, jsonb) TO authenticated, service_role;
