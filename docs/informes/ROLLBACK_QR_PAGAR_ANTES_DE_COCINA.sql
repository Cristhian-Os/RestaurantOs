-- COPIA PREVIA / VOLVER ATRÁS de la migración 20261128120000_qr_pagar_antes_de_cocina.sql
-- Definiciones de producción tomadas el 2026-11-28 justo antes de aplicar la migración.
-- Solo se usa si hay que deshacer el cambio. NO es una migración (no va en supabase/migrations/).

-- 1) Soltar cualquier pedido que esté esperando pago (pasan a cocina).
UPDATE public.orders SET espera_pago_qr = false WHERE espera_pago_qr;

-- 2) Quitar los disparadores nuevos.
DROP TRIGGER IF EXISTS orders_liberar_espera_pago_qr ON public.orders;
DROP TRIGGER IF EXISTS pedidos_mesa_aceptado_espera_pago ON public.pedidos_mesa_pendientes;
DROP FUNCTION IF EXISTS public._liberar_espera_pago_qr();
DROP FUNCTION IF EXISTS public._qr_mesa_aceptado_espera_pago();

-- 3) Funciones como estaban.
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
      WHERE o.restaurant_id = rid AND o.status IN ('pending','cooking','ready')), '[]'::jsonb),
    'dishes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'category', d.category))
                        FROM public.dishes d WHERE d.restaurant_id = rid), '[]'::jsonb),
    'modules_enabled', (SELECT c.modules_enabled FROM public.restaurant_config c WHERE c.restaurant_id = rid LIMIT 1)
  );
END $$;

-- 4) Por último, la columna (ya nada la usa).
ALTER TABLE public.orders DROP COLUMN IF EXISTS espera_pago_qr;
NOTIFY pgrst, 'reload schema';
