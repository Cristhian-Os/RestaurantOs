-- Integridad de pedidos, stock y caja (hallazgos de la auditoria 2026-10-15).
--  * crear_orden_completa: clave de idempotencia (doble envio / cola offline ya no duplican pedidos), valida que la mesa
--    sea del restaurante, y solo admin/cajero pueden crear pedidos RAPPI (nacen pagados).
--  * crear_orden_con_custom / on_order_status_change: la mesa debe ser del restaurante (un mesero podia ocupar/liberar
--    mesas de otro restaurante).
--  * cancelar_orden / cancelar_item_orden / tv_cocina_cancelar: ya no se cancela un pedido con pagos (sacaba el dinero
--    ya recibido del corte), reponen el stock descontado al crear el pedido, y cancelar un item resta precio*cantidad.
--  * _cobrar_base: el efectivo debe cubrir lo que falta mas la propina (antes un monto vacio/corto pasaba).
--  * hacer_corte_caja: un solo corte por dia (UNIQUE restaurant_id+fecha); repetirlo ACTUALIZA el existente. Los cortes
--    duplicados historicos se archivan en cortes_caja_archivo (no se pierde nada).
--  * editar_items_pedido: no se edita un pedido con pagos registrados o con un pago en linea en curso (se podia pagar
--    menos de lo que vale).
--  * gastos: el cajero no puede borrar un gasto de un dia con corte.
-- Reversa: supabase/rollback/20261015202000_integridad_pedidos_caja_down.sql

-- 0) Estructura ---------------------------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_idx ON public.orders (restaurant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cortes_caja_archivo (LIKE public.cortes_caja INCLUDING DEFAULTS, archivado_at timestamptz NOT NULL DEFAULT now(), motivo text);
ALTER TABLE public.cortes_caja_archivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cortes_caja_archivo FROM anon, authenticated;
CREATE POLICY cortes_archivo_admin ON public.cortes_caja_archivo FOR SELECT TO authenticated
  USING (((restaurant_id = (SELECT current_restaurant_id())) AND (SELECT is_admin())) OR (SELECT is_super_admin()));
GRANT SELECT ON public.cortes_caja_archivo TO authenticated;

-- Consolida los cortes duplicados del mismo dia: queda el ultimo (acumula todo el dia); los demas se archivan.
INSERT INTO public.cortes_caja_archivo
  SELECT c.*, now(), 'duplicado del mismo dia, archivado al crear el indice unico'
    FROM public.cortes_caja c
   WHERE c.id NOT IN (SELECT DISTINCT ON (restaurant_id, fecha) id FROM public.cortes_caja ORDER BY restaurant_id, fecha, created_at DESC, id DESC);
DELETE FROM public.cortes_caja
 WHERE id NOT IN (SELECT DISTINCT ON (restaurant_id, fecha) id FROM public.cortes_caja ORDER BY restaurant_id, fecha, created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cortes_caja_dia_uniq ON public.cortes_caja (restaurant_id, fecha);

-- Reposicion de stock (la usan las cancelaciones; el stock se descuenta al crear el pedido, via detalles_pedidos).
CREATE OR REPLACE FUNCTION public._reponer_stock_orden(p_order_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.ingredientes i
     SET stock_actual = i.stock_actual + x.cant, updated_at = now()
    FROM (SELECT r.ingrediente_id, SUM(r.cantidad_necesaria * d.cantidad) AS cant
            FROM public.detalles_pedidos d JOIN public.recetas r ON r.producto_id = d.dish_id
           WHERE d.order_id = p_order_id AND r.ingrediente_id IS NOT NULL
           GROUP BY r.ingrediente_id) x
   WHERE i.id = x.ingrediente_id;
$function$;
REVOKE ALL ON FUNCTION public._reponer_stock_orden(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reponer_stock_orden(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._orden_tiene_pagos(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.paid_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.order_payments op WHERE op.order_id = p_order_id AND op.anulado_at IS NULL);
$function$;
REVOKE ALL ON FUNCTION public._orden_tiene_pagos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._orden_tiene_pagos(uuid) TO service_role;

-- 1) crear_orden_completa con idempotencia, mesa validada y RAPPI restringido ----------------------------------------
DROP FUNCTION IF EXISTS public.crear_orden_completa(uuid, jsonb, text, text, integer, text);
CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL::text, p_table_num integer DEFAULT NULL::integer, p_customer_name text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
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
  v_existente public.orders%ROWTYPE;
  v_key      text := NULLIF(left(btrim(COALESCE(p_idempotency_key, '')), 80), '');
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
  IF p_tipo_pedido = 'RAPPI' AND public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar pedidos de Rappi';
  END IF;
  IF p_mesa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mesas WHERE id = p_mesa_id AND restaurant_id = v_rid) THEN
    RAISE EXCEPTION 'La mesa no pertenece a tu restaurante';
  END IF;
  -- Idempotencia: el mismo intento (doble clic, reintento de red, cola offline) devuelve el pedido ya creado.
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.orders WHERE restaurant_id = v_rid AND idempotency_key = v_key;
    IF FOUND THEN
      RETURN json_build_object('order_id', v_existente.id, 'total', v_existente.total, 'status', v_existente.status, 'duplicado', true);
    END IF;
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
    v_comensal := NULLIF(left(btrim(coalesce(v_item->>'comensal', '')), 60), '');
    v_items_final := v_items_final || (jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes',
      'size', v_size, 'toppings', v_toppings_ok,
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END
    ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);
  END LOOP;

  INSERT INTO public.orders (
    user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id, customer_name,
    payment_method, paid_at, amount_paid, paid_by, idempotency_key
  )
  VALUES (
    auth.uid(), p_mesa_id, p_table_num, v_items_final, v_total, p_tipo_pedido, p_notes, 'pending', v_rid,
    NULLIF(left(trim(coalesce(p_customer_name,'')), 120), ''),
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN 'rappi' END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN NOW() END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN v_total END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN auth.uid() END,
    v_key
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_final) LOOP
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id)
    VALUES (v_order.id, (v_item->>'id')::UUID, (v_item->>'quantity')::INTEGER, (v_item->>'price')::NUMERIC, v_item->>'notes', v_rid);
  END LOOP;

  RETURN json_build_object('order_id', v_order.id, 'total', v_total, 'status', 'pending', 'duplicado', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_orden_completa(uuid, jsonb, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_orden_completa(uuid, jsonb, text, text, integer, text, text) TO authenticated, service_role;

-- 2) crear_orden_con_custom: mesa del restaurante -------------------------------------------------------------------
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
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier','client') THEN
    RAISE EXCEPTION 'No autorizado para crear órdenes';
  END IF;
  IF v_rid IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el restaurante';
  END IF;
  IF p_mesa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mesas WHERE id = p_mesa_id AND restaurant_id = v_rid) THEN
    RAISE EXCEPTION 'La mesa no pertenece a tu restaurante';
  END IF;

  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id)
  VALUES (auth.uid(), p_mesa_id, p_table_num, '[]'::jsonb, 0, p_tipo_pedido, p_notes, 'pending', v_rid)
  RETURNING id INTO v_order_id;

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

  UPDATE public.orders
  SET items = v_items_final, total = v_total
  WHERE id = v_order_id;

  RETURN json_build_object(
    'order_id', v_order_id,
    'total',    v_total,
    'status',   'pending'
  );
END; $function$;

-- 3) El trigger de mesas no cruza restaurantes ---------------------------------------------------------------------
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
        UPDATE public.mesas SET estado = 'libre' WHERE id = NEW.mesa_id AND restaurant_id = NEW.restaurant_id;
      END IF;
    END IF;
  END IF;
  IF NEW.status NOT IN ('completed','cancelled') AND NEW.mesa_id IS NOT NULL THEN
    UPDATE public.mesas SET estado = 'ocupada' WHERE id = NEW.mesa_id AND restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END; $function$;

-- 4) Cancelaciones: sin pagos vigentes, con reposicion de stock ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_orden(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT public.get_user_role() INTO v_role;

  -- Personal: solo pedidos de su restaurante, activos y sin pagos. Comensal/anonimo: solo pendientes y sin pagar.
  IF v_role IN ('admin','cashier','waiter','kitchen') THEN
    IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
      RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    IF v_order.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Este pedido ya no se puede cancelar';
    END IF;
    IF public._orden_tiene_pagos(p_order_id) THEN
      RAISE EXCEPTION 'Este pedido ya tiene pagos registrados. Anula los pagos en caja antes de cancelarlo.';
    END IF;
  ELSE
    IF v_order.status <> 'pending' OR public._orden_tiene_pagos(p_order_id) THEN
      RAISE EXCEPTION 'Tu pedido ya fue pagado o está en preparación. Pide el cambio en caja.';
    END IF;
  END IF;

  UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;
  PERFORM public._reponer_stock_orden(p_order_id);

  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_item_orden(p_order_id uuid, p_item_index integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role TEXT;
  v_items JSONB;
  v_item JSONB;
  v_qty INTEGER;
  v_item_total NUMERIC;
  v_new_total NUMERIC;
  v_dish UUID;
  v_det public.detalles_pedidos%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;

  SELECT public.get_user_role() INTO v_role;
  IF v_role IS NULL OR v_role NOT IN ('kitchen', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'Solo cocina, cajero o admin pueden cancelar items';
  END IF;
  IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;
  IF v_order.status != 'cooking' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar items de órdenes en cooking';
  END IF;
  IF public._orden_tiene_pagos(p_order_id) THEN
    RAISE EXCEPTION 'Este pedido ya tiene pagos registrados. Anula los pagos en caja antes de cancelar productos.';
  END IF;

  v_items := CASE
    WHEN jsonb_typeof(v_order.items::jsonb) = 'array' THEN v_order.items::jsonb
    ELSE '[]'::jsonb
  END;

  IF p_item_index < 0 OR p_item_index >= jsonb_array_length(v_items) THEN
    RAISE EXCEPTION 'Índice de item inválido';
  END IF;

  v_item := v_items -> p_item_index;
  IF COALESCE((v_item->>'cancelled')::boolean, false) THEN
    RAISE EXCEPTION 'Ese producto ya estaba cancelado';
  END IF;

  v_qty := GREATEST(COALESCE((v_item->>'quantity')::INTEGER, 1), 1);
  v_item_total := COALESCE((v_item->>'price')::NUMERIC, 0) * v_qty;

  v_items := jsonb_set(v_items, ARRAY[p_item_index::text, 'cancelled'], 'true'::jsonb);
  v_new_total := GREATEST(0, v_order.total - v_item_total);

  UPDATE public.orders SET items = v_items, total = v_new_total, updated_at = NOW() WHERE id = p_order_id;

  -- Repone el stock de ese producto y descuenta su linea de detalles_pedidos (para no reponerlo dos veces).
  IF (v_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_dish := (v_item->>'id')::uuid;
    SELECT * INTO v_det FROM public.detalles_pedidos
     WHERE order_id = p_order_id AND dish_id = v_dish AND cantidad >= v_qty
     ORDER BY created_at LIMIT 1;
    IF FOUND THEN
      UPDATE public.ingredientes i
         SET stock_actual = i.stock_actual + r.cantidad_necesaria * v_qty, updated_at = now()
        FROM public.recetas r
       WHERE r.producto_id = v_dish AND r.ingrediente_id = i.id;
      IF v_det.cantidad = v_qty THEN
        DELETE FROM public.detalles_pedidos WHERE id = v_det.id;
      ELSE
        UPDATE public.detalles_pedidos SET cantidad = cantidad - v_qty WHERE id = v_det.id;
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'order_id', p_order_id,
    'item_index', p_item_index,
    'item_name', v_item->>'name',
    'new_total', v_new_total,
    'message', 'Item cancelado'
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.tv_cocina_cancelar(p_token text, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid := public._tv_restaurante(p_token); n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND restaurant_id = rid)
     AND public._orden_tiene_pagos(p_order_id) THEN
    RETURN jsonb_build_object('status', 'pagado');
  END IF;
  UPDATE public.orders SET status = 'cancelled', updated_at = now()
   WHERE id = p_order_id AND restaurant_id = rid AND status IN ('pending','cooking','ready');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN PERFORM public._reponer_stock_orden(p_order_id); END IF;
  RETURN jsonb_build_object('status', CASE WHEN n = 1 THEN 'ok' ELSE 'sin_cambio' END);
END $function$;

-- 5) El efectivo debe cubrir lo que falta mas la propina ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cobrar_base(p_order_id uuid, p_metodo text, p_amount numeric, p_propina numeric, p_completar boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid     uuid := public.current_restaurant_id();
  v_order   public.orders%ROWTYPE;
  v_pagado  numeric; v_falta numeric; v_cambio numeric := 0;
  v_propina numeric := GREATEST(COALESCE(p_propina,0),0);
  v_metodo_pago text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'La orden está cancelada'; END IF;
  IF p_completar AND v_order.status != 'ready' THEN
    RAISE EXCEPTION 'La orden debe estar en estado "ready" para cobrar (estado actual: %)', v_order.status;
  END IF;
  IF NOT p_completar AND v_order.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya fue pagada'; END IF;

  IF v_order.paid_at IS NULL THEN
    SELECT COALESCE(SUM(monto),0) INTO v_pagado FROM public.order_payments
      WHERE order_id = p_order_id AND anulado_at IS NULL;
    v_falta := GREATEST(v_order.total - v_pagado, 0);

    IF v_falta > 0 THEN
      v_metodo_pago := CASE WHEN p_metodo IN ('efectivo','transferencia','tarjeta') THEN p_metodo ELSE 'efectivo' END;
      IF v_metodo_pago = 'efectivo' AND (p_amount IS NULL OR p_amount < v_falta + v_propina) THEN
        RAISE EXCEPTION 'El efectivo recibido no alcanza (faltan % más la propina %)', v_falta, v_propina;
      END IF;
      IF v_metodo_pago = 'efectivo' AND p_amount IS NOT NULL THEN
        v_cambio := GREATEST(p_amount - v_falta - v_propina, 0);
      END IF;
      INSERT INTO public.order_payments
        (restaurant_id, order_id, payment_method, monto, propina, monto_recibido, cambio, paid_by)
      VALUES
        (v_rid, p_order_id, v_metodo_pago, v_falta, v_propina,
         CASE WHEN v_metodo_pago = 'efectivo' THEN p_amount END, v_cambio, auth.uid());
      PERFORM public._orden_recalcular_pago(p_order_id);
    ELSE
      UPDATE public.orders SET payment_method = CASE WHEN p_metodo IN ('efectivo','transferencia','tarjeta') THEN p_metodo ELSE 'efectivo' END,
             amount_paid = COALESCE(p_amount, v_order.total), propina = v_propina,
             paid_at = NOW(), paid_by = auth.uid()
       WHERE id = p_order_id;
    END IF;
    PERFORM public.registrar_venta_stock(p_order_id);
  END IF;

  IF p_completar THEN
    UPDATE public.orders SET status = 'completed' WHERE id = p_order_id;
    PERFORM public.registrar_venta_stock(p_order_id);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN json_build_object('order_id', p_order_id, 'total', v_order.total,
    'paid', COALESCE(v_order.amount_paid, v_order.total), 'change', v_cambio,
    'method', v_order.payment_method, 'propina', COALESCE(v_order.propina, 0));
END;
$function$;

-- 6) Un solo corte por dia: repetirlo actualiza el existente -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_ef numeric; v_tr numeric; v_tj numeric; v_prop numeric; v_prop_ef numeric;
  v_ordenes int; v_ids uuid[];
  v_gastos numeric; v_gastos_caja numeric; v_gastos_propios numeric; v_reemb_caja numeric; v_aportes numeric;
  v_neto numeric; v_base numeric; v_esperado numeric; v_existia boolean;
  v_rid   uuid := public.current_restaurant_id();
  v_hoy   date := public.hoy_local();
  v_desde timestamptz := public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
  v_hasta timestamptz := (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota';
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden hacer el corte de caja';
  END IF;

  SELECT COALESCE(SUM(p.monto) FILTER (WHERE p.payment_method = 'efectivo'), 0),
         COALESCE(SUM(p.monto) FILTER (WHERE p.payment_method = 'transferencia'), 0),
         COALESCE(SUM(p.monto) FILTER (WHERE p.payment_method = 'tarjeta'), 0),
         COALESCE(SUM(p.propina), 0),
         COALESCE(SUM(p.propina) FILTER (WHERE p.payment_method = 'efectivo'), 0)
    INTO v_ef, v_tr, v_tj, v_prop, v_prop_ef
    FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
   WHERE p.restaurant_id = v_rid AND p.anulado_at IS NULL
     AND p.paid_at >= v_desde AND p.paid_at < v_hasta
     AND o.status <> 'cancelled'
     AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi';

  SELECT COUNT(*)::int, ARRAY_AGG(id) INTO v_ordenes, v_ids
    FROM public.orders
   WHERE status = 'completed' AND paid_at >= v_desde AND paid_at < v_hasta AND restaurant_id = v_rid
     AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi';

  SELECT COALESCE(SUM(monto), 0),
         COALESCE(SUM(monto) FILTER (WHERE fuente = 'caja'), 0),
         COALESCE(SUM(monto) FILTER (WHERE fuente = 'propio'), 0)
    INTO v_gastos, v_gastos_caja, v_gastos_propios
    FROM public.gastos WHERE created_at >= v_desde AND created_at < v_hasta AND restaurant_id = v_rid;

  SELECT COALESCE(SUM(monto), 0) INTO v_reemb_caja FROM public.gastos
   WHERE restaurant_id = v_rid AND reembolso_medio = 'caja' AND reembolsado_at >= v_desde AND reembolsado_at < v_hasta;

  SELECT COALESCE(SUM(monto), 0) INTO v_aportes FROM public.aportes_caja WHERE restaurant_id = v_rid AND fecha = v_hoy;

  SELECT monto INTO v_base FROM public.bases_caja WHERE restaurant_id = v_rid AND fecha = v_hoy;
  v_base := COALESCE(v_base, 0);

  v_neto     := v_ef + v_tr + v_tj - v_gastos;
  v_esperado := v_base + v_aportes + v_ef + v_prop_ef - v_gastos_caja - v_reemb_caja;
  v_existia := EXISTS (SELECT 1 FROM public.cortes_caja WHERE restaurant_id = v_rid AND fecha = v_hoy);

  INSERT INTO public.cortes_caja (
    cashier_id, fecha, total_efectivo, total_transferencia, total_rappi, total_ordenes, ordenes_ids, notas,
    restaurant_id, total_gastos, total_neto, total_propinas, total_propinas_efectivo, base_caja,
    total_tarjeta, total_gastos_caja, total_gastos_propios, total_reembolsos_caja, total_aportes, efectivo_esperado
  ) VALUES (
    auth.uid(), v_hoy, v_ef, v_tr, 0, v_ordenes, v_ids, p_notas,
    v_rid, v_gastos, v_neto, v_prop, v_prop_ef, v_base,
    v_tj, v_gastos_caja, v_gastos_propios, v_reemb_caja, v_aportes, v_esperado
  ) ON CONFLICT (restaurant_id, fecha) DO UPDATE SET
    cashier_id = EXCLUDED.cashier_id, total_efectivo = EXCLUDED.total_efectivo,
    total_transferencia = EXCLUDED.total_transferencia, total_rappi = EXCLUDED.total_rappi,
    total_ordenes = EXCLUDED.total_ordenes, ordenes_ids = EXCLUDED.ordenes_ids,
    notas = COALESCE(EXCLUDED.notas, public.cortes_caja.notas),
    total_gastos = EXCLUDED.total_gastos, total_neto = EXCLUDED.total_neto,
    total_propinas = EXCLUDED.total_propinas, total_propinas_efectivo = EXCLUDED.total_propinas_efectivo,
    base_caja = EXCLUDED.base_caja, total_tarjeta = EXCLUDED.total_tarjeta,
    total_gastos_caja = EXCLUDED.total_gastos_caja, total_gastos_propios = EXCLUDED.total_gastos_propios,
    total_reembolsos_caja = EXCLUDED.total_reembolsos_caja, total_aportes = EXCLUDED.total_aportes,
    efectivo_esperado = EXCLUDED.efectivo_esperado
  RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id', v_corte.id, 'actualizado', v_existia, 'fecha', v_corte.fecha,
    'total_efectivo', v_ef, 'total_transferencia', v_tr, 'total_tarjeta', v_tj,
    'total_general', v_ef + v_tr + v_tj, 'total_ordenes', v_ordenes,
    'total_gastos', v_gastos, 'total_neto', v_neto,
    'total_propinas', v_prop, 'total_propinas_efectivo', v_prop_ef,
    'base_caja', v_base,
    'gastos_pagados_de_caja', v_gastos_caja, 'gastos_adelantados', v_gastos_propios,
    'reembolsos_de_caja', v_reemb_caja, 'aportes_a_caja', v_aportes,
    'efectivo_esperado_cajon', v_esperado
  );
END;
$function$;

-- 7) No se edita un pedido con pagos -------------------------------------------------------------------------------
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

  IF EXISTS (SELECT 1 FROM public.order_payments op WHERE op.order_id = p_order_id AND op.anulado_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.payments pm WHERE pm.order_id = p_order_id
                  AND (pm.status = 'APPROVED' OR (pm.status = 'PENDING' AND pm.created_at > now() - interval '30 minutes'))) THEN
    RAISE EXCEPTION 'Este pedido tiene pagos registrados o un pago en línea en curso; ya no se puede editar.';
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

-- 8) El cajero no borra gastos de un dia con corte (el administrador si; luego repite el corte) ------------------------
CREATE OR REPLACE FUNCTION public.gastos_bloquear_dia_cerrado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_user_role() = 'cashier'
     AND public._dia_con_corte(OLD.restaurant_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Ese día ya tiene corte de caja. Pídele al administrador que ajuste el gasto.';
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.gastos_bloquear_dia_cerrado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gastos_dia_cerrado ON public.gastos;
CREATE TRIGGER gastos_dia_cerrado BEFORE DELETE ON public.gastos FOR EACH ROW EXECUTE FUNCTION public.gastos_bloquear_dia_cerrado();
