-- Bloque 1 (spec Anexo A, Parte B): pagos divididos con pagos mixtos, corte de caja que cuadre
-- y gastos con origen del dinero.
--
-- Idea central: un pedido pasa a tener VARIOS pagos (order_payments). Cada pago dice quien pago,
-- con que metodo y cuanto. El pedido queda cobrado cuando la suma de sus pagos cubre el total.
-- El corte de caja suma pagos, no pedidos.
--
-- Esta migracion es TRANSACCIONAL: incluye una verificacion dia por dia de que los totales
-- historicos (efectivo, transferencia, propinas) no cambian al migrar. Si algo no cuadra,
-- lanza una excepcion y NO se aplica nada.
-- REVERSA: supabase/rollback/20261014154959_pagos_divididos_y_gastos_origen_down.sql

-- ───────────────────────────────────────────────────────────────────────────
-- 1. order_payments
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.order_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id            uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  order_id                 uuid NOT NULL REFERENCES public.orders(id),
  comensal                 text CHECK (char_length(comensal) <= 60),
  payment_method           text NOT NULL CHECK (payment_method IN ('efectivo','transferencia','tarjeta')),
  monto                    numeric NOT NULL CHECK (monto > 0),             -- parte de la venta que cubre, sin propina
  propina                  numeric NOT NULL DEFAULT 0 CHECK (propina >= 0),
  monto_recibido           numeric CHECK (monto_recibido IS NULL OR monto_recibido >= 0),  -- efectivo entregado
  cambio                   numeric NOT NULL DEFAULT 0 CHECK (cambio >= 0),
  referencia               text CHECK (char_length(referencia) <= 60),
  transferencia_verificada boolean NOT NULL DEFAULT false,
  paid_at                  timestamptz NOT NULL DEFAULT now(),
  paid_by                  uuid,                                           -- sin FK: los pagos historicos pueden venir de usuarios ya borrados
  idempotency_key          text CHECK (char_length(idempotency_key) <= 100),
  anulado_at               timestamptz,
  anulado_por              uuid,
  anulado_motivo           text,
  metodo_original          text,                                           -- si se corrigio el metodo
  corregido_at             timestamptz,
  corregido_por            uuid,
  corregido_motivo         text
);
CREATE INDEX order_payments_rest_fecha_idx ON public.order_payments (restaurant_id, paid_at);
CREATE INDEX order_payments_order_idx      ON public.order_payments (order_id);
-- Doble toque: la misma clave de idempotencia no puede registrar dos pagos del mismo restaurante.
CREATE UNIQUE INDEX order_payments_idem_idx ON public.order_payments (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM anon;
-- Solo lectura directa para admin y cajero del restaurante. Toda escritura pasa por las funciones
-- SECURITY DEFINER (el servidor calcula el cambio y valida los montos; el navegador solo propone).
CREATE POLICY "Admin y cajero leen pagos" ON public.order_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ((( SELECT public.get_user_role() AS r) = ANY (ARRAY['admin'::text, 'cashier'::text]))
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Aportes a la caja, gastos con origen del dinero, columnas nuevas del corte
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.aportes_caja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  fecha          date NOT NULL DEFAULT public.hoy_local(),
  monto          numeric NOT NULL CHECK (monto > 0),
  aportado_por   text CHECK (char_length(aportado_por) <= 80),
  registrado_por uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aportes_caja_rest_fecha_idx ON public.aportes_caja (restaurant_id, fecha);
ALTER TABLE public.aportes_caja ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aportes_caja FROM anon;
CREATE POLICY "Admin y cajero leen aportes" ON public.aportes_caja AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ((( SELECT public.get_user_role() AS r) = ANY (ARRAY['admin'::text, 'cashier'::text]))
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  );

-- Los gastos anteriores quedan con fuente = 'caja' (comportamiento actual).
ALTER TABLE public.gastos
  ADD COLUMN fuente             text NOT NULL DEFAULT 'caja' CHECK (fuente IN ('caja','propio','transferencia','tarjeta')),
  ADD COLUMN pagado_por_nombre  text CHECK (char_length(pagado_por_nombre) <= 80),
  ADD COLUMN reembolsado_at     timestamptz,
  ADD COLUMN reembolso_medio    text CHECK (reembolso_medio IN ('caja','transferencia'));
ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_propio_requiere_nombre
  CHECK (fuente <> 'propio' OR char_length(btrim(COALESCE(pagado_por_nombre, ''))) > 0);

ALTER TABLE public.cortes_caja
  ADD COLUMN total_tarjeta         numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_gastos_caja     numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_gastos_propios  numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_reembolsos_caja numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_aportes         numeric NOT NULL DEFAULT 0,
  ADD COLUMN efectivo_esperado     numeric;

-- orders.payment_method acepta 'mixto' (pedido pagado con mas de un metodo).
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['efectivo'::text,'transferencia'::text,'tarjeta'::text,'rappi'::text,'mixto'::text]));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Funciones internas (no se exponen a los clientes)
-- ───────────────────────────────────────────────────────────────────────────

-- Recalcula el resumen del pedido (orders) a partir de sus pagos vigentes.
CREATE OR REPLACE FUNCTION public._orden_recalcular_pago(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_total numeric; v_pagado numeric; v_prop numeric; v_rec numeric;
  v_n int; v_metodos int; v_metodo text; v_ultimo timestamptz;
BEGIN
  SELECT total INTO v_total FROM public.orders WHERE id = p_order_id;
  SELECT COALESCE(SUM(monto),0), COALESCE(SUM(propina),0),
         COALESCE(SUM(COALESCE(monto_recibido, monto + propina)),0),
         COUNT(*), COUNT(DISTINCT payment_method), MIN(payment_method), MAX(paid_at)
    INTO v_pagado, v_prop, v_rec, v_n, v_metodos, v_metodo, v_ultimo
    FROM public.order_payments WHERE order_id = p_order_id AND anulado_at IS NULL;

  IF v_n = 0 THEN
    -- (change_amount es una columna generada: se recalcula sola a partir de amount_paid y total)
    UPDATE public.orders SET payment_method = NULL, amount_paid = NULL, propina = 0,
           paid_at = NULL, paid_by = NULL
     WHERE id = p_order_id;
  ELSE
    UPDATE public.orders SET
      payment_method = CASE WHEN v_metodos > 1 THEN 'mixto' ELSE v_metodo END,
      amount_paid    = v_rec,
      propina        = v_prop,
      -- paid_at solo existe cuando el pedido esta cubierto por completo
      paid_at        = CASE WHEN v_pagado >= v_total THEN COALESCE(paid_at, v_ultimo) ELSE NULL END,
      paid_by        = CASE WHEN v_pagado >= v_total THEN COALESCE(paid_by, auth.uid()) ELSE NULL END
    WHERE id = p_order_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._orden_recalcular_pago(uuid) FROM PUBLIC, anon, authenticated;

-- Cobro "de un solo paso" compartido por cobrar_orden (completa el pedido) y cobrar_orden_inicial
-- (solo registra el pago, antes de cocina). Crea UN pago por lo que falte por cobrar.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Funciones nuevas para clientes
-- ───────────────────────────────────────────────────────────────────────────

-- Registra UN pago de un pedido (puede haber varios por pedido).
CREATE OR REPLACE FUNCTION public.registrar_pago(
  p_order_id uuid, p_comensal text, p_metodo text, p_monto numeric,
  p_propina numeric DEFAULT 0, p_recibido numeric DEFAULT NULL, p_referencia text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := public.current_restaurant_id();
  v_order public.orders%ROWTYPE;
  v_pago  public.order_payments%ROWTYPE;
  v_pagado numeric; v_falta numeric; v_cambio numeric := 0;
  v_propina numeric := GREATEST(COALESCE(p_propina,0),0);
  v_comensal text := NULLIF(btrim(COALESCE(p_comensal,'')), '');
  v_ref text := NULLIF(btrim(COALESCE(p_referencia,'')), '');
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_metodo NOT IN ('efectivo','transferencia','tarjeta') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'La orden está cancelada'; END IF;
  IF v_order.tipo_pedido = 'RAPPI' OR v_order.payment_method = 'rappi' THEN
    RAISE EXCEPTION 'Los pedidos de Rappi no se cobran en caja';
  END IF;

  SELECT COALESCE(SUM(monto),0) INTO v_pagado FROM public.order_payments
    WHERE order_id = p_order_id AND anulado_at IS NULL;

  -- Doble toque: la misma clave devuelve el pago ya registrado, sin duplicarlo.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_pago FROM public.order_payments
      WHERE restaurant_id = v_rid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN json_build_object('pago_id', v_pago.id, 'order_id', p_order_id, 'total', v_order.total,
        'pagado', v_pagado, 'falta', GREATEST(v_order.total - v_pagado, 0),
        'completo', v_pagado >= v_order.total, 'cambio', v_pago.cambio, 'duplicado', true);
    END IF;
  END IF;

  v_falta := v_order.total - v_pagado;
  IF p_monto > v_falta THEN
    RAISE EXCEPTION 'El monto (%) supera lo que falta por cobrar (%)', p_monto, v_falta;
  END IF;

  IF p_metodo = 'efectivo' AND p_recibido IS NOT NULL THEN
    IF p_recibido < p_monto + v_propina THEN RAISE EXCEPTION 'El efectivo recibido no alcanza'; END IF;
    v_cambio := p_recibido - p_monto - v_propina;
  END IF;

  INSERT INTO public.order_payments
    (restaurant_id, order_id, comensal, payment_method, monto, propina, monto_recibido, cambio,
     referencia, paid_by, idempotency_key)
  VALUES
    (v_rid, p_order_id, v_comensal, p_metodo, p_monto, v_propina,
     CASE WHEN p_metodo = 'efectivo' THEN p_recibido END, v_cambio, v_ref, auth.uid(), p_idempotency_key)
  RETURNING * INTO v_pago;

  v_pagado := v_pagado + p_monto;
  PERFORM public._orden_recalcular_pago(p_order_id);
  IF v_pagado >= v_order.total THEN PERFORM public.registrar_venta_stock(p_order_id); END IF;

  RETURN json_build_object('pago_id', v_pago.id, 'order_id', p_order_id, 'total', v_order.total,
    'pagado', v_pagado, 'falta', GREATEST(v_order.total - v_pagado, 0),
    'completo', v_pagado >= v_order.total, 'cambio', v_cambio, 'duplicado', false);
END;
$$;

-- Dia (Bogota) de un pago ya tiene corte? Entonces no se edita: se corrige con un ajuste al dia siguiente.
CREATE OR REPLACE FUNCTION public._dia_con_corte(p_restaurant uuid, p_paid_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.cortes_caja
                  WHERE restaurant_id = p_restaurant
                    AND fecha = (p_paid_at AT TIME ZONE 'America/Bogota')::date)
$$;
REVOKE ALL ON FUNCTION public._dia_con_corte(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- "Dijo efectivo y pago por transferencia": cajero o admin, mientras el dia no tenga corte, con motivo.
CREATE OR REPLACE FUNCTION public.corregir_pago(p_pago_id uuid, p_metodo text, p_motivo text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id(); v_p public.order_payments%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden corregir pagos';
  END IF;
  IF p_metodo NOT IN ('efectivo','transferencia','tarjeta') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;
  IF char_length(btrim(COALESCE(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo de la corrección'; END IF;

  SELECT * INTO v_p FROM public.order_payments WHERE id = p_pago_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_p.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'El pago está anulado'; END IF;
  IF public._dia_con_corte(v_rid, v_p.paid_at) THEN
    RAISE EXCEPTION 'Ese día ya tiene corte de caja: la corrección se hace con un ajuste el día siguiente';
  END IF;
  IF v_p.payment_method = p_metodo THEN RAISE EXCEPTION 'El pago ya es de ese método'; END IF;

  UPDATE public.order_payments SET
    metodo_original = COALESCE(metodo_original, payment_method),
    payment_method  = p_metodo,
    monto_recibido  = CASE WHEN p_metodo = 'efectivo' THEN monto + propina ELSE NULL END,
    cambio          = 0,
    transferencia_verificada = false,
    corregido_at = now(), corregido_por = auth.uid(), corregido_motivo = btrim(p_motivo)
  WHERE id = p_pago_id;

  PERFORM public._orden_recalcular_pago(v_p.order_id);
  RETURN json_build_object('pago_id', p_pago_id, 'metodo', p_metodo);
END;
$$;

-- Solo el administrador anula un pago (con motivo, antes del corte): el pedido vuelve a "falta por cobrar".
CREATE OR REPLACE FUNCTION public.anular_pago(p_pago_id uuid, p_motivo text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id(); v_p public.order_payments%ROWTYPE; v_o public.orders%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede anular pagos';
  END IF;
  IF char_length(btrim(COALESCE(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo de la anulación'; END IF;

  SELECT * INTO v_p FROM public.order_payments WHERE id = p_pago_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_p.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'El pago ya estaba anulado'; END IF;
  IF public._dia_con_corte(v_rid, v_p.paid_at) THEN
    RAISE EXCEPTION 'Ese día ya tiene corte de caja: la corrección se hace con un ajuste el día siguiente';
  END IF;

  SELECT * INTO v_o FROM public.orders WHERE id = v_p.order_id FOR UPDATE;
  UPDATE public.order_payments SET anulado_at = now(), anulado_por = auth.uid(), anulado_motivo = btrim(p_motivo)
   WHERE id = p_pago_id;
  PERFORM public._orden_recalcular_pago(v_p.order_id);
  -- Si el pedido ya estaba entregado y deja de estar cubierto, vuelve a caja.
  UPDATE public.orders SET status = 'ready' WHERE id = v_p.order_id AND status = 'completed' AND paid_at IS NULL;
  RETURN json_build_object('pago_id', p_pago_id, 'anulado', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_transferencia(p_pago_id uuid, p_verificada boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden verificar transferencias';
  END IF;
  UPDATE public.order_payments SET transferencia_verificada = COALESCE(p_verificada, false)
   WHERE id = p_pago_id AND restaurant_id = public.current_restaurant_id() AND payment_method = 'transferencia';
END;
$$;

-- Transferencias del dia, para marcarlas una por una contra la app del banco.
CREATE OR REPLACE FUNCTION public.get_transferencias_dia()
RETURNS TABLE(pago_id uuid, order_id uuid, numero integer, mesa integer, tipo text, cliente text,
              comensal text, monto numeric, propina numeric, referencia text, verificada boolean, paid_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver las transferencias';
  END IF;
  RETURN QUERY
  SELECT p.id, o.id, o.order_number_today, o.table_num, o.tipo_pedido, o.customer_name, p.comensal,
         p.monto, p.propina, p.referencia, p.transferencia_verificada, p.paid_at
    FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
   WHERE p.restaurant_id = public.current_restaurant_id() AND p.payment_method = 'transferencia'
     AND p.anulado_at IS NULL AND o.status <> 'cancelled'
     AND p.paid_at >= public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota'
     AND p.paid_at <  (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota'
   ORDER BY p.paid_at;
END;
$$;

-- Mesas con varios pagos o metodos mezclados hoy: ayuda para encontrar un descuadre del conteo fisico.
CREATE OR REPLACE FUNCTION public.get_mesas_mixtas_dia()
RETURNS TABLE(order_id uuid, numero integer, mesa integer, tipo text, cliente text, total numeric, pagos json)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte';
  END IF;
  RETURN QUERY
  SELECT o.id, o.order_number_today, o.table_num, o.tipo_pedido, o.customer_name, o.total,
         json_agg(json_build_object('comensal', p.comensal, 'metodo', p.payment_method, 'monto', p.monto,
                                    'propina', p.propina, 'referencia', p.referencia) ORDER BY p.paid_at)
    FROM public.orders o JOIN public.order_payments p ON p.order_id = o.id AND p.anulado_at IS NULL
   WHERE o.restaurant_id = public.current_restaurant_id() AND o.status <> 'cancelled'
     AND p.paid_at >= public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota'
     AND p.paid_at <  (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota'
   GROUP BY o.id
  HAVING COUNT(*) > 1;
END;
$$;

-- Aporte a la caja: si la base no alcanza y alguien pone mas efectivo, el efectivo esperado lo suma.
CREATE OR REPLACE FUNCTION public.registrar_aporte_caja(p_monto numeric, p_aportado_por text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_a public.aportes_caja%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar aportes a la caja';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  INSERT INTO public.aportes_caja (restaurant_id, monto, aportado_por, registrado_por)
  VALUES (public.current_restaurant_id(), p_monto, NULLIF(btrim(COALESCE(p_aportado_por,'')), ''), auth.uid())
  RETURNING * INTO v_a;
  RETURN json_build_object('aporte_id', v_a.id, 'fecha', v_a.fecha, 'monto', v_a.monto);
END;
$$;

-- Devolver la plata a quien adelanto un gasto (con efectivo de la caja o por transferencia).
CREATE OR REPLACE FUNCTION public.reembolsar_gasto(p_gasto_id uuid, p_medio text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_g public.gastos%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden reembolsar gastos';
  END IF;
  IF p_medio NOT IN ('caja','transferencia') THEN RAISE EXCEPTION 'Medio de reembolso inválido'; END IF;
  SELECT * INTO v_g FROM public.gastos WHERE id = p_gasto_id AND restaurant_id = public.current_restaurant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
  IF v_g.fuente <> 'propio' THEN RAISE EXCEPTION 'Solo se reembolsan los gastos pagados con dinero propio'; END IF;
  IF v_g.reembolsado_at IS NOT NULL THEN RAISE EXCEPTION 'Este gasto ya fue reembolsado'; END IF;
  UPDATE public.gastos SET reembolsado_at = now(), reembolso_medio = p_medio WHERE id = p_gasto_id;
  RETURN json_build_object('gasto_id', p_gasto_id, 'medio', p_medio, 'monto', v_g.monto);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago(uuid, text, text, numeric, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.corregir_pago(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anular_pago(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_transferencia(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_transferencias_dia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_mesas_mixtas_dia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_aporte_caja(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reembolsar_gasto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago(uuid, text, text, numeric, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_pago(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_transferencia(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transferencias_dia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mesas_mixtas_dia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_aporte_caja(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reembolsar_gasto(uuid, text) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Migracion de datos: cada pedido ya cobrado pasa a tener UN pago
-- ───────────────────────────────────────────────────────────────────────────
-- No se crean pagos para: Rappi (no entra al corte), pedidos de total 0 (monto debe ser > 0)
-- ni pedidos sin pago registrado (paid_at nulo).
INSERT INTO public.order_payments
  (restaurant_id, order_id, payment_method, monto, propina, monto_recibido, cambio, paid_at, paid_by, idempotency_key)
SELECT o.restaurant_id, o.id, o.payment_method, o.total, COALESCE(o.propina,0),
       CASE WHEN o.payment_method = 'efectivo' THEN o.amount_paid END,
       -- cambio real = efectivo entregado - venta - propina (la columna change_amount ignora la propina)
       CASE WHEN o.payment_method = 'efectivo' AND o.amount_paid IS NOT NULL
            THEN GREATEST(o.amount_paid - o.total - COALESCE(o.propina,0), 0) ELSE 0 END,
       o.paid_at, o.paid_by, 'migracion:' || o.id::text
  FROM public.orders o
 WHERE o.paid_at IS NOT NULL
   AND o.payment_method IN ('efectivo','transferencia','tarjeta')
   AND o.tipo_pedido IS DISTINCT FROM 'RAPPI'
   AND o.total > 0;

-- Verificacion obligatoria: para cada restaurante y cada dia historico, efectivo, transferencia,
-- propinas y propinas en efectivo calculados con la logica vieja (pedidos) y con la nueva (pagos)
-- deben ser IGUALES. Si no, se cancela toda la migracion.
DO $$
DECLARE v_diff int; v_detalle text;
BEGIN
  WITH viejo AS (
    SELECT restaurant_id, (paid_at AT TIME ZONE 'America/Bogota')::date AS dia,
           COALESCE(SUM(total) FILTER (WHERE payment_method = 'efectivo'), 0)      AS ef,
           COALESCE(SUM(total) FILTER (WHERE payment_method = 'transferencia'), 0) AS tr,
           COALESCE(SUM(propina), 0)                                               AS pr,
           COALESCE(SUM(propina) FILTER (WHERE payment_method = 'efectivo'), 0)    AS pre
      FROM public.orders
     WHERE status = 'completed' AND paid_at IS NOT NULL
       AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi'
     GROUP BY 1, 2
  ), nuevo AS (
    SELECT p.restaurant_id, (p.paid_at AT TIME ZONE 'America/Bogota')::date AS dia,
           COALESCE(SUM(p.monto) FILTER (WHERE p.payment_method = 'efectivo'), 0)      AS ef,
           COALESCE(SUM(p.monto) FILTER (WHERE p.payment_method = 'transferencia'), 0) AS tr,
           COALESCE(SUM(p.propina), 0)                                                 AS pr,
           COALESCE(SUM(p.propina) FILTER (WHERE p.payment_method = 'efectivo'), 0)    AS pre
      FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
     WHERE o.status = 'completed' AND p.anulado_at IS NULL
       AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi'
     GROUP BY 1, 2
  ), dif AS (
    SELECT COALESCE(v.restaurant_id, n.restaurant_id) AS restaurant_id, COALESCE(v.dia, n.dia) AS dia
      FROM viejo v FULL JOIN nuevo n ON n.restaurant_id = v.restaurant_id AND n.dia = v.dia
     WHERE COALESCE(v.ef,0) <> COALESCE(n.ef,0) OR COALESCE(v.tr,0) <> COALESCE(n.tr,0)
        OR COALESCE(v.pr,0) <> COALESCE(n.pr,0) OR COALESCE(v.pre,0) <> COALESCE(n.pre,0)
  )
  SELECT COUNT(*), string_agg(dia::text, ', ') INTO v_diff, v_detalle FROM dif;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'MIGRACION CANCELADA: % dia(s) con totales historicos distintos: %', v_diff, v_detalle;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Funciones existentes, ahora sobre pagos
-- ───────────────────────────────────────────────────────────────────────────

-- Misma firma que antes; ahora crea un pago por lo que falte y comparte la logica con cobrar_orden_inicial.
CREATE OR REPLACE FUNCTION public.cobrar_orden(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  -- 'mixto' llega cuando solo se esta entregando un pedido que ya estaba pagado con varios metodos.
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta','mixto') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  RETURN public._cobrar_base(p_order_id, p_payment_method, p_amount_paid, p_propina, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cobrar_orden_inicial(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  RETURN public._cobrar_base(p_order_id, p_payment_method, p_amount_paid, p_propina, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas text DEFAULT NULL::text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_ef numeric; v_tr numeric; v_tj numeric; v_prop numeric; v_prop_ef numeric;
  v_ordenes int; v_ids uuid[];
  v_gastos numeric; v_gastos_caja numeric; v_gastos_propios numeric; v_reemb_caja numeric; v_aportes numeric;
  v_neto numeric; v_base numeric; v_esperado numeric;
  v_rid   uuid := public.current_restaurant_id();
  v_hoy   date := public.hoy_local();
  v_desde timestamptz := public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
  v_hasta timestamptz := (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota';
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden hacer el corte de caja';
  END IF;

  -- Dinero: se suman los PAGOS recibidos hoy (no los pedidos).
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

  -- Pedidos del dia: igual que antes (completados y pagados hoy, sin Rappi).
  SELECT COUNT(*)::int, ARRAY_AGG(id) INTO v_ordenes, v_ids
    FROM public.orders
   WHERE status = 'completed' AND paid_at >= v_desde AND paid_at < v_hasta AND restaurant_id = v_rid
     AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi';

  -- Gastos del dia por origen del dinero.
  SELECT COALESCE(SUM(monto), 0),
         COALESCE(SUM(monto) FILTER (WHERE fuente = 'caja'), 0),
         COALESCE(SUM(monto) FILTER (WHERE fuente = 'propio'), 0)
    INTO v_gastos, v_gastos_caja, v_gastos_propios
    FROM public.gastos WHERE created_at >= v_desde AND created_at < v_hasta AND restaurant_id = v_rid;

  -- Reembolsos pagados con efectivo de la caja hoy (salen del cajon aunque el gasto sea de otro dia).
  SELECT COALESCE(SUM(monto), 0) INTO v_reemb_caja FROM public.gastos
   WHERE restaurant_id = v_rid AND reembolso_medio = 'caja' AND reembolsado_at >= v_desde AND reembolsado_at < v_hasta;

  SELECT COALESCE(SUM(monto), 0) INTO v_aportes FROM public.aportes_caja WHERE restaurant_id = v_rid AND fecha = v_hoy;

  SELECT monto INTO v_base FROM public.bases_caja WHERE restaurant_id = v_rid AND fecha = v_hoy;
  v_base := COALESCE(v_base, 0);

  v_neto     := v_ef + v_tr + v_tj - v_gastos;
  v_esperado := v_base + v_aportes + v_ef + v_prop_ef - v_gastos_caja - v_reemb_caja;

  INSERT INTO public.cortes_caja (
    cashier_id, fecha, total_efectivo, total_transferencia, total_rappi, total_ordenes, ordenes_ids, notas,
    restaurant_id, total_gastos, total_neto, total_propinas, total_propinas_efectivo, base_caja,
    total_tarjeta, total_gastos_caja, total_gastos_propios, total_reembolsos_caja, total_aportes, efectivo_esperado
  ) VALUES (
    auth.uid(), v_hoy, v_ef, v_tr, 0, v_ordenes, v_ids, p_notas,
    v_rid, v_gastos, v_neto, v_prop, v_prop_ef, v_base,
    v_tj, v_gastos_caja, v_gastos_propios, v_reemb_caja, v_aportes, v_esperado
  ) RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id', v_corte.id, 'fecha', v_corte.fecha,
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
$$;

-- Cambia el tipo de 'cantidad' (bigint -> numeric: un plato compartido entre varios pagos se reparte
-- en proporcion), por eso hay que borrar la funcion antes de crearla de nuevo.
DROP FUNCTION public.get_corte_productos();
CREATE FUNCTION public.get_corte_productos()
RETURNS TABLE(producto text, metodo_pago text, cantidad numeric, precio_unit numeric, subtotal numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT o.id AS order_id,
           COALESCE(item->>'name', 'Sin nombre') AS nombre,
           COALESCE((item->>'quantity')::int, 0) AS qty,
           COALESCE((item->>'price')::numeric, 0) AS price,
           NULLIF(btrim(item->>'comensal'), '') AS comensal
      FROM public.orders o
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(o.items) = 'array' THEN o.items
          WHEN jsonb_typeof(o.items) = 'string'
               AND left(btrim(o.items #>> '{}'), 1) = '[' THEN (o.items #>> '{}')::jsonb
          ELSE '[]'::jsonb
        END
      ) AS item
     WHERE o.status = 'completed'
       AND o.paid_at >= public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota'
       AND o.paid_at <  (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota'
       AND o.restaurant_id = public.current_restaurant_id()
       AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi'
       AND NOT COALESCE((item->>'cancelled')::boolean, false)
  ), pagos AS (
    SELECT p.order_id, p.comensal, p.payment_method, SUM(p.monto) AS monto
      FROM public.order_payments p
     WHERE p.anulado_at IS NULL AND p.order_id IN (SELECT order_id FROM base)
     GROUP BY p.order_id, p.comensal, p.payment_method
  ), pago_orden AS (
    SELECT t.order_id, t.payment_method, t.monto, SUM(t.monto) OVER (PARTITION BY t.order_id) AS tot
      FROM (SELECT order_id, payment_method, SUM(monto) AS monto FROM pagos GROUP BY order_id, payment_method) t
  ), pago_com AS (
    SELECT order_id, comensal, payment_method, monto, SUM(monto) OVER (PARTITION BY order_id, comensal) AS tot
      FROM pagos WHERE comensal IS NOT NULL
  ), asignado AS (
    -- Plato con comensal: va al metodo de pago de esa persona. Sin comensal: se reparte en proporcion
    -- al monto de cada metodo del pedido.
    SELECT b.nombre, b.qty, b.price,
           COALESCE(pc.payment_method, po.payment_method, 'sin especificar') AS metodo,
           CASE WHEN pc.order_id IS NOT NULL THEN pc.monto / pc.tot
                WHEN po.order_id IS NOT NULL THEN po.monto / po.tot
                ELSE 1 END AS peso
      FROM base b
      LEFT JOIN pago_com   pc ON pc.order_id = b.order_id AND pc.comensal = b.comensal
      LEFT JOIN pago_orden po ON po.order_id = b.order_id AND pc.order_id IS NULL
  )
  SELECT a.nombre::text, a.metodo::text,
         ROUND(SUM(a.qty * a.peso), 2),
         MAX(a.price),
         ROUND(SUM(a.qty * a.price * a.peso), 2)
    FROM asignado a
   GROUP BY a.nombre, a.metodo
   ORDER BY a.nombre, ROUND(SUM(a.qty * a.price * a.peso), 2) DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_corte_productos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_corte_productos() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_corte_mensual()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid     uuid := public.current_restaurant_id();
  v_mes_ini date := date_trunc('month', public.hoy_local())::date;
  v_desde   timestamptz;
  v_hasta   timestamptz;
  v_result  json;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte mensual';
  END IF;
  v_desde := v_mes_ini::timestamp AT TIME ZONE 'America/Bogota';
  v_hasta := (v_mes_ini + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota';

  WITH pagos AS (
    SELECT (p.paid_at AT TIME ZONE 'America/Bogota')::date AS dia, p.payment_method, p.monto, p.propina
      FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
     WHERE p.restaurant_id = v_rid AND p.anulado_at IS NULL
       AND p.paid_at >= v_desde AND p.paid_at < v_hasta
       AND o.status <> 'cancelled'
       AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi'
  ), ordenes AS (
    SELECT (paid_at AT TIME ZONE 'America/Bogota')::date AS dia, COUNT(*) AS n
      FROM public.orders
     WHERE status = 'completed' AND paid_at >= v_desde AND paid_at < v_hasta AND restaurant_id = v_rid
       AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi'
     GROUP BY 1
  ), gastos_mes AS (
    SELECT (created_at AT TIME ZONE 'America/Bogota')::date AS dia, monto
      FROM public.gastos
     WHERE created_at >= v_desde AND created_at < v_hasta AND restaurant_id = v_rid
  ), por_dia AS (
    SELECT d.dia AS fecha,
           COALESCE(pg.efectivo, 0) AS efectivo, COALESCE(pg.transferencia, 0) AS transferencia,
           COALESCE(pg.tarjeta, 0) AS tarjeta, COALESCE(o.n, 0) AS ordenes, COALESCE(g.gastos, 0) AS gastos
      FROM (SELECT dia FROM pagos UNION SELECT dia FROM ordenes UNION SELECT dia FROM gastos_mes) d
      LEFT JOIN (SELECT dia,
                        SUM(monto) FILTER (WHERE payment_method = 'efectivo')      AS efectivo,
                        SUM(monto) FILTER (WHERE payment_method = 'transferencia') AS transferencia,
                        SUM(monto) FILTER (WHERE payment_method = 'tarjeta')       AS tarjeta
                   FROM pagos GROUP BY dia) pg ON pg.dia = d.dia
      LEFT JOIN ordenes o ON o.dia = d.dia
      LEFT JOIN (SELECT dia, SUM(monto) AS gastos FROM gastos_mes GROUP BY dia) g ON g.dia = d.dia
  )
  SELECT json_build_object(
    'mes',                 to_char(v_mes_ini, 'YYYY-MM'),
    'desde',               v_mes_ini,
    'hasta',               public.hoy_local(),
    'total_efectivo',      COALESCE((SELECT SUM(efectivo) FROM por_dia), 0),
    'total_transferencia', COALESCE((SELECT SUM(transferencia) FROM por_dia), 0),
    'total_tarjeta',       COALESCE((SELECT SUM(tarjeta) FROM por_dia), 0),
    'total_general',       COALESCE((SELECT SUM(efectivo + transferencia + tarjeta) FROM por_dia), 0),
    'total_ordenes',       COALESCE((SELECT SUM(ordenes) FROM por_dia), 0),
    'total_propinas',      COALESCE((SELECT SUM(propina) FROM pagos), 0),
    'total_gastos',        COALESCE((SELECT SUM(gastos) FROM por_dia), 0),
    'total_neto',          COALESCE((SELECT SUM(efectivo + transferencia + tarjeta - gastos) FROM por_dia), 0),
    'dias',                COALESCE((SELECT json_agg(json_build_object(
                              'fecha', fecha, 'efectivo', efectivo, 'transferencia', transferencia, 'tarjeta', tarjeta,
                              'total', efectivo + transferencia + tarjeta, 'ordenes', ordenes, 'gastos', gastos
                            ) ORDER BY fecha) FROM por_dia), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
