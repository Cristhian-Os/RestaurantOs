-- Editar un producto de un pedido con el mismo constructor con el que se armó.
--
-- Para poder reabrir el constructor precargado (cantidad, tamaño, sabores,
-- queso/helado, toppings, comentario) cada línea del pedido guarda ahora,
-- además de id/name/price/quantity/notes:
--   size      tamaño elegido (NULL si el plato no usa tamaños)
--   toppings  toppings elegidos (solo los que existen en dishes.toppings)
--   sel       selección completa del constructor (JSON del frontend, solo
--             para reabrirlo; el precio NUNCA sale de aquí)
--
-- crear_orden_completa y create_public_order conservan su firma (CREATE OR
-- REPLACE en el lugar, sin overloads nuevos) y toda su lógica anterior
-- (auto-pago Rappi, customer_name, toppings, stock, rate limit, horario).

CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL::text, p_table_num integer DEFAULT NULL::integer, p_customer_name text DEFAULT NULL::text)
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
  v_toppings_sel   jsonb;
  v_toppings_total numeric;
  v_toppings_ok    jsonb;
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

    v_size := NULLIF(v_item->>'size', '');
    IF v_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(v_dish.sizes) = 'array' THEN
      SELECT s INTO v_size_obj FROM jsonb_array_elements(v_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
      IF v_size_obj IS NULL THEN RAISE EXCEPTION 'tamaño inválido para %: %', v_dish.name, v_size; END IF;
      v_unit := (v_size_obj->>'precio')::numeric;
    ELSE
      v_unit := v_dish.price;
      v_size := NULL;
    END IF;

    v_toppings_sel := COALESCE(v_item->'toppings', '[]'::jsonb);
    v_toppings_total := 0;
    v_toppings_ok := '[]'::jsonb;
    IF jsonb_typeof(v_dish.toppings) = 'array' AND jsonb_typeof(v_toppings_sel) = 'array' THEN
      SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
        INTO v_toppings_total, v_toppings_ok
      FROM jsonb_array_elements(v_dish.toppings) t
      WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_toppings_sel));
    END IF;
    v_unit := v_unit + v_toppings_total;

    v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    v_total := v_total + v_unit * v_qty;
    v_items_final := v_items_final || jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes',
      'size', v_size, 'toppings', v_toppings_ok,
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END
    );
  END LOOP;

  -- RAPPI: Rappi ya le cobró al cliente por su app. El pedido nace pagado
  -- (payment_method='rappi', paid_at=NOW()) para que NUNCA aparezca en la
  -- cola de cobro de caja; solo queda pendiente de preparar/entregar.
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
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id)
    VALUES (v_order.id, (v_item->>'id')::UUID, (v_item->>'quantity')::INTEGER, (v_item->>'price')::NUMERIC, v_item->>'notes', v_rid);
  END LOOP;

  RETURN json_build_object('order_id', v_order.id, 'total', v_total, 'status', 'pending');
END;
$function$;

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
  v_toppings_sel   jsonb;
  v_toppings_total numeric;
  v_toppings_ok    jsonb;
  v_sel            jsonb;
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

      v_size := NULLIF(v_item->>'size', '');
      IF v_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(v_dish.sizes) = 'array' THEN
        SELECT s INTO v_size_obj FROM jsonb_array_elements(v_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
        IF v_size_obj IS NULL THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
        v_unit := (v_size_obj->>'precio')::numeric;
      ELSE
        v_unit := v_dish.price;
        v_size := NULL;
      END IF;

      -- Toppings elegidos (solo nombres); precio recalculado desde dishes.toppings
      v_toppings_sel := COALESCE(v_item->'toppings', '[]'::jsonb);
      v_toppings_total := 0;
      v_toppings_ok := '[]'::jsonb;
      IF jsonb_typeof(v_dish.toppings) = 'array' AND jsonb_typeof(v_toppings_sel) = 'array' THEN
        SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
          INTO v_toppings_total, v_toppings_ok
        FROM jsonb_array_elements(v_dish.toppings) t
        WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_toppings_sel));
      END IF;
      v_unit := v_unit + v_toppings_total;

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

-- Reemplaza las líneas de un pedido por la versión editada.
--   p_items: [{ idx, quantity, size, toppings, notes, sel }]
--     idx  = posición de la línea en el pedido ORIGINAL (el plato sale de ahí,
--            nunca del cliente, así que no se puede cambiar por otro plato)
--   Líneas que no vienen se quitan. El precio se recalcula aquí igual que al
--   crear el pedido (tamaño + toppings desde dishes).
-- Quién puede:
--   - personal (admin/cajero/mesero) de ese restaurante: pedidos pendientes o
--     listos. Si ya está pagado, solo cambios que no muevan el total (ej.
--     otro sabor): lo cobrado no puede quedar distinto a lo registrado.
--   - comensal del menú QR (sin sesión): solo su pedido pendiente y sin pagar
--     (tener el id del pedido es la credencial, igual que cancelar_orden).
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

      v_new_items := v_new_items || jsonb_build_object(
        'id', v_dish.id, 'name', COALESCE(v_orig->>'name', v_dish.name), 'price', v_unit,
        'quantity', v_qty, 'notes', v_notes, 'size', v_size, 'toppings', v_top_ok,
        'sel', CASE WHEN jsonb_typeof(v_elem->'sel') = 'object' AND length((v_elem->'sel')::text) <= 4000 THEN v_elem->'sel' END
      );
    ELSE
      -- Plato personalizado (sin plato en el menú): solo cantidad y nota.
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

GRANT EXECUTE ON FUNCTION public.editar_items_pedido(uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
