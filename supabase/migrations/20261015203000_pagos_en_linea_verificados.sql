-- Pagos en linea verificados (hallazgos de la auditoria 2026-10-15).
--  * mark_order_paid ahora exige que lo pagado cubra el total del pedido, registra el cobro en order_payments
--    (el corte de caja lo cuenta) y solo la puede ejecutar service_role. Antes bastaba con que llegara un evento
--    APPROVED, sin comparar montos: se podia pagar un pedido de $10.000, editarlo a $200.000 y quedar "pagado".
--    El REVOKE de la version anterior existia solo en produccion; aqui queda versionado.
--  * procesar_pago_wompi: el webhook aplica cada evento dentro de UNA transaccion y de forma idempotente:
--    un APPROVED repetido ya no vuelve a extender la suscripcion, un PENDING/DECLINED tardio no pisa un APPROVED y se
--    verifican monto y moneda contra lo que se firmo al iniciar el pago.
--  * suscripcion_puede_cobrar: el cron no reintenta sin limite ni cobra dos veces el mismo periodo.
-- Reversa: supabase/rollback/20261015203000_pagos_en_linea_verificados_down.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE wompi_transaction_id IS NOT NULL
                  GROUP BY wompi_transaction_id HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS payments_wompi_tx_uniq ON public.payments (wompi_transaction_id)
      WHERE wompi_transaction_id IS NOT NULL;
  END IF;
END $$;

-- 1) mark_order_paid verificado ------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_order_paid(uuid, text, text);

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_method text, p_tx_id text, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_total_cents bigint;
  v_key text := CASE WHEN p_tx_id IS NOT NULL THEN 'wompi:' || p_tx_id END;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'order_not_found'); END IF;
  IF v_order.status = 'cancelled' THEN RETURN jsonb_build_object('status', 'order_cancelled'); END IF;
  IF v_key IS NOT NULL AND EXISTS (SELECT 1 FROM public.order_payments WHERE restaurant_id = v_order.restaurant_id AND idempotency_key = v_key) THEN
    RETURN jsonb_build_object('status', 'already_recorded');
  END IF;
  IF v_order.paid_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_paid'); END IF;

  v_total_cents := round(COALESCE(v_order.total, 0) * 100);
  IF p_amount_cents IS NULL OR p_amount_cents < v_total_cents THEN
    RETURN jsonb_build_object('status', 'underpaid', 'expected_cents', v_total_cents, 'received_cents', p_amount_cents);
  END IF;

  INSERT INTO public.order_payments (restaurant_id, order_id, payment_method, monto, propina, referencia, paid_by, idempotency_key)
  VALUES (v_order.restaurant_id, p_order_id, 'tarjeta', v_order.total, 0, p_tx_id, NULL, v_key);
  PERFORM public._orden_recalcular_pago(p_order_id);

  RETURN jsonb_build_object('status', 'paid', 'overpaid_cents', GREATEST(p_amount_cents - v_total_cents, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text, integer) TO service_role;

-- 2) Maquina de estados idempotente para los eventos del webhook ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_pago_wompi(
  p_reference text, p_tx_id text, p_status text, p_amount_cents integer, p_currency text,
  p_method_type text, p_email text, p_raw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_mark jsonb := NULL;
  v_nota text := NULL;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'unknown_reference'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('APPROVED','DECLINED','VOIDED','ERROR','PENDING') THEN
    RETURN jsonb_build_object('result', 'ignored_status');
  END IF;

  -- APPROVED es terminal: un evento repetido o fuera de orden no cambia nada (un VOIDED si se registra para revision).
  IF v_pay.status = 'APPROVED' THEN
    IF p_status = 'VOIDED' THEN
      UPDATE public.payments SET status = 'VOIDED', raw = COALESCE(p_raw, raw), updated_at = now() WHERE id = v_pay.id;
      RETURN jsonb_build_object('result', 'voided_after_approval', 'kind', v_pay.kind, 'restaurant_id', v_pay.restaurant_id, 'order_id', v_pay.order_id);
    END IF;
    RETURN jsonb_build_object('result', 'already_approved');
  END IF;

  IF p_status = 'APPROVED' AND (p_amount_cents IS DISTINCT FROM v_pay.amount_in_cents
                                OR COALESCE(p_currency, v_pay.currency) IS DISTINCT FROM v_pay.currency) THEN
    UPDATE public.payments SET raw = COALESCE(p_raw, raw) || jsonb_build_object('_ros_nota', 'monto_o_moneda_no_coincide'), updated_at = now() WHERE id = v_pay.id;
    RETURN jsonb_build_object('result', 'amount_mismatch', 'expected_cents', v_pay.amount_in_cents, 'received_cents', p_amount_cents);
  END IF;

  UPDATE public.payments
     SET status = p_status,
         wompi_transaction_id = COALESCE(p_tx_id, wompi_transaction_id),
         payment_method_type = COALESCE(p_method_type, payment_method_type),
         customer_email = COALESCE(p_email, customer_email),
         raw = COALESCE(p_raw, raw),
         updated_at = now()
   WHERE id = v_pay.id;

  IF p_status = 'APPROVED' THEN
    IF v_pay.kind = 'subscription' THEN
      UPDATE public.subscriptions
         SET status = 'active', current_period_start = now(), current_period_end = now() + interval '1 month',
             grace_ends_at = NULL, purge_at = NULL
       WHERE restaurant_id = v_pay.restaurant_id;
    ELSIF v_pay.kind = 'diner' AND v_pay.order_id IS NOT NULL THEN
      v_mark := public.mark_order_paid(v_pay.order_id, p_method_type, p_tx_id, p_amount_cents);
      IF v_mark->>'status' NOT IN ('paid','already_paid','already_recorded') THEN
        v_nota := 'pedido_no_marcado_pagado:' || (v_mark->>'status');
        UPDATE public.payments SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('_ros_nota', v_nota) WHERE id = v_pay.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('result', 'applied', 'status', p_status, 'kind', v_pay.kind,
                            'restaurant_id', v_pay.restaurant_id, 'order_id', v_pay.order_id, 'order', v_mark);
END;
$function$;

REVOKE ALL ON FUNCTION public.procesar_pago_wompi(text, text, text, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_pago_wompi(text, text, text, integer, text, text, text, jsonb) TO service_role;

-- 3) El cron de cobros no cobra dos veces ni reintenta sin limite --------------------------------------------------
CREATE OR REPLACE FUNCTION public.suscripcion_puede_cobrar(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.payments
            WHERE restaurant_id = p_restaurant_id AND kind = 'subscription'
              AND ((status IN ('APPROVED') AND created_at > now() - interval '25 days')
                OR (status = 'PENDING' AND created_at > now() - interval '2 days')))
     AND (SELECT count(*) FROM public.payments
           WHERE restaurant_id = p_restaurant_id AND kind = 'subscription'
             AND status IN ('DECLINED','ERROR') AND created_at > now() - interval '7 days') < 3;
$function$;

REVOKE ALL ON FUNCTION public.suscripcion_puede_cobrar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suscripcion_puede_cobrar(uuid) TO service_role;
