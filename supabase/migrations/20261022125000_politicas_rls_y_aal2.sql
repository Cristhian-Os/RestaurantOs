-- FASE A (compatible con el frontend anterior y con el nuevo). Auditoria 2026-10-22, seccion 3.1: S-05, S-06, S-07, S-08
-- y la revision de todas las politicas de public (pg_policies).
--
--  * S-05  is_super_admin() exige ademas aal2 (segundo paso TOTP) en el JWT. Las ~20-40 politicas "OR is_super_admin()"
--          dejan de dar acceso a una sesion del dueño con solo contraseña. Conserva "AND active" (migracion 20261022120000).
--          NO se rompe el inicio de sesion: el dueño sigue leyendo/editando su propio perfil por id = auth.uid() con aal1,
--          y el panel de plataforma (MfaGate) ya pide el codigo antes de mostrarse.
--          ANTES DE APLICAR el dueño debe tener TOTP enrolado: entrar una vez al panel de plataforma (MfaGate lo enrola y lo
--          verifica) o hacerlo desde Authentication > Users > MFA. Sin factor verificado, el panel y todo lo que dependa de
--          is_super_admin() quedan cerrados (get_platform_overview, plataforma_*, crear_restaurante ya lo exigian).
--          Despues de aplicar, las sesiones abiertas del dueño siguen en aal1 hasta que vuelva a verificar el codigo.
--  * S-06  Cajero: antes tenia FOR ALL sobre cortes_caja, gastos y bases_caja (podia editar/borrar cierres).
--            cortes_caja : cajero lee; solo puede guardar el conteo (denominaciones) del corte reciente (trigger por columnas);
--                          no inserta (el corte lo hace hacer_corte_caja) ni borra. Admin conserva todo.
--            gastos      : cajero lee, registra, y corrige/borra solo gastos de dias SIN corte (el trigger gastos_dia_cerrado
--                          ya frenaba el DELETE; ahora tambien el UPDATE y el alta retroactiva en un dia cerrado).
--            bases_caja  : cajero solo lee; la base se registra con registrar_base_caja (RPC). Admin conserva todo.
--            gasto_items : cajero solo lee (las altas las hace registrar_compra_proveedor, SECURITY DEFINER).
--  * S-07  tasks: el empleado ya no puede cambiar restaurante, datos de la tarea ni marcarla "completed" sin evidencia
--          (solo pending/rejected -> in_progress; completar es por complete_task_with_evidence).
--          complete_task_with_evidence valida que la ruta sea <uid>/<id de la tarea>/<archivo> y que photo_url sea esa ruta
--          (frontend nuevo) o una URL https de Storage del bucket task-evidence con esa ruta (frontend anterior).
--  * S-08  ai_report_feedback: condicion tautologica r.restaurant_id = r.restaurant_id -> compara con la fila nueva.
--          (No era explotable por la RLS de ai_reports, pero la politica no decia lo que debia.)
--  * Revision de pg_policies: detalles_pedidos, custom_dishes y custom_dish_ingredients aceptaban filas propias que apuntaban
--          a pedidos/platos/ingredientes de OTRO restaurante (con el trigger descontar_ingredientes, definer, se bajaba el
--          stock ajeno). Ahora la referencia debe ser del mismo restaurante.
--  * profiles "Own profile update": WITH CHECK con IS NOT DISTINCT FROM para que el dueño (sin restaurante) siga editando su
--          propio perfil con aal1 (antes lo cubria la politica "Admin manages profiles" via is_super_admin()).
--  * NO se toca (se anota en el informe): S-09 profiles (ver nota al final).
-- Reversa: supabase/rollback/20261022125000_politicas_rls_y_aal2_down.sql

-- 1) S-05 -----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin' AND active)
     AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$function$;

-- 2) S-06 -----------------------------------------------------------------------------------------------------------
-- Helper sin parametro de restaurante (no es un oraculo para otros restaurantes): ¿el dia de esa fecha ya tiene corte en MI restaurante?
CREATE OR REPLACE FUNCTION public._mi_dia_con_corte(p_fecha timestamptz)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public._dia_con_corte(public.current_restaurant_id(), p_fecha);
$function$;
REVOKE ALL ON FUNCTION public._mi_dia_con_corte(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mi_dia_con_corte(timestamptz) TO authenticated, service_role;

-- 2a) cortes_caja
DROP POLICY IF EXISTS "Admin and cashier cortes" ON public.cortes_caja;
CREATE POLICY "cortes: admin y cajero leen" ON public.cortes_caja FOR SELECT
  USING (((( SELECT get_user_role()) = ANY (ARRAY['admin','cashier'])) AND restaurant_id = ( SELECT current_restaurant_id()))
         OR ( SELECT is_super_admin()));
CREATE POLICY "cortes: admin crea" ON public.cortes_caja FOR INSERT
  WITH CHECK ((( SELECT is_admin()) AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));
CREATE POLICY "cortes: admin edita" ON public.cortes_caja FOR UPDATE
  USING ((( SELECT is_admin()) AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()))
  WITH CHECK ((( SELECT is_admin()) AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));
-- El cajero solo guarda el conteo (denominaciones) del corte reciente; el trigger de abajo limita las columnas.
CREATE POLICY "cortes: cajero guarda el conteo del corte reciente" ON public.cortes_caja FOR UPDATE
  USING (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id()) AND created_at > now() - interval '1 day')
  WITH CHECK (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id()));
CREATE POLICY "cortes: admin borra" ON public.cortes_caja FOR DELETE
  USING ((( SELECT is_admin()) AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));

CREATE OR REPLACE FUNCTION public.cortes_caja_cajero_solo_conteo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo aplica a llamadas directas de la API (rol authenticated). Las funciones SECURITY DEFINER (hacer_corte_caja) y service_role no pasan por aqui.
  IF current_user IN ('authenticated', 'anon') AND public.get_user_role() = 'cashier'
     AND (to_jsonb(NEW) - 'denominaciones') IS DISTINCT FROM (to_jsonb(OLD) - 'denominaciones') THEN
    RAISE EXCEPTION 'El cajero solo puede guardar el conteo del corte; los totales los calcula el sistema';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.cortes_caja_cajero_solo_conteo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cortes_caja_cajero_solo_conteo() TO service_role;
DROP TRIGGER IF EXISTS cortes_caja_cajero_solo_conteo ON public.cortes_caja;
CREATE TRIGGER cortes_caja_cajero_solo_conteo BEFORE UPDATE ON public.cortes_caja
  FOR EACH ROW EXECUTE FUNCTION public.cortes_caja_cajero_solo_conteo();

-- 2b) gastos
DROP POLICY IF EXISTS "Admin y cajero gestionan gastos" ON public.gastos;
CREATE POLICY "gastos: admin y cajero leen" ON public.gastos FOR SELECT
  USING (((( SELECT get_user_role()) = ANY (ARRAY['admin','cashier'])) AND restaurant_id = ( SELECT current_restaurant_id()))
         OR ( SELECT is_super_admin()));
CREATE POLICY "gastos: admin y cajero registran" ON public.gastos FOR INSERT
  WITH CHECK ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id()))
              OR ( SELECT is_super_admin())
              OR (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id())
                  AND (created_at > now() - interval '10 minutes' OR NOT ( SELECT _mi_dia_con_corte(created_at)))));
CREATE POLICY "gastos: admin edita" ON public.gastos FOR UPDATE
  USING ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()))
  WITH CHECK ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));
CREATE POLICY "gastos: cajero corrige los de dias sin corte" ON public.gastos FOR UPDATE
  USING (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id()) AND NOT ( SELECT _mi_dia_con_corte(created_at)))
  WITH CHECK (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id()) AND NOT ( SELECT _mi_dia_con_corte(created_at)));
CREATE POLICY "gastos: admin borra" ON public.gastos FOR DELETE
  USING ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));
CREATE POLICY "gastos: cajero borra los de dias sin corte" ON public.gastos FOR DELETE
  USING (( SELECT get_user_role()) = 'cashier' AND restaurant_id = ( SELECT current_restaurant_id()) AND NOT ( SELECT _mi_dia_con_corte(created_at)));

-- 2c) bases_caja: el cajero la registra por registrar_base_caja (RPC); aqui solo lee.
DROP POLICY IF EXISTS "Admin y cajero gestionan bases de caja" ON public.bases_caja;
CREATE POLICY "bases: admin y cajero leen" ON public.bases_caja FOR SELECT
  USING (((( SELECT get_user_role()) = ANY (ARRAY['admin','cashier'])) AND restaurant_id = ( SELECT current_restaurant_id()))
         OR ( SELECT is_super_admin()));
CREATE POLICY "bases: admin gestiona" ON public.bases_caja FOR ALL
  USING ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()))
  WITH CHECK ((( SELECT get_user_role()) = 'admin' AND restaurant_id = ( SELECT current_restaurant_id())) OR ( SELECT is_super_admin()));

-- 2d) gasto_items: el cajero solo lee
DROP POLICY IF EXISTS "Admin y cajero gestionan gasto_items" ON public.gasto_items;
CREATE POLICY "gasto_items: admin y cajero leen" ON public.gasto_items FOR SELECT
  USING (((get_user_role() = ANY (ARRAY['admin','cashier'])) AND restaurant_id = current_restaurant_id()) OR is_super_admin());
CREATE POLICY "gasto_items: admin gestiona" ON public.gasto_items FOR ALL
  USING ((get_user_role() = 'admin' AND restaurant_id = current_restaurant_id()) OR is_super_admin())
  WITH CHECK ((get_user_role() = 'admin' AND restaurant_id = current_restaurant_id()) OR is_super_admin());

-- 3) S-07 -----------------------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employee can update own task status" ON public.tasks;
CREATE POLICY "Employee can update own task status" ON public.tasks FOR UPDATE
  USING (( SELECT auth.uid()) = assigned_to AND restaurant_id = ( SELECT current_restaurant_id())
         AND status = ANY (ARRAY['pending','rejected','in_progress']))
  WITH CHECK (( SELECT auth.uid()) = assigned_to AND restaurant_id = ( SELECT current_restaurant_id())
              AND status = 'in_progress');

-- El empleado solo cambia el estado (pending/rejected -> in_progress); titulo, fechas, prioridad, creador y destinatario no.
CREATE OR REPLACE FUNCTION public.tasks_empleado_solo_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND auth.uid() = OLD.assigned_to
     AND NOT public.is_admin() AND NOT public.is_super_admin()
     AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Solo puedes cambiar el estado de tu tarea; completarla requiere la evidencia';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.tasks_empleado_solo_estado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_empleado_solo_estado() TO service_role;
DROP TRIGGER IF EXISTS tasks_empleado_solo_estado ON public.tasks;
CREATE TRIGGER tasks_empleado_solo_estado BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_empleado_solo_estado();

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
  -- La foto debe estar en la carpeta de quien la sube y de esa tarea: <uid>/<id de la tarea>/<archivo>
  IF p_storage_path IS NULL OR p_storage_path !~ ('^' || auth.uid()::text || '/' || p_task_id::text || '/[A-Za-z0-9._-]{1,120}$')
     OR p_storage_path ~ '\.\.' THEN
    RAISE EXCEPTION 'La ruta de la evidencia no es válida' USING ERRCODE = 'P0001';
  END IF;
  -- photo_url: la misma ruta (frontend nuevo) o una URL https de Storage del bucket task-evidence con esa ruta (frontend anterior).
  IF p_photo_url IS NULL OR length(p_photo_url) > 2000
     OR NOT (p_photo_url = p_storage_path
             OR (p_photo_url ~ '^https://[^/[:space:]]+/storage/v1/object/(public|sign|authenticated)/task-evidence/'
                 AND strpos(p_photo_url, '/task-evidence/' || p_storage_path) > 0)) THEN
    RAISE EXCEPTION 'La URL de la evidencia no es válida' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.task_evidence (task_id, uploaded_by, photo_url, storage_path, notes)
  VALUES (p_task_id, auth.uid(), p_photo_url, p_storage_path, p_notes) RETURNING * INTO v_evidence;
  UPDATE public.tasks SET status = 'completed', updated_at = NOW() WHERE id = p_task_id;
  RETURN json_build_object('task_id', p_task_id, 'evidence_id', v_evidence.id, 'status', 'completed');
END; $function$;

-- 4) S-08 -----------------------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "feedback ia: el admin opina sobre reportes suyos" ON public.ai_report_feedback;
CREATE POLICY "feedback ia: el admin opina sobre reportes suyos" ON public.ai_report_feedback FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = ( SELECT current_restaurant_id()) AND ( SELECT get_user_role()) = 'admin'
              AND user_id = ( SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM public.ai_reports r
                           WHERE r.id = ai_report_feedback.report_id AND r.restaurant_id = ai_report_feedback.restaurant_id));

-- 5) Referencias entre restaurantes en tablas de pedidos --------------------------------------------------------------
DROP POLICY IF EXISTS "Staff insert detalles" ON public.detalles_pedidos;
CREATE POLICY "Staff insert detalles" ON public.detalles_pedidos FOR INSERT
  WITH CHECK (( SELECT auth.role()) = 'authenticated' AND restaurant_id = ( SELECT current_restaurant_id())
              AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = detalles_pedidos.order_id AND o.restaurant_id = detalles_pedidos.restaurant_id)
              AND (dish_id IS NULL OR EXISTS (SELECT 1 FROM public.dishes d WHERE d.id = detalles_pedidos.dish_id AND d.restaurant_id = detalles_pedidos.restaurant_id)));

DROP POLICY IF EXISTS "Staff insert custom dishes" ON public.custom_dishes;
CREATE POLICY "Staff insert custom dishes" ON public.custom_dishes FOR INSERT
  WITH CHECK (( SELECT auth.role()) = 'authenticated' AND restaurant_id = ( SELECT current_restaurant_id())
              AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = custom_dishes.order_id AND o.restaurant_id = custom_dishes.restaurant_id));

DROP POLICY IF EXISTS "Staff manage custom ingredients" ON public.custom_dish_ingredients;
CREATE POLICY "Staff manage custom ingredients" ON public.custom_dish_ingredients
  USING (( SELECT auth.role()) = 'authenticated' AND restaurant_id = ( SELECT current_restaurant_id()))
  WITH CHECK (( SELECT auth.role()) = 'authenticated' AND restaurant_id = ( SELECT current_restaurant_id())
              AND EXISTS (SELECT 1 FROM public.custom_dishes c WHERE c.id = custom_dish_ingredients.custom_dish_id AND c.restaurant_id = custom_dish_ingredients.restaurant_id)
              AND EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.id = custom_dish_ingredients.ingrediente_id AND i.restaurant_id = custom_dish_ingredients.restaurant_id));

-- profiles: el dueño (restaurant_id NULL) conserva la edicion de su propio perfil con aal1.
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE
  USING (( SELECT auth.uid()) = id)
  WITH CHECK (( SELECT auth.uid()) = id AND restaurant_id IS NOT DISTINCT FROM ( SELECT current_restaurant_id()));

-- S-09 (profiles visible a todo el equipo) NO se cambia aqui: las pantallas de ventas, facturas e impresion leen id/full_name/role
-- de OTROS usuarios y TeamManager/Dashboard usan select(*) con email/phone; quitar filas o columnas (REVOKE por columna rompe
-- select('*')) dejaria nombres vacios y pantallas con error. Requiere un cambio de frontend (vista/RPC de directorio) antes.
