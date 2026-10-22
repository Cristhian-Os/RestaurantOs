-- FASE A (compatible con el frontend anterior). Cierra la escalada de privilegios sobre profiles y hace que
-- "inactivo" signifique inactivo. Hallazgos C1-C3 de docs/AUDITORIA_2026-10-22.md.
--  C1  prevent_self_role_escalation comprobaba current_user IN ('authenticated','anon') dentro de una funcion
--      SECURITY DEFINER: ahi current_user es el dueño de la funcion, asi que nunca bloqueaba nada y cualquier
--      usuario podia hacer PATCH /profiles {"role":"super_admin"}. La defensa real pasa a ser el privilegio por columna.
--  C2  handle_new_user leia role y restaurant_id de raw_user_meta_data (lo controla quien se registra).
--  C3  Ninguna funcion auxiliar miraba profiles.active: un empleado desactivado seguia operando.
-- Reversa: supabase/rollback/20261022120000_perfiles_acceso_y_cuentas_down.sql

-- 1) Privilegios por columna. `active` se conserva SOLO hasta la fase B (el frontend anterior aun lo actualiza directo);
--    la fase B lo retira cuando todo pasa por set_employee_active.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, avatar_url, recovery_email, active) ON public.profiles TO authenticated;
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

-- 3) handle_new_user: nunca confia en la metadata del cliente. Los perfiles reales los completan
--    crear_restaurante y create_employee_profile (ON CONFLICT DO UPDATE, con active = true).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
  IF v_target.role IN ('super_admin', 'admin') THEN RAISE EXCEPTION 'No autorizado: no puedes desactivar a otro administrador'; END IF;

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
  IF v_target.role IN ('super_admin', 'admin') THEN RAISE EXCEPTION 'No autorizado: no puedes eliminar a otro administrador'; END IF;

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

-- 6) Reglas de cuentas de empleados: contraseña minima de 8, un admin no toca a otro admin, y al cambiar
--    credenciales se cierran las sesiones abiertas de esa cuenta.
DO $$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef('public.admin_update_employee(uuid,text,text,text,text,text)'::regprocedure);
  d := replace(d, 'length(v_pw) < 6', 'length(v_pw) < 8');
  d := replace(d, 'al menos 6 caracteres', 'al menos 8 caracteres');
  n := (length(d) - length(replace(d, '  IF p_role IS NOT NULL AND trim(p_role)', ''))) / length('  IF p_role IS NOT NULL AND trim(p_role)');
  IF n <> 1 THEN RAISE EXCEPTION 'ancla admin_update_employee (rol) no encontrada'; END IF;
  d := replace(d, '  IF p_role IS NOT NULL AND trim(p_role)',
'  IF p_user_id <> auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN (''admin'',''super_admin'')) THEN
    RAISE EXCEPTION ''No autorizado: no puedes modificar a otro administrador'';
  END IF;
  IF p_user_id = auth.uid() AND p_role IS NOT NULL AND trim(p_role) <> ''admin'' THEN
    RAISE EXCEPTION ''No puedes quitarte a ti mismo el rol de administrador'';
  END IF;
  IF p_role IS NOT NULL AND trim(p_role)');
  IF position('  RETURN jsonb_build_object(''status'', ''ok'');' IN d) = 0 THEN RAISE EXCEPTION 'ancla admin_update_employee (return) no encontrada'; END IF;
  d := replace(d, '  RETURN jsonb_build_object(''status'', ''ok'');',
'  IF (v_pw IS NOT NULL OR v_email IS NOT NULL) AND p_user_id <> auth.uid() THEN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
  END IF;
  RETURN jsonb_build_object(''status'', ''ok'');');
  EXECUTE d;

  d := pg_get_functiondef('public.create_employee_profile(text,text,text,text,text,text)'::regprocedure);
  d := replace(d, 'length(v_pw) < 6', 'length(v_pw) < 8');
  d := replace(d, 'al menos 6 caracteres', 'al menos 8 caracteres');
  IF position('    UPDATE public.profiles SET
      full_name = p_full_name,' IN d) = 0 THEN RAISE EXCEPTION 'ancla create_employee_profile no encontrada'; END IF;
  -- Un email ya existente en el mismo restaurante solo se reutiliza si no es admin ni dueño de otro rol privilegiado.
  d := replace(d, '    UPDATE public.profiles SET
      full_name = p_full_name,',
'    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_existing_id AND role IN (''admin'',''super_admin'')) THEN
      RAISE EXCEPTION ''Ya existe un administrador con ese email'';
    END IF;
    UPDATE public.profiles SET
      active    = true,
      full_name = p_full_name,');
  EXECUTE d;
END $$;

-- 7) config_publica: lectura anonima acotada de la configuracion del restaurante (reemplaza el SELECT directo a la
--    tabla, que la fase B cierra). Solo columnas pensadas para el menu publico; nunca llaves ni contactos internos.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%L, c.%I', column_name, column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'restaurant_config'
     AND column_name IN ('restaurant_id','display_name','modules_enabled','logo_url','color_primario','color_acento','slogan',
                         'currency_code','promo_texto','promo_activo','whatsapp_numero','direccion','instagram_url',
                         'facebook_url','propina_sugerida_pct','portada_url','horario_activo','horario_apertura',
                         'horario_cierre','cerrado_manual','cerrado_mensaje','business_type','ciudad','mascota_url');
  IF cols IS NULL THEN RAISE EXCEPTION 'restaurant_config sin columnas publicas reconocibles'; END IF;
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.config_publica(p_restaurant_id uuid)
     RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $b$
      SELECT jsonb_build_object(%s)
        FROM public.restaurant_config c
        JOIN public.restaurants r ON r.id = c.restaurant_id
       WHERE c.restaurant_id = p_restaurant_id AND r.active
       LIMIT 1;
    $b$ $f$, cols);
END $$;
REVOKE ALL ON FUNCTION public.config_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.config_publica(uuid) TO anon, authenticated, service_role;
