-- Reversa de 20261017000002: quita el cálculo de opciones v2 de las funciones de pedido y restaura las dos funciones de stock.
DO $$
DECLARE
  f record; def text;
  quitar jsonb := jsonb_build_array(
    jsonb_build_array('crear_orden_completa', E'\n    v_unit := v_unit + public._opciones_v2(v_dish.id, v_rid, v_item->''sel'');', ''),
    jsonb_build_array('crear_orden_completa', E'notes, restaurant_id, opciones_consumo)', E'notes, restaurant_id)'),
    jsonb_build_array('crear_orden_completa', E'v_rid,\n      public._consumo_opciones((v_item->>''id'')::UUID, v_rid, v_item->''sel''));', E'v_rid);'),
    jsonb_build_array('create_public_order', E'\n      v_unit := v_unit + public._opciones_v2(v_dish.id, p_restaurant_id, CASE WHEN jsonb_typeof(v_item->''sel'') = ''object'' THEN v_item->''sel'' END);', ''),
    jsonb_build_array('editar_items_pedido', E'\n      v_unit := v_unit + public._opciones_v2(v_dish.id, v_order.restaurant_id, v_elem->''sel'', false);', '')
  );
  p jsonb;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(quitar) LOOP
    SELECT pr.oid INTO f FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace WHERE ns.nspname = 'public' AND pr.proname = p->>0;
    def := pg_get_functiondef(f.oid);
    IF position((p->>1) IN def) > 0 THEN EXECUTE replace(def, p->>1, p->>2); END IF;
  END LOOP;
END $$;

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
$function$;

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
END; $function$;

DROP FUNCTION IF EXISTS public._consumo_opciones(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public._opciones_v2(uuid, uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public._lista_items(uuid, text);
ALTER TABLE public.detalles_pedidos DROP COLUMN IF EXISTS opciones_consumo;
