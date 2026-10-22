-- FASE A. El interruptor de Resti (restaurant_config.modules_enabled.resti_agent) lo decide SOLO el dueño de la
-- plataforma (plataforma_activar_resti, con 2FA). Hasta ahora el admin del restaurante podia escribir esa clave con un
-- UPDATE directo sobre modules_enabled (costo de IA y contrato comercial), y un guardado con datos viejos podia pisar la
-- activacion hecha por la plataforma. El trigger conserva SIEMPRE el valor existente cuando escribe un usuario que no es
-- dueño de la plataforma; service_role y las migraciones (auth.uid() NULL) no se restringen.
-- Reversa: supabase/rollback/20261022126000_proteger_interruptor_resti_down.sql
CREATE OR REPLACE FUNCTION public.proteger_interruptor_resti()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.modules_enabled := COALESCE(NEW.modules_enabled, '{}'::jsonb) - 'resti_agent';
    ELSIF NEW.modules_enabled IS DISTINCT FROM OLD.modules_enabled THEN
      NEW.modules_enabled := CASE
        WHEN OLD.modules_enabled ? 'resti_agent'
          THEN jsonb_set(COALESCE(NEW.modules_enabled, '{}'::jsonb), '{resti_agent}', OLD.modules_enabled->'resti_agent')
        ELSE COALESCE(NEW.modules_enabled, '{}'::jsonb) - 'resti_agent'
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.proteger_interruptor_resti() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proteger_interruptor_resti() TO service_role;

DROP TRIGGER IF EXISTS trg_proteger_interruptor_resti ON public.restaurant_config;
CREATE TRIGGER trg_proteger_interruptor_resti BEFORE INSERT OR UPDATE OF modules_enabled ON public.restaurant_config
  FOR EACH ROW EXECUTE FUNCTION public.proteger_interruptor_resti();
