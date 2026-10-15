-- REVERSA de 20261015073000_compra_crea_ingrediente_y_proveedor.sql
-- Devuelve registrar_compra_proveedor a su version anterior (solo suma stock a ingredientes que ya existen).
-- NO borra los ingredientes ni los proveedores que la version nueva ya creo.
-- SI quita la columna gastos.proveedor_id: se pierde el enlace gasto -> proveedor de las compras hechas
-- con la version nueva (el texto del gasto, `concepto`, se conserva).

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
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
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
END; $function$;

REVOKE ALL ON FUNCTION public.registrar_compra_proveedor(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_proveedor(text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public._unidad_ingrediente(text);
DROP FUNCTION IF EXISTS public._norm_nombre(text);
DROP INDEX IF EXISTS public.gastos_proveedor_id_idx;
ALTER TABLE public.gastos DROP COLUMN IF EXISTS proveedor_id;
