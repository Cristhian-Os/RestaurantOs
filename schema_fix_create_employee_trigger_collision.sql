-- ============================================================
-- FIX: create_employee_profile chocaba con on_auth_user_created
-- Aplicado a Supabase vía MCP (migración: fix_create_employee_profile_trigger_collision)
-- ============================================================
-- Síntoma reportado: "no me deja agregar más empleados" — el admin
-- veía un error de "cuenta ya existe" al crear un empleado NUEVO
-- (nunca antes registrado).
--
-- Causa real (confirmada en postgres_logs): "duplicate key value
-- violates unique constraint profiles_pkey", NO un email duplicado.
--
-- El trigger on_auth_user_created (handle_new_user()) inserta una fila
-- en public.profiles apenas se crea CUALQUIER fila en auth.users,
-- usando el mismo raw_user_meta_data (full_name/role/restaurant_id)
-- que create_employee_profile ya pasaba. Esa función luego intentaba
-- su PROPIO INSERT INTO public.profiles sin ON CONFLICT — chocando
-- contra la fila que el trigger acababa de crear. Fallaba el 100% de
-- los intentos de crear un empleado nuevo desde que se agregó la
-- creación real de auth.users (ver schema_harden_create_employee.sql).
--
-- Fix: el INSERT propio de la función ahora es
-- "ON CONFLICT (id) DO UPDATE" — si el trigger ya creó la fila,
-- la sobreescribe con los datos completos que dio el admin
-- (teléfono, recovery_email, must_change_password), que el trigger
-- no conoce. No se tocó el trigger: lo siguen usando otros flujos
-- (self-signup de clientes, dueño de crear_restaurante).
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
  -- sobreescribe con los datos completos que dio el admin (teléfono,
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
$$;
