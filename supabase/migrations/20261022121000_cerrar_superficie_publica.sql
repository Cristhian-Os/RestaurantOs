-- FASE A (compatible con el frontend anterior). Cierra la superficie publica que la auditoria 2026-10-22 encontro abierta.
--  * order_total_cents, enforce_subscription_lifecycle y purge_restaurant eran ejecutables por anon/authenticated.
--  * Funciones de trigger ejecutables por anon/authenticated y funciones nuevas publicas por defecto.
--  * anon tenia INSERT/UPDATE/DELETE sobre casi todas las tablas (solo la RLS lo frenaba): se retira el privilegio.
--  * orders: el personal podia reescribir total/items/paid_at con un UPDATE directo. Ahora solo status, delivered_at y
--    updated_at, y solo sobre pedidos activos (no se puede resucitar un pedido cancelado/completado).
--  * payments y subscriptions (con el JSON crudo de Wompi) las leia cualquier empleado: ahora solo admin.
--  * set_module_config: escritura atomica de una clave de modules_enabled.
-- Reversa: supabase/rollback/20261022121000_cerrar_superficie_publica_down.sql
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

-- 3) orders: el personal solo avanza el estado; nada de reescribir total/items/pagos --------------------------------
REVOKE INSERT, UPDATE ON public.orders FROM anon, authenticated;
GRANT UPDATE (status, delivered_at, updated_at) ON public.orders TO authenticated;

DROP POLICY IF EXISTS "Staff update order status" ON public.orders;
CREATE POLICY "Staff update order status" ON public.orders FOR UPDATE
  USING (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier'])
         AND restaurant_id = current_restaurant_id()
         AND status = ANY (ARRAY['pending','cooking','ready']))
  WITH CHECK (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier'])
         AND restaurant_id = current_restaurant_id()
         AND status = ANY (ARRAY['pending','cooking','ready']));

-- 4) Datos de pago visibles solo para el administrador ------------------------------------------------------------
DROP POLICY IF EXISTS pay_select_own ON public.payments;
CREATE POLICY pay_select_admin ON public.payments FOR SELECT
  USING (((restaurant_id = (SELECT current_restaurant_id())) AND (SELECT is_admin())) OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS subs_select_own ON public.subscriptions;
CREATE POLICY subs_select_admin ON public.subscriptions FOR SELECT
  USING (((restaurant_id = (SELECT current_restaurant_id())) AND (SELECT is_admin())) OR (SELECT is_super_admin()));

-- 5) Escritura atomica de una clave de modules_enabled -------------------------------------------------------------
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
