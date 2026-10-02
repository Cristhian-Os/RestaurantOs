-- Estado: APLICADA en producción el 2026-10-02 (verificada con roles simulados: el cajero solo hace SELECT; el admin puede todo).
-- Para revertir: recrear la política "Admin y cajero gestionan proveedores" FOR ALL con rol admin o cashier.
-- Proveedores: admin y cajero pueden VER la lista (el cajero la necesita para registrar
-- compras y gastos), pero solo el admin puede crear, editar o borrar.
-- Antes una sola política "ALL" dejaba escribir también al cajero.

DROP POLICY IF EXISTS "Admin y cajero gestionan proveedores" ON public.proveedores;

CREATE POLICY "Admin y cajero ven proveedores" ON public.proveedores
  FOR SELECT
  USING (
    (((SELECT public.get_user_role()) = ANY (ARRAY['admin'::text, 'cashier'::text]))
      AND restaurant_id = (SELECT public.current_restaurant_id()))
    OR (SELECT public.is_super_admin())
  );

CREATE POLICY "Solo admin crea proveedores" ON public.proveedores
  FOR INSERT
  WITH CHECK (
    (((SELECT public.get_user_role()) = 'admin')
      AND restaurant_id = (SELECT public.current_restaurant_id()))
    OR (SELECT public.is_super_admin())
  );

CREATE POLICY "Solo admin edita proveedores" ON public.proveedores
  FOR UPDATE
  USING (
    (((SELECT public.get_user_role()) = 'admin')
      AND restaurant_id = (SELECT public.current_restaurant_id()))
    OR (SELECT public.is_super_admin())
  )
  WITH CHECK (
    (((SELECT public.get_user_role()) = 'admin')
      AND restaurant_id = (SELECT public.current_restaurant_id()))
    OR (SELECT public.is_super_admin())
  );

CREATE POLICY "Solo admin borra proveedores" ON public.proveedores
  FOR DELETE
  USING (
    (((SELECT public.get_user_role()) = 'admin')
      AND restaurant_id = (SELECT public.current_restaurant_id()))
    OR (SELECT public.is_super_admin())
  );
