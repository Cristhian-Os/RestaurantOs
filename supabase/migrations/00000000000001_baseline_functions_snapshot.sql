-- ============================================================
-- FUNCIONES (public schema) -- snapshot desde produccion
-- Generado automaticamente. NO editar a mano; para cambiar una
-- funcion, aplica una migracion nueva y vuelve a generar este snapshot.
-- ============================================================

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
$function$
;

CREATE OR REPLACE FUNCTION public.borrar_comentario_plato(p_comment_id uuid, p_edit_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update comentarios_platos
    set estado = 'eliminado', texto = '', updated_at = now()
    where id = p_comment_id and edit_token = p_edit_token and estado = 'visible';
  if not found then raise exception 'No se pudo eliminar ese comentario'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_costo_receta(p_dish_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(
    COALESCE(NULLIF(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria
  ), 0)
  FROM public.recetas r
  LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
  WHERE r.producto_id = p_dish_id;
$function$
;

CREATE OR REPLACE FUNCTION public.change_my_password(p_new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pw text := trim(p_new_password);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF length(v_pw) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  UPDATE auth.users SET
    encrypted_password = crypt(v_pw, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = auth.uid();

  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();

  RETURN jsonb_build_object('status','ok');
END; $function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_window timestamptz;
BEGIN
  INSERT INTO public.order_rate_limit (identifier, window_start, request_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (identifier) DO UPDATE SET
    request_count = CASE WHEN public.order_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
                         THEN 1 ELSE public.order_rate_limit.request_count + 1 END,
    window_start  = CASE WHEN public.order_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
                         THEN now() ELSE public.order_rate_limit.window_start END
  RETURNING request_count, window_start INTO v_count, v_window;

  RETURN v_count <= p_max;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cobrar_orden(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE; v_change NUMERIC := 0; v_propina_final numeric;
BEGIN
  IF public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT * INTO v_order FROM public.orders
    WHERE id=p_order_id AND restaurant_id=public.current_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.status != 'ready' THEN
    RAISE EXCEPTION 'La orden debe estar en estado "ready" para cobrar (estado actual: %)', v_order.status;
  END IF;

  v_propina_final := CASE WHEN v_order.paid_at IS NULL THEN GREATEST(COALESCE(p_propina,0),0) ELSE v_order.propina END;

  IF v_order.paid_at IS NULL AND p_payment_method='efectivo' AND p_amount_paid IS NOT NULL THEN
    v_change := GREATEST(p_amount_paid - v_order.total - v_propina_final, 0);
  END IF;

  UPDATE public.orders SET status='completed',
    payment_method = COALESCE(v_order.payment_method, p_payment_method),
    amount_paid    = COALESCE(v_order.amount_paid, p_amount_paid, v_order.total),
    propina        = v_propina_final,
    paid_at        = COALESCE(v_order.paid_at, NOW()),
    paid_by        = COALESCE(v_order.paid_by, auth.uid())
  WHERE id=p_order_id;

  PERFORM public.registrar_venta_stock(p_order_id);

  RETURN json_build_object('order_id',p_order_id,'total',v_order.total,
    'paid',COALESCE(v_order.amount_paid, p_amount_paid,v_order.total),'change',v_change,'method',p_payment_method,
    'propina', v_propina_final);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cobrar_orden_inicial(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_change NUMERIC := 0;
  v_propina_final numeric := GREATEST(COALESCE(p_propina,0),0);
BEGIN
  IF public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND restaurant_id = public.current_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya fue pagada'; END IF;

  IF p_payment_method = 'efectivo' AND p_amount_paid IS NOT NULL THEN
    v_change := GREATEST(p_amount_paid - v_order.total - v_propina_final, 0);
  END IF;

  UPDATE public.orders SET
    payment_method = p_payment_method,
    amount_paid    = COALESCE(p_amount_paid, v_order.total),
    propina        = v_propina_final,
    paid_at        = NOW(),
    paid_by        = auth.uid()
  WHERE id = p_order_id;

  PERFORM public.registrar_venta_stock(p_order_id);

  RETURN json_build_object('order_id', p_order_id, 'total', v_order.total,
    'paid', COALESCE(p_amount_paid, v_order.total), 'change', v_change, 'method', p_payment_method,
    'propina', v_propina_final);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_task_with_evidence(p_task_id uuid, p_photo_url text, p_storage_path text, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_task public.tasks%ROWTYPE; v_evidence public.task_evidence%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND assigned_to = auth.uid() AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada o no está en progreso' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.task_evidence (task_id, uploaded_by, photo_url, storage_path, notes)
  VALUES (p_task_id, auth.uid(), p_photo_url, p_storage_path, p_notes) RETURNING * INTO v_evidence;
  UPDATE public.tasks SET status = 'completed', updated_at = NOW() WHERE id = p_task_id;
  RETURN json_build_object('task_id', p_task_id, 'evidence_id', v_evidence.id, 'status', 'completed');
END; $function$
;

CREATE OR REPLACE FUNCTION public.crear_comentario_plato(p_dish_id uuid, p_cliente_nombre text, p_texto text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(comment_id uuid, comment_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_parent_id uuid;
  v_texto text;
  v_new_id uuid;
  v_new_token uuid;
begin
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then raise exception 'Plato no encontrado'; end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes comentar en platos que ya hayas pedido con ese nombre';
  end if;
  if not check_rate_limit('comentario:' || lower(btrim(p_cliente_nombre)), 8, 60) then
    raise exception 'Estás comentando muy rápido, espera un momento';
  end if;

  v_texto := btrim(coalesce(p_texto, ''));
  if v_texto = '' then raise exception 'Escribe un comentario'; end if;
  if length(v_texto) > 500 then raise exception 'El comentario es muy largo (máximo 500 caracteres)'; end if;

  v_parent_id := null;
  if p_parent_id is not null then
    select coalesce(cp.parent_id, cp.id) into v_parent_id
      from comentarios_platos cp where cp.id = p_parent_id and cp.dish_id = p_dish_id;
    if v_parent_id is null then raise exception 'El comentario al que respondes no existe'; end if;
  end if;

  insert into comentarios_platos (restaurant_id, dish_id, parent_id, cliente_nombre, texto)
  values (v_restaurant_id, p_dish_id, v_parent_id, btrim(p_cliente_nombre), v_texto)
  returning comentarios_platos.id, comentarios_platos.edit_token into v_new_id, v_new_token;

  return query select v_new_id, v_new_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL::text, p_table_num integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order    public.orders%ROWTYPE;
  v_total    NUMERIC := 0;
  v_item     JSONB;
  v_qty      INTEGER;
  v_dish     public.dishes%ROWTYPE;
  v_rid      UUID := public.current_restaurant_id();
  v_items_final JSONB := '[]'::JSONB;
  v_size     text;
  v_size_obj jsonb;
  v_unit     numeric;
  v_reservas jsonb := '{}'::jsonb;
BEGIN
  IF public.get_user_role() NOT IN ('admin','waiter','cashier') THEN
    RAISE EXCEPTION 'No autorizado para crear órdenes';
  END IF;
  IF v_rid IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el restaurante';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'la orden no tiene items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::INTEGER, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_dish FROM public.dishes
      WHERE id = (v_item->>'id')::uuid AND restaurant_id = v_rid
        AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible: %', v_item->>'id'; END IF;

    v_size := NULLIF(v_item->>'size', '');
    IF v_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(v_dish.sizes) = 'array' THEN
      SELECT s INTO v_size_obj FROM jsonb_array_elements(v_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
      IF v_size_obj IS NULL THEN RAISE EXCEPTION 'tamaño inválido para %: %', v_dish.name, v_size; END IF;
      v_unit := (v_size_obj->>'precio')::numeric;
    ELSE
      v_unit := v_dish.price;
    END IF;

    v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    v_total := v_total + v_unit * v_qty;
    v_items_final := v_items_final || jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes'
    );
  END LOOP;

  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id)
  VALUES (auth.uid(), p_mesa_id, p_table_num, v_items_final, v_total, p_tipo_pedido, p_notes, 'pending', v_rid)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_final) LOOP
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id)
    VALUES (v_order.id, (v_item->>'id')::UUID, (v_item->>'quantity')::INTEGER, (v_item->>'price')::NUMERIC, v_item->>'notes', v_rid);
  END LOOP;

  RETURN json_build_object('order_id', v_order.id, 'total', v_total, 'status', 'pending');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_orden_con_custom(p_items_normales jsonb DEFAULT '[]'::jsonb, p_platos_custom jsonb DEFAULT '[]'::jsonb, p_tipo_pedido text DEFAULT 'LOCAL'::text, p_table_num integer DEFAULT NULL::integer, p_mesa_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id      UUID;
  v_total         NUMERIC := 0;
  v_item          JSONB;
  v_custom        JSONB;
  v_custom_id     UUID;
  v_custom_price  NUMERIC;
  v_qty           INTEGER;
  v_dish          public.dishes%ROWTYPE;
  v_rid           UUID := public.current_restaurant_id();
  v_items_final   JSONB := '[]'::JSONB;
BEGIN
  IF public.get_user_role() NOT IN ('admin','waiter','cashier','client') THEN
    RAISE EXCEPTION 'No autorizado para crear órdenes';
  END IF;
  IF v_rid IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el restaurante';
  END IF;

  -- 1. Crear la orden (vacía por ahora; se rellena items y total al final)
  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id)
  VALUES (auth.uid(), p_mesa_id, p_table_num, '[]'::jsonb, 0, p_tipo_pedido, p_notes, 'pending', v_rid)
  RETURNING id INTO v_order_id;

  -- 2. Items normales: precio SIEMPRE recalculado server-side desde dishes
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_normales) LOOP
    v_qty := coalesce((v_item->>'quantity')::INTEGER, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_dish FROM public.dishes
      WHERE id = (v_item->>'id')::uuid AND restaurant_id = v_rid
        AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible: %', v_item->>'id'; END IF;

    v_total := v_total + v_dish.price * v_qty;

    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes)
    VALUES (v_order_id, v_dish.id, v_qty, v_dish.price, v_item->>'notes');

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name,
      'price', v_dish.price, 'quantity', v_qty
    );
  END LOOP;

  -- 3. Platos custom: crear cada uno (descuenta ingredientes, calcula costo real) y acumular
  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_platos_custom) LOOP
    v_qty := COALESCE((v_custom->>'quantity')::INTEGER, 1);

    v_custom_id := public.crear_plato_custom(
      v_order_id,
      v_custom->>'name',
      v_custom->>'description',
      COALESCE(v_custom->'ingredients', '{}'::jsonb)
    );

    SELECT base_price INTO v_custom_price FROM public.custom_dishes WHERE id = v_custom_id;
    v_total := v_total + v_custom_price * v_qty;

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_custom_id, 'name', v_custom->>'name',
      'price', v_custom_price, 'quantity', v_qty, 'is_custom', true
    );
  END LOOP;

  -- 4. Actualizar orden con items finales y total
  UPDATE public.orders
  SET items = v_items_final, total = v_total
  WHERE id = v_order_id;

  RETURN json_build_object(
    'order_id', v_order_id,
    'total',    v_total,
    'status',   'pending'
  );
END; $function$
;

CREATE OR REPLACE FUNCTION public.crear_plato_custom(p_order_id uuid, p_name text, p_description text DEFAULT NULL::text, p_ingredientes jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_custom_dish_id UUID;
  v_total_precio   NUMERIC(10,2) := 0;
  v_ingrediente_id UUID;
  v_cantidad_pedida NUMERIC(10,3);
  v_costo_unitario NUMERIC(10,2);
  v_stock_actual   NUMERIC(10,3);
  v_nombre         TEXT;
BEGIN
  INSERT INTO public.custom_dishes (order_id, name, description, created_by)
  VALUES (p_order_id, p_name, p_description, auth.uid())
  RETURNING id INTO v_custom_dish_id;

  FOR v_ingrediente_id, v_cantidad_pedida IN
    SELECT key::UUID, value::NUMERIC
    FROM jsonb_each_text(p_ingredientes)
  LOOP
    SELECT costo_unitario, stock_actual, nombre
    INTO v_costo_unitario, v_stock_actual, v_nombre
    FROM public.ingredientes
    WHERE id = v_ingrediente_id;

    IF v_costo_unitario IS NULL THEN
      RAISE EXCEPTION 'Ingrediente no encontrado: %', v_ingrediente_id;
    END IF;

    IF v_stock_actual < v_cantidad_pedida THEN
      RAISE EXCEPTION 'Stock insuficiente de %: disponible %, solicitado %',
        v_nombre, v_stock_actual, v_cantidad_pedida;
    END IF;

    INSERT INTO public.custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad)
    VALUES (v_custom_dish_id, v_ingrediente_id, v_cantidad_pedida);

    UPDATE public.ingredientes
    SET stock_actual = stock_actual - v_cantidad_pedida
    WHERE id = v_ingrediente_id;

    -- Precio de venta = costo / 0.65 (mismo margen que ingredientes_menu_publico)
    v_total_precio := v_total_precio + (round(v_costo_unitario / 0.65, 2) * v_cantidad_pedida);
  END LOOP;

  -- Redondeo hacia arriba al múltiplo de 100 más cercano (igual que create_public_order)
  UPDATE public.custom_dishes
  SET base_price = ceil(v_total_precio / 100) * 100
  WHERE id = v_custom_dish_id;

  RETURN v_custom_dish_id;
END;
$function$
;

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
  IF length(v_pass) < 6 THEN RAISE EXCEPTION 'La contrasena debe tener al menos 6 caracteres'; END IF;
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
END; $function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.create_public_order(p_restaurant_id uuid, p_table_num integer, p_customer_name text, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_computed jsonb := '[]'::jsonb;
  v_item jsonb;
  v_kind text;
  v_qty int;
  v_dish record;
  v_dish_id uuid;
  v_unit numeric;
  v_size text;
  v_size_obj jsonb;
  v_line_notes text;
  v_name text;
  v_ing jsonb;
  v_ing_row record;
  v_qty_ing numeric;
  v_custom_total numeric;
  v_headers jsonb;
  v_ip text;
  v_rl_key text;
  v_rl_count int;
  v_rl_window timestamptz;
  v_cfg record;
  v_hora_local time;
  v_reservas jsonb := '{}'::jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN RAISE EXCEPTION 'restaurant_id requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id AND active = true) THEN
    RAISE EXCEPTION 'restaurante no disponible';
  END IF;

  SELECT cerrado_manual, cerrado_mensaje, horario_activo, horario_apertura, horario_cierre
    INTO v_cfg
    FROM public.restaurant_config WHERE restaurant_id = p_restaurant_id;

  IF v_cfg.cerrado_manual THEN
    RAISE EXCEPTION '%', COALESCE(v_cfg.cerrado_mensaje, 'El restaurante está cerrado temporalmente. Intenta más tarde.');
  END IF;

  IF v_cfg.horario_activo AND v_cfg.horario_apertura IS NOT NULL AND v_cfg.horario_cierre IS NOT NULL THEN
    v_hora_local := (now() AT TIME ZONE 'America/Bogota')::time;
    IF NOT (
      CASE WHEN v_cfg.horario_apertura::time <= v_cfg.horario_cierre::time
        THEN v_hora_local BETWEEN v_cfg.horario_apertura::time AND v_cfg.horario_cierre::time
        ELSE v_hora_local >= v_cfg.horario_apertura::time OR v_hora_local <= v_cfg.horario_cierre::time
      END
    ) THEN
      RAISE EXCEPTION 'Cerrado ahora. Atendemos de % a %', v_cfg.horario_apertura, v_cfg.horario_cierre;
    END IF;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL;
  END;
  v_ip := coalesce(
    v_headers->>'cf-connecting-ip',
    nullif(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), ''),
    'sin-ip'
  );
  v_rl_key := p_restaurant_id::text || ':' || v_ip;

  INSERT INTO public.order_rate_limit (identifier, window_start, request_count)
  VALUES (v_rl_key, now(), 1)
  ON CONFLICT (identifier) DO UPDATE SET
    request_count = CASE WHEN public.order_rate_limit.window_start < now() - interval '60 seconds'
                         THEN 1 ELSE public.order_rate_limit.request_count + 1 END,
    window_start  = CASE WHEN public.order_rate_limit.window_start < now() - interval '60 seconds'
                         THEN now() ELSE public.order_rate_limit.window_start END
  RETURNING request_count, window_start INTO v_rl_count, v_rl_window;

  IF v_rl_count > 8 THEN
    RAISE EXCEPTION 'Demasiados pedidos seguidos, espera un momento antes de intentar de nuevo';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'el pedido no tiene items';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'demasiados items en el pedido';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_kind := coalesce(v_item->>'kind', 'dish');
    v_qty  := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
    v_line_notes := NULLIF(left(trim(coalesce(v_item->>'line_notes', '')), 400), '');

    IF v_kind = 'dish' THEN
      SELECT * INTO v_dish FROM public.dishes
        WHERE id = (v_item->>'dish_id')::uuid
          AND restaurant_id = p_restaurant_id
          AND available = true
          AND availability_status <> 'discontinued';
      IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible'; END IF;

      v_size := NULLIF(v_item->>'size', '');
      IF v_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(v_dish.sizes) = 'array' THEN
        SELECT s INTO v_size_obj FROM jsonb_array_elements(v_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
        IF v_size_obj IS NULL THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
        v_unit := (v_size_obj->>'precio')::numeric;
      ELSE
        v_unit := v_dish.price;
      END IF;
      v_name := v_dish.name;
      v_dish_id := v_dish.id;
      v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    ELSIF v_kind = 'custom' THEN
      v_custom_total := 0;
      FOR v_ing IN SELECT * FROM jsonb_array_elements(coalesce(v_item->'ingredients', '[]'::jsonb))
      LOOP
        SELECT * INTO v_ing_row FROM public.ingredientes_menu_publico
          WHERE id = (v_ing->>'id')::uuid AND restaurant_id = p_restaurant_id AND disponible = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'ingrediente no disponible'; END IF;
        v_qty_ing := coalesce((v_ing->>'cantidad')::numeric, 0);
        IF v_qty_ing <= 0 OR v_qty_ing > 1000 THEN RAISE EXCEPTION 'cantidad de ingrediente inválida'; END IF;
        v_custom_total := v_custom_total + v_ing_row.precio_venta_unitario * v_qty_ing;
      END LOOP;
      IF v_custom_total <= 0 THEN RAISE EXCEPTION 'plato personalizado vacío'; END IF;
      v_unit := ceil(v_custom_total / 100) * 100;
      v_name := 'Plato personalizado';
      v_dish_id := NULL;

    ELSE
      RAISE EXCEPTION 'tipo de item inválido';
    END IF;

    v_total := v_total + v_unit * v_qty;
    v_computed := v_computed || jsonb_build_object(
      'id', v_dish_id, 'name', v_name, 'price', v_unit, 'quantity', v_qty, 'notes', v_line_notes
    );
  END LOOP;

  IF p_table_num IS NOT NULL AND (p_table_num < 1 OR p_table_num > 100) THEN
    RAISE EXCEPTION 'número de mesa inválido';
  END IF;

  INSERT INTO public.orders (
    restaurant_id, table_num, items, total, tipo_pedido, status, customer_name, notes, user_id
  ) VALUES (
    p_restaurant_id, p_table_num, v_computed, v_total, 'LOCAL', 'pending',
    NULLIF(left(trim(coalesce(p_customer_name,'')), 120), ''),
    NULLIF(left(trim(coalesce(p_notes,'')), 500), ''),
    NULL
  ) RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.dejar_resena_plato(p_dish_id uuid, p_cliente_nombre text, p_rating integer, p_comentario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'La calificación debe ser entre 1 y 5';
  end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then
    raise exception 'Plato no encontrado';
  end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes reseñar platos que ya hayas pedido con ese nombre';
  end if;

  insert into resenas_platos (restaurant_id, dish_id, cliente_nombre, rating, comentario, estado)
  values (v_restaurant_id, p_dish_id, btrim(p_cliente_nombre), p_rating, nullif(btrim(coalesce(p_comentario, '')), ''), 'pendiente')
  on conflict (dish_id, lower(btrim(cliente_nombre)))
  do update set rating = excluded.rating, comentario = excluded.comentario, estado = 'pendiente', updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_dish(p_dish_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar platos';
  END IF;
  DELETE FROM public.dishes WHERE id = p_dish_id AND restaurant_id = current_restaurant_id();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.descontar_ingredientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ingredientes i
  SET stock_actual = GREATEST(stock_actual - (r.cantidad_necesaria * NEW.cantidad), 0)
  FROM public.recetas r
  WHERE r.producto_id = NEW.dish_id
    AND r.ingrediente_id = i.id;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.editar_comentario_plato(p_comment_id uuid, p_edit_token uuid, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_texto text;
begin
  v_texto := btrim(coalesce(p_texto, ''));
  if v_texto = '' then raise exception 'Escribe un comentario'; end if;
  if length(v_texto) > 500 then raise exception 'El comentario es muy largo (máximo 500 caracteres)'; end if;

  update comentarios_platos
    set texto = v_texto, updated_at = now()
    where id = p_comment_id and edit_token = p_edit_token and estado = 'visible';
  if not found then raise exception 'No se pudo editar ese comentario'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_subscription_lifecycle()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not exists (
    select 1 from public.platform_secrets
    where key = 'wompi_public_key' and value is not null and value <> ''
  ) then
    return;
  end if;

  -- 1) Periodo/trial vencido → MORA (7 días), guardando la fecha límite
  update public.subscriptions
     set status = 'past_due',
         grace_ends_at = coalesce(grace_ends_at, now() + interval '7 days')
   where status in ('active','trialing')
     and is_promo = false
     and coalesce(current_period_end, trial_ends_at) is not null
     and coalesce(current_period_end, trial_ends_at) < now();

  -- 2) Mora vencida → CANCELADO + programar borrado a los 30 días
  update public.subscriptions
     set status = 'canceled',
         purge_at = coalesce(purge_at, now() + interval '30 days')
   where status = 'past_due'
     and is_promo = false
     and grace_ends_at is not null
     and grace_ends_at < now();

  -- 3) Bloquear acceso de los cancelados (defensa extra; la app ya lo valida)
  update public.restaurants
     set active = false
   where active = true
     and id in (select restaurant_id from public.subscriptions where status = 'canceled' and is_promo = false);

  -- 4) Reactivar acceso de los que volvieron a estar al día
  update public.restaurants
     set active = true
   where active = false
     and id in (select restaurant_id from public.subscriptions where status in ('active','trialing','past_due'));

  -- 5) Borrado definitivo de los cancelados cuyo plazo de 30 días ya venció
  for r in
    select restaurant_id from public.subscriptions
    where status = 'canceled' and is_promo = false and purge_at is not null and purge_at < now()
  loop
    perform public.purge_restaurant(r.restaurant_id);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_slug(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(
    lower(translate(p_name,
      'áàäâãéèëêíìïîóòöôõúùüûñ','aaaaaeeeeiiiiooooouuuun')),
    '[^a-z0-9]+','','g');
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_metrics()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result JSON; v_rid UUID := public.current_restaurant_id();
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Solo administradores pueden ver estas métricas';
  END IF;
  SELECT json_build_object(
    'total_sales_today', COALESCE((SELECT SUM(total) FROM public.orders WHERE status='completed' AND created_at>=CURRENT_DATE AND restaurant_id=v_rid),0),
    'pending_count',  COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='pending'  AND restaurant_id=v_rid),0),
    'cooking_count',  COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='cooking'  AND restaurant_id=v_rid),0),
    'ready_count',    COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='ready'    AND restaurant_id=v_rid),0),
    'completed_today',COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='completed' AND created_at>=CURRENT_DATE AND restaurant_id=v_rid),0),
    'active_tables',  COALESCE((SELECT COUNT(*) FROM public.mesas  WHERE estado='ocupada'  AND restaurant_id=v_rid),0),
    'cancelled_today',COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='cancelled' AND created_at>=CURRENT_DATE AND restaurant_id=v_rid),0)
  ) INTO v_result;
  RETURN v_result;
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_corte_productos()
 RETURNS TABLE(producto text, metodo_pago text, cantidad bigint, precio_unit numeric, subtotal numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(item->>'name', 'Sin nombre')                                  AS producto,
    COALESCE(o.payment_method, 'sin especificar')                          AS metodo_pago,
    SUM(COALESCE((item->>'quantity')::int, 0))                             AS cantidad,
    MAX(COALESCE((item->>'price')::numeric, 0))                            AS precio_unit,
    SUM(COALESCE((item->>'quantity')::int,0) * COALESCE((item->>'price')::numeric,0)) AS subtotal
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(o.items) = 'array' THEN o.items
      WHEN jsonb_typeof(o.items) = 'string'
           AND left(btrim(o.items #>> '{}'), 1) = '[' THEN (o.items #>> '{}')::jsonb
      ELSE '[]'::jsonb
    END
  ) AS item
  WHERE o.status = 'completed'
    AND o.paid_at >= CURRENT_DATE
    AND o.paid_at <  CURRENT_DATE + INTERVAL '1 day'
    AND o.restaurant_id = public.current_restaurant_id()
  GROUP BY COALESCE(item->>'name', 'Sin nombre'), COALESCE(o.payment_method, 'sin especificar')
  ORDER BY COALESCE(item->>'name', 'Sin nombre'),
           SUM(COALESCE((item->>'quantity')::int,0) * COALESCE((item->>'price')::numeric,0)) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_receta_manual(p_producto_id uuid, p_lineas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo los administradores pueden editar recetas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dishes
    WHERE id = p_producto_id AND restaurant_id = public.current_restaurant_id()
  ) THEN
    RAISE EXCEPTION 'Ese plato no pertenece a tu restaurante';
  END IF;

  DELETE FROM public.recetas WHERE producto_id = p_producto_id;

  INSERT INTO public.recetas (producto_id, ingrediente_id, nombre, costo_unitario, unidad, cantidad_necesaria)
  SELECT
    p_producto_id,
    NULLIF(l->>'ingrediente_id', '')::uuid,
    trim(l->>'nombre'),
    COALESCE(NULLIF(l->>'costo_unitario','')::numeric, 0),
    NULLIF(trim(l->>'unidad'), ''),
    (l->>'cantidad_necesaria')::numeric
  FROM jsonb_array_elements(p_lineas) AS l
  WHERE trim(COALESCE(l->>'nombre','')) <> ''
    AND COALESCE(NULLIF(l->>'cantidad_necesaria','')::numeric, 0) > 0
    AND (
      NULLIF(l->>'ingrediente_id', '') IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ingredientes i
        WHERE i.id = NULLIF(l->>'ingrediente_id', '')::uuid
          AND i.restaurant_id = public.current_restaurant_id()
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_total_efectivo NUMERIC; v_total_transf NUMERIC;
  v_total_propinas NUMERIC; v_total_propinas_efectivo NUMERIC;
  v_total_ordenes INTEGER; v_ordenes_ids UUID[];
  v_total_gastos NUMERIC; v_total_neto NUMERIC;
  v_rid UUID := public.current_restaurant_id();
BEGIN
  IF public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden hacer el corte de caja';
  END IF;

  SELECT COALESCE(SUM(total) FILTER (WHERE payment_method='efectivo'),0),
         COALESCE(SUM(total) FILTER (WHERE payment_method='transferencia'),0),
         COALESCE(SUM(propina),0),
         COALESCE(SUM(propina) FILTER (WHERE payment_method='efectivo'),0),
         COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_total_efectivo, v_total_transf, v_total_propinas, v_total_propinas_efectivo, v_total_ordenes, v_ordenes_ids
  FROM public.orders
  WHERE status='completed' AND paid_at>=CURRENT_DATE AND paid_at<CURRENT_DATE+INTERVAL '1 day'
    AND restaurant_id=v_rid;

  SELECT COALESCE(SUM(monto),0) INTO v_total_gastos
  FROM public.gastos
  WHERE created_at>=CURRENT_DATE AND created_at<CURRENT_DATE+INTERVAL '1 day'
    AND restaurant_id=v_rid;

  -- Beneficio neto del negocio: las propinas NUNCA son ingreso del restaurante,
  -- así que no entran a esta cuenta (son de los meseros).
  v_total_neto := v_total_efectivo + v_total_transf - v_total_gastos;

  INSERT INTO public.cortes_caja (
    cashier_id, total_efectivo, total_transferencia, total_ordenes, ordenes_ids, notas,
    restaurant_id, total_gastos, total_neto, total_propinas, total_propinas_efectivo
  )
  VALUES (
    auth.uid(), v_total_efectivo, v_total_transf, v_total_ordenes, v_ordenes_ids, p_notas,
    v_rid, v_total_gastos, v_total_neto, v_total_propinas, v_total_propinas_efectivo
  )
  RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id', v_corte.id, 'fecha', v_corte.fecha,
    'total_efectivo', v_total_efectivo, 'total_transferencia', v_total_transf,
    'total_general', v_total_efectivo + v_total_transf, 'total_ordenes', v_total_ordenes,
    'total_gastos', v_total_gastos, 'total_neto', v_total_neto,
    'total_propinas', v_total_propinas, 'total_propinas_efectivo', v_total_propinas_efectivo,
    -- Lo que debe HABER físicamente en el cajón: ventas en efectivo + propinas en efectivo
    'efectivo_esperado_cajon', v_total_efectivo + v_total_propinas_efectivo
  );
END;
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role = 'super_admin');
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_method text DEFAULT 'ONLINE'::text, p_tx_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.orders
     set payment_method = 'tarjeta',   -- pago con tarjeta/en línea (encaja con el CHECK existente)
         paid_at = now()
   where id = p_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_reaccion_plato(p_dish_id uuid, p_cliente_nombre text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select reaccion from likes_platos
  where dish_id = p_dish_id and lower(btrim(cliente_nombre)) = lower(btrim(coalesce(p_cliente_nombre, '')));
$function$
;

CREATE OR REPLACE FUNCTION public.notify_pedido_estado_publico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform realtime.send(
    jsonb_build_object(
      'id',          new.id,
      'status',      new.status,
      'table_num',   new.table_num,
      'tipo_pedido', new.tipo_pedido,
      'updated_at',  new.updated_at
    ),
    'status_update',
    'pedido:' || new.id::text,
    false
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_comentarios_plato(p_dish_id uuid, p_cliente_nombre text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, parent_id uuid, cliente_nombre text, texto text, estado text, created_at timestamp with time zone, updated_at timestamp with time zone, likes_count integer, ya_me_gusta boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.parent_id, c.cliente_nombre, c.texto, c.estado, c.created_at, c.updated_at,
         coalesce(lk.n, 0)::int as likes_count,
         coalesce(mine.liked, false) as ya_me_gusta
  from comentarios_platos c
  left join (select comment_id, count(*) as n from comentario_likes group by comment_id) lk on lk.comment_id = c.id
  left join (
    select comment_id, true as liked from comentario_likes
    where p_cliente_nombre is not null and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre))
  ) mine on mine.comment_id = c.id
  where c.dish_id = p_dish_id and c.estado in ('visible', 'eliminado')
  order by c.created_at asc;
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_interacciones_platos(p_restaurant_id uuid)
 RETURNS TABLE(dish_id uuid, likes_count integer, dislikes_count integer, rating_avg numeric, rating_count integer, comentarios_count integer, total_vendido integer, es_popular boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ventas as (
    select dp.dish_id, sum(dp.cantidad)::int as total_vendido
    from detalles_pedidos dp
    join dishes d on d.id = dp.dish_id
    where d.restaurant_id = p_restaurant_id
    group by dp.dish_id
  ),
  ranked as (
    select dish_id, total_vendido, rank() over (order by total_vendido desc) as rnk
    from ventas
  ),
  reacciones as (
    select l.dish_id,
           count(*) filter (where l.reaccion = 'like')::int as likes_count,
           count(*) filter (where l.reaccion = 'dislike')::int as dislikes_count
    from likes_platos l
    join dishes d on d.id = l.dish_id
    where d.restaurant_id = p_restaurant_id
    group by l.dish_id
  ),
  ratings as (
    select r.dish_id, round(avg(r.rating)::numeric, 1) as rating_avg, count(*)::int as rating_count
    from resenas_platos r
    join dishes d on d.id = r.dish_id
    where d.restaurant_id = p_restaurant_id and r.estado = 'aprobada'
    group by r.dish_id
  ),
  comentarios as (
    select c.dish_id, count(*)::int as comentarios_count
    from comentarios_platos c
    join dishes d on d.id = c.dish_id
    where d.restaurant_id = p_restaurant_id and c.estado in ('visible', 'eliminado')
    group by c.dish_id
  )
  select d.id as dish_id,
         coalesce(rc.likes_count, 0) as likes_count,
         coalesce(rc.dislikes_count, 0) as dislikes_count,
         rt.rating_avg,
         coalesce(rt.rating_count, 0) as rating_count,
         coalesce(cm.comentarios_count, 0) as comentarios_count,
         coalesce(v.total_vendido, 0) as total_vendido,
         coalesce(rk.rnk <= 3 and v.total_vendido > 0, false) as es_popular
  from dishes d
  left join ventas v on v.dish_id = d.id
  left join ranked rk on rk.dish_id = d.id
  left join reacciones rc on rc.dish_id = d.id
  left join ratings rt on rt.dish_id = d.id
  left join comentarios cm on cm.dish_id = d.id
  where d.restaurant_id = p_restaurant_id;
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_resenas_aprobadas(p_dish_id uuid)
 RETURNS TABLE(cliente_nombre text, rating smallint, comentario text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cliente_nombre, rating, comentario, created_at
  from resenas_platos
  where dish_id = p_dish_id and estado = 'aprobada'
  order by created_at desc
  limit 50;
$function$
;

CREATE OR REPLACE FUNCTION public.on_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('completed','cancelled') AND OLD.status != NEW.status THEN
    IF NEW.mesa_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE mesa_id = NEW.mesa_id
          AND id != NEW.id
          AND status NOT IN ('completed','cancelled')
      ) THEN
        UPDATE public.mesas SET estado = 'libre' WHERE id = NEW.mesa_id;
      END IF;
    END IF;
  END IF;
  IF NEW.status NOT IN ('completed','cancelled') AND NEW.mesa_id IS NOT NULL THEN
    UPDATE public.mesas SET estado = 'ocupada' WHERE id = NEW.mesa_id;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.online_payments_enabled(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select enabled from public.restaurant_payment_config where restaurant_id = p_restaurant_id), false);
$function$
;

CREATE OR REPLACE FUNCTION public.order_total_cents(p_order_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(coalesce(total,0) * 100)::integer from public.orders where id = p_order_id;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_billing_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_secrets
    WHERE key = 'wompi_public_key' AND value IS NOT NULL AND value <> ''
  );
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.purge_restaurant(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ok boolean;
begin
  -- Solo si su suscripción está CANCELADA, no es promo, y ya pasó la fecha de borrado
  select true into v_ok
  from public.subscriptions s
  where s.restaurant_id = p_restaurant_id
    and s.status = 'canceled'
    and s.is_promo = false
    and s.purge_at is not null
    and s.purge_at < now();

  if not coalesce(v_ok, false) then
    return false;  -- no elegible: no se borra nada
  end if;

  delete from public.restaurants where id = p_restaurant_id;  -- cascade a todo lo demás
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reaccionar_comentario_plato(p_comment_id uuid, p_cliente_nombre text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dish_id uuid;
  v_existe boolean;
begin
  select dish_id into v_dish_id from comentarios_platos where id = p_comment_id and estado = 'visible';
  if v_dish_id is null then raise exception 'Comentario no encontrado'; end if;
  if not verificar_cliente_pidio_plato(v_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes reaccionar a comentarios de platos que ya hayas pedido con ese nombre';
  end if;

  select exists(
    select 1 from comentario_likes
    where comment_id = p_comment_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre))
  ) into v_existe;

  if v_existe then
    delete from comentario_likes
      where comment_id = p_comment_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));
    return false;
  else
    insert into comentario_likes (comment_id, cliente_nombre) values (p_comment_id, btrim(p_cliente_nombre));
    return true;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reaccionar_plato(p_dish_id uuid, p_cliente_nombre text, p_reaccion text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_actual text;
begin
  if p_reaccion not in ('like', 'dislike') then
    raise exception 'Reacción inválida';
  end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then
    raise exception 'Plato no encontrado';
  end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes calificar platos que ya hayas pedido con ese nombre';
  end if;
  if not check_rate_limit('reaccion:' || lower(btrim(p_cliente_nombre)), 20, 60) then
    raise exception 'Vas muy rápido, espera un momento';
  end if;

  select reaccion into v_actual from likes_platos
    where dish_id = p_dish_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));

  if v_actual is not null and v_actual = p_reaccion then
    delete from likes_platos
      where dish_id = p_dish_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));
    return null;
  end if;

  insert into likes_platos (restaurant_id, dish_id, cliente_nombre, reaccion)
  values (v_restaurant_id, p_dish_id, btrim(p_cliente_nombre), p_reaccion)
  on conflict (dish_id, lower(btrim(cliente_nombre)))
  do update set reaccion = excluded.reaccion, updated_at = now();

  return p_reaccion;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_compra_proveedor(p_concepto text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid       UUID := public.current_restaurant_id();
  v_gasto_id  UUID;
  v_item      JSONB;
  v_total     NUMERIC := 0;
  v_ing_id    UUID;
  v_cantidad  NUMERIC;
  v_precio    NUMERIC;
BEGIN
  IF public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar gastos';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos';
  END IF;

  SELECT COALESCE(SUM((i->>'cantidad')::numeric * (i->>'precio_unitario')::numeric), 0)
  INTO v_total FROM jsonb_array_elements(p_items) i;

  INSERT INTO public.gastos (restaurant_id, concepto, monto, categoria, registrado_por)
  VALUES (v_rid, p_concepto, v_total, 'proveedor', auth.uid())
  RETURNING id INTO v_gasto_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ing_id   := NULLIF(v_item->>'ingrediente_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio   := (v_item->>'precio_unitario')::numeric;

    INSERT INTO public.gasto_items (gasto_id, ingrediente_id, nombre_producto, cantidad, unidad, precio_unitario, restaurant_id)
    VALUES (v_gasto_id, v_ing_id, v_item->>'nombre_producto', v_cantidad, NULLIF(v_item->>'unidad', ''), v_precio, v_rid);

    IF v_ing_id IS NOT NULL THEN
      UPDATE public.ingredientes SET
        stock_actual   = stock_actual + v_cantidad,
        costo_unitario = v_precio,
        updated_at     = NOW()
      WHERE id = v_ing_id AND restaurant_id = v_rid;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('gasto_id', v_gasto_id, 'total', v_total);
END; $function$
;

CREATE OR REPLACE FUNCTION public.registrar_venta_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items       jsonb;
  v_restaurant  uuid;
  v_item        jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.detalles_pedidos WHERE order_id = p_order_id) THEN
    RETURN; -- ya se registró (evita descontar dos veces la misma orden)
  END IF;

  SELECT items, restaurant_id INTO v_items, v_restaurant FROM public.orders WHERE id = p_order_id;
  IF v_items IS NULL THEN RETURN; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, restaurant_id)
      VALUES (
        p_order_id,
        (v_item->>'id')::uuid,
        GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1),
        COALESCE((v_item->>'price')::numeric, 0),
        v_restaurant
      );
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reportar_comentario_plato(p_comment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not check_rate_limit('reporte:' || p_comment_id::text, 20, 60) then
    raise exception 'Ese comentario ya se reportó varias veces, gracias';
  end if;
  update comentarios_platos set reportado_count = reportado_count + 1 where id = p_comment_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reservar_stock_receta(p_dish_id uuid, p_qty integer, p_reservas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reservas jsonb := COALESCE(p_reservas, '{}'::jsonb);
  r RECORD;
  v_ya numeric;
  v_necesita numeric;
BEGIN
  FOR r IN
    SELECT rec.ingrediente_id, rec.cantidad_necesaria, i.nombre, i.stock_actual
    FROM public.recetas rec
    JOIN public.ingredientes i ON i.id = rec.ingrediente_id
    WHERE rec.producto_id = p_dish_id AND rec.ingrediente_id IS NOT NULL
    FOR UPDATE OF i
  LOOP
    v_necesita := r.cantidad_necesaria * p_qty;
    v_ya := COALESCE((v_reservas->>r.ingrediente_id::text)::numeric, 0);
    IF r.stock_actual - v_ya < v_necesita THEN
      RAISE EXCEPTION 'Ya no hay suficiente "%" para preparar este plato', r.nombre;
    END IF;
    v_reservas := jsonb_set(v_reservas, ARRAY[r.ingrediente_id::text], to_jsonb(v_ya + v_necesita));
  END LOOP;
  RETURN v_reservas;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at = now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.verificar_cliente_pidio_plato(p_dish_id uuid, p_cliente_nombre text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from orders o, jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
    where btrim(coalesce(p_cliente_nombre, '')) <> ''
      and lower(btrim(o.customer_name)) = lower(btrim(p_cliente_nombre))
      and (item->>'id') = p_dish_id::text
  );
$function$
;

