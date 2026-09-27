-- La migracion toppings_por_plato (20260926235104) se baso en una copia
-- vieja de crear_orden_completa y sin querer revirtio el fix de
-- rappi_no_cobra_en_tienda (20260926233822): desde entonces, los pedidos
-- RAPPI nacian con paid_at=NULL como cualquier pedido local, cayendo en la
-- cola de "por cobrar antes de cocina" de Caja. El cajero terminaba
-- cobrandolos manualmente (efectivo/transferencia) para poder mandarlos a
-- cocina, inflando esos totales con plata que Rappi ya le cobro al
-- cliente por su cuenta -> descuadre de caja.
--
-- Esta version junta las 3 piezas que deben convivir: auto-pago Rappi,
-- toppings (agregada despues) y p_customer_name (agregada hoy).
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
    END IF;

    v_toppings_sel := COALESCE(v_item->'toppings', '[]'::jsonb);
    v_toppings_total := 0;
    IF jsonb_typeof(v_dish.toppings) = 'array' AND jsonb_typeof(v_toppings_sel) = 'array' THEN
      SELECT COALESCE(SUM((t->>'precio')::numeric), 0) INTO v_toppings_total
      FROM jsonb_array_elements(v_dish.toppings) t
      WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_toppings_sel));
    END IF;
    v_unit := v_unit + v_toppings_total;

    v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    v_total := v_total + v_unit * v_qty;
    v_items_final := v_items_final || jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes'
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

NOTIFY pgrst, 'reload schema';

-- Corrige los 2 pedidos RAPPI de hoy (2026-09-27, restaurante Cholaos) que
-- el cajero tuvo que cobrar manualmente por el bug de arriba, para que no
-- infuenrizados el corte de caja de hoy: se contaban como transferencia
-- ($73.000 en total) cuando en realidad Rappi ya le cobro al cliente.
-- Ningun corte de hoy los habia incluido todavia (se verifico antes de
-- aplicar esto), asi que no hace falta tocar cortes_caja.
UPDATE public.orders
SET payment_method = 'rappi'
WHERE id IN ('97278619-9594-4b1b-a67b-30038b3d24de', '6087a6ee-5ca3-44dc-8569-c9a2dc67966e')
  AND tipo_pedido = 'RAPPI';
