-- COPIA PREVIA de lo que las migraciones de Central modifican en PRODUCCIÓN (proyecto RestaurantOs).
-- Tomada el 2026-11-15 ~1:35 p.m. (hora Colombia), solo lectura, antes de aplicar nada.
-- El plan gratuito de Supabase no incluye copias de seguridad, así que esta es la copia de TODO lo que cambia.
-- Las migraciones 2, 3 y 4 solo CREAN objetos nuevos (se deshacen con sus archivos *_down.sql). Ninguna toca datos existentes.
-- La migración 1 es la única que reemplaza algo existente: estas funciones y el disparador. Para volver EXACTAMENTE a como estaba,
-- ejecutar este archivo completo (solo en emergencia: reabre el hueco de escalada de rol).
--
-- Perfiles por rol al tomar la copia (control de que ningún dato cambió): waiter 8, admin 5, cashier 3, kitchen 4, super_admin 1.

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
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

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
GRANT EXECUTE ON FUNCTION public.prevent_self_role_escalation() TO service_role;

-- Disparador original: solo UPDATE (la migración 1 lo amplía a INSERT).
DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_role_escalation();
-- El disparador on_auth_user_created (auth.users → handle_new_user) y profiles_set_updated_at no cambian.
