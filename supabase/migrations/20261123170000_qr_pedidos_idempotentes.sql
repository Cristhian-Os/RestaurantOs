-- Menú QR sin pedidos duplicados cuando se cae el internet (mismo problema que ya se arregló para meseros/cajeros).
-- Se agregan dos funciones nuevas que ENVUELVEN a las actuales (create_public_order y mesa_pedir_publico) sin tocar su lógica de precios/límites:
--   * create_public_order_idem   -> pedido directo del menú público (sin mesa QR).
--   * mesa_pedir_publico_idem    -> pedido de una mesa con QR (queda esperando al mesero).
-- Cada una recibe un código único por envío: si ya existe un pedido con ese código en ese restaurante, devuelve el MISMO y no crea otro.
-- El código es opcional: sin código funcionan igual que las funciones originales (que siguen existiendo para apps viejas).
-- Las funciones nuevas tienen nombre distinto a propósito: no crean sobrecargas de las originales.

ALTER TABLE public.pedidos_mesa_pendientes ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_mesa_pendientes_idem_uq
  ON public.pedidos_mesa_pendientes (restaurant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_public_order_idem(p_restaurant_id uuid, p_table_num integer, p_customer_name text, p_notes text, p_items jsonb, p_idempotency_key uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR p_restaurant_id IS NULL THEN
    RETURN public.create_public_order(p_restaurant_id, p_table_num, p_customer_name, p_notes, p_items);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || p_idempotency_key::text, 1));
  SELECT id INTO v_id FROM public.orders WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_id; END IF;
  v_id := public.create_public_order(p_restaurant_id, p_table_num, p_customer_name, p_notes, p_items);
  UPDATE public.orders SET idempotency_key = p_idempotency_key WHERE id = v_id AND restaurant_id = p_restaurant_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.mesa_pedir_publico_idem(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_nombre text, p_items jsonb, p_codigo text DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_total numeric; v_r jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR p_restaurant IS NULL THEN
    RETURN public.mesa_pedir_publico(p_restaurant, p_mesa, p_dispositivo, p_nombre, p_items, p_codigo);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant::text || p_idempotency_key::text, 2));
  SELECT id, total INTO v_id, v_total FROM public.pedidos_mesa_pendientes WHERE restaurant_id = p_restaurant AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'id', v_id, 'total', v_total, 'repetido', true); END IF;
  v_r := public.mesa_pedir_publico(p_restaurant, p_mesa, p_dispositivo, p_nombre, p_items, p_codigo);
  IF coalesce((v_r->>'ok')::boolean, false) AND v_r->>'id' IS NOT NULL THEN
    UPDATE public.pedidos_mesa_pendientes SET idempotency_key = p_idempotency_key WHERE id = (v_r->>'id')::uuid AND restaurant_id = p_restaurant;
  END IF;
  RETURN v_r;
END $$;

REVOKE ALL ON FUNCTION public.create_public_order_idem(uuid, integer, text, text, jsonb, uuid), public.mesa_pedir_publico_idem(uuid, integer, uuid, text, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order_idem(uuid, integer, text, text, jsonb, uuid), public.mesa_pedir_publico_idem(uuid, integer, uuid, text, jsonb, text, uuid) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
