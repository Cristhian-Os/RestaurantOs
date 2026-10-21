-- Bloque 11, paso 2: `reporte_datos(desde, hasta)`: todas las cifras de un reporte, calculadas en el servidor (Anexo I, 4).
-- La IA solo redacta lo que esta función devuelve. Solo administrador; solo su restaurante; sin nombres de personas (ni clientes ni empleados).
-- Fechas en hora de Colombia. Ventas = pedidos completados, sin Rappi (precios distintos al menú), igual que el corte de caja.

CREATE OR REPLACE FUNCTION public._ventas_rango(rid uuid, d1 date, d2 date)
 RETURNS TABLE (total numeric, pedidos integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(sum(o.total), 0), count(*)::int FROM public.orders o
   WHERE o.restaurant_id = rid AND o.status = 'completed' AND o.tipo_pedido <> 'RAPPI'
     AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN d1 AND d2
$$;
REVOKE ALL ON FUNCTION public._ventas_rango(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reporte_datos(p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  rid uuid := public.current_restaurant_id();
  dias integer; ant_d1 date; ant_d2 date;
  v_tot numeric; v_ped integer; a_tot numeric; a_ped integer; s4 numeric := 0; s4n integer := 0; k integer; t numeric;
  res jsonb;
BEGIN
  IF rid IS NULL OR public.get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede generar reportes'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN RAISE EXCEPTION 'Periodo no válido'; END IF;
  dias := p_hasta - p_desde + 1;
  IF dias > 93 THEN RAISE EXCEPTION 'El periodo máximo es de 93 días'; END IF;
  ant_d2 := p_desde - 1; ant_d1 := ant_d2 - (dias - 1);
  SELECT total, pedidos INTO v_tot, v_ped FROM public._ventas_rango(rid, p_desde, p_hasta);
  SELECT total, pedidos INTO a_tot, a_ped FROM public._ventas_rango(rid, ant_d1, ant_d2);
  FOR k IN 1..4 LOOP   -- mismas fechas de las 4 semanas anteriores (equivalentes por día de la semana)
    SELECT total INTO t FROM public._ventas_rango(rid, p_desde - 7 * k, p_hasta - 7 * k);
    IF t > 0 THEN s4 := s4 + t; s4n := s4n + 1; END IF;
  END LOOP;

  WITH ped AS (
    SELECT o.*, (o.created_at AT TIME ZONE 'America/Bogota') AS local_ts FROM public.orders o
     WHERE o.restaurant_id = rid AND o.status = 'completed' AND o.tipo_pedido <> 'RAPPI'
       AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta),
  vend AS (
    SELECT it->>'id' AS dish_id, min(it->>'name') AS nombre,
           sum(greatest(1, coalesce(public._num(it->>'quantity'), 1)))::int AS unidades,
           sum(greatest(1, coalesce(public._num(it->>'quantity'), 1)) * coalesce(public._num(it->>'price'), 0)) AS ingresos
      FROM ped, jsonb_array_elements(public._items_pedido(ped.items)) it
     WHERE coalesce(it->>'cancelled', 'false') <> 'true' AND it->>'id' IS NOT NULL GROUP BY 1),
  platos AS (
    SELECT v.dish_id, coalesce(d.name, v.nombre, 'Plato') AS nombre, v.unidades, round(v.ingresos) AS ingresos,
           c.costo, (c.dish_id IS NOT NULL) AS con_receta,
           CASE WHEN c.dish_id IS NOT NULL AND coalesce(d.price, 0) > 0 THEN round((d.price - c.costo) / d.price * 100, 1) END AS margen
      FROM vend v LEFT JOIN public.dishes d ON d.id::text = v.dish_id AND d.restaurant_id = rid
      LEFT JOIN public._costos_platos(rid) c ON c.dish_id = d.id),
  conreceta AS (SELECT sum(ingresos) AS ing, sum(unidades * costo) AS cst FROM platos WHERE con_receta)
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'dias', dias),
    'ventas', jsonb_build_object('total', round(v_tot), 'pedidos', v_ped, 'ticket_promedio', CASE WHEN v_ped > 0 THEN round(v_tot / v_ped) END,
      'rappi_pedidos_aparte', (SELECT count(*) FROM public.orders o WHERE o.restaurant_id = rid AND o.status = 'completed' AND o.tipo_pedido = 'RAPPI'
         AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta)),
    'comparacion', jsonb_build_object(
      'periodo_anterior', jsonb_build_object('desde', ant_d1, 'hasta', ant_d2, 'ventas', round(a_tot), 'pedidos', a_ped,
         'variacion_ventas_pct', CASE WHEN a_tot > 0 THEN round((v_tot - a_tot) / a_tot * 100, 1) END),
      'promedio_4_semanas_equivalentes', jsonb_build_object('semanas_con_ventas', s4n, 'ventas', CASE WHEN s4n > 0 THEN round(s4 / s4n) END,
         'variacion_pct', CASE WHEN s4n > 0 AND s4 > 0 THEN round((v_tot - s4 / s4n) / (s4 / s4n) * 100, 1) END)),
    'por_dia_semana', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', (ARRAY['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[x.dow + 1],
          'ventas', round(x.v), 'pedidos', x.n) ORDER BY x.dow), '[]'::jsonb)
        FROM (SELECT extract(dow FROM local_ts)::int AS dow, sum(total) AS v, count(*) AS n FROM ped GROUP BY 1) x),
    'por_franja', (SELECT coalesce(jsonb_agg(jsonb_build_object('franja', x.f, 'ventas', round(x.v), 'pedidos', x.n) ORDER BY x.o), '[]'::jsonb)
        FROM (SELECT CASE WHEN h < 6 THEN 'Madrugada (0-6)' WHEN h < 12 THEN 'Mañana (6-12)' WHEN h < 15 THEN 'Almuerzo (12-15)' WHEN h < 19 THEN 'Tarde (15-19)' ELSE 'Noche (19-24)' END AS f,
                     min(h) AS o, sum(total) AS v, count(*) AS n
                FROM (SELECT extract(hour FROM local_ts)::int AS h, total FROM ped) y GROUP BY 1) x),
    'por_metodo_pago', (SELECT coalesce(jsonb_agg(jsonb_build_object('metodo', x.m, 'ventas', round(x.v), 'pedidos', x.n) ORDER BY x.v DESC), '[]'::jsonb)
        FROM (SELECT coalesce(payment_method, 'sin dato') AS m, sum(total) AS v, count(*) AS n FROM ped GROUP BY 1) x),
    'por_canal', (SELECT coalesce(jsonb_agg(jsonb_build_object('canal', x.c, 'ventas', round(x.v), 'pedidos', x.n) ORDER BY x.v DESC), '[]'::jsonb)
        FROM (SELECT tipo_pedido AS c, sum(total) AS v, count(*) AS n FROM ped GROUP BY 1) x),
    'platos', jsonb_build_object(
      'distintos_vendidos', (SELECT count(*) FROM platos),
      'mas_vendidos', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'unidades', x.unidades, 'ingresos', x.ingresos, 'margen_pct', x.margen)), '[]'::jsonb)
          FROM (SELECT * FROM platos ORDER BY unidades DESC, nombre LIMIT 5) x),
      'menos_vendidos', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'unidades', x.unidades, 'ingresos', x.ingresos, 'margen_pct', x.margen)), '[]'::jsonb)
          FROM (SELECT * FROM platos ORDER BY unidades ASC, nombre LIMIT 5) x),
      'sin_receta_vendidos', (SELECT count(*) FROM platos WHERE NOT con_receta),
      'sin_receta_ejemplos', (SELECT coalesce(jsonb_agg(x.nombre), '[]'::jsonb) FROM (SELECT nombre FROM platos WHERE NOT con_receta ORDER BY unidades DESC LIMIT 5) x),
      'margen_calculable_en', (SELECT count(*) FROM platos WHERE con_receta)),
    'food_cost', jsonb_build_object(
      'cobertura_ventas_pct', CASE WHEN v_tot > 0 THEN round(coalesce((SELECT ing FROM conreceta), 0) / v_tot * 100, 1) END,
      'costo_insumos_pct', CASE WHEN coalesce((SELECT ing FROM conreceta), 0) > 0 THEN round((SELECT cst FROM conreceta) / (SELECT ing FROM conreceta) * 100, 1) END),
    'gastos', jsonb_build_object(
      'total', (SELECT round(coalesce(sum(monto), 0)) FROM public.gastos g WHERE g.restaurant_id = rid AND (g.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta),
      'por_categoria', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', x.c, 'monto', round(x.m)) ORDER BY x.m DESC), '[]'::jsonb)
          FROM (SELECT coalesce(categoria, 'sin categoría') AS c, sum(monto) AS m FROM public.gastos g WHERE g.restaurant_id = rid
                  AND (g.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta GROUP BY 1) x),
      'por_origen', (SELECT coalesce(jsonb_agg(jsonb_build_object('origen', x.o, 'monto', round(x.m))), '[]'::jsonb)
          FROM (SELECT coalesce(fuente, 'sin dato') AS o, sum(monto) AS m FROM public.gastos g WHERE g.restaurant_id = rid
                  AND (g.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta GROUP BY 1) x)),
    'inventario', jsonb_build_object(
      'insumos_total', (SELECT count(*) FROM public.ingredientes WHERE restaurant_id = rid),
      'bajo_minimo', (SELECT count(*) FROM public.ingredientes WHERE restaurant_id = rid AND stock_minimo > 0 AND stock_actual <= stock_minimo),
      'bajo_minimo_ejemplos', (SELECT coalesce(jsonb_agg(jsonb_build_object('insumo', x.nombre, 'stock', x.stock_actual, 'minimo', x.stock_minimo, 'unidad', x.unidad_medida)), '[]'::jsonb)
          FROM (SELECT nombre, stock_actual, stock_minimo, unidad_medida FROM public.ingredientes WHERE restaurant_id = rid AND stock_minimo > 0 AND stock_actual <= stock_minimo
                  ORDER BY (stock_actual / stock_minimo) LIMIT 8) x)),
    'caja', jsonb_build_object(
      'cierres', (SELECT count(*) FROM public.cortes_caja c WHERE c.restaurant_id = rid AND c.fecha BETWEEN p_desde AND p_hasta),
      'cierres_con_conteo', (SELECT count(*) FROM public.cortes_caja c WHERE c.restaurant_id = rid AND c.fecha BETWEEN p_desde AND p_hasta AND jsonb_typeof(c.denominaciones) = 'array' AND jsonb_array_length(c.denominaciones) > 0),
      'cierres_con_diferencia', (SELECT count(*) FROM (
          SELECT c.id, (SELECT coalesce(sum(public._num(e->>'subtotal')), 0) FROM jsonb_array_elements(c.denominaciones) e) - coalesce(c.efectivo_esperado, c.total_efectivo) AS dif
            FROM public.cortes_caja c WHERE c.restaurant_id = rid AND c.fecha BETWEEN p_desde AND p_hasta AND jsonb_typeof(c.denominaciones) = 'array' AND jsonb_array_length(c.denominaciones) > 0) z WHERE abs(z.dif) >= 1),
      'diferencia_neta', (SELECT round(coalesce(sum(z.dif), 0)) FROM (
          SELECT (SELECT coalesce(sum(public._num(e->>'subtotal')), 0) FROM jsonb_array_elements(c.denominaciones) e) - coalesce(c.efectivo_esperado, c.total_efectivo) AS dif
            FROM public.cortes_caja c WHERE c.restaurant_id = rid AND c.fecha BETWEEN p_desde AND p_hasta AND jsonb_typeof(c.denominaciones) = 'array' AND jsonb_array_length(c.denominaciones) > 0) z)),
    'operacion', jsonb_build_object(
      'anulados', (SELECT count(*) FROM public.orders o WHERE o.restaurant_id = rid AND o.status = 'cancelled' AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta),
      'anulados_pct', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE o.status = 'cancelled') * 100.0 / count(*), 1) END
          FROM public.orders o WHERE o.restaurant_id = rid AND o.status IN ('completed', 'cancelled') AND o.tipo_pedido <> 'RAPPI' AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta)),
    'calidad_del_dato', jsonb_build_object(
      'platos_con_receta_pct', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.recetas r WHERE r.producto_id = d.id)) * 100.0 / count(*), 1) END
          FROM public.dishes d WHERE d.restaurant_id = rid),
      'dias_con_ventas', (SELECT count(DISTINCT (local_ts)::date) FROM ped),
      'dias_con_ventas_sin_cierre', (SELECT count(*) FROM (SELECT DISTINCT local_ts::date AS d FROM ped) x
          WHERE NOT EXISTS (SELECT 1 FROM public.cortes_caja c WHERE c.restaurant_id = rid AND c.fecha = x.d)),
      'tiempo_de_preparacion', 'no se registra')
  ) INTO res;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.reporte_datos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporte_datos(date, date) TO authenticated;
