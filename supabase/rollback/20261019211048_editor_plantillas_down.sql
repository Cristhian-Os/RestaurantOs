-- Reversa de 20261017000004: quita el editor y devuelve a super admin la escritura directa sobre las tablas de plantillas.
DROP FUNCTION IF EXISTS public.plataforma_restaurar_version_plantilla(text, integer);
DROP FUNCTION IF EXISTS public.plataforma_set_plantilla_activa(text, boolean);
DROP FUNCTION IF EXISTS public.plataforma_guardar_plantilla(text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.plataforma_listar_plantillas();
DROP FUNCTION IF EXISTS public._validar_payload_plantilla(jsonb);
DROP POLICY IF EXISTS "versiones de plantilla: super admin lee" ON public.restaurant_template_versions;
GRANT INSERT, UPDATE, DELETE ON public.restaurant_templates, public.restaurant_template_versions TO authenticated;
CREATE POLICY "plantillas: solo super admin escribe" ON public.restaurant_templates FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY "versiones de plantilla: solo super admin" ON public.restaurant_template_versions FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
