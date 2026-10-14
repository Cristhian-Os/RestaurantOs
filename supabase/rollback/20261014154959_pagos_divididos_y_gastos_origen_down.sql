-- REVERSA de 20261014154959_pagos_divididos_y_gastos_origen.sql
-- NO es una migracion: no se aplica sola. Ejecutar solo si algo se rompe, y SOLO con copia de seguridad reciente.
--
-- Que hace:
--   * Vuelve a poner las funciones de cobro y de corte tal como estaban en produccion el 2026-10-14
--     (cobrar_orden, cobrar_orden_inicial, hacer_corte_caja, get_corte_productos, get_corte_mensual).
--   * Quita las funciones nuevas (registrar_pago, corregir_pago, anular_pago, etc.).
--   * Los pedidos con pago 'mixto' quedan con el metodo del pago MAS GRANDE (es el comportamiento viejo:
--     el corte suma el pedido entero a un solo metodo, que fue justo el descuadre original).
-- Que NO hace (a proposito, para no perder datos):
--   * NO borra las tablas order_payments ni aportes_caja, ni las columnas nuevas de gastos y cortes_caja.
--     Los pagos registrados quedan guardados; si luego se vuelve a aplicar la migracion, hay que
--     omitir la creacion de esas tablas o borrarlas a mano despues de revisarlas.

-- 1. Pedidos 'mixto' -> metodo dominante (el check viejo no acepta 'mixto')
UPDATE public.orders o SET payment_method = (
  SELECT p.payment_method FROM public.order_payments p
   WHERE p.order_id = o.id AND p.anulado_at IS NULL
   GROUP BY p.payment_method ORDER BY SUM(p.monto) DESC LIMIT 1)
 WHERE o.payment_method = 'mixto';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['efectivo'::text,'transferencia'::text,'tarjeta'::text,'rappi'::text]));

-- 2. Funciones nuevas
DROP FUNCTION IF EXISTS public.registrar_pago(uuid, text, text, numeric, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.corregir_pago(uuid, text, text);
DROP FUNCTION IF EXISTS public.anular_pago(uuid, text);
DROP FUNCTION IF EXISTS public.marcar_transferencia(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_transferencias_dia();
DROP FUNCTION IF EXISTS public.get_mesas_mixtas_dia();
DROP FUNCTION IF EXISTS public.registrar_aporte_caja(numeric, text);
DROP FUNCTION IF EXISTS public.reembolsar_gasto(uuid, text);
DROP FUNCTION IF EXISTS public._cobrar_base(uuid, text, numeric, numeric, boolean);
DROP FUNCTION IF EXISTS public._orden_recalcular_pago(uuid);
DROP FUNCTION IF EXISTS public._dia_con_corte(uuid, timestamptz);

-- 3. Funciones de siempre (texto exacto de produccion antes de la migracion)
CREATE OR REPLACE FUNCTION public.cobrar_orden(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE; v_change NUMERIC := 0; v_propina_final numeric;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT * INTO v_order FROM public.orders
    WHERE id=p_order_id AND restaurant_id=public.current_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.status != 'ready' THEN
    RAISE EXCEPTION 'La orden debe estar en estado "ready" para cobrar (estado actual: %)', v_order.status;
  END IF;

  v_propina_final := CASE WHEN v_order.paid_at IS NULL THEN GREATEST(COALESCE(p_propina,0),0) ELSE v_order.propina END;

  IF v_order.paid_at IS NULL AND p_payment_method='efectivo' AND p_amount_paid IS NOT NULL THEN
    v_change := GREATEST(p_amount_paid - v_order.total - v_propina_final, 0);
  END IF;

  UPDATE public.orders SET status='completed',
    payment_method = COALESCE(v_order.payment_method, p_payment_method),
    amount_paid    = COALESCE(v_order.amount_paid, p_amount_paid, v_order.total),
    propina        = v_propina_final,
    paid_at        = COALESCE(v_order.paid_at, NOW()),
    paid_by        = COALESCE(v_order.paid_by, auth.uid())
  WHERE id=p_order_id;

  PERFORM public.registrar_venta_stock(p_order_id);

  RETURN json_build_object('order_id',p_order_id,'total',v_order.total,
    'paid',COALESCE(v_order.amount_paid, p_amount_paid,v_order.total),'change',v_change,'method',p_payment_method,
    'propina', v_propina_final);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cobrar_orden_inicial(p_order_id uuid, p_payment_method text, p_amount_paid numeric DEFAULT NULL::numeric, p_propina numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_change NUMERIC := 0;
  v_propina_final numeric := GREATEST(COALESCE(p_propina,0),0);
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cobrar órdenes';
  END IF;
  IF p_payment_method NOT IN ('efectivo','transferencia','tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND restaurant_id = public.current_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya fue pagada'; END IF;

  IF p_payment_method = 'efectivo' AND p_amount_paid IS NOT NULL THEN
    v_change := GREATEST(p_amount_paid - v_order.total - v_propina_final, 0);
  END IF;

  UPDATE public.orders SET
    payment_method = p_payment_method,
    amount_paid    = COALESCE(p_amount_paid, v_order.total),
    propina        = v_propina_final,
    paid_at        = NOW(),
    paid_by        = auth.uid()
  WHERE id = p_order_id;

  PERFORM public.registrar_venta_stock(p_order_id);

  RETURN json_build_object('order_id', p_order_id, 'total', v_order.total,
    'paid', COALESCE(p_amount_paid, v_order.total), 'change', v_change, 'method', p_payment_method,
    'propina', v_propina_final);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_total_efectivo NUMERIC; v_total_transf NUMERIC;
  v_total_propinas NUMERIC; v_total_propinas_efectivo NUMERIC;
  v_total_ordenes INTEGER; v_ordenes_ids UUID[];
  v_total_gastos NUMERIC; v_total_neto NUMERIC; v_base NUMERIC;
  v_rid   UUID := public.current_restaurant_id();
  v_hoy   DATE := public.hoy_local();
  v_desde TIMESTAMPTZ := public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
  v_hasta TIMESTAMPTZ := (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota';
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden hacer el corte de caja';
  END IF;

  SELECT COALESCE(SUM(total) FILTER (WHERE payment_method='efectivo'),0),
         COALESCE(SUM(total) FILTER (WHERE payment_method='transferencia'),0),
         COALESCE(SUM(propina),0),
         COALESCE(SUM(propina) FILTER (WHERE payment_method='efectivo'),0),
         COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_total_efectivo, v_total_transf, v_total_propinas, v_total_propinas_efectivo, v_total_ordenes, v_ordenes_ids
  FROM public.orders
  WHERE status='completed' AND paid_at >= v_desde AND paid_at < v_hasta
    AND restaurant_id = v_rid
    AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi';

  SELECT COALESCE(SUM(monto),0) INTO v_total_gastos
  FROM public.gastos
  WHERE created_at >= v_desde AND created_at < v_hasta AND restaurant_id = v_rid;

  SELECT monto INTO v_base FROM public.bases_caja WHERE restaurant_id = v_rid AND fecha = v_hoy;
  v_base := COALESCE(v_base, 0);

  v_total_neto := v_total_efectivo + v_total_transf - v_total_gastos;

  INSERT INTO public.cortes_caja (
    cashier_id, fecha, total_efectivo, total_transferencia, total_rappi, total_ordenes, ordenes_ids, notas,
    restaurant_id, total_gastos, total_neto, total_propinas, total_propinas_efectivo, base_caja
  )
  VALUES (
    auth.uid(), v_hoy, v_total_efectivo, v_total_transf, 0, v_total_ordenes, v_ordenes_ids, p_notas,
    v_rid, v_total_gastos, v_total_neto, v_total_propinas, v_total_propinas_efectivo, v_base
  )
  RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id', v_corte.id, 'fecha', v_corte.fecha,
    'total_efectivo', v_total_efectivo, 'total_transferencia', v_total_transf,
    'total_general', v_total_efectivo + v_total_transf, 'total_ordenes', v_total_ordenes,
    'total_gastos', v_total_gastos, 'total_neto', v_total_neto,
    'total_propinas', v_total_propinas, 'total_propinas_efectivo', v_total_propinas_efectivo,
    'base_caja', v_base,
    'efectivo_esperado_cajon', v_base + v_total_efectivo + v_total_propinas_efectivo
  );
END;
$function$;

-- get_corte_productos: vuelve al tipo bigint de 'cantidad' (hay que borrar y crear)
DROP FUNCTION IF EXISTS public.get_corte_productos();
CREATE FUNCTION public.get_corte_productos()
 RETURNS TABLE(producto text, metodo_pago text, cantidad bigint, precio_unit numeric, subtotal numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(item->>'name', 'Sin nombre')                                  AS producto,
    COALESCE(o.payment_method, 'sin especificar')                          AS metodo_pago,
    SUM(COALESCE((item->>'quantity')::int, 0))                             AS cantidad,
    MAX(COALESCE((item->>'price')::numeric, 0))                            AS precio_unit,
    SUM(COALESCE((item->>'quantity')::int,0) * COALESCE((item->>'price')::numeric,0)) AS subtotal
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
  GROUP BY COALESCE(item->>'name', 'Sin nombre'), COALESCE(o.payment_method, 'sin especificar')
  ORDER BY COALESCE(item->>'name', 'Sin nombre'),
           SUM(COALESCE((item->>'quantity')::int,0) * COALESCE((item->>'price')::numeric,0)) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_corte_mensual()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid     UUID := public.current_restaurant_id();
  v_mes_ini DATE := date_trunc('month', public.hoy_local())::date;
  v_desde   TIMESTAMPTZ;
  v_hasta   TIMESTAMPTZ;
  v_result  JSON;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ver el corte mensual';
  END IF;
  v_desde := v_mes_ini::timestamp AT TIME ZONE 'America/Bogota';
  v_hasta := (v_mes_ini + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota';

  WITH ventas AS (
    SELECT (paid_at AT TIME ZONE 'America/Bogota')::date AS dia, payment_method, total, propina
    FROM public.orders
    WHERE status = 'completed' AND paid_at >= v_desde AND paid_at < v_hasta
      AND restaurant_id = v_rid
      AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi'
  ), gastos_mes AS (
    SELECT (created_at AT TIME ZONE 'America/Bogota')::date AS dia, monto
    FROM public.gastos
    WHERE created_at >= v_desde AND created_at < v_hasta AND restaurant_id = v_rid
  ), por_dia AS (
    SELECT COALESCE(v.dia, g.dia) AS fecha,
           COALESCE(v.efectivo, 0) AS efectivo, COALESCE(v.transferencia, 0) AS transferencia,
           COALESCE(v.ordenes, 0) AS ordenes, COALESCE(g.gastos, 0) AS gastos
    FROM (SELECT dia,
                 SUM(total) FILTER (WHERE payment_method = 'efectivo')      AS efectivo,
                 SUM(total) FILTER (WHERE payment_method = 'transferencia') AS transferencia,
                 COUNT(*) AS ordenes
          FROM ventas GROUP BY dia) v
    FULL JOIN (SELECT dia, SUM(monto) AS gastos FROM gastos_mes GROUP BY dia) g ON g.dia = v.dia
  )
  SELECT json_build_object(
    'mes',                 to_char(v_mes_ini, 'YYYY-MM'),
    'desde',               v_mes_ini,
    'hasta',               public.hoy_local(),
    'total_efectivo',      COALESCE((SELECT SUM(efectivo) FROM por_dia), 0),
    'total_transferencia', COALESCE((SELECT SUM(transferencia) FROM por_dia), 0),
    'total_general',       COALESCE((SELECT SUM(efectivo + transferencia) FROM por_dia), 0),
    'total_ordenes',       COALESCE((SELECT SUM(ordenes) FROM por_dia), 0),
    'total_propinas',      COALESCE((SELECT SUM(propina) FROM ventas), 0),
    'total_gastos',        COALESCE((SELECT SUM(gastos) FROM por_dia), 0),
    'total_neto',          COALESCE((SELECT SUM(efectivo + transferencia - gastos) FROM por_dia), 0),
    'dias',                COALESCE((SELECT json_agg(json_build_object(
                              'fecha', fecha, 'efectivo', efectivo, 'transferencia', transferencia,
                              'total', efectivo + transferencia, 'ordenes', ordenes, 'gastos', gastos
                            ) ORDER BY fecha) FROM por_dia), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Permisos de get_corte_productos (la funcion se borro y se creo de nuevo)
REVOKE ALL ON FUNCTION public.get_corte_productos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_corte_productos() TO authenticated;
