-- Cobro de domicilios por transferencia: el pedido pagado por Caja ya no queda escondido de cocina.
-- Causa: _cobrar_base registraba el pago pero no apagaba orders.en_espera_pago (solo lo hacía dom_confirmar_pago),
-- y la cocina solo muestra pedidos con en_espera_pago = false. Resultado: pedido pagado, en 'pending' para siempre,
-- y el cajero lo rehacía (duplicado + corte inflado).
-- Ahora: sin comprobante, el cobro se rechaza con un mensaje claro; con comprobante, el pedido sale de espera y pasa a cocina.
-- Firma sin cambios (no crea sobrecarga).
-- No cambia hacer_corte_caja: el dinero de pedidos ya pagados que siguen en preparación debe contar en el corte.

CREATE OR REPLACE FUNCTION public._cobrar_base(
  p_order_id uuid, p_metodo text, p_amount numeric, p_propina numeric, p_completar boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Domicilio por transferencia retenido: solo se cobra con su comprobante (regla _dom_exigir_comprobante).
  -- Antes el cobro normal de Caja lo dejaba pagado pero escondido de cocina, y el cajero lo rehacía.
  IF v_order.en_espera_pago AND NOT EXISTS (
       SELECT 1 FROM public.domicilios WHERE order_id = p_order_id AND restaurant_id = v_rid AND comprobante_path IS NOT NULL) THEN
    RAISE EXCEPTION 'Este domicilio es por transferencia: adjunta el comprobante y confírmalo desde Domicilios. No lo cobres desde Caja ni lo vuelvas a crear.';
  END IF;

  IF v_order.paid_at IS NULL THEN
    SELECT COALESCE(SUM(monto),0) INTO v_pagado FROM public.order_payments
      WHERE order_id = p_order_id AND anulado_at IS NULL;
    v_falta := GREATEST(v_order.total - v_pagado, 0);

    IF v_falta > 0 THEN
      v_metodo_pago := CASE WHEN p_metodo IN ('efectivo','transferencia','tarjeta') THEN p_metodo ELSE 'efectivo' END;
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
      -- Pedido de total 0 (cortesia): no hay pago que registrar, solo se marca pagado como antes.
      UPDATE public.orders SET payment_method = CASE WHEN p_metodo IN ('efectivo','transferencia','tarjeta') THEN p_metodo ELSE 'efectivo' END,
             amount_paid = COALESCE(p_amount, v_order.total), propina = v_propina,
             paid_at = NOW(), paid_by = auth.uid()
       WHERE id = p_order_id;
    END IF;
    PERFORM public.registrar_venta_stock(p_order_id);
  END IF;

  -- Domicilio por transferencia retenido (en_espera_pago): al quedar PAGADO por cualquier vía
  -- (Caja normal, pago dividido o confirmación de domicilio) sale de espera y pasa a cocina.
  -- Antes solo dom_confirmar_pago lo apagaba, y el cobro normal dejaba el pedido pagado pero oculto.
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND paid_at IS NOT NULL AND en_espera_pago) THEN
    UPDATE public.orders SET en_espera_pago = false WHERE id = p_order_id;
    UPDATE public.domicilios
       SET pago_estado = 'confirmado', pago_confirmado_por = auth.uid(), pago_confirmado_at = now(), pago_rechazo = NULL,
           estado = CASE WHEN estado = 'recibido' THEN 'confirmado' ELSE estado END
     WHERE order_id = p_order_id AND restaurant_id = v_rid AND pago_estado IN ('pendiente_comprobante','comprobante_enviado');
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
$$;
REVOKE ALL ON FUNCTION public._cobrar_base(uuid, text, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
