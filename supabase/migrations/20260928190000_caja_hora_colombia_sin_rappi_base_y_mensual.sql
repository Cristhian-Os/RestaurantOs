-- Caja: día en hora de Colombia, Rappi fuera de las ventas, base diaria y
-- corte mensual.
--
-- 1. Zona horaria. La base de datos corre en UTC, así que CURRENT_DATE
--    cambia de día a las 7 pm de Colombia. El corte del 27-sep (hecho a las
--    10:17 pm) solo sumó lo cobrado después de las 7 pm: $192.500 de los
--    ~$469.500 vendidos ese día. Todas las funciones de caja usan ahora el
--    día de America/Bogota (Colombia no tiene horario de verano, así que un
--    día siempre dura 24 h).
--
-- 2. Rappi. Sus precios son distintos a los del menú físico y la plata la
--    paga Rappi por fuera, así que no entra en ningún cálculo de ventas:
--    ni corte diario, ni corte mensual, ni productos del Excel, ni "Ventas
--    hoy" del admin. total_rappi del corte queda en 0 (columna conservada
--    por compatibilidad con cortes viejos).
--
-- 3. Base de caja: efectivo con el que arranca el cajón cada día. Es el
--    punto de partida del arqueo: efectivo esperado = base + ventas en
--    efectivo + propinas en efectivo. No es venta, así que no toca el neto.

CREATE OR REPLACE FUNCTION public.hoy_local()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE 'America/Bogota')::date
$function$;

-- ── Base de caja ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bases_caja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id),
  fecha          date NOT NULL DEFAULT public.hoy_local(),
  monto          numeric NOT NULL CHECK (monto >= 0),
  registrado_por uuid REFERENCES auth.users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, fecha)
);
ALTER TABLE public.bases_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin y cajero gestionan bases de caja" ON public.bases_caja;
CREATE POLICY "Admin y cajero gestionan bases de caja" ON public.bases_caja AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

ALTER TABLE public.cortes_caja ADD COLUMN IF NOT EXISTS base_caja numeric NOT NULL DEFAULT 0;

-- Registra (o corrige) la base de HOY. Una sola base por restaurante y día.
CREATE OR REPLACE FUNCTION public.registrar_base_caja(p_monto numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid UUID := public.current_restaurant_id();
  v_row public.bases_caja%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar la base de caja';
  END IF;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el restaurante'; END IF;
  IF p_monto IS NULL OR p_monto < 0 OR p_monto > 100000000 THEN
    RAISE EXCEPTION 'Monto de base inválido';
  END IF;

  INSERT INTO public.bases_caja (restaurant_id, fecha, monto, registrado_por)
  VALUES (v_rid, public.hoy_local(), round(p_monto), auth.uid())
  ON CONFLICT (restaurant_id, fecha) DO UPDATE
    SET monto = EXCLUDED.monto, registrado_por = EXCLUDED.registrado_por, updated_at = now()
  RETURNING * INTO v_row;

  RETURN json_build_object('fecha', v_row.fecha, 'monto', v_row.monto);
END;
$function$;

-- ── Corte diario ────────────────────────────────────────────────────────
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

-- Productos vendidos hoy (Excel del corte): mismo día local, sin Rappi.
CREATE OR REPLACE FUNCTION public.get_corte_productos()
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

-- ── Corte mensual (solo lectura: no crea registro en cortes_caja) ────────
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

-- ── Métricas del admin: "Ventas hoy" en día local y sin Rappi ───────────
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
  v_rid    UUID := public.current_restaurant_id();
  v_desde  TIMESTAMPTZ := public.hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Solo administradores pueden ver estas métricas';
  END IF;
  SELECT json_build_object(
    'total_sales_today', COALESCE((SELECT SUM(total) FROM public.orders WHERE status='completed' AND created_at>=v_desde AND restaurant_id=v_rid
                                     AND tipo_pedido IS DISTINCT FROM 'RAPPI' AND payment_method IS DISTINCT FROM 'rappi'),0),
    'pending_count',  COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='pending'  AND restaurant_id=v_rid),0),
    'cooking_count',  COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='cooking'  AND restaurant_id=v_rid),0),
    'ready_count',    COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='ready'    AND restaurant_id=v_rid),0),
    'completed_today',COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='completed' AND created_at>=v_desde AND restaurant_id=v_rid),0),
    'active_tables',  COALESCE((SELECT COUNT(*) FROM public.mesas  WHERE estado='ocupada'  AND restaurant_id=v_rid),0),
    'cancelled_today',COALESCE((SELECT COUNT(*) FROM public.orders WHERE status='cancelled' AND created_at>=v_desde AND restaurant_id=v_rid),0)
  ) INTO v_result;
  RETURN v_result;
END; $function$;

-- Funciones nuevas: solo personal autenticado (el rol se revalida adentro).
REVOKE ALL ON FUNCTION public.registrar_base_caja(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_corte_mensual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_base_caja(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_corte_mensual() TO authenticated;

NOTIFY pgrst, 'reload schema';
