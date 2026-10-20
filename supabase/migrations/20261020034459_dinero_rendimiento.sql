-- Bloque 8, paso 9 (datos): pantallas "Dinero" y "Rendimiento" + avisos nuevos del Inicio (Anexo C, 6 y 7.6).
-- Solo dueño + 2 pasos. Los montos de ingresos salen del precio SIN IVA (base). "Rendimiento" es solo para ti: nunca se muestra a los
-- vendedores ni se usa para sancionar; solo datos reales (prospectos, estados y pagos confirmados), nada de horas ni asistencia.

CREATE OR REPLACE FUNCTION public._base_pago(p payments) RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(p.base_cop, round((p.amount_in_cents / 100.0) / (1 + coalesce((SELECT valor FROM platform_settings WHERE clave = 'iva_pct'), 19) / 100.0)));
$function$;
REVOKE ALL ON FUNCTION public._base_pago(payments) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plataforma_dinero()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ini date := date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date; v jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  WITH pagos AS (
    SELECT p.restaurant_id, p.created_at, (p.created_at AT TIME ZONE 'America/Bogota')::date dia, public._base_pago(p) base, p.amount_in_cents / 100.0 total
      FROM payments p WHERE p.kind = 'subscription' AND p.status = 'APPROVED' AND coalesce(p.amount_in_cents, 0) > 0),
  ultimo AS (
    SELECT DISTINCT ON (restaurant_id) restaurant_id, base FROM pagos WHERE created_at >= now() - interval '35 days' ORDER BY restaurant_id, created_at DESC)
  SELECT jsonb_build_object(
    'ingresos_mes_base', coalesce((SELECT sum(base) FROM pagos WHERE dia >= v_ini), 0),
    'iva_mes', coalesce((SELECT sum(total - base) FROM pagos WHERE dia >= v_ini), 0),
    'pagos_mes', (SELECT count(*) FROM pagos WHERE dia >= v_ini),
    'mrr_base', coalesce((SELECT sum(base) FROM ultimo), 0),
    'clientes_pagando', (SELECT count(*) FROM ultimo),
    'pruebas_por_convertir', (SELECT count(*) FROM restaurant_crm c JOIN restaurants r ON r.id = c.restaurant_id
                               WHERE r.active AND c.estado_comercial IN ('prueba','demo','prospecto')),
    'cancelaciones_mes', (SELECT count(DISTINCT registro_id) FROM auditoria_plataforma
                           WHERE tabla = 'restaurant_crm' AND despues->>'estado_comercial' = 'cancelado' AND antes->>'estado_comercial' <> 'cancelado'
                             AND (created_at AT TIME ZONE 'America/Bogota')::date >= v_ini),
    'comisiones_por_pagar', coalesce((SELECT sum(monto_cop) FROM comisiones WHERE estado IN ('pendiente','aprobada')), 0),
    'liquidaciones_por_pagar', coalesce((SELECT sum(total_pagar_cop) FROM liquidaciones_vendedor WHERE estado IN ('borrador','aprobada')), 0),
    'serie', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', m.mes, 'ingresos_base', coalesce(x.base, 0), 'pagos', coalesce(x.n, 0)) ORDER BY m.mes)
                         FROM generate_series(v_ini - interval '5 months', v_ini, interval '1 month') AS m(mes)
                         LEFT JOIN (SELECT date_trunc('month', dia)::date mes, sum(base) base, count(*) n FROM pagos GROUP BY 1) x ON x.mes = m.mes::date), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

-- Rendimiento de vendedores y aliados en un periodo (por defecto, el mes actual). Cada consulta queda en el registro de cambios.
CREATE OR REPLACE FUNCTION public.plataforma_rendimiento(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Bogota')::date;
  d date := coalesce(p_desde, date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date);
  h date := coalesce(p_hasta, (now() AT TIME ZONE 'America/Bogota')::date);
  v_mes date; out jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  IF d > h THEN RAISE EXCEPTION 'La fecha inicial es posterior a la final'; END IF;
  v_mes := date_trunc('month', d)::date;

  WITH pagos AS (
    SELECT p.restaurant_id rid, p.created_at, (p.created_at AT TIME ZONE 'America/Bogota')::date dia, public._base_pago(p) base
      FROM payments p WHERE p.kind = 'subscription' AND p.status = 'APPROVED' AND coalesce(p.amount_in_cents, 0) > 0),
  primero AS (SELECT rid, min(created_at) f, min(dia) fdia FROM pagos GROUP BY rid),
  ultimo AS (SELECT DISTINCT ON (rid) rid, base FROM pagos WHERE created_at >= now() - interval '35 days' ORDER BY rid, created_at DESC),
  cartera AS (SELECT c.vendedor_id, c.restaurant_id rid, c.estado_comercial, r.active FROM restaurant_crm c JOIN restaurants r ON r.id = c.restaurant_id WHERE c.vendedor_id IS NOT NULL),
  filas AS (
    SELECT v.id, v.nombre, v.codigo, v.tipo, v.activo,
      (SELECT count(*) FROM prospectos p WHERE p.vendedor_id = v.id AND p.fecha_registro BETWEEN d AND h) prospectos,
      (SELECT count(*) FROM prospectos p WHERE p.vendedor_id = v.id AND p.fecha_registro BETWEEN d AND h AND p.etapa IN ('demo','prueba','cerrado')) demos,
      (SELECT count(*) FROM cartera c WHERE c.vendedor_id = v.id AND c.active AND c.estado_comercial IN ('prueba','piloto')) pruebas_activas,
      (SELECT count(*) FROM cartera c JOIN primero f ON f.rid = c.rid WHERE c.vendedor_id = v.id AND f.fdia BETWEEN d AND h) cerrados_periodo,
      (SELECT count(*) FROM cartera c JOIN ultimo u ON u.rid = c.rid WHERE c.vendedor_id = v.id AND c.active) clientes_activos,
      (SELECT coalesce(sum(u.base), 0) FROM cartera c JOIN ultimo u ON u.rid = c.rid WHERE c.vendedor_id = v.id AND c.active) ingreso_mensual_base,
      (SELECT coalesce(sum(k.monto_cop), 0) FROM comisiones k WHERE k.vendedor_id = v.id AND k.estado <> 'anulada' AND k.periodo BETWEEN v_mes AND h) comision_periodo,
      (SELECT coalesce(sum(k.monto_cop), 0) FROM comisiones k WHERE k.vendedor_id = v.id AND k.estado <> 'anulada') comision_acumulada,
      (SELECT count(*) FROM cartera c JOIN primero f ON f.rid = c.rid WHERE c.vendedor_id = v.id AND f.f <= now() - interval '90 days') retencion_base,
      (SELECT count(*) FROM cartera c JOIN primero f ON f.rid = c.rid WHERE c.vendedor_id = v.id AND f.f <= now() - interval '90 days'
          AND EXISTS (SELECT 1 FROM pagos q WHERE q.rid = c.rid AND q.created_at >= f.f + interval '60 days')) retencion_ok
      FROM vendedores v)
  SELECT jsonb_build_object(
    'desde', d, 'hasta', h,
    'vendedores', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.comision_periodo DESC, f.nombre) FROM filas f), '[]'::jsonb),
    'serie', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', m.mes, 'clientes_nuevos', coalesce(n.n, 0), 'comisiones', coalesce(k.total, 0)) ORDER BY m.mes)
                         FROM generate_series(date_trunc('month', v_hoy)::date - interval '11 months', date_trunc('month', v_hoy)::date, interval '1 month') AS m(mes)
                         LEFT JOIN (SELECT date_trunc('month', fdia)::date mes, count(*) n FROM primero GROUP BY 1) n ON n.mes = m.mes::date
                         LEFT JOIN (SELECT periodo mes, sum(monto_cop) total FROM comisiones WHERE estado <> 'anulada' GROUP BY 1) k ON k.mes = m.mes::date), '[]'::jsonb)
  ) INTO out;

  PERFORM public._auditar('ver_rendimiento', 'vendedores', NULL, NULL, jsonb_build_object('desde', d, 'hasta', h), NULL);
  RETURN out;
END;
$function$;

-- Inicio: se suman los avisos de dinero y contratos (liquidaciones por aprobar o vencidas, contratos por vencer).
CREATE OR REPLACE FUNCTION public.plataforma_atencion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_hoy date := (now() AT TIME ZONE 'America/Bogota')::date; v_dia numeric;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT valor INTO v_dia FROM platform_settings WHERE clave = 'dia_pago_mes';
  WITH salud AS (SELECT * FROM public.plataforma_salud_restaurantes()),
  base AS (
    SELECT r.id, r.name, r.active, r.created_at, r.trial_ends_at, c.estado_comercial, c.proxima_accion, c.proxima_accion_fecha,
           c.codigo_usado, c.codigo_estado, c.vendedor_id, s.semaforo, s.ultimo_pedido, s.pedidos_7d
      FROM restaurants r
      JOIN restaurant_crm c ON c.restaurant_id = r.id
      JOIN salud s ON s.restaurant_id = r.id
  )
  SELECT jsonb_build_object(
    'pruebas_por_vencer', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name, 'vence', b.trial_ends_at) ORDER BY b.trial_ends_at)
        FROM base b WHERE b.active AND b.trial_ends_at IS NOT NULL AND b.trial_ends_at >= now() AND b.trial_ends_at < now() + interval '3 days'), '[]'::jsonb),
    'sin_pedidos_7d', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name, 'ultimo_pedido', b.ultimo_pedido, 'estado', b.estado_comercial) ORDER BY b.ultimo_pedido NULLS FIRST)
        FROM base b WHERE b.active AND b.semaforo = 'rojo' AND b.estado_comercial NOT IN ('cancelado','prospecto','demo')), '[]'::jsonb),
    'pagos_fallidos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.name, 'estado', s.status, 'gracia_hasta', s.grace_ends_at) ORDER BY r.name)
        FROM subscriptions s JOIN restaurants r ON r.id = s.restaurant_id WHERE s.status = 'past_due'), '[]'::jsonb),
    'acciones_de_hoy', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name, 'accion', b.proxima_accion, 'fecha', b.proxima_accion_fecha) ORDER BY b.proxima_accion_fecha)
        FROM base b WHERE b.proxima_accion_fecha IS NOT NULL AND b.proxima_accion_fecha <= v_hoy
         AND b.estado_comercial <> 'cancelado'), '[]'::jsonb),
    'codigos_a_revisar', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name, 'codigo', b.codigo_usado, 'estado', b.codigo_estado) ORDER BY b.created_at DESC)
        FROM base b WHERE b.codigo_estado IN ('invalido','inactivo') AND b.vendedor_id IS NULL), '[]'::jsonb),
    'liquidaciones_por_aprobar', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'vendedor', vd.nombre, 'total', l.total_pagar_cop, 'periodo', l.periodo,
                                    'vencida', (l.periodo < date_trunc('month', v_hoy)::date AND extract(day FROM v_hoy) > coalesce(v_dia, 10))) ORDER BY l.periodo, vd.nombre)
        FROM liquidaciones_vendedor l JOIN vendedores vd ON vd.id = l.vendedor_id WHERE l.estado IN ('borrador','aprobada')), '[]'::jsonb),
    'contratos_por_vencer', coalesce((SELECT jsonb_agg(jsonb_build_object('id', vd.id, 'vendedor', vd.nombre, 'vence', vd.vigente_hasta) ORDER BY vd.vigente_hasta)
        FROM vendedores vd WHERE vd.activo AND vd.vigente_hasta IS NOT NULL AND vd.vigente_hasta BETWEEN v_hoy AND v_hoy + 30), '[]'::jsonb),
    'semaforo', (SELECT jsonb_build_object('verde', count(*) FILTER (WHERE semaforo = 'verde'), 'amarillo', count(*) FILTER (WHERE semaforo = 'amarillo'),
                        'rojo', count(*) FILTER (WHERE semaforo = 'rojo'), 'gris', count(*) FILTER (WHERE semaforo = 'gris')) FROM base)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.plataforma_dinero() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plataforma_rendimiento(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_dinero() TO authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_rendimiento(date, date) TO authenticated;
