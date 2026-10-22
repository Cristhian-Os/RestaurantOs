-- Reversa de 20261015201000_cerrar_superficie_publica_y_pagos.sql
-- ATENCION: vuelve a abrir la lectura anonima de restaurant_config de TODOS los restaurantes, la vista de ingredientes y
-- las funciones internas (hallazgos de la auditoria 2026-10-15). Solo para emergencias.
DROP FUNCTION IF EXISTS public.config_publica(uuid);
DROP FUNCTION IF EXISTS public.ingredientes_publicos(uuid);
DROP FUNCTION IF EXISTS public.set_module_config(text, jsonb);

-- (la lectura anonima de restaurant_config y de la vista se revierte con 20261015206000_..._down.sql)

GRANT EXECUTE ON FUNCTION public.order_total_cents(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_lifecycle() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_restaurant(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_billing_active() TO anon;
DO $$
DECLARE r regprocedure;
BEGIN
  FOR r IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'pg_catalog.trigger'::regtype LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

GRANT INSERT, UPDATE ON public.orders TO anon, authenticated;
DROP POLICY IF EXISTS "Staff update order status" ON public.orders;
CREATE POLICY "Staff update order status" ON public.orders FOR UPDATE
  USING (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier']) AND restaurant_id = current_restaurant_id())
  WITH CHECK (get_user_role() = ANY (ARRAY['waiter','kitchen','cashier']) AND restaurant_id = current_restaurant_id()
              AND status = ANY (ARRAY['pending','cooking','ready']));

DROP POLICY IF EXISTS pay_select_admin ON public.payments;
CREATE POLICY pay_select_own ON public.payments FOR SELECT
  USING ((restaurant_id = (SELECT current_restaurant_id())) OR (SELECT is_super_admin()));
DROP POLICY IF EXISTS subs_select_admin ON public.subscriptions;
CREATE POLICY subs_select_own ON public.subscriptions FOR SELECT
  USING ((restaurant_id = (SELECT current_restaurant_id())) OR (SELECT is_super_admin()));

-- anon recupera los privilegios de escritura que tenia (solo en tablas donde los tenia en produccion; la RLS sigue aplicando).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
            AND c.relname NOT IN ('aportes_caja','categorias_gasto','kitchen_tv_tokens','order_payments','platform_audit_log',
                                  'platform_secrets','restaurant_fiscal','restaurant_onboarding','cortes_caja_archivo') LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO anon', t.relname);
  END LOOP;
END $$;
