-- Multi-sede fase 2, paso B: resumen de todas las sedes de la cuenta para el panel "Mis sedes".
-- Por sede y en total: ventas, propinas, pedidos, gastos y neto de hoy y del mes; pedidos en curso;
-- ingredientes con stock bajo; y el último corte de caja.
-- Las ventas usan EXACTAMENTE las reglas del corte de caja (get_corte_mensual / hacer_corte_caja): pagos
-- no anulados, pedido no cancelado, sin Rappi, propina aparte, "hoy" con hoy_local() (America/Bogota).
-- Así el número de aquí coincide con el que ve cada sede en su caja.
-- Stock bajo = stock_actual <= stock_minimo (igual que el inventario). Pedido en curso = pending, cooking o ready.
-- Solo el dueño de la cuenta (cuentas.owner_id) lo ve, y solo las sedes de sus cuentas. Es de solo lectura.
-- Reversa: supabase/rollback/20261120150000_resumen_sedes_down.sql

CREATE OR REPLACE FUNCTION public.resumen_sedes()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_hoy       date := public.hoy_local();
  v_dia_ini   timestamptz := public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
  v_dia_fin   timestamptz := (public.hoy_local() + 1)::timestamp AT TIME ZONE 'America/Bogota';
  v_mes_ini   date := date_trunc('month', public.hoy_local())::date;
  v_mes_desde timestamptz := date_trunc('month', public.hoy_local())::date::timestamp AT TIME ZONE 'America/Bogota';
  v_mes_hasta timestamptz := (date_trunc('month', public.hoy_local())::date + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota';
  v_sedes     jsonb;
  v_total     jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede ver el resumen de sedes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cuentas WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'Solo el dueño de la cuenta ve el resumen de sus sedes';
  END IF;

  WITH mias AS (
    SELECT r.id, r.name, r.active, r.created_at, (r.id = public.current_restaurant_id()) AS actual
      FROM restaurants r
     WHERE r.cuenta_id IN (SELECT c.id FROM cuentas c WHERE c.owner_id = v_uid)
  ), pagos AS (
    SELECT p.restaurant_id,
           SUM(p.monto)   FILTER (WHERE p.paid_at >= v_dia_ini AND p.paid_at < v_dia_fin) AS ventas_hoy,
           SUM(p.propina) FILTER (WHERE p.paid_at >= v_dia_ini AND p.paid_at < v_dia_fin) AS propinas_hoy,
           SUM(p.monto)   AS ventas_mes,
           SUM(p.propina) AS propinas_mes
      FROM order_payments p JOIN orders o ON o.id = p.order_id
     WHERE p.restaurant_id IN (SELECT id FROM mias) AND p.anulado_at IS NULL
       AND p.paid_at >= v_mes_desde AND p.paid_at < v_mes_hasta
       AND o.status <> 'cancelled'
       AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi'
     GROUP BY p.restaurant_id
  ), ordenes AS (
    SELECT o.restaurant_id,
           COUNT(*) FILTER (WHERE o.paid_at >= v_dia_ini AND o.paid_at < v_dia_fin) AS pedidos_hoy,
           COUNT(*) AS pedidos_mes
      FROM orders o
     WHERE o.restaurant_id IN (SELECT id FROM mias) AND o.status = 'completed'
       AND o.paid_at >= v_mes_desde AND o.paid_at < v_mes_hasta
       AND o.tipo_pedido IS DISTINCT FROM 'RAPPI' AND o.payment_method IS DISTINCT FROM 'rappi'
     GROUP BY o.restaurant_id
  ), gas AS (
    SELECT g.restaurant_id,
           SUM(g.monto) FILTER (WHERE g.created_at >= v_dia_ini AND g.created_at < v_dia_fin) AS gastos_hoy,
           SUM(g.monto) AS gastos_mes
      FROM gastos g
     WHERE g.restaurant_id IN (SELECT id FROM mias) AND g.created_at >= v_mes_desde AND g.created_at < v_mes_hasta
     GROUP BY g.restaurant_id
  ), curso AS (
    SELECT o.restaurant_id, COUNT(*) AS n FROM orders o
     WHERE o.restaurant_id IN (SELECT id FROM mias) AND o.status IN ('pending', 'cooking', 'ready')
     GROUP BY o.restaurant_id
  ), bajos AS (
    SELECT i.restaurant_id, COUNT(*) AS n FROM ingredientes i
     WHERE i.restaurant_id IN (SELECT id FROM mias) AND i.stock_actual <= i.stock_minimo
     GROUP BY i.restaurant_id
  ), cortes AS (
    SELECT DISTINCT ON (k.restaurant_id) k.restaurant_id, k.fecha, k.created_at,
           k.total_efectivo + k.total_transferencia + COALESCE(k.total_tarjeta, 0) AS total,
           k.total_neto, k.efectivo_esperado
      FROM cortes_caja k
     WHERE k.restaurant_id IN (SELECT id FROM mias)
     ORDER BY k.restaurant_id, k.created_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id, 'nombre', m.name, 'activa', m.active, 'actual', m.actual,
           'ventas_hoy',   COALESCE(p.ventas_hoy, 0),   'ventas_mes',   COALESCE(p.ventas_mes, 0),
           'propinas_hoy', COALESCE(p.propinas_hoy, 0), 'propinas_mes', COALESCE(p.propinas_mes, 0),
           'pedidos_hoy',  COALESCE(o.pedidos_hoy, 0),  'pedidos_mes',  COALESCE(o.pedidos_mes, 0),
           'gastos_hoy',   COALESCE(g.gastos_hoy, 0),   'gastos_mes',   COALESCE(g.gastos_mes, 0),
           'neto_hoy',     COALESCE(p.ventas_hoy, 0) - COALESCE(g.gastos_hoy, 0),
           'neto_mes',     COALESCE(p.ventas_mes, 0) - COALESCE(g.gastos_mes, 0),
           'pedidos_en_curso',   COALESCE(c.n, 0),
           'ingredientes_bajos', COALESCE(b.n, 0),
           'ultimo_corte', CASE WHEN k.restaurant_id IS NULL THEN NULL ELSE jsonb_build_object(
              'fecha', k.fecha, 'creado', k.created_at, 'total', k.total, 'neto', k.total_neto,
              'efectivo_esperado', k.efectivo_esperado) END
         ) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_sedes
    FROM mias m
    LEFT JOIN pagos p  ON p.restaurant_id = m.id
    LEFT JOIN ordenes o ON o.restaurant_id = m.id
    LEFT JOIN gas g    ON g.restaurant_id = m.id
    LEFT JOIN curso c  ON c.restaurant_id = m.id
    LEFT JOIN bajos b  ON b.restaurant_id = m.id
    LEFT JOIN cortes k ON k.restaurant_id = m.id;

  SELECT jsonb_build_object(
           'ventas_hoy',   COALESCE(SUM((e->>'ventas_hoy')::numeric), 0),
           'ventas_mes',   COALESCE(SUM((e->>'ventas_mes')::numeric), 0),
           'propinas_hoy', COALESCE(SUM((e->>'propinas_hoy')::numeric), 0),
           'propinas_mes', COALESCE(SUM((e->>'propinas_mes')::numeric), 0),
           'pedidos_hoy',  COALESCE(SUM((e->>'pedidos_hoy')::int), 0),
           'pedidos_mes',  COALESCE(SUM((e->>'pedidos_mes')::int), 0),
           'gastos_hoy',   COALESCE(SUM((e->>'gastos_hoy')::numeric), 0),
           'gastos_mes',   COALESCE(SUM((e->>'gastos_mes')::numeric), 0),
           'neto_hoy',     COALESCE(SUM((e->>'neto_hoy')::numeric), 0),
           'neto_mes',     COALESCE(SUM((e->>'neto_mes')::numeric), 0),
           'pedidos_en_curso',   COALESCE(SUM((e->>'pedidos_en_curso')::int), 0),
           'ingredientes_bajos', COALESCE(SUM((e->>'ingredientes_bajos')::int), 0))
    INTO v_total
    FROM jsonb_array_elements(v_sedes) e;

  RETURN jsonb_build_object('hoy', v_hoy, 'mes', to_char(v_mes_ini, 'YYYY-MM'), 'sedes', v_sedes, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.resumen_sedes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_sedes() TO authenticated;
