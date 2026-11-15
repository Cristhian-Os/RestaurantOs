-- Cierra la escalada de rol (hallada el 2026-11-14 al preparar RestaurantOS Central).
-- ESTADO: probada SOLO en el Postgres local (PGlite). NO aplicada en el proyecto de prueba ni en producción.
--         Producción exige copia previa y el "apruebo, aplica" de Cristhian.
--
-- Qué estaba mal (reproducido con supabase/tests/seguridad_escalada_rol.sql sobre las definiciones reales de producción):
--  1. prevent_self_role_escalation era SECURITY DEFINER. Dentro de una función así, current_user es el dueño de la
--     función (postgres), no quien hace la petición. Su condición "current_user IN ('authenticated','anon')" nunca se
--     cumplía, así que NO bloqueaba nada: cualquier usuario con sesión (mesero, cocina, cajero o admin) podía cambiarse
--     el rol con un UPDATE directo a profiles, incluso a super_admin.
--  2. El disparador solo cubría UPDATE: un administrador podía borrar un perfil de su restaurante y volver a
--     insertarlo como super_admin.
--  3. handle_new_user copiaba role y restaurant_id de raw_user_meta_data, que lo escribe quien se registra. Con el
--     registro público de Supabase Auth abierto, una cuenta nueva podía nacer como super_admin o como administrador
--     de un restaurante ajeno.
--
-- Qué cambia:
--  a) prevent_self_role_escalation pasa a SECURITY INVOKER (así current_user sí es quien hace la petición), cubre
--     también INSERT, y agrega una regla nueva: super_admin no se asigna desde la app por NINGÚN camino (ni sentencia
--     directa, ni función del servidor, ni llave de servicio). Solo el dueño, con SQL directo en el panel de Supabase.
--  b) handle_new_user ya no confía en lo que envía quien se registra: toda cuenta nace como mesero sin restaurante
--     (no ve nada). crear_restaurante y create_employee_profile ponen después el rol y el restaurante, ya validados
--     (las dos sobrescriben el perfil completo; verificado en producción el 2026-11-14).
-- No cambia: políticas, tablas, datos existentes ni las funciones del servidor.
-- Reversa: supabase/rollback/20261114120000_cerrar_escalada_de_rol_down.sql (vuelve a abrir el hueco: solo en emergencia).

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Sentencia directa de la app: el rol activo es authenticated o anon. Dentro de una función del servidor
  -- (SECURITY DEFINER) el rol activo es su dueño; por eso esas funciones sí pueden cambiar rol y restaurante.
  v_directo   boolean := current_user IN ('authenticated', 'anon');
  -- Petición que nace en la app, aunque pase por una función del servidor o use la llave de servicio.
  v_desde_app boolean := auth.role() IS NOT NULL;
BEGIN
  -- 1) super_admin no se asigna desde la app por ningún camino.
  IF NEW.role = 'super_admin' AND (v_directo OR v_desde_app) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'El rol de superadministrador no se puede asignar desde la aplicación';
    END IF;
    IF OLD.role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'El rol de superadministrador no se puede asignar desde la aplicación';
    END IF;
  END IF;
  -- 2) Cambios directos de rol o de restaurante: solo por las funciones del servidor, que validan a quien las llama.
  IF TG_OP = 'UPDATE' AND v_directo THEN
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

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- El rol y el restaurante NUNCA salen de raw_user_meta_data (lo escribe el propio usuario al registrarse).
  INSERT INTO public.profiles (id, email, full_name, role, restaurant_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'waiter', NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
