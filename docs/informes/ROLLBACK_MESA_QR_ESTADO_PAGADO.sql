-- COPIA PREVIA / VOLVER ATRÁS de 20261128140000_mesa_qr_estado_pagado.sql
-- Definición de producción (2026-11-28) de mesa_publica_estado antes del cambio. NO es una migración.

CREATE OR REPLACE FUNCTION public.mesa_publica_estado(p_restaurant uuid, p_mesa integer, p_dispositivo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m public.mesas%ROWTYPE; v_abierta boolean; v_auth boolean; v_sol jsonb; v_lineas jsonb := '[]'::jsonb; v_total numeric := 0; v_call jsonb;
BEGIN
  IF p_restaurant IS NULL OR p_mesa IS NULL OR p_dispositivo IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  SELECT * INTO m FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND active = true) THEN
    RETURN jsonb_build_object('existe', false);
  END IF;
  v_abierta := m.estado IN ('ocupada','cuenta');
  v_auth := (NOT v_abierta) OR p_dispositivo = ANY (m.dispositivos_autorizados);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'estado', CASE WHEN s.estado = 'pendiente' AND s.created_at < now() - interval '30 minutes' THEN 'expirado' ELSE s.estado END,
           'motivo', s.motivo, 'total', s.total, 'created_at', s.created_at,
           'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', i->>'name', 'quantity', i->'quantity', 'price', i->'price', 'notes', i->>'notes')), '[]'::jsonb) FROM jsonb_array_elements(s.items) i)
         ) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sol
    FROM (SELECT * FROM public.pedidos_mesa_pendientes
           WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND created_at > now() - interval '6 hours'
           ORDER BY created_at DESC LIMIT 10) s;

  IF v_auth THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'price', p, 'quantity', q) ORDER BY n), '[]'::jsonb) INTO v_lineas
      FROM (SELECT i->>'name' n, (i->>'price')::numeric p, sum(coalesce((i->>'quantity')::int, 1)) q
              FROM public.orders o, jsonb_array_elements(o.items) i
             WHERE o.restaurant_id = p_restaurant AND o.status <> 'cancelled' AND o.paid_at IS NULL AND o.created_at > now() - interval '24 hours'
               AND (o.mesa_id = m.id OR (o.mesa_id IS NULL AND o.table_num = m.numero AND o.tipo_pedido = 'LOCAL'))
             GROUP BY 1, 2) x;
    SELECT coalesce(sum(o.total), 0) INTO v_total FROM public.orders o
     WHERE o.restaurant_id = p_restaurant AND o.status <> 'cancelled' AND o.paid_at IS NULL AND o.created_at > now() - interval '24 hours'
       AND (o.mesa_id = m.id OR (o.mesa_id IS NULL AND o.table_num = m.numero AND o.tipo_pedido = 'LOCAL'));
  END IF;

  SELECT jsonb_build_object(
      'mesero', EXISTS (SELECT 1 FROM public.llamadas_mesa WHERE mesa_id = m.id AND tipo = 'mesero' AND attended_at IS NULL),
      'cuenta', EXISTS (SELECT 1 FROM public.llamadas_mesa WHERE mesa_id = m.id AND tipo = 'cuenta' AND attended_at IS NULL)) INTO v_call;

  RETURN jsonb_build_object('existe', true, 'mesa', m.numero, 'abierta', v_abierta, 'autorizado', v_auth,
    'bloqueada', (m.codigo_bloqueo_hasta IS NOT NULL AND m.codigo_bloqueo_hasta > now()),
    'solicitudes', v_sol, 'cuenta', CASE WHEN v_auth THEN jsonb_build_object('lineas', v_lineas, 'total', v_total) END,
    'llamadas', v_call);
END $function$;

NOTIFY pgrst, 'reload schema';
