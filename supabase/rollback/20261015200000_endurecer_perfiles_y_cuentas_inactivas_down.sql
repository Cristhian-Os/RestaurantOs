-- Reversa de 20261015200000_endurecer_perfiles_y_cuentas_inactivas.sql
-- ATENCION: reabre la escalada de privilegios sobre profiles (C1/C2/C3 de la auditoria 2026-10-15). Solo para emergencias.
DROP FUNCTION IF EXISTS public.set_employee_active(uuid, boolean);
DROP FUNCTION IF EXISTS public.eliminar_empleado(uuid);

GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO anon;

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'No puedes cambiar tu propio rol'; END IF;
    IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN RAISE EXCEPTION 'No puedes cambiar de restaurante'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    INSERT INTO public.profiles (id, email, full_name, role, restaurant_id)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'waiter', NULL)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.profiles (id, email, full_name, role, restaurant_id)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
            COALESCE(NEW.raw_user_meta_data->>'role','waiter'),
            COALESCE((NEW.raw_user_meta_data->>'restaurant_id')::uuid, public.current_restaurant_id()))
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT role FROM public.profiles WHERE id = auth.uid(); $function$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT restaurant_id FROM public.profiles WHERE id = auth.uid(); $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'); $function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'); $function$;

CREATE OR REPLACE FUNCTION public.change_my_password(p_new_password text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_pw text := trim(p_new_password);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF length(v_pw) < 6 THEN RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres'; END IF;
  UPDATE auth.users SET encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = NOW() WHERE id = auth.uid();
  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();
  RETURN jsonb_build_object('status','ok');
END; $function$;

-- admin_update_employee / create_employee_profile: volver al minimo de 6 caracteres.
DO $$
DECLARE d text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.admin_update_employee(uuid,text,text,text,text,text)',
                            'public.create_employee_profile(text,text,text,text,text,text)'] LOOP
    d := pg_get_functiondef(fn::regprocedure);
    d := replace(d, 'length(v_pw) < 8', 'length(v_pw) < 6');
    d := replace(d, 'al menos 8 caracteres', 'al menos 6 caracteres');
    EXECUTE d;
  END LOOP;
END $$;
