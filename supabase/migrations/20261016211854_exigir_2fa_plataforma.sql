-- Bloque 3 (seguridad, P5): las acciones del panel de plataforma exigen sesión con verificación en dos pasos (aal2).
-- Aplicar SOLO después de que el super admin haya inscrito su app de códigos (MfaGate) y entrado una vez con código.
-- Inyecta `PERFORM public._exigir_aal2();` como primera instrucción de cada función (el resto del cuerpo no cambia).
CREATE OR REPLACE FUNCTION public._exigir_aal2()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Verifica tu código de 2 pasos para usar el panel de plataforma';
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._exigir_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._exigir_aal2() TO authenticated;

DO $$
DECLARE f record; def text; nuevo text;
BEGIN
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('get_platform_overview', 'plataforma_activar_plan', 'plataforma_restablecer_admin', 'crear_restaurante')
  LOOP
    def := pg_get_functiondef(f.oid);
    IF def LIKE '%_exigir_aal2%' THEN CONTINUE; END IF;
    nuevo := regexp_replace(def, '\mBEGIN\M', E'BEGIN\n  PERFORM public._exigir_aal2();', 'i');
    IF nuevo = def THEN RAISE EXCEPTION 'No se encontró BEGIN en %', f.proname; END IF;
    EXECUTE nuevo;
  END LOOP;
END $$;
