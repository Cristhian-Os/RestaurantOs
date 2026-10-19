-- Bloque 7, paso 2: crear_restaurante registra "¿cómo se enteró?" y el código de vendedor (Anexo C, sección 4).
-- Cuidado con las funciones sobrecargadas: se BORRA la versión de 4 parámetros y se crea una sola de 7 (los 3 nuevos son opcionales).
-- Reglas: el código de vendedor/aliado gana sobre cualquier otra respuesta; se valida aquí (existe, activo, vigente);
-- un código inválido NO bloquea la creación (queda anotado como inválido para revisar); un vendedor no puede traerse a sí mismo.

DROP FUNCTION IF EXISTS public.crear_restaurante(text, text, text, text);

CREATE OR REPLACE FUNCTION public.crear_restaurante(
  p_restaurant_name text, p_owner_email text, p_owner_password text, p_owner_full_name text DEFAULT NULL::text,
  p_origen text DEFAULT NULL::text, p_origen_detalle text DEFAULT NULL::text, p_codigo_vendedor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_base text; v_slug text; v_domain text; v_rid uuid; v_user_id uuid;
  v_email text := lower(trim(p_owner_email));
  v_pass  text := trim(p_owner_password);
  v_n int := 1;
  v_origen text := lower(NULLIF(btrim(p_origen), ''));
  v_detalle text := left(NULLIF(btrim(p_origen_detalle), ''), 200);
  v_codigo text := upper(NULLIF(btrim(p_codigo_vendedor), ''));
  v_vend vendedores%ROWTYPE;
  v_estado_codigo text;
  v_vendedor_id uuid;
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'El registro esta cerrado. Contactanos para activar tu restaurante';
  END IF;
  IF length(trim(p_restaurant_name)) < 2 THEN RAISE EXCEPTION 'Nombre de restaurante muy corto'; END IF;
  IF strpos(v_email,'@') < 2 OR strpos(v_email,'.') = 0 THEN RAISE EXCEPTION 'Email invalido'; END IF;
  IF length(v_pass) < 8 THEN RAISE EXCEPTION 'La contrasena debe tener al menos 8 caracteres'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email=v_email) THEN RAISE EXCEPTION 'Ya existe una cuenta con ese email'; END IF;

  -- Origen: obligatorio salvo que venga un código de vendedor.
  IF v_origen IS NOT NULL AND v_origen NOT IN ('vendedor','redes','restaurante','aliado','google','evento','otro') THEN
    RAISE EXCEPTION 'Origen inválido';
  END IF;
  IF v_origen IS NULL AND v_codigo IS NULL THEN RAISE EXCEPTION 'Elige cómo se enteró de nosotros'; END IF;

  IF v_codigo IS NOT NULL THEN
    SELECT * INTO v_vend FROM vendedores WHERE codigo = v_codigo;
    IF NOT FOUND THEN
      v_estado_codigo := 'invalido';
    ELSIF NOT v_vend.activo OR (v_vend.vigente_hasta IS NOT NULL AND v_vend.vigente_hasta < current_date) THEN
      v_estado_codigo := 'inactivo';
    ELSE
      v_estado_codigo := 'valido';
      IF lower(coalesce(v_vend.correo, '')) = v_email THEN
        v_detalle := 'Código propio del vendedor: sin comisión';   -- no se atribuye
      ELSE
        v_vendedor_id := v_vend.id;
        v_origen := v_vend.tipo;                                    -- el código gana sobre lo demás
      END IF;
    END IF;
    IF v_vendedor_id IS NULL AND v_origen IS NULL THEN v_origen := 'otro'; END IF;
  END IF;

  v_base := public.generate_slug(p_restaurant_name);
  IF v_base='' THEN v_base:='restaurante'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug=v_slug) LOOP
    v_n := v_n + 1; v_slug := v_base || v_n::text;
  END LOOP;
  v_domain := v_slug || '.com';

  INSERT INTO public.restaurants (name, slug, email_domain, plan, is_promo, trial_ends_at)
  VALUES (trim(p_restaurant_name), v_slug, v_domain, 'emprende', false, NULL)
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
  UPDATE public.profiles SET must_change_password = true WHERE id = v_user_id;

  UPDATE public.restaurants SET owner_id=v_user_id WHERE id=v_rid;
  INSERT INTO public.restaurant_config (display_name, restaurant_id)
  VALUES (trim(p_restaurant_name), v_rid) ON CONFLICT (restaurant_id) DO NOTHING;

  INSERT INTO public.subscriptions (restaurant_id, plan, status, amount_in_cents, is_promo, trial_ends_at)
  VALUES (v_rid, 'emprende', 'active', NULL, false, NULL)
  ON CONFLICT (restaurant_id) DO NOTHING;

  -- La ficha de seguimiento la crea el disparador de restaurants; aquí se completa con el origen.
  UPDATE public.restaurant_crm SET
    origen = v_origen, origen_detalle = v_detalle, codigo_usado = v_codigo, codigo_estado = v_estado_codigo,
    vendedor_id = v_vendedor_id, vendedor_asignado_at = CASE WHEN v_vendedor_id IS NOT NULL THEN now() END
   WHERE restaurant_id = v_rid;

  INSERT INTO public.platform_audit_log (actor_id, action, restaurant_id, target_user_id, detail)
  VALUES (auth.uid(), 'crear_restaurante', v_rid, v_user_id, jsonb_build_object('nombre', trim(p_restaurant_name), 'slug', v_slug, 'email', v_email));
  PERFORM public._auditar('crear_restaurante', 'restaurants', v_rid, NULL,
    jsonb_build_object('nombre', trim(p_restaurant_name), 'origen', v_origen, 'codigo', v_codigo, 'codigo_estado', v_estado_codigo, 'vendedor_id', v_vendedor_id), NULL);

  RETURN jsonb_build_object('restaurant_id', v_rid, 'slug', v_slug,
    'email_domain', v_domain, 'plan', 'emprende', 'is_promo', false, 'status','ok',
    'origen', v_origen, 'codigo_estado', v_estado_codigo);
END; $function$;

REVOKE ALL ON FUNCTION public.crear_restaurante(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_restaurante(text, text, text, text, text, text, text) TO authenticated;
