-- QR: el comensal PAGA PRIMERO en Caja y solo entonces el pedido pasa a cocina. Además el nombre es obligatorio.
-- Alcance: SOLO pedidos que nacen del menú público (create_public_order_idem) y los de mesa con QR cuando el mesero
-- los acepta (mesa_pedido_aceptar). Los pedidos del mesero/cajero y Rappi NO cambian: siguen entrando a cocina como hoy.
-- Mecanismo: orders.espera_pago_qr = true mantiene el pedido fuera de cocina (pantalla y TV) hasta que quede pagado.
--   * Caja lo ve igual que siempre en "Pedidos por cobrar antes de cocina" (status pending y paid_at nulo).
--   * Al quedar pagado (cobro normal, pago dividido o pago en línea) un trigger apaga la espera y cocina lo recibe.
-- No toca _cobrar_base, registrar_pago, cobrar_orden ni hacer_corte_caja: el dinero y el corte no cambian.
-- Las funciones reemplazadas conservan su firma (no crean sobrecargas).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS espera_pago_qr boolean NOT NULL DEFAULT false;

-- 1) Al quedar pagado, el pedido sale de espera y pasa a cocina (cualquier vía que llene paid_at).
CREATE OR REPLACE FUNCTION public._liberar_espera_pago_qr()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.espera_pago_qr := false;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._liberar_espera_pago_qr() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_liberar_espera_pago_qr ON public.orders;
CREATE TRIGGER orders_liberar_espera_pago_qr
  BEFORE UPDATE OF paid_at ON public.orders
  FOR EACH ROW WHEN (NEW.paid_at IS NOT NULL AND NEW.espera_pago_qr)
  EXECUTE FUNCTION public._liberar_espera_pago_qr();

-- 2) Pedido directo del menú público: exige nombre y queda esperando el pago.
CREATE OR REPLACE FUNCTION public.create_public_order_idem(p_restaurant_id uuid, p_table_num integer, p_customer_name text, p_notes text, p_items jsonb, p_idempotency_key uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF btrim(coalesce(p_customer_name, '')) = '' THEN
    RAISE EXCEPTION 'Escribe tu nombre para enviar el pedido';
  END IF;
  IF p_idempotency_key IS NULL OR p_restaurant_id IS NULL THEN
    v_id := public.create_public_order(p_restaurant_id, p_table_num, p_customer_name, p_notes, p_items);
    UPDATE public.orders SET espera_pago_qr = true WHERE id = v_id AND restaurant_id = p_restaurant_id AND paid_at IS NULL;
    RETURN v_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || p_idempotency_key::text, 1));
  SELECT id INTO v_id FROM public.orders WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_id; END IF;
  v_id := public.create_public_order(p_restaurant_id, p_table_num, p_customer_name, p_notes, p_items);
  UPDATE public.orders SET idempotency_key = p_idempotency_key, espera_pago_qr = true
   WHERE id = v_id AND restaurant_id = p_restaurant_id AND paid_at IS NULL;
  RETURN v_id;
END $$;

-- 3) Mesa con QR: exige nombre al pedir.
CREATE OR REPLACE FUNCTION public.mesa_pedir_publico_idem(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_nombre text, p_items jsonb, p_codigo text DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_total numeric; v_r jsonb;
BEGIN
  IF btrim(coalesce(p_nombre, '')) = '' THEN
    RAISE EXCEPTION 'Escribe tu nombre para enviar el pedido';
  END IF;
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

-- 4) Mesa con QR: cuando el mesero ACEPTA la solicitud se crea el pedido; queda esperando el pago (sin copiar mesa_pedido_aceptar).
CREATE OR REPLACE FUNCTION public._qr_mesa_aceptado_espera_pago()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.orders SET espera_pago_qr = true
   WHERE id = NEW.order_id AND restaurant_id = NEW.restaurant_id AND paid_at IS NULL;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._qr_mesa_aceptado_espera_pago() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pedidos_mesa_aceptado_espera_pago ON public.pedidos_mesa_pendientes;
CREATE TRIGGER pedidos_mesa_aceptado_espera_pago
  AFTER UPDATE OF estado, order_id ON public.pedidos_mesa_pendientes
  FOR EACH ROW WHEN (NEW.estado = 'aceptado' AND NEW.order_id IS NOT NULL AND OLD.estado IS DISTINCT FROM 'aceptado')
  EXECUTE FUNCTION public._qr_mesa_aceptado_espera_pago();

-- 5) TV de cocina: no muestra los pedidos que esperan pago (misma regla que la pantalla de cocina).
CREATE OR REPLACE FUNCTION public.tv_cocina_datos(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._tv_restaurante(p_token);
BEGIN
  RETURN jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'status', o.status, 'tipo_pedido', o.tipo_pedido, 'table_num', o.table_num,
        'items', o.items, 'notes', o.notes, 'paid_at', o.paid_at, 'created_at', o.created_at,
        'customer_name', o.customer_name, 'order_number_today', o.order_number_today
      ) ORDER BY o.created_at)
      FROM public.orders o
      WHERE o.restaurant_id = rid AND o.status IN ('pending','cooking','ready') AND NOT o.espera_pago_qr), '[]'::jsonb),
    'dishes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'category', d.category))
                        FROM public.dishes d WHERE d.restaurant_id = rid), '[]'::jsonb),
    'modules_enabled', (SELECT c.modules_enabled FROM public.restaurant_config c WHERE c.restaurant_id = rid LIMIT 1)
  );
END $$;

NOTIFY pgrst, 'reload schema';
