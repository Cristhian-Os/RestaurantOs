-- ============================================================
-- TEAM: edición completa de empleados por el admin (aplicado vía MCP)
-- ============================================================
-- Permite que un administrador edite a CUALQUIER empleado: nombre,
-- email de acceso, contraseña, teléfono y rol.
--
-- Por qué una RPC SECURITY DEFINER:
--   supabase.auth.updateUser() solo cambia el email/contraseña del
--   usuario logueado. Para modificar a OTRO usuario hay que tocar
--   auth.users con privilegios elevados, por eso esta función corre
--   como definer y valida que quien la llama sea admin.

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_user_id   uuid,
  p_email     text DEFAULT NULL,
  p_password  text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL,
  p_role      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role text;
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_pw    text := NULLIF(trim(p_password), '');
BEGIN
  -- Solo un administrador puede modificar a otros usuarios
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
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

GRANT EXECUTE ON FUNCTION public.admin_update_employee(uuid, text, text, text, text, text) TO authenticated;
