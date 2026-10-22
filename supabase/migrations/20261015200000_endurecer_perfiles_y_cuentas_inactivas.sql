-- Cierra la escalada de privilegios sobre profiles y hace que "inactivo" signifique inactivo.
-- Hallazgos de la auditoria 2026-10-15:
--  C1  prevent_self_role_escalation comprobaba current_user IN ('authenticated','anon'), pero es SECURITY DEFINER:
--      ahi current_user es el dueño de la funcion, asi que el trigger nunca bloqueaba nada y cualquier usuario
--      podia hacer PATCH /profiles {"role":"super_admin"}. La defensa real pasa a ser el privilegio por columna.
--  C2  handle_new_user leia role y restaurant_id de raw_user_meta_data (controlado por quien se registra).
--      crear_restaurante y create_employee_profile ya insertan el perfil completo con ON CONFLICT DO UPDATE,
--      asi que el trigger solo necesita crear una fila minima y sin privilegios.
--  C3  Ninguna funcion auxiliar miraba profiles.active: un empleado desactivado seguia operando.
-- Ademas: set_employee_active / eliminar_empleado (desactivar de verdad: perfil + baneo + sesiones) y contraseñas
-- minimas de 8 caracteres en los RPC de empleados.
-- Reversa: supabase/rollback/20261015200000_endurecer_perfiles_y_cuentas_inactivas_down.sql

-- 1) Privilegios por columna: authenticated solo edita datos personales de su propio perfil (la RLS limita a la fila).
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, avatar_url, recovery_email) ON public.profiles TO authenticated;
REVOKE INSERT ON public.profiles FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon, authenticated;

-- 2) Trigger de respaldo (defensa en profundidad): ya no depende de current_user.
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- auth.uid() es NULL cuando escribe service_role, el editor SQL o una migracion: no se restringe.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'Solo el dueño de la plataforma puede asignar super_admin';
    END IF;
    IF auth.uid() = OLD.id AND (
         NEW.role IS DISTINCT FROM OLD.role
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.active IS DISTINCT FROM OLD.active
    ) THEN
      RAISE EXCEPTION 'No puedes cambiar tu propio rol, restaurante ni estado';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) handle_new_user: nunca confia en la metadata del cliente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Fila minima y sin privilegios. Los perfiles reales los completan crear_restaurante y create_employee_profile.
  INSERT INTO public.profiles (id, email, full_name, role, restaurant_id, active)
  VALUES (NEW.id, NEW.email,
          COALESCE(NULLIF(left(NEW.raw_user_meta_data->>'full_name', 120), ''), split_part(NEW.email,'@',1)),
          'client', NULL, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 4) Las funciones auxiliares de RLS solo reconocen perfiles activos.
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT role FROM public.profiles WHERE id = auth.uid() AND active; $function$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT restaurant_id FROM public.profiles WHERE id = auth.uid() AND active; $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND active);
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin' AND active);
$function$;

-- 5) Desactivar / eliminar empleados de verdad (perfil + auth.users + sesiones).
CREATE OR REPLACE FUNCTION public.set_employee_active(p_employee_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid := public.current_restaurant_id(); v_target public.profiles%ROWTYPE;
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_employee_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese empleado no pertenece a tu restaurante'; END IF;
  IF p_employee_id = auth.uid() THEN RAISE EXCEPTION 'No puedes desactivarte a ti mismo'; END IF;
  IF v_target.role = 'super_admin' THEN RAISE EXCEPTION 'No autorizado'; END IF;

  UPDATE public.profiles SET active = COALESCE(p_active, false) WHERE id = p_employee_id;
  UPDATE auth.users SET banned_until = CASE WHEN COALESCE(p_active, false) THEN NULL ELSE 'infinity'::timestamptz END
   WHERE id = p_employee_id;
  IF NOT COALESCE(p_active, false) THEN
    DELETE FROM auth.sessions WHERE user_id = p_employee_id;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'active', COALESCE(p_active, false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_empleado(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid := public.current_restaurant_id(); v_target public.profiles%ROWTYPE;
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_employee_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese empleado no pertenece a tu restaurante'; END IF;
  IF p_employee_id = auth.uid() THEN RAISE EXCEPTION 'No puedes eliminarte a ti mismo'; END IF;
  IF v_target.role = 'super_admin' THEN RAISE EXCEPTION 'No autorizado'; END IF;

  DELETE FROM public.employee_schedules WHERE employee_id = p_employee_id;
  DELETE FROM public.push_subscriptions WHERE user_id = p_employee_id;
  UPDATE public.profiles SET active = false, full_name = 'Empleado eliminado', phone = NULL, avatar_url = NULL,
         recovery_email = NULL
   WHERE id = p_employee_id;
  UPDATE auth.users SET banned_until = 'infinity'::timestamptz WHERE id = p_employee_id;
  DELETE FROM auth.sessions WHERE user_id = p_employee_id;
  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.set_employee_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eliminar_empleado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_empleado(uuid) TO authenticated;

-- 6) Contraseñas minimas de 8 caracteres (alineado con crear_restaurante y plataforma_restablecer_admin).
CREATE OR REPLACE FUNCTION public.change_my_password(p_new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_pw text := trim(p_new_password);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF length(v_pw) < 8 THEN RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres'; END IF;
  UPDATE auth.users SET encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = NOW() WHERE id = auth.uid();
  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();
  RETURN jsonb_build_object('status','ok');
END; $function$;

-- admin_update_employee y create_employee_profile: mismo minimo (el cuerpo no cambia salvo el 6 -> 8).
DO $$
DECLARE d text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.admin_update_employee(uuid,text,text,text,text,text)',
                            'public.create_employee_profile(text,text,text,text,text,text)'] LOOP
    d := pg_get_functiondef(fn::regprocedure);
    d := replace(d, 'length(v_pw) < 6', 'length(v_pw) < 8');
    d := replace(d, 'al menos 6 caracteres', 'al menos 8 caracteres');
    EXECUTE d;
  END LOOP;
END $$;
