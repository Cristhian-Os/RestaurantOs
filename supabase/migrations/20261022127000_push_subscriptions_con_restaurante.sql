-- FASE A. push_subscriptions: la politica "Own push subscriptions" (FOR ALL USING user_id = auth.uid()) no tenia WITH CHECK,
-- asi que un usuario podia mover sus suscripciones push al restaurante de otro (hallazgo de supabase/tests/aislamiento_multitenant.sql).
-- El restaurante de la suscripcion debe ser el del propio perfil activo (o NULL: filas de antes de existir la columna).
-- Reversa: supabase/rollback/20261022127000_push_subscriptions_con_restaurante_down.sql
DROP POLICY IF EXISTS "Own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Own push subscriptions" ON public.push_subscriptions FOR ALL TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id AND (restaurant_id IS NULL OR restaurant_id = (SELECT public.current_restaurant_id())));
