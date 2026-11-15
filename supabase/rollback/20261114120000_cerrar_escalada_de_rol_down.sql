-- Reversa de 20261114120000_cerrar_escalada_de_rol.
-- OJO: esto VUELVE A ABRIR el hueco (cualquier usuario con sesión puede subirse de rol). Solo en emergencia, si la
-- migración rompe algo, y por el menor tiempo posible. Deja las dos funciones y el disparador exactamente como
-- estaban en producción el 2026-11-14 (definiciones leídas del catálogo ese día).

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'No puedes cambiar tu propio rol';
    END IF;
    IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
      RAISE EXCEPTION 'No puedes cambiar de restaurante';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prevent_self_role_escalation BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    INSERT INTO public.profiles (id, email, full_name, role, restaurant_id)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'waiter', NULL)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.profiles (id, email, full_name, role, restaurant_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      COALESCE(NEW.raw_user_meta_data->>'role','waiter'),
      COALESCE((NEW.raw_user_meta_data->>'restaurant_id')::uuid, public.current_restaurant_id())
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
