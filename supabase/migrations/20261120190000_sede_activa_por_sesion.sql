-- Multi-sede: la sede activa es POR SESIÓN (por dispositivo), ya no por cuenta.
-- Antes cambiar_sede guardaba la sede en profiles.restaurant_id: al cambiar en un celular, todos los aparatos
-- con esa cuenta pasaban a la otra sede (y los de la sede A dejaban de servir para A). Ahora cada sesión
-- (cada inicio de sesión en cada aparato) guarda su propia sede; profiles.restaurant_id queda como la sede "de casa",
-- que es la que se usa al iniciar sesión.
-- La sesión sale del token (claim session_id). Todo lo que usa current_restaurant_id() (políticas, funciones,
-- valores por defecto y la app) sigue la sede de la sesión sin más cambios.
-- Seguridad: la sede de la sesión solo vale si el usuario sigue siendo dueño de la cuenta de esa sede; si no, se
-- ignora y se usa la de casa. La tabla no es accesible desde la app (solo las funciones).
-- También: admin_update_employee compara contra la sede activa de la sesión (antes, la de casa).
-- Reversa: supabase/rollback/20261120190000_sede_activa_por_sesion_down.sql

CREATE TABLE IF NOT EXISTS public.sede_activa_sesion (
  session_id    uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sede_activa_sesion_user_idx ON public.sede_activa_sesion (user_id);
ALTER TABLE public.sede_activa_sesion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sede_activa_sesion FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT s.restaurant_id
       FROM public.sede_activa_sesion s
       JOIN public.restaurants r ON r.id = s.restaurant_id
       JOIN public.cuentas c ON c.id = r.cuenta_id AND c.owner_id = auth.uid()
      WHERE s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        AND s.user_id = auth.uid()),
    (SELECT restaurant_id FROM public.profiles WHERE id = auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_sede(p_restaurant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sesion uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede cambiar de sede'; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurants r JOIN cuentas c ON c.id = r.cuenta_id
                  WHERE r.id = p_restaurant_id AND c.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Esa sede no es de tu cuenta';
  END IF;
  IF v_sesion IS NULL THEN RAISE EXCEPTION 'Vuelve a iniciar sesión para cambiar de sede'; END IF;
  INSERT INTO sede_activa_sesion (session_id, user_id, restaurant_id, updated_at)
  VALUES (v_sesion, auth.uid(), p_restaurant_id, now())
  ON CONFLICT (session_id) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id, user_id = EXCLUDED.user_id, updated_at = now();
  DELETE FROM sede_activa_sesion WHERE user_id = auth.uid() AND updated_at < now() - interval '60 days';   -- sesiones viejas
  RETURN public.mis_sedes();
END;
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
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  v_caller_rid := public.current_restaurant_id();   -- la sede activa de ESTA sesión
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
