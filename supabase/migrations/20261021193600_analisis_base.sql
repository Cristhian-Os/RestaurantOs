-- Bloque 11, paso 1: cálculos base del Asistente de Negocio, hechos en el servidor y sin cifras supuestas (Anexo I, 3).
-- Aditiva: una tabla y funciones nuevas. Todas son solo para el administrador y solo ven su restaurante.

-- ── Ayudas internas (no se exponen) ──
CREATE OR REPLACE FUNCTION public._num(t text) RETURNS numeric LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN t ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t::numeric END $$;

-- `orders.items` es jsonb, pero algunos pedidos lo traen como texto JSON: se normaliza a arreglo.
CREATE OR REPLACE FUNCTION public._items_pedido(i jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE
     WHEN jsonb_typeof(i) = 'array'  THEN i
     WHEN jsonb_typeof(i) = 'string' AND (i #>> '{}') ~ '^\s*\[' THEN (i #>> '{}')::jsonb
     ELSE '[]'::jsonb END $$;

REVOKE ALL ON FUNCTION public._num(text), public._items_pedido(jsonb) FROM PUBLIC, anon, authenticated;

-- ── Umbrales que el dueño puede ajustar ──
CREATE TABLE IF NOT EXISTS public.analytics_config (
  restaurant_id        uuid PRIMARY KEY DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  anulacion_pct_max    numeric NOT NULL DEFAULT 15 CHECK (anulacion_pct_max BETWEEN 1 AND 100),
  min_pedidos          integer NOT NULL DEFAULT 10 CHECK (min_pedidos BETWEEN 3 AND 1000),
  food_cost_margen_min numeric NOT NULL DEFAULT 60 CHECK (food_cost_margen_min BETWEEN 10 AND 95),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_config FROM anon;
CREATE POLICY "analitica: el admin lee la suya" ON public.analytics_config FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "analitica: el admin crea la suya" ON public.analytics_config FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "analitica: el admin cambia la suya" ON public.analytics_config FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER analytics_config_updated_at BEFORE UPDATE ON public.analytics_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Costo de receta por plato: una sola consulta para todo el menú (misma regla que calcular_costo_receta) ──
-- Un plato "con receta" tiene al menos una fila en `recetas`; si algún ingrediente no tiene costo, el costo es incompleto y se avisa.
CREATE OR REPLACE FUNCTION public._costos_platos(rid uuid)
 RETURNS TABLE (dish_id uuid, costo numeric, incompleto boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT r.producto_id,
         sum(coalesce(nullif(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria),
         bool_or(coalesce(nullif(r.costo_unitario, 0), i.costo_unitario, 0) = 0)
    FROM public.recetas r
    JOIN public.dishes d ON d.id = r.producto_id AND d.restaurant_id = rid
    LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
   GROUP BY r.producto_id
$$;
REVOKE ALL ON FUNCTION public._costos_platos(uuid) FROM PUBLIC, anon, authenticated;

-- ── Matriz de rentabilidad: los platos sin receta NO tienen margen (antes salía 100%) ──
CREATE OR REPLACE FUNCTION public.analisis_menu(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rid uuid := public.current_restaurant_id(); res jsonb;
BEGIN
  IF rid IS NULL OR public.get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede ver este análisis'; END IF;
  p_dias := least(greatest(coalesce(p_dias, 30), 1), 365);
  WITH ventas AS (
    SELECT it->>'id' AS dish_id, min(it->>'name') AS nombre,
           sum(greatest(1, coalesce(public._num(it->>'quantity'), 1)))::int AS unidades,
           sum(greatest(1, coalesce(public._num(it->>'quantity'), 1)) * coalesce(public._num(it->>'price'), 0)) AS ingresos,
           avg(public._num(it->>'price')) AS precio_vendido
      FROM public.orders o, jsonb_array_elements(public._items_pedido(o.items)) it
     WHERE o.restaurant_id = rid AND o.status = 'completed' AND o.tipo_pedido <> 'RAPPI'
       AND o.created_at >= now() - make_interval(days => p_dias)
       AND coalesce(it->>'cancelled', 'false') <> 'true' AND it->>'id' IS NOT NULL
     GROUP BY 1),
  base AS (
    SELECT v.dish_id, coalesce(d.name, v.nombre, 'Plato') AS nombre, coalesce(d.price, v.precio_vendido, 0) AS precio,
           v.unidades, round(v.ingresos) AS ingresos, c.costo, coalesce(c.incompleto, false) AS incompleto,
           (c.dish_id IS NOT NULL) AS con_receta,
           CASE WHEN c.dish_id IS NOT NULL AND coalesce(d.price, v.precio_vendido, 0) > 0
                THEN round((coalesce(d.price, v.precio_vendido) - c.costo) / coalesce(d.price, v.precio_vendido) * 100, 1) END AS margen
      FROM ventas v
      LEFT JOIN public.dishes d ON d.id::text = v.dish_id AND d.restaurant_id = rid
      LEFT JOIN public._costos_platos(rid) c ON c.dish_id = d.id),
  medias AS (SELECT avg(unidades) AS u, avg(margen) AS m FROM base WHERE margen IS NOT NULL)
  SELECT jsonb_build_object(
      'dias', p_dias,
      'con_receta', (SELECT count(*) FROM base WHERE margen IS NOT NULL),
      'sin_receta', (SELECT count(*) FROM base WHERE margen IS NULL),
      'promedio_unidades', (SELECT round(u, 1) FROM medias), 'promedio_margen', (SELECT round(m, 1) FROM medias),
      'platos', coalesce(jsonb_agg(jsonb_build_object(
          'dish_id', b.dish_id, 'nombre', b.nombre, 'precio', b.precio, 'unidades', b.unidades, 'ingresos', b.ingresos,
          'costo_receta', CASE WHEN b.con_receta THEN round(b.costo, 2) END, 'margen_pct', b.margen,
          'costo_incompleto', b.incompleto,
          'cuadrante', CASE WHEN b.margen IS NULL THEN 'sin_receta'
                            WHEN b.unidades >= m.u AND b.margen >= m.m THEN 'star'
                            WHEN b.unidades <  m.u AND b.margen >= m.m THEN 'cash_cow'
                            WHEN b.unidades >= m.u AND b.margen <  m.m THEN 'question_mark'
                            ELSE 'dog' END) ORDER BY b.unidades DESC), '[]'::jsonb))
    INTO res FROM base b CROSS JOIN medias m;
  RETURN coalesce(res, jsonb_build_object('dias', p_dias, 'con_receta', 0, 'sin_receta', 0, 'platos', '[]'::jsonb));
END;
$function$;

-- ── Alerta de food cost: todo en una consulta; solo platos con receta; sin "margen anterior" supuesto ──
CREATE OR REPLACE FUNCTION public.alertas_food_cost()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rid uuid := public.current_restaurant_id(); objetivo numeric; res jsonb;
BEGIN
  IF rid IS NULL OR public.get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede ver este análisis'; END IF;
  SELECT coalesce((SELECT food_cost_margen_min FROM public.analytics_config WHERE restaurant_id = rid), 60) INTO objetivo;
  WITH p AS (
    SELECT d.id, d.name, d.price, c.costo, c.incompleto,
           round((d.price - c.costo) / d.price * 100, 1) AS margen
      FROM public.dishes d JOIN public._costos_platos(rid) c ON c.dish_id = d.id
     WHERE d.restaurant_id = rid AND d.price > 0)
  SELECT jsonb_build_object(
      'margen_minimo', objetivo,
      'platos_total', (SELECT count(*) FROM public.dishes WHERE restaurant_id = rid),
      'platos_con_receta', (SELECT count(*) FROM p),
      'alertas', coalesce(jsonb_agg(jsonb_build_object(
          'dish_id', p.id, 'nombre', p.name, 'precio', p.price, 'costo_receta', round(p.costo, 2), 'margen_pct', p.margen,
          'critico', p.margen < objetivo - 20, 'costo_incompleto', p.incompleto,
          'precio_sugerido', ceil(p.costo / (1 - objetivo / 100) / 100) * 100) ORDER BY p.margen) FILTER (WHERE p.margen < objetivo), '[]'::jsonb))
    INTO res FROM p;
  RETURN res;
END;
$function$;

-- ── Alertas para revisar (no acusaciones): reglas explicables con umbrales del dueño ──
-- R1: porcentaje de pedidos anulados por quien los tomó, en el periodo. R2: anulaciones de las últimas 24 h frente al promedio diario REAL de los 28 días anteriores.
CREATE OR REPLACE FUNCTION public.alertas_revision(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rid uuid := public.current_restaurant_id(); umbral numeric; minp integer; salida jsonb := '[]'::jsonb; r record; hoy integer; prom numeric; dias_hist integer;
BEGIN
  IF rid IS NULL OR public.get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede ver este análisis'; END IF;
  p_dias := least(greatest(coalesce(p_dias, 7), 1), 90);
  SELECT coalesce(c.anulacion_pct_max, 15), coalesce(c.min_pedidos, 10) INTO umbral, minp
    FROM (SELECT 1) x LEFT JOIN public.analytics_config c ON c.restaurant_id = rid;
  FOR r IN
    SELECT o.user_id, coalesce(p.full_name, 'Sin nombre') AS nombre, count(*) AS total, count(*) FILTER (WHERE o.status = 'cancelled') AS anulados
      FROM public.orders o LEFT JOIN public.profiles p ON p.id = o.user_id
     WHERE o.restaurant_id = rid AND o.user_id IS NOT NULL AND o.created_at >= now() - make_interval(days => p_dias)
     GROUP BY o.user_id, p.full_name
    HAVING count(*) >= minp AND count(*) FILTER (WHERE o.status = 'cancelled') * 100.0 / count(*) > umbral
     ORDER BY 4 DESC
  LOOP
    salida := salida || jsonb_build_object('regla', 'anulaciones_por_persona', 'persona', r.nombre, 'pedidos', r.total, 'anulados', r.anulados,
      'porcentaje', round(r.anulados * 100.0 / r.total, 1));
  END LOOP;
  SELECT count(*) INTO hoy FROM public.orders WHERE restaurant_id = rid AND status = 'cancelled' AND created_at >= now() - interval '24 hours';
  SELECT count(DISTINCT (created_at AT TIME ZONE 'America/Bogota')::date) INTO dias_hist FROM public.orders
   WHERE restaurant_id = rid AND created_at >= now() - interval '29 days' AND created_at < now() - interval '1 day';
  SELECT count(*) / 28.0 INTO prom FROM public.orders
   WHERE restaurant_id = rid AND status = 'cancelled' AND created_at >= now() - interval '29 days' AND created_at < now() - interval '1 day';
  IF dias_hist >= 14 AND hoy >= 5 AND hoy > prom * 3 THEN
    salida := salida || jsonb_build_object('regla', 'anulaciones_24h', 'anulados', hoy, 'promedio_diario', round(prom, 1));
  END IF;
  RETURN jsonb_build_object('umbral_pct', umbral, 'min_pedidos', minp, 'dias', p_dias, 'alertas', salida);
END;
$function$;

-- ── Demanda por día de la semana, solo con historial real: sin 4 semanas completas dice "faltan datos" ──
CREATE OR REPLACE FUNCTION public.demanda_por_dia(p_semanas integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rid uuid := public.current_restaurant_id(); primer date; hoy date := (now() AT TIME ZONE 'America/Bogota')::date; ini date; dias_hist integer; res jsonb;
BEGIN
  IF rid IS NULL OR public.get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede ver este análisis'; END IF;
  p_semanas := least(greatest(coalesce(p_semanas, 8), 4), 26);
  SELECT min((created_at AT TIME ZONE 'America/Bogota')::date) INTO primer FROM public.orders WHERE restaurant_id = rid AND status = 'completed' AND tipo_pedido <> 'RAPPI';
  dias_hist := CASE WHEN primer IS NULL THEN 0 ELSE hoy - primer END;
  IF dias_hist < 28 THEN
    RETURN jsonb_build_object('suficiente', false, 'dias_de_historial', dias_hist, 'mensaje', 'Faltan datos: se necesitan al menos 4 semanas de ventas para estimar la demanda por día.', 'dias', '[]'::jsonb);
  END IF;
  ini := greatest(hoy - p_semanas * 7, primer);
  WITH cal AS (SELECT d::date AS dia, extract(dow FROM d)::int AS dow FROM generate_series(ini, hoy - 1, interval '1 day') d),
  v AS (SELECT (created_at AT TIME ZONE 'America/Bogota')::date AS dia, count(*) AS n FROM public.orders
         WHERE restaurant_id = rid AND status = 'completed' AND tipo_pedido <> 'RAPPI'
           AND (created_at AT TIME ZONE 'America/Bogota')::date BETWEEN ini AND hoy - 1 GROUP BY 1)
  SELECT jsonb_build_object('suficiente', true, 'dias_de_historial', dias_hist, 'desde', ini, 'hasta', hoy - 1, 'dias',
      jsonb_agg(jsonb_build_object('dow', t.dow, 'nombre', (ARRAY['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[t.dow + 1],
          'promedio_pedidos', round(t.total::numeric / t.dias_obs, 1), 'dias_observados', t.dias_obs) ORDER BY t.dow))
    INTO res FROM (SELECT cal.dow, count(*) AS dias_obs, coalesce(sum(v.n), 0) AS total FROM cal LEFT JOIN v ON v.dia = cal.dia GROUP BY cal.dow) t;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.analisis_menu(integer), public.alertas_food_cost(), public.alertas_revision(integer), public.demanda_por_dia(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analisis_menu(integer), public.alertas_food_cost(), public.alertas_revision(integer), public.demanda_por_dia(integer) TO authenticated;
