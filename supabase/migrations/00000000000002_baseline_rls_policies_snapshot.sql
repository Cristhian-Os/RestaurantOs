-- ============================================================
-- POLITICAS RLS (public schema) -- snapshot desde produccion
-- Generado automaticamente el 2026-09-26. NO editar a mano.
-- ============================================================

CREATE POLICY "Admin ve likes de comentarios" ON public.comentario_likes AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM comentarios_platos c
  WHERE ((c.id = comentario_likes.comment_id) AND ((is_admin() AND (c.restaurant_id = current_restaurant_id())) OR is_super_admin())))));

CREATE POLICY "Admin gestiona comentarios" ON public.comentarios_platos AS PERMISSIVE FOR ALL TO public
  USING (((is_admin() AND (restaurant_id = current_restaurant_id())) OR is_super_admin()))
  WITH CHECK (((is_admin() AND (restaurant_id = current_restaurant_id())) OR is_super_admin()));

CREATE POLICY "Admin and cashier cortes" ON public.cortes_caja AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT is_admin() AS is_admin) OR (( SELECT get_user_role() AS get_user_role) = 'cashier'::text)) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT is_admin() AS is_admin) OR (( SELECT get_user_role() AS get_user_role) = 'cashier'::text)) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Custom ingredients read authenticated" ON public.custom_dish_ingredients AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Staff manage custom ingredients" ON public.custom_dish_ingredients AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))))
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Custom dishes read authenticated" ON public.custom_dishes AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Staff insert custom dishes" ON public.custom_dishes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Detalles read authenticated" ON public.detalles_pedidos AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Staff insert detalles" ON public.detalles_pedidos AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Admin manages dishes" ON public.dishes AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Dishes visible to authenticated" ON public.dishes AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Public can read available dishes" ON public.dishes AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'anon'::text) AND (available = true) AND (availability_status <> 'discontinued'::text)));

CREATE POLICY "Admin manages schedules" ON public.employee_schedules AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Employee views own schedule" ON public.employee_schedules AS PERMISSIVE FOR SELECT TO public
  USING ((employee_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Admin y cajero gestionan gasto_items" ON public.gasto_items AS PERMISSIVE FOR ALL TO public
  USING ((((get_user_role() = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id())) OR is_super_admin()))
  WITH CHECK ((((get_user_role() = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id())) OR is_super_admin()));

CREATE POLICY "Admin y cajero gestionan gastos" ON public.gastos AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Admin manages ingredientes" ON public.ingredientes AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Ingredientes read authenticated" ON public.ingredientes AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Admin ve likes" ON public.likes_platos AS PERMISSIVE FOR SELECT TO public
  USING (((is_admin() AND (restaurant_id = current_restaurant_id())) OR is_super_admin()));

CREATE POLICY "Admin manages mesas" ON public.mesas AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Mesas visible to authenticated" ON public.mesas AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Staff update mesas" ON public.mesas AS PERMISSIVE FOR UPDATE TO public
  USING (((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['waiter'::text, 'cashier'::text, 'admin'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Admin full access orders" ON public.orders AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Staff update order status" ON public.orders AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_role() = ANY (ARRAY['waiter'::text, 'kitchen'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id())))
  WITH CHECK (((get_user_role() = ANY (ARRAY['waiter'::text, 'kitchen'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id()) AND (status = ANY (ARRAY['pending'::text, 'cooking'::text, 'ready'::text]))));

CREATE POLICY "Staff view orders" ON public.orders AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['waiter'::text, 'kitchen'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Waiter create orders" ON public.orders AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['waiter'::text, 'cashier'::text])) AND (( SELECT auth.uid() AS uid) = user_id) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "pay_select_own" ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING (((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Admin manages profiles" ON public.profiles AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Own profile update" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK (((( SELECT auth.uid() AS uid) = id) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

CREATE POLICY "Profiles visible to authenticated" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR (id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Admin manages recetas" ON public.recetas AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Recetas read authenticated" ON public.recetas AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Admin gestiona resenas" ON public.resenas_platos AS PERMISSIVE FOR ALL TO public
  USING (((is_admin() AND (restaurant_id = current_restaurant_id())) OR is_super_admin()))
  WITH CHECK (((is_admin() AND (restaurant_id = current_restaurant_id())) OR is_super_admin()));

CREATE POLICY "Admin write config" ON public.restaurant_config AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Auth read own config" ON public.restaurant_config AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin))));

CREATE POLICY "Public read config" ON public.restaurant_config AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.role() AS role) = 'anon'::text));

CREATE POLICY "rpc_admin_all" ON public.restaurant_payment_config AS PERMISSIVE FOR ALL TO public
  USING ((((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) AND ( SELECT is_admin() AS is_admin)) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) AND ( SELECT is_admin() AS is_admin)) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "subs_select_own" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
  USING (((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Admin can view all evidence" ON public.task_evidence AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Employee can submit evidence" ON public.task_evidence AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.uid() AS uid) = uploaded_by) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) AND (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_evidence.task_id) AND (tasks.assigned_to = ( SELECT auth.uid() AS uid)) AND (tasks.status = 'in_progress'::text))))));

CREATE POLICY "Employee can view own evidence" ON public.task_evidence AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = uploaded_by));

CREATE POLICY "Admin can manage all tasks" ON public.tasks AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK (((( SELECT is_admin() AS is_admin) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

CREATE POLICY "Employee can update own task status" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((( SELECT auth.uid() AS uid) = assigned_to) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = assigned_to) AND (status = ANY (ARRAY['in_progress'::text, 'completed'::text]))));

CREATE POLICY "Employee can view own tasks" ON public.tasks AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.uid() AS uid) = assigned_to) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));
