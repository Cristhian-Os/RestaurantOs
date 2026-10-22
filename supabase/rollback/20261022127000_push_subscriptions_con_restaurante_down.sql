DROP POLICY IF EXISTS "Own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Own push subscriptions" ON public.push_subscriptions FOR ALL TO public USING ((SELECT auth.uid()) = user_id);
