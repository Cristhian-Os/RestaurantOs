-- Bloque 1, paso 5 del Anexo A (B2.2): tomar el pedido por persona.
-- crear_orden_completa y editar_items_pedido reconstruyen cada plato y descartarian el campo opcional
-- "comensal" ("Persona 2" o un nombre). Esta migracion lo conserva si viene (maximo 60 caracteres).
-- Es CREATE OR REPLACE con la MISMA firma (no crea una copia duplicada de la funcion).
-- Texto base: definicion real de produccion el 2026-10-14; solo cambian los bloques marcados "COMENSAL".
-- REVERSA: supabase/rollback/20261014170000_comensal_en_items_pedido_down.sql

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
  v_comensal text;
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
    -- COMENSAL: persona a la que se le cobra este plato (opcional, para dividir la cuenta)
    v_comensal := NULLIF(left(btrim(coalesce(v_item->>'comensal', '')), 60), '');
    v_items_final := v_items_final || (jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes',
      'size', v_size, 'toppings', v_toppings_ok,
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END
    ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);
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

      -- COMENSAL: si la edicion no lo manda, se conserva el del plato original
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
