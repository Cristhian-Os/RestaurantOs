-- Reversa de 20261022120000_perfiles_acceso_y_cuentas (restaura las definiciones y privilegios previos; el estado
-- anterior era VULNERABLE: usar solo para volver atras ante un incidente).
DROP FUNCTION IF EXISTS public.set_employee_active(uuid, boolean);
DROP FUNCTION IF EXISTS public.eliminar_empleado(uuid);
DROP FUNCTION IF EXISTS public.config_publica(uuid);
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
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role = 'super_admin');
$function$;
CREATE OR REPLACE FUNCTION public.admin_update_employee(p_user_id uuid, p_email text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_rid  uuid;
  v_target_rid  uuid;
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_pw    text := NULLIF(trim(p_password), '');
BEGIN
  -- Solo un administrador puede modificar a otros usuarios
  SELECT role, restaurant_id INTO v_caller_role, v_caller_rid FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;

  -- El empleado a modificar debe pertenecer AL MISMO restaurante del admin
  -- (evita que un admin de un restaurante secuestre cuentas de otro restaurante)
  SELECT restaurant_id INTO v_target_rid FROM public.profiles WHERE id = p_user_id;
  IF v_target_rid IS NULL OR v_target_rid IS DISTINCT FROM v_caller_rid THEN
    RAISE EXCEPTION 'No autorizado: ese empleado no pertenece a tu restaurante';
  END IF;

  IF p_role IS NOT NULL AND trim(p_role) NOT IN ('admin','waiter','kitchen','cashier','client') THEN
    RAISE EXCEPTION 'Rol inválido';
  END IF;

  -- Cambiar email (en auth.users y profiles)
  IF v_email IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email AND id <> p_user_id) THEN
      RAISE EXCEPTION 'Ya existe una cuenta con ese email';
    END IF;
    UPDATE auth.users SET
      email                  = v_email,
      email_confirmed_at     = COALESCE(email_confirmed_at, NOW()),
      email_change           = '',
      email_change_token_new = '',
      updated_at             = NOW()
    WHERE id = p_user_id;
    UPDATE public.profiles SET email = v_email WHERE id = p_user_id;
  END IF;

  -- Cambiar contraseña
  IF v_pw IS NOT NULL THEN
    IF length(v_pw) < 6 THEN
      RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
    END IF;
    UPDATE auth.users SET
      encrypted_password = crypt(v_pw, gen_salt('bf')),
      updated_at         = NOW()
    WHERE id = p_user_id;
  END IF;

  -- Datos del perfil (full_name, phone, role)
  UPDATE public.profiles SET
    full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
    phone     = CASE WHEN p_phone IS NULL THEN phone ELSE NULLIF(trim(p_phone), '') END,
    role      = COALESCE(NULLIF(trim(p_role), ''), role)
  WHERE id = p_user_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_employee_profile(p_email text, p_full_name text, p_role text, p_password text DEFAULT NULL::text, p_recovery_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile_id UUID;
  v_caller_role TEXT;
  v_caller_rid UUID;
  v_existing_id UUID;
  v_existing_rid UUID;
  v_email TEXT := lower(trim(p_email));
  v_pw TEXT := NULLIF(trim(p_password), '');
BEGIN
  SELECT role, restaurant_id INTO v_caller_role, v_caller_rid
  FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;

  IF trim(p_role) NOT IN ('admin','waiter','kitchen','cashier','client') THEN
    RAISE EXCEPTION 'Rol inválido';
  END IF;

  SELECT id, restaurant_id INTO v_existing_id, v_existing_rid
  FROM public.profiles WHERE email = v_email;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_rid IS DISTINCT FROM v_caller_rid THEN
      RAISE EXCEPTION 'Ya existe una cuenta con ese email en otro restaurante';
    END IF;
    UPDATE public.profiles SET
      full_name = p_full_name,
      role      = p_role,
      phone     = p_phone,
      recovery_email = p_recovery_email
    WHERE id = v_existing_id
    RETURNING id INTO v_profile_id;
    RETURN jsonb_build_object('profile_id', v_profile_id, 'status', 'updated');
  END IF;

  IF v_pw IS NULL OR length(v_pw) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  v_profile_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, role, aud, created_at, updated_at, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_profile_id, '00000000-0000-0000-0000-000000000000', v_email,
    crypt(v_pw, gen_salt('bf')), NOW(),
    jsonb_build_object('full_name', p_full_name, 'role', p_role, 'restaurant_id', v_caller_rid),
    'authenticated', 'authenticated', NOW(), NOW(), false, '', '', '', ''
  );

  -- ON CONFLICT: on_auth_user_created ya insertó una fila para este id
  -- (mismo trigger que corre para cualquier alta en auth.users). Se
  -- sobreescribe con los datos completos que dio el admin (telefono,
  -- recovery_email, must_change_password), que el trigger no conoce.
  INSERT INTO public.profiles (id, email, full_name, role, active, phone, recovery_email, restaurant_id, must_change_password)
  VALUES (v_profile_id, v_email, p_full_name, p_role, true, p_phone, p_recovery_email, v_caller_rid, true)
  ON CONFLICT (id) DO UPDATE SET
    email                 = EXCLUDED.email,
    full_name             = EXCLUDED.full_name,
    role                  = EXCLUDED.role,
    active                = EXCLUDED.active,
    phone                 = EXCLUDED.phone,
    recovery_email        = EXCLUDED.recovery_email,
    restaurant_id         = EXCLUDED.restaurant_id,
    must_change_password  = EXCLUDED.must_change_password;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'status', 'created');
END;
$function$;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles TO authenticated;
