-- Reversa de 20261022125000_politicas_rls_y_aal2.sql (generada desde la base previa a la migracion, no escrita a mano).
-- ATENCION: vuelve a dar al cajero control total sobre cortes/gastos/bases, quita la exigencia de aal2 a is_super_admin()
-- y reabre las referencias entre restaurantes. Usar solo si la fase A rompe un flujo y no hay otra salida.

-- 1) Politicas nuevas fuera
DROP POLICY IF EXISTS "cortes: admin y cajero leen" ON public.cortes_caja;
DROP POLICY IF EXISTS "cortes: admin crea" ON public.cortes_caja;
DROP POLICY IF EXISTS "cortes: admin edita" ON public.cortes_caja;
DROP POLICY IF EXISTS "cortes: cajero guarda el conteo del corte reciente" ON public.cortes_caja;
DROP POLICY IF EXISTS "cortes: admin borra" ON public.cortes_caja;
DROP POLICY IF EXISTS "gastos: admin y cajero leen" ON public.gastos;
DROP POLICY IF EXISTS "gastos: admin y cajero registran" ON public.gastos;
DROP POLICY IF EXISTS "gastos: admin edita" ON public.gastos;
DROP POLICY IF EXISTS "gastos: cajero corrige los de dias sin corte" ON public.gastos;
DROP POLICY IF EXISTS "gastos: admin borra" ON public.gastos;
DROP POLICY IF EXISTS "gastos: cajero borra los de dias sin corte" ON public.gastos;
DROP POLICY IF EXISTS "bases: admin y cajero leen" ON public.bases_caja;
DROP POLICY IF EXISTS "bases: admin gestiona" ON public.bases_caja;
DROP POLICY IF EXISTS "gasto_items: admin y cajero leen" ON public.gasto_items;
DROP POLICY IF EXISTS "gasto_items: admin gestiona" ON public.gasto_items;
DROP TRIGGER IF EXISTS cortes_caja_cajero_solo_conteo ON public.cortes_caja;
DROP TRIGGER IF EXISTS tasks_empleado_solo_estado ON public.tasks;

-- 2) Politicas originales
DROP POLICY IF EXISTS "Admin and cashier cortes" ON public.cortes_caja;
CREATE POLICY "Admin and cashier cortes" ON public.cortes_caja AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT is_admin() AS is_admin) OR (( SELECT get_user_role() AS get_user_role) = 'cashier'::text)) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT is_admin() AS is_admin) OR (( SELECT get_user_role() AS get_user_role) = 'cashier'::text)) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));
DROP POLICY IF EXISTS "Admin y cajero gestionan gastos" ON public.gastos;
CREATE POLICY "Admin y cajero gestionan gastos" ON public.gastos AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));
DROP POLICY IF EXISTS "Admin y cajero gestionan bases de caja" ON public.bases_caja;
CREATE POLICY "Admin y cajero gestionan bases de caja" ON public.bases_caja AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));
DROP POLICY IF EXISTS "Admin y cajero gestionan gasto_items" ON public.gasto_items;
CREATE POLICY "Admin y cajero gestionan gasto_items" ON public.gasto_items AS PERMISSIVE FOR ALL TO public
  USING ((((get_user_role() = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id())) OR is_super_admin()))
  WITH CHECK ((((get_user_role() = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = current_restaurant_id())) OR is_super_admin()));
DROP POLICY IF EXISTS "Employee can update own task status" ON public.tasks;
CREATE POLICY "Employee can update own task status" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((( SELECT auth.uid() AS uid) = assigned_to) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = assigned_to) AND (status = ANY (ARRAY['in_progress'::text, 'completed'::text]))));
DROP POLICY IF EXISTS "feedback ia: el admin opina sobre reportes suyos" ON public.ai_report_feedback;
CREATE POLICY "feedback ia: el admin opina sobre reportes suyos" ON public.ai_report_feedback AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id)) AND (( SELECT get_user_role() AS get_user_role) = 'admin'::text) AND (user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM ai_reports r
  WHERE ((r.id = ai_report_feedback.report_id) AND (r.restaurant_id = r.restaurant_id))))));
DROP POLICY IF EXISTS "Staff insert detalles" ON public.detalles_pedidos;
CREATE POLICY "Staff insert detalles" ON public.detalles_pedidos AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));
DROP POLICY IF EXISTS "Staff insert custom dishes" ON public.custom_dishes;
CREATE POLICY "Staff insert custom dishes" ON public.custom_dishes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));
DROP POLICY IF EXISTS "Staff manage custom ingredients" ON public.custom_dish_ingredients;
CREATE POLICY "Staff manage custom ingredients" ON public.custom_dish_ingredients AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))))
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;
CREATE POLICY "Own profile update" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK (((( SELECT auth.uid() AS uid) = id) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))));

-- 3) Funciones originales
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin' AND active);
$function$
;
CREATE OR REPLACE FUNCTION public.complete_task_with_evidence(p_task_id uuid, p_photo_url text, p_storage_path text, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_task public.tasks%ROWTYPE; v_evidence public.task_evidence%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND assigned_to = auth.uid() AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada o no está en progreso' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.task_evidence (task_id, uploaded_by, photo_url, storage_path, notes)
  VALUES (p_task_id, auth.uid(), p_photo_url, p_storage_path, p_notes) RETURNING * INTO v_evidence;
  UPDATE public.tasks SET status = 'completed', updated_at = NOW() WHERE id = p_task_id;
  RETURN json_build_object('task_id', p_task_id, 'evidence_id', v_evidence.id, 'status', 'completed');
END; $function$
;

-- 4) Objetos nuevos fuera
DROP FUNCTION IF EXISTS public.cortes_caja_cajero_solo_conteo();
DROP FUNCTION IF EXISTS public.tasks_empleado_solo_estado();
DROP FUNCTION IF EXISTS public._mi_dia_con_corte(timestamptz);
