-- Reversa de 20261120190000_sede_activa_por_sesion: vuelve a la sede activa en profiles.restaurant_id.
-- OJO: después de esto, cambiar de sede vuelve a cambiar la sede de todos los aparatos de esa cuenta.
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_sede(p_restaurant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede cambiar de sede'; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurants r JOIN cuentas c ON c.id = r.cuenta_id
                  WHERE r.id = p_restaurant_id AND c.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Esa sede no es de tu cuenta';
  END IF;
  UPDATE profiles SET restaurant_id = p_restaurant_id WHERE id = auth.uid();
  RETURN public.mis_sedes();
END;
$function$;

-- admin_update_employee: volver a comparar contra profiles.restaurant_id del que llama.
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
  SELECT role, restaurant_id INTO v_caller_role, v_caller_rid FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;
  SELECT restaurant_id INTO v_target_rid FROM public.profiles WHERE id = p_user_id;
  IF v_target_rid IS NULL OR v_target_rid IS DISTINCT FROM v_caller_rid THEN
    RAISE EXCEPTION 'No autorizado: ese empleado no pertenece a tu restaurante';
  END IF;
  IF p_role IS NOT NULL AND trim(p_role) NOT IN ('admin','waiter','kitchen','cashier','client') THEN
    RAISE EXCEPTION 'Rol inválido';
  END IF;
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
  IF v_pw IS NOT NULL THEN
    IF length(v_pw) < 6 THEN
      RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
    END IF;
    UPDATE auth.users SET
      encrypted_password = crypt(v_pw, gen_salt('bf')),
      updated_at         = NOW()
    WHERE id = p_user_id;
  END IF;
  UPDATE public.profiles SET
    full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
    phone     = CASE WHEN p_phone IS NULL THEN phone ELSE NULLIF(trim(p_phone), '') END,
    role      = COALESCE(NULLIF(trim(p_role), ''), role)
  WHERE id = p_user_id;
  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

DROP TABLE IF EXISTS public.sede_activa_sesion;
