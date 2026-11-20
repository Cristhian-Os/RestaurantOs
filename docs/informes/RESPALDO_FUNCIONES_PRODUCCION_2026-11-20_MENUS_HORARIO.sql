-- RESPALDO previo a "Menús por horario" en PRODUCCIÓN (proyecto RestaurantOs, ifypeslrcdebvdqglywt), 2026-11-20.
-- Definiciones EXACTAS tomadas de pg_get_functiondef antes de aplicar las migraciones 20261117120000 … 20261117136000.
-- Sirven para restaurar a mano si hiciera falta. NO es una migración: no ejecutar este archivo entero sin revisar.
-- Funciones: _precio_plato, crear_orden_completa, create_public_order, mesa_pedir_publico, mesa_pedido_aceptar,
--            editar_items_pedido, wa_bot_cotizar, wa_bot_contexto.

-- ===== _precio_plato =====
CREATE OR REPLACE FUNCTION public._precio_plato(p_dish dishes, p_size text, p_toppings jsonb, p_sel jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_size text := NULLIF(p_size, ''); v_obj jsonb; v_unit numeric; v_top jsonb := COALESCE(p_toppings, '[]'::jsonb); v_tot numeric := 0; v_ok jsonb := '[]'::jsonb;
BEGIN
  IF p_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(p_dish.sizes) = 'array' THEN
    SELECT s INTO v_obj FROM jsonb_array_elements(p_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
    IF v_obj IS NULL THEN RETURN jsonb_build_object('tamano_invalido', true); END IF;
    v_unit := (v_obj->>'precio')::numeric;
  ELSE
    v_unit := p_dish.price;
    v_size := NULL;
  END IF;
  IF jsonb_typeof(p_dish.toppings) = 'array' AND jsonb_typeof(v_top) = 'array' THEN
    SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
      INTO v_tot, v_ok
    FROM jsonb_array_elements(p_dish.toppings) t
    WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_top));
  END IF;
  v_unit := v_unit + v_tot + public._opciones_v2(p_dish.id, p_dish.restaurant_id, p_sel);
  RETURN jsonb_build_object('unit', v_unit, 'size', v_size, 'toppings', v_ok);
END;
$function$;

-- ===== crear_orden_completa =====
CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL::text, p_table_num integer DEFAULT NULL::integer, p_customer_name text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE; v_total NUMERIC := 0; v_item JSONB; v_qty INTEGER; v_dish public.dishes%ROWTYPE;
  v_rid UUID := public.current_restaurant_id(); v_items_final JSONB := '[]'::JSONB; v_unit numeric; v_reservas jsonb := '{}'::jsonb;
  v_comensal text; v_pp jsonb;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier') THEN
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

    v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', v_item->'sel');
    IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN
      RAISE EXCEPTION 'tamaño inválido para %: %', v_dish.name, NULLIF(v_item->>'size', '');
    END IF;
    v_unit := (v_pp->>'unit')::numeric;

    v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    v_total := v_total + v_unit * v_qty;
    v_comensal := NULLIF(left(btrim(coalesce(v_item->>'comensal', '')), 60), '');
    v_items_final := v_items_final || (jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes',
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END
    ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);
  END LOOP;

  INSERT INTO public.orders (
    user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id, customer_name,
    payment_method, paid_at, amount_paid, paid_by
  )
  VALUES (
    auth.uid(), p_mesa_id, p_table_num, v_items_final, v_total, p_tipo_pedido, p_notes, 'pending', v_rid,
    NULLIF(left(trim(coalesce(p_customer_name,'')), 120), ''),
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN 'rappi' END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN NOW() END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN v_total END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN auth.uid() END
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_final) LOOP
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id, opciones_consumo)
    VALUES (v_order.id, (v_item->>'id')::UUID, (v_item->>'quantity')::INTEGER, (v_item->>'price')::NUMERIC, v_item->>'notes', v_rid,
      public._consumo_opciones((v_item->>'id')::UUID, v_rid, v_item->'sel'));
  END LOOP;

  RETURN json_build_object('order_id', v_order.id, 'total', v_total, 'status', 'pending');
END;
$function$;

-- ===== create_public_order =====
CREATE OR REPLACE FUNCTION public.create_public_order(p_restaurant_id uuid, p_table_num integer, p_customer_name text, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid; v_total numeric := 0; v_computed jsonb := '[]'::jsonb; v_item jsonb; v_kind text; v_qty int; v_dish public.dishes%ROWTYPE; v_dish_id uuid;
  v_unit numeric; v_size text; v_line_notes text; v_name text; v_ing jsonb; v_ing_row record; v_qty_ing numeric; v_custom_total numeric;
  v_headers jsonb; v_ip text; v_rl_key text; v_rl_count int; v_rl_window timestamptz; v_cfg record; v_hora_local time;
  v_reservas jsonb := '{}'::jsonb; v_toppings_ok jsonb; v_sel jsonb; v_pp jsonb;
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
    v_toppings_ok := NULL;
    v_sel := NULL;

    IF v_kind = 'dish' THEN
      SELECT * INTO v_dish FROM public.dishes
        WHERE id = (v_item->>'dish_id')::uuid
          AND restaurant_id = p_restaurant_id
          AND available = true
          AND availability_status <> 'discontinued';
      IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible'; END IF;

      v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' THEN v_item->'sel' END);
      IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
      v_unit := (v_pp->>'unit')::numeric;
      v_size := v_pp->>'size';
      v_toppings_ok := v_pp->'toppings';

      v_name := v_dish.name;
      v_dish_id := v_dish.id;
      v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);
      v_sel := CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END;

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
      v_size := NULL;

    ELSE
      RAISE EXCEPTION 'tipo de item inválido';
    END IF;

    v_total := v_total + v_unit * v_qty;
    v_computed := v_computed || jsonb_build_object(
      'id', v_dish_id, 'name', v_name, 'price', v_unit, 'quantity', v_qty, 'notes', v_line_notes,
      'size', v_size, 'toppings', v_toppings_ok, 'sel', v_sel
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
$function$;

-- ===== editar_items_pedido =====
CREATE OR REPLACE FUNCTION public.editar_items_pedido(p_order_id uuid, p_items jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order     public.orders%ROWTYPE;
  v_role      TEXT := public.get_user_role();
  v_orig_all  JSONB;
  v_new_items JSONB := '[]'::jsonb;
  v_total     NUMERIC := 0;
  v_elem      JSONB;
  v_idx       INTEGER;
  v_seen      INTEGER[] := '{}';
  v_orig      JSONB;
  v_qty       INTEGER;
  v_dish      public.dishes%ROWTYPE;
  v_found     BOOLEAN;
  v_size      TEXT;
  v_size_obj  JSONB;
  v_unit      NUMERIC;
  v_top_sel   JSONB;
  v_top_ok    JSONB;
  v_top_total NUMERIC;
  v_notes     TEXT;
  v_comensal  TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  IF v_role IN ('admin','cashier','waiter') THEN
    IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
      RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    IF v_order.status NOT IN ('pending','ready') THEN
      RAISE EXCEPTION 'Este pedido ya no se puede editar (estado: %)', v_order.status;
    END IF;
  ELSIF v_order.status <> 'pending' OR v_order.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tu pedido ya fue pagado o está en preparación. Pide el cambio en caja.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe tener al menos un producto';
  END IF;

  v_orig_all := CASE WHEN jsonb_typeof(v_order.items) = 'array' THEN v_order.items ELSE '[]'::jsonb END;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := (v_elem->>'idx')::int;
    IF v_idx IS NULL OR v_idx < 0 OR v_idx >= jsonb_array_length(v_orig_all) THEN
      RAISE EXCEPTION 'Producto inválido en el pedido';
    END IF;
    IF v_idx = ANY(v_seen) THEN RAISE EXCEPTION 'Producto repetido en la edición'; END IF;
    v_seen := v_seen || v_idx;

    v_orig := v_orig_all -> v_idx;
    IF COALESCE((v_orig->>'cancelled')::boolean, false) THEN CONTINUE; END IF;

    v_qty := (v_elem->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    v_notes := NULLIF(left(trim(coalesce(v_elem->>'notes', '')), 400), '');

    v_found := false;
    IF (v_orig->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_dish FROM public.dishes
        WHERE id = (v_orig->>'id')::uuid AND restaurant_id = v_order.restaurant_id;
      v_found := FOUND;
    END IF;

    IF v_found THEN
      v_size := NULLIF(trim(coalesce(v_elem->>'size', '')), '');
      IF v_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(v_dish.sizes) = 'array' THEN
        SELECT s INTO v_size_obj FROM jsonb_array_elements(v_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
        IF v_size_obj IS NULL THEN RAISE EXCEPTION 'Tamaño inválido para %: %', v_dish.name, v_size; END IF;
        v_unit := (v_size_obj->>'precio')::numeric;
      ELSE
        v_unit := v_dish.price;
        v_size := NULL;
      END IF;

      v_top_sel := COALESCE(v_elem->'toppings', '[]'::jsonb);
      v_top_total := 0;
      v_top_ok := '[]'::jsonb;
      IF jsonb_typeof(v_dish.toppings) = 'array' AND jsonb_typeof(v_top_sel) = 'array' THEN
        SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
          INTO v_top_total, v_top_ok
        FROM jsonb_array_elements(v_dish.toppings) t
        WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_top_sel));
      END IF;
      v_unit := v_unit + v_top_total;
      v_unit := v_unit + public._opciones_v2(v_dish.id, v_order.restaurant_id, v_elem->'sel', false);

      v_comensal := COALESCE(NULLIF(left(btrim(coalesce(v_elem->>'comensal', '')), 60), ''),
                             NULLIF(left(btrim(coalesce(v_orig->>'comensal', '')), 60), ''));
      v_new_items := v_new_items || (jsonb_build_object(
        'id', v_dish.id, 'name', COALESCE(v_orig->>'name', v_dish.name), 'price', v_unit,
        'quantity', v_qty, 'notes', v_notes, 'size', v_size, 'toppings', v_top_ok,
        'sel', CASE WHEN jsonb_typeof(v_elem->'sel') = 'object' AND length((v_elem->'sel')::text) <= 4000 THEN v_elem->'sel' END
      ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);
    ELSE
      v_unit := COALESCE((v_orig->>'price')::numeric, 0);
      v_new_items := v_new_items || (v_orig || jsonb_build_object('quantity', v_qty, 'notes', v_notes));
    END IF;

    v_total := v_total + v_unit * v_qty;
  END LOOP;

  IF jsonb_array_length(v_new_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe tener al menos un producto';
  END IF;

  IF v_order.paid_at IS NOT NULL AND v_total <> v_order.total THEN
    RAISE EXCEPTION 'Este pedido ya fue pagado: el total no puede cambiar. Si hay que cambiar el precio, cancélalo y crea uno nuevo.';
  END IF;

  UPDATE public.orders SET items = v_new_items, total = v_total, updated_at = now()
  WHERE id = p_order_id;

  RETURN json_build_object('order_id', p_order_id, 'total', v_total, 'items', v_new_items);
END;
$function$;

-- ===== mesa_pedido_aceptar =====
CREATE OR REPLACE FUNCTION public.mesa_pedido_aceptar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid := public._mesa_personal(); r public.pedidos_mesa_pendientes%ROWTYPE; v_res json; v_oid uuid;
BEGIN
  SELECT * INTO r FROM public.pedidos_mesa_pendientes WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud no encontrada'; END IF;
  IF r.estado = 'aceptado' THEN RETURN jsonb_build_object('ok', true, 'ya', true, 'order_id', r.order_id); END IF;
  IF r.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta solicitud ya fue %', r.estado; END IF;
  IF r.created_at < now() - interval '30 minutes' THEN
    UPDATE public.pedidos_mesa_pendientes SET estado = 'expirado', resolved_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expirada');
  END IF;
  v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);
  v_oid := (v_res->>'order_id')::uuid;
  UPDATE public.mesas SET dispositivos_autorizados = (array_append(dispositivos_autorizados, r.dispositivo))[greatest(1, cardinality(dispositivos_autorizados) - 18):]
   WHERE id = r.mesa_id AND NOT (r.dispositivo = ANY (dispositivos_autorizados));
  UPDATE public.pedidos_mesa_pendientes SET estado = 'aceptado', order_id = v_oid, resolved_at = now(), resolved_by = auth.uid() WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'ya', false, 'order_id', v_oid);
END $function$;

-- ===== mesa_pedir_publico =====
CREATE OR REPLACE FUNCTION public.mesa_pedir_publico(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_nombre text, p_items jsonb, p_codigo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.mesas%ROWTYPE; v_acc text; v_item jsonb; v_qty int; v_dish public.dishes%ROWTYPE; v_pp jsonb; v_unit numeric;
  v_total numeric := 0; v_lines jsonb := '[]'::jsonb; v_id uuid; v_notes text;
BEGIN
  IF p_restaurant IS NULL OR p_mesa IS NULL OR p_dispositivo IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND active = true) THEN RAISE EXCEPTION 'restaurante no disponible'; END IF;
  IF coalesce((SELECT cerrado_manual FROM public.restaurant_config WHERE restaurant_id = p_restaurant), false) THEN
    RAISE EXCEPTION 'El restaurante está cerrado temporalmente.';
  END IF;
  SELECT * INTO m FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'mesa no disponible'; END IF;

  v_acc := public._mesa_acceso(m.id, p_dispositivo, p_codigo);
  IF v_acc <> 'ok' THEN RETURN jsonb_build_object('ok', false, 'error', v_acc); END IF;

  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE restaurant_id = p_restaurant AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 40 THEN
    RAISE EXCEPTION 'Hay muchos pedidos esperando. Llama a un mesero.';
  END IF;
  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 5 THEN
    RAISE EXCEPTION 'Esta mesa ya tiene varios pedidos esperando al mesero. Espera a que los atiendan.';
  END IF;
  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 2 THEN
    RAISE EXCEPTION 'Ya tienes pedidos esperando al mesero. Espera su respuesta.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND created_at > now() - interval '10 seconds') THEN
    RAISE EXCEPTION 'Espera unos segundos antes de enviar otro pedido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'el pedido no tiene platos'; END IF;
  IF jsonb_array_length(p_items) > 30 THEN RAISE EXCEPTION 'demasiados platos en un solo pedido'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(v_item->>'kind', 'dish') <> 'dish' THEN RAISE EXCEPTION 'Los platos armados a tu gusto aún no se piden por QR. Pídelos al mesero.'; END IF;
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
    SELECT * INTO v_dish FROM public.dishes
     WHERE id = (v_item->>'dish_id')::uuid AND restaurant_id = p_restaurant AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible'; END IF;
    v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' THEN v_item->'sel' END);
    IF coalesce((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
    v_unit := (v_pp->>'unit')::numeric;
    v_total := v_total + v_unit * v_qty;
    v_notes := NULLIF(left(btrim(coalesce(v_item->>'line_notes', '')), 400), '');
    v_lines := v_lines || jsonb_build_object('id', v_dish.id, 'name', v_dish.name, 'price', v_unit, 'quantity', v_qty, 'notes', v_notes,
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END);
  END LOOP;

  INSERT INTO public.pedidos_mesa_pendientes (restaurant_id, mesa_id, table_num, dispositivo, nombre, items, total)
  VALUES (p_restaurant, m.id, m.numero, p_dispositivo, NULLIF(left(btrim(coalesce(p_nombre, '')), 60), ''), v_lines, v_total)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'total', v_total);
END $function$;

-- ===== wa_bot_cotizar =====
CREATE OR REPLACE FUNCTION public.wa_bot_cotizar(p_rid uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it jsonb; d dishes%ROWTYPE; v_qty int; v_pp jsonb; v_lineas jsonb := '[]'::jsonb; v_sub numeric := 0; v_res jsonb := '{}'::jsonb; v_tam text; t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_rid AND active) THEN RAISE EXCEPTION 'Restaurante no disponible'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Carrito inválido'; END IF;
  IF jsonb_array_length(p_items) > 30 THEN RAISE EXCEPTION 'Máximo 30 productos por pedido'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE(it->>'cantidad', '') !~ '^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    v_qty := (it->>'cantidad')::int;
    IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'La cantidad debe estar entre 1 y 20'; END IF;
    IF COALESCE(it->>'dish_id', '') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Plato inválido'; END IF;
    SELECT * INTO d FROM dishes WHERE id = (it->>'dish_id')::uuid AND restaurant_id = p_rid AND available AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese plato no está disponible'; END IF;
    v_tam := NULLIF(it->>'tamano', '');
    IF d.has_sizes AND jsonb_typeof(d.sizes) = 'array' AND jsonb_array_length(d.sizes) > 0 AND v_tam IS NULL THEN
      RAISE EXCEPTION 'Falta elegir el tamaño de %', d.name;
    END IF;
    IF NOT d.has_sizes AND v_tam IS NOT NULL THEN RAISE EXCEPTION '% no tiene tamaños', d.name; END IF;
    IF jsonb_typeof(it->'toppings') = 'array' THEN
      FOR t IN SELECT jsonb_array_elements_text(it->'toppings') LOOP
        IF jsonb_typeof(d.toppings) <> 'array' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.toppings) x WHERE x->>'nombre' = t) THEN
          RAISE EXCEPTION '"%" no es un topping de %', t, d.name;
        END IF;
      END LOOP;
    END IF;
    v_pp := _precio_plato(d, v_tam, CASE WHEN jsonb_typeof(it->'toppings') = 'array' THEN it->'toppings' END, CASE WHEN jsonb_typeof(it->'sel') = 'object' THEN it->'sel' END);
    IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'Tamaño inválido para %', d.name; END IF;
    v_res := reservar_stock_receta(d.id, v_qty, v_res);
    v_lineas := v_lineas || jsonb_build_object(
      'id', d.id, 'name', d.name, 'price', (v_pp->>'unit')::numeric, 'quantity', v_qty, 'notes', NULLIF(left(btrim(COALESCE(it->>'nota', '')), 200), ''),
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(it->'sel') = 'object' AND length((it->'sel')::text) <= 4000 THEN it->'sel' END);
    v_sub := v_sub + (v_pp->>'unit')::numeric * v_qty;
  END LOOP;
  RETURN jsonb_build_object('lineas', v_lineas, 'subtotal', v_sub);
END;
$function$;

-- ===== wa_bot_contexto =====
CREATE OR REPLACE FUNCTION public.wa_bot_contexto(p_rid uuid, p_conv uuid, p_excluir uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r restaurants%ROWTYPE; cfg wa_config%ROWTYPE; rc restaurant_config%ROWTYPE; cv wa_conversaciones%ROWTYPE; v_menu jsonb; v_hist jsonb; v_abierto boolean; v_hora time; v_cli text;
BEGIN
  SELECT * INTO r FROM restaurants WHERE id = p_rid AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cv FROM wa_conversaciones WHERE id = p_conv AND restaurant_id = p_rid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cfg FROM wa_config WHERE restaurant_id = p_rid;
  SELECT * INTO rc FROM restaurant_config WHERE restaurant_id = p_rid;
  v_hora := (now() AT TIME ZONE 'America/Bogota')::time;
  v_abierto := CASE WHEN rc.cerrado_manual THEN false
    WHEN rc.horario_activo AND rc.horario_apertura IS NOT NULL AND rc.horario_cierre IS NOT NULL THEN
      CASE WHEN rc.horario_apertura::time <= rc.horario_cierre::time THEN v_hora BETWEEN rc.horario_apertura::time AND rc.horario_cierre::time
           ELSE v_hora >= rc.horario_apertura::time OR v_hora <= rc.horario_cierre::time END
    ELSE NULL END;
  SELECT nombre INTO v_cli FROM clientes WHERE id = cv.cliente_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'categoria', (x->>'orden')::int, x->>'nombre', x->>'id'), '[]'::jsonb) INTO v_menu FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'nombre', d.name, 'descripcion', left(COALESCE(d.description, ''), 160), 'precio', d.price, 'categoria', COALESCE(d.category, ''), 'orden', COALESCE(d.sort_order, 0),
      'tamanos', CASE WHEN d.has_sizes AND jsonb_typeof(d.sizes) = 'array' THEN d.sizes ELSE '[]'::jsonb END,
      'toppings', CASE WHEN jsonb_typeof(d.toppings) = 'array' THEN d.toppings ELSE '[]'::jsonb END,
      'opciones', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', g->>'id', 'nombre', g->>'nombre', 'requerido', COALESCE((g->>'requerido')::boolean, false),
                 'min', COALESCE((g->>'min')::int, CASE WHEN COALESCE((g->>'requerido')::boolean, false) THEN 1 ELSE 0 END), 'max', CASE WHEN COALESCE(g->>'max', '') ~ '^[0-9]+$' THEN (g->>'max')::int ELSE 1 END,
                 'items', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('l', i->>'label', 'p', COALESCE((i->>'precio_extra')::numeric, 0),
                            's', CASE WHEN i ? 'sub' THEN jsonb_build_object('n', COALESCE((i->'sub'->>'cantidad')::int, 1),
                                   'o', COALESCE((SELECT jsonb_agg(si->>'label') FROM jsonb_array_elements(_lista_items(p_rid, i->'sub'->>'lista')) si WHERE COALESCE((si->>'activo')::boolean, true)), '[]'::jsonb)) END))
                   FROM jsonb_array_elements(CASE WHEN g->'fuente' ? 'lista' THEN _lista_items(p_rid, g->'fuente'->>'lista') ELSE COALESCE(g->'fuente'->'items', '[]'::jsonb) END) i
                   WHERE COALESCE((i->>'activo')::boolean, true)), '[]'::jsonb)))
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.options) = 'array' THEN d.options ELSE '[]'::jsonb END) g WHERE COALESCE(g->>'v', '') = '2'), '[]'::jsonb)) AS x
    FROM dishes d WHERE d.restaurant_id = p_rid AND d.available AND d.availability_status <> 'discontinued' LIMIT 400) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('rol', CASE WHEN h.direccion = 'entrante' THEN 'user' ELSE 'assistant' END,
                     'texto', COALESCE(h.contenido->>'texto', h.contenido->>'transcripcion', CASE h.tipo WHEN 'imagen' THEN '[imagen]' WHEN 'audio' THEN '[nota de voz]' ELSE NULL END)) ORDER BY h.created_at), '[]'::jsonb)
    INTO v_hist FROM (
      SELECT * FROM wa_mensajes m WHERE m.conversacion_id = p_conv AND m.restaurant_id = p_rid AND m.estado <> 'fallido' AND (p_excluir IS NULL OR m.id <> p_excluir)
         AND m.tipo IN ('texto','imagen','audio') ORDER BY m.created_at DESC LIMIT 12) h
    WHERE COALESCE(h.contenido->>'texto', h.contenido->>'transcripcion', CASE h.tipo WHEN 'imagen' THEN 'x' WHEN 'audio' THEN 'x' END) IS NOT NULL;

  RETURN jsonb_build_object(
    'restaurante', jsonb_build_object('id', r.id, 'nombre', COALESCE(NULLIF(btrim(rc.display_name), ''), r.name), 'slug', r.slug, 'direccion', rc.direccion, 'ciudad', rc.ciudad),
    'cfg', jsonb_build_object('modo', cfg.modo, 'bot_pedidos', COALESCE(cfg.bot_pedidos, false), 'bot_nombre', cfg.bot_nombre, 'bot_tono', cfg.bot_tono, 'bot_info', cfg.bot_info,
           'horario', cfg.horario, 'tarifa_domicilio', COALESCE(cfg.tarifa_domicilio, 0), 'cobertura', cfg.cobertura, 'datos_transferencia', cfg.datos_transferencia,
           'bot_bienvenida', cfg.bot_bienvenida, 'pedido_minimo', COALESCE(cfg.pedido_minimo, 0)),
    'abierto', jsonb_build_object('ahora', v_abierto, 'hora', to_char(v_hora, 'HH24:MI'), 'apertura', CASE WHEN rc.horario_activo THEN rc.horario_apertura END, 'cierre', CASE WHEN rc.horario_activo THEN rc.horario_cierre END,
           'mensaje', CASE WHEN rc.cerrado_manual THEN rc.cerrado_mensaje END),
    'conv', jsonb_build_object('id', cv.id, 'estado', cv.estado, 'contexto', cv.contexto, 'nombre', COALESCE(v_cli, cv.nombre_perfil), 'es_prueba', cv.es_prueba),
    'menu', v_menu, 'historial', v_hist,
    'tope_total', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_total_max'), 1500000),
    'precios', jsonb_build_object('entrada', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'ai_precio_entrada_usd_millon'), 0.3),
                                  'salida', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'ai_precio_salida_usd_millon'), 2.5)));
END;
$function$;
