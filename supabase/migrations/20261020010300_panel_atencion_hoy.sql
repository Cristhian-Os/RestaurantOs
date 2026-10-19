-- Bloque 7, paso 4 (datos): "qué necesita atención hoy" para el Inicio del panel de plataforma (Anexo C, sección 5).
-- Devuelve listas cortas; cada elemento lleva el id del restaurante para abrir su ficha.
-- Quedan para el Bloque 8 (aún no existen los datos): comisiones por aprobar, contratos por vencer. Mensajes de soporte sin
-- respuesta: no hay forma de saberlo todavía.

CREATE OR REPLACE FUNCTION public.plataforma_atencion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public._exigir_dueno();
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
        FROM base b WHERE b.proxima_accion_fecha IS NOT NULL AND b.proxima_accion_fecha <= (now() AT TIME ZONE 'America/Bogota')::date
         AND b.estado_comercial <> 'cancelado'), '[]'::jsonb),
    'codigos_a_revisar', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name, 'codigo', b.codigo_usado, 'estado', b.codigo_estado) ORDER BY b.created_at DESC)
        FROM base b WHERE b.codigo_estado IN ('invalido','inactivo') AND b.vendedor_id IS NULL), '[]'::jsonb),
    'semaforo', (SELECT jsonb_build_object('verde', count(*) FILTER (WHERE semaforo = 'verde'), 'amarillo', count(*) FILTER (WHERE semaforo = 'amarillo'),
                        'rojo', count(*) FILTER (WHERE semaforo = 'rojo'), 'gris', count(*) FILTER (WHERE semaforo = 'gris')) FROM base)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.plataforma_atencion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_atencion() TO authenticated;
