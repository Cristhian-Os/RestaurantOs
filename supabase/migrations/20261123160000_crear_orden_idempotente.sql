-- Pedidos sin duplicados cuando se cae el internet justo al enviar.
-- Problema: el pedido llegaba al servidor, la respuesta "listo" se perdía, el celular lo reenviaba desde su cola
-- y el servidor creaba un segundo pedido igual (corte de caja inflado).
-- Solución: cada pedido lleva un código único (generado en el celular al tocar "Enviar", y reutilizado en cada reintento).
-- crear_orden_completa busca ese código primero: si ya existe, devuelve el MISMO pedido y no crea nada.
--  * orders.idempotency_key + índice único por restaurante (red de seguridad contra choques simultáneos).
--  * El código es opcional (DEFAULT NULL): quien no lo manda (QR por mesa, apps viejas) funciona igual que antes.
--  * Se borra la firma vieja de 6 parámetros para no dejar una sobrecarga duplicada (regla del proyecto).
--  * El resto de la función no cambia: es la misma lógica de precios, stock y detalles de pedido.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS orders_restaurant_idempotency_key_uq
  ON public.orders (restaurant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.crear_orden_completa(uuid, jsonb, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL::text, p_table_num integer DEFAULT NULL::integer, p_customer_name text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
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

  -- Reintento del mismo pedido: se devuelve el que ya existe. El candado evita que dos envíos simultáneos
  -- con el mismo código creen dos pedidos (el segundo espera al primero y luego lo encuentra).
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_rid::text || p_idempotency_key::text, 0));
    SELECT * INTO v_order FROM public.orders WHERE restaurant_id = v_rid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN json_build_object('order_id', v_order.id, 'total', v_order.total, 'status', v_order.status, 'duplicado', true);
    END IF;
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
    ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END || CASE WHEN v_pp->>'menu_nombre' IS NOT NULL THEN jsonb_build_object('menu', v_pp->>'menu_nombre', 'menu_id', v_pp->>'menu_id') ELSE '{}'::jsonb END);
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
    p_idempotency_key
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

REVOKE ALL ON FUNCTION public.crear_orden_completa(uuid, jsonb, text, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_orden_completa(uuid, jsonb, text, text, integer, text, uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
