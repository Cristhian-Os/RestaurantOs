-- Endurecimiento de seguridad + recuperacion del administrador (Bloque 3 del spec, parte critica para instalar).
-- 1) Un visitante SIN sesion ya no puede ejecutar funciones que son solo de personal (escriben datos o muestran costos).
--    Se dejan abiertas las del menu publico (comentarios, resenas, reacciones, pedido publico, cancelar/editar pedido
--    del cliente, crear_restaurante) y los ayudantes que usan las politicas RLS (is_admin, get_user_role, ...).
-- 2) cancelar_item_orden con ruta de busqueda fija.
-- 3) Auditoria de plataforma y restablecimiento de la contrasena de un administrador SIN depender del correo
--    (solo el dueño de la plataforma; la contrasena temporal obliga a cambiarla al entrar; se cierran sus sesiones).
-- 4) Contrasena minima de 8 caracteres al crear un restaurante.
-- Reversa: supabase/rollback/20261014183020_endurecer_seguridad_y_recuperacion_admin_down.sql

-- 1) Funciones solo de personal: fuera para anon (y PUBLIC), dentro para authenticated y service_role
REVOKE ALL ON FUNCTION
  public.registrar_venta_stock(uuid),
  public.calcular_costo_receta(uuid),
  public.change_my_password(text),
  public.complete_task_with_evidence(uuid, text, text, text),
  public.crear_orden_completa(uuid, jsonb, text, text, integer, text),
  public.crear_orden_con_custom(jsonb, jsonb, text, integer, uuid, text),
  public.crear_plato_custom(uuid, text, text, jsonb),
  public.delete_dish(uuid),
  public.guardar_receta_manual(uuid, jsonb),
  public.hacer_corte_caja(text),
  public.registrar_compra_proveedor(text, jsonb),
  public.registrar_llegada(uuid, text),
  public.revisar_llegada(uuid, boolean, text),
  public.cobrar_orden(uuid, text, numeric, numeric),
  public.cobrar_orden_inicial(uuid, text, numeric, numeric),
  public.cancelar_item_orden(uuid, integer),
  public.get_admin_metrics()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.registrar_venta_stock(uuid),
  public.calcular_costo_receta(uuid),
  public.change_my_password(text),
  public.complete_task_with_evidence(uuid, text, text, text),
  public.crear_orden_completa(uuid, jsonb, text, text, integer, text),
  public.crear_orden_con_custom(jsonb, jsonb, text, integer, uuid, text),
  public.crear_plato_custom(uuid, text, text, jsonb),
  public.delete_dish(uuid),
  public.guardar_receta_manual(uuid, jsonb),
  public.hacer_corte_caja(text),
  public.registrar_compra_proveedor(text, jsonb),
  public.registrar_llegada(uuid, text),
  public.revisar_llegada(uuid, boolean, text),
  public.cobrar_orden(uuid, text, numeric, numeric),
  public.cobrar_orden_inicial(uuid, text, numeric, numeric),
  public.cancelar_item_orden(uuid, integer),
  public.get_admin_metrics()
TO authenticated, service_role;

-- El limitador solo lo llaman funciones internas (SECURITY DEFINER): nadie debe poder gastar la cuota de otro
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- 2) Ruta de busqueda fija
ALTER FUNCTION public.cancelar_item_orden(uuid, integer) SET search_path = public;

-- 3) Auditoria de plataforma y recuperacion de administrador
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  actor_id       uuid,
  action         text NOT NULL,
  restaurant_id  uuid,
  target_user_id uuid,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lee la auditoria de plataforma" ON public.platform_audit_log
  FOR SELECT TO authenticated USING (( SELECT public.is_super_admin()));

CREATE OR REPLACE FUNCTION public.plataforma_restablecer_admin(p_email text, p_password_temporal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_email text := lower(trim(p_email)); v_pw text := trim(p_password_temporal); v_uid uuid; v_rid uuid; v_role text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  IF length(v_pw) < 8 THEN RAISE EXCEPTION 'La contraseña temporal debe tener al menos 8 caracteres'; END IF;
  SELECT id, restaurant_id, role INTO v_uid, v_rid, v_role FROM public.profiles WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No encontré un usuario con ese correo'; END IF;
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Solo se restablece la contraseña de administradores de restaurante'; END IF;
  UPDATE auth.users SET encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = now() WHERE id = v_uid;
  UPDATE public.profiles SET must_change_password = true WHERE id = v_uid;
  DELETE FROM auth.sessions WHERE user_id = v_uid;
  INSERT INTO public.platform_audit_log (actor_id, action, restaurant_id, target_user_id, detail)
  VALUES (auth.uid(), 'restablecer_contrasena_admin', v_rid, v_uid, jsonb_build_object('email', v_email));
  RETURN jsonb_build_object('status', 'ok');
END $$;

REVOKE ALL ON FUNCTION public.plataforma_restablecer_admin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_restablecer_admin(text, text) TO authenticated;

-- 4) Contrasena minima de 8 al crear un restaurante (misma firma: no se duplica la funcion)
CREATE OR REPLACE FUNCTION public.crear_restaurante(p_restaurant_name text, p_owner_email text, p_owner_password text, p_owner_full_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_base text; v_slug text; v_domain text; v_rid uuid; v_user_id uuid;
  v_email text := lower(trim(p_owner_email));
  v_pass  text := trim(p_owner_password);
  v_n int := 1; v_promo boolean; v_plan text; v_trial timestamptz;
  v_amount int;
  v_headers jsonb;
  v_ip text;
BEGIN
  IF length(trim(p_restaurant_name)) < 2 THEN RAISE EXCEPTION 'Nombre de restaurante muy corto'; END IF;
  IF strpos(v_email,'@') < 2 OR strpos(v_email,'.') = 0 THEN RAISE EXCEPTION 'Email invalido'; END IF;
  IF length(v_pass) < 8 THEN RAISE EXCEPTION 'La contrasena debe tener al menos 8 caracteres'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email=v_email) THEN RAISE EXCEPTION 'Ya existe una cuenta con ese email'; END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL;
  END;
  v_ip := coalesce(
    v_headers->>'cf-connecting-ip',
    nullif(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), ''),
    'sin-ip'
  );
  IF NOT public.check_rate_limit('signup:' || v_ip, 3, 600) THEN
    RAISE EXCEPTION 'Demasiados intentos de registro, espera unos minutos antes de volver a intentar';
  END IF;

  v_base := public.generate_slug(p_restaurant_name);
  IF v_base='' THEN v_base:='restaurante'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug=v_slug) LOOP
    v_n := v_n + 1; v_slug := v_base || v_n::text;
  END LOOP;
  v_domain := v_slug || '.com';

  -- Promo: primeros 5 registros nuevos con is_promo → Premium gratis de por vida
  -- (el fundador tiene is_promo=false, así que NO cuenta aquí)
  v_promo := (SELECT count(*) FROM public.restaurants WHERE is_promo) < 5;
  IF v_promo THEN v_plan := 'premium'; v_trial := NULL; v_amount := 68000000;
  ELSE            v_plan := 'trial';   v_trial := now() + interval '7 days'; v_amount := NULL;
  END IF;

  INSERT INTO public.restaurants (name, slug, email_domain, plan, is_promo, trial_ends_at)
  VALUES (trim(p_restaurant_name), v_slug, v_domain, v_plan, v_promo, v_trial)
  RETURNING id INTO v_rid;

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, role, aud, created_at, updated_at, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', v_email,
    crypt(v_pass, gen_salt('bf')), NOW(),
    jsonb_build_object('full_name', COALESCE(NULLIF(trim(p_owner_full_name),''), split_part(v_email,'@',1)),
                       'role','admin','restaurant_id', v_rid),
    'authenticated','authenticated', NOW(), NOW(), false, '', '', '', ''
  );

  INSERT INTO public.profiles (id, email, full_name, role, active, restaurant_id)
  VALUES (v_user_id, v_email, COALESCE(NULLIF(trim(p_owner_full_name),''), split_part(v_email,'@',1)), 'admin', true, v_rid)
  ON CONFLICT (id) DO UPDATE SET role='admin', restaurant_id=v_rid, active=true;

  UPDATE public.restaurants SET owner_id=v_user_id WHERE id=v_rid;
  INSERT INTO public.restaurant_config (display_name, restaurant_id)
  VALUES (trim(p_restaurant_name), v_rid) ON CONFLICT (restaurant_id) DO NOTHING;

  INSERT INTO public.subscriptions (restaurant_id, plan, status, amount_in_cents, is_promo, trial_ends_at)
  VALUES (v_rid, v_plan, CASE WHEN v_promo THEN 'active' ELSE 'trialing' END, v_amount, v_promo, v_trial)
  ON CONFLICT (restaurant_id) DO NOTHING;

  RETURN jsonb_build_object('restaurant_id', v_rid, 'slug', v_slug,
    'email_domain', v_domain, 'plan', v_plan, 'is_promo', v_promo, 'status','ok');
END; $function$;
