-- ============================================================
-- Harden: create_employee_profile
-- ------------------------------------------------------------
-- Historial de fixes aplicados a esta función (2026-09-25):
--
-- 1. Vulnerabilidad crítica: la función corría con SECURITY
--    DEFINER (privilegios elevados) pero no validaba quién la
--    llamaba. Cualquier usuario autenticado (mesero, cliente)
--    podía invocarla desde la consola del navegador y crear un
--    empleado con rol admin.
--
-- 2. Fuga cross-tenant: el fix inicial de (1) usaba
--    ON CONFLICT (email) DO UPDATE sin validar que el perfil
--    existente perteneciera al mismo restaurante del caller. Un
--    admin del restaurante A podía "crear empleado" con el email
--    de alguien del restaurante B y sobreescribirle rol/nombre.
--
-- 3. Login nunca se creaba: p_password se recibía pero nunca se
--    usaba para insertar en auth.users. profiles.id es FK a
--    auth.users(id), así que un "empleado creado" no podía
--    loguearse nunca. profiles.must_change_password confirma que
--    el flujo esperado es: admin crea con password temporal ->
--    empleado la cambia en su primer login vía
--    change_my_password(). Se completa creando el auth.user real,
--    siguiendo el mismo patrón que crear_restaurante().
--
-- Estado final: valida rol admin, aísla por restaurant_id (crea
-- nuevo si el email no existe, edita si existe en el MISMO
-- restaurante, rechaza si existe en OTRO), y crea el login real.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_employee_profile(
  p_email          TEXT,
  p_full_name      TEXT,
  p_role           TEXT,
  p_password       TEXT DEFAULT NULL,
  p_recovery_email TEXT DEFAULT NULL,
  p_phone          TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
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
    -- Empleado ya existe: solo se permite editar si es del mismo restaurante
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

  -- Empleado nuevo: crear login real en auth.users
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

  INSERT INTO public.profiles (id, email, full_name, role, active, phone, recovery_email, restaurant_id, must_change_password)
  VALUES (v_profile_id, v_email, p_full_name, p_role, true, p_phone, p_recovery_email, v_caller_rid, true);

  RETURN jsonb_build_object('profile_id', v_profile_id, 'status', 'created');
END;
$$;
