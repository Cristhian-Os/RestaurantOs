-- Reversa de 20261016000003: quita la exigencia de 2 pasos de las cuatro funciones de plataforma.
DO $$
DECLARE f record; def text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('get_platform_overview', 'plataforma_activar_plan', 'plataforma_restablecer_admin', 'crear_restaurante')
  LOOP
    def := pg_get_functiondef(f.oid);
    EXECUTE replace(def, E'\n  PERFORM public._exigir_aal2();', '');
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public._exigir_aal2();
