-- Bloque 11, paso 3: historial de reportes con IA, interruptor por restaurante (APAGADO por defecto), registro de consumo,
-- topes de gasto y la vista de consumo para el dueño de la plataforma (Anexo I, 6 y 7). Aditiva.

-- ── Topes y precios (se editan en el panel con las funciones existentes de condiciones generales; los precios son para ESTIMAR el costo) ──
INSERT INTO public.platform_settings (clave, valor, descripcion) VALUES
  ('ai_tope_global_usd_mes', 20, 'Tope de gasto de IA de toda la plataforma por mes (USD). Al llegar, no se generan más reportes.'),
  ('ai_alerta_pct', 80, 'Porcentaje del tope global desde el cual el panel muestra el aviso de consumo'),
  ('ai_precio_entrada_usd_millon', 0.30, 'Precio por millón de tokens de entrada (USD), para estimar el costo. Verificar con el proveedor.'),
  ('ai_precio_salida_usd_millon', 2.50, 'Precio por millón de tokens de salida (USD), para estimar el costo. Verificar con el proveedor.')
ON CONFLICT (clave) DO NOTHING;

-- ── Interruptor de IA por restaurante: sin fila = apagada. Solo lo cambia el dueño de la plataforma ──
CREATE TABLE IF NOT EXISTS public.ai_restaurant_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  ia_activa     boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);
ALTER TABLE public.ai_restaurant_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_restaurant_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_restaurant_settings FROM authenticated;
CREATE POLICY "ia: el admin ve el estado de la suya" ON public.ai_restaurant_settings FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

-- ── Reportes: historial, caché y trazabilidad. Los escribe solo la Edge Function (service role) ──
CREATE TABLE IF NOT EXISTS public.ai_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('semanal', 'mensual', 'pregunta')),
  periodo_desde   date NOT NULL,
  periodo_hasta   date NOT NULL,
  datos           jsonb NOT NULL,                       -- lo que calculó la base (y lo único que se le mostró a la IA)
  resultado       jsonb,                                -- lo que redactó la IA, ya validado
  estado          text NOT NULL CHECK (estado IN ('ok', 'sin_redaccion', 'error')),
  proveedor       text,
  modelo          text,
  tokens_entrada  integer NOT NULL DEFAULT 0,
  tokens_salida   integer NOT NULL DEFAULT 0,
  costo_usd       numeric(12, 6) NOT NULL DEFAULT 0,
  intentos        integer NOT NULL DEFAULT 1,
  error           text CHECK (error IS NULL OR char_length(error) <= 500),
  origen          text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'programado')),
  pedido_por      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_reports_rest_idx ON public.ai_reports (restaurant_id, created_at DESC);
-- Un solo reporte válido por restaurante, tipo y periodo: es la caché y el freno de costo (regenerar el mismo periodo no cuesta de nuevo).
CREATE UNIQUE INDEX IF NOT EXISTS ai_reports_periodo_unico ON public.ai_reports (restaurant_id, tipo, periodo_desde, periodo_hasta)
  WHERE estado IN ('ok', 'sin_redaccion') AND tipo <> 'pregunta';
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_reports FROM authenticated;
CREATE POLICY "reportes ia: el admin lee los de su restaurante" ON public.ai_reports FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

-- ── Consumo: una fila por llamada a la IA (reportes hoy; chat y voz pueden registrarse aquí después) ──
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid REFERENCES public.restaurants (id) ON DELETE CASCADE,
  funcion         text NOT NULL,
  proveedor       text,
  modelo          text,
  tokens_entrada  integer NOT NULL DEFAULT 0,
  tokens_salida   integer NOT NULL DEFAULT 0,
  costo_usd       numeric(12, 6) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_fecha_idx ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_rest_idx ON public.ai_usage (restaurant_id, created_at DESC);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;      -- sin políticas: solo service role y las funciones del dueño
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

-- ── ¿Se puede generar este reporte? Solo la Edge Function (service role) la llama ──
CREATE OR REPLACE FUNCTION public.ai_cupo(p_restaurant uuid, p_tipo text, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE activa boolean; existente uuid; gasto numeric; tope numeric; pct numeric;
  mes_ini timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
BEGIN
  SELECT coalesce((SELECT ia_activa FROM public.ai_restaurant_settings WHERE restaurant_id = p_restaurant), false) INTO activa;
  IF NOT activa THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'ia_apagada'); END IF;
  SELECT id INTO existente FROM public.ai_reports
   WHERE restaurant_id = p_restaurant AND tipo = p_tipo AND periodo_desde = p_desde AND periodo_hasta = p_hasta AND estado IN ('ok', 'sin_redaccion') LIMIT 1;
  IF existente IS NOT NULL THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'ya_existe', 'report_id', existente); END IF;
  SELECT coalesce(sum(costo_usd), 0) INTO gasto FROM public.ai_usage WHERE created_at >= mes_ini;
  SELECT coalesce((SELECT valor FROM public.platform_settings WHERE clave = 'ai_tope_global_usd_mes'), 20) INTO tope;
  SELECT coalesce((SELECT valor FROM public.platform_settings WHERE clave = 'ai_alerta_pct'), 80) INTO pct;
  IF gasto >= tope THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'tope_global', 'gasto_usd', gasto, 'tope_usd', tope); END IF;
  RETURN jsonb_build_object('permitido', true, 'gasto_usd', gasto, 'tope_usd', tope, 'alerta', gasto >= tope * pct / 100);
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_cupo(uuid, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cupo(uuid, text, date, date) TO service_role;

-- ── Para el dueño de la plataforma: consumo del mes por restaurante ──
CREATE OR REPLACE FUNCTION public.plataforma_ai_consumo(p_mes date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ini timestamptz; fin timestamptz; gasto numeric; tope numeric; pct numeric; filas jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  ini := date_trunc('month', coalesce(p_mes, (now() AT TIME ZONE 'America/Bogota')::date)::timestamp) AT TIME ZONE 'America/Bogota';
  fin := ini + interval '1 month';
  SELECT coalesce(sum(costo_usd), 0) INTO gasto FROM public.ai_usage WHERE created_at >= ini AND created_at < fin;
  SELECT coalesce((SELECT valor FROM public.platform_settings WHERE clave = 'ai_tope_global_usd_mes'), 20) INTO tope;
  SELECT coalesce((SELECT valor FROM public.platform_settings WHERE clave = 'ai_alerta_pct'), 80) INTO pct;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'costo_usd')::numeric DESC, x->>'nombre'), '[]'::jsonb) INTO filas FROM (
    SELECT jsonb_build_object('restaurant_id', r.id, 'nombre', r.name,
        'ia_activa', coalesce(s.ia_activa, false),
        'llamadas', coalesce(u.n, 0), 'tokens_entrada', coalesce(u.ti, 0), 'tokens_salida', coalesce(u.ts, 0),
        'costo_usd', round(coalesce(u.c, 0), 4), 'ultimo_uso', u.ultimo) AS x
      FROM public.restaurants r
      LEFT JOIN public.ai_restaurant_settings s ON s.restaurant_id = r.id
      LEFT JOIN (SELECT restaurant_id, count(*) AS n, sum(tokens_entrada) AS ti, sum(tokens_salida) AS ts, sum(costo_usd) AS c, max(created_at) AS ultimo
                   FROM public.ai_usage WHERE created_at >= ini AND created_at < fin GROUP BY 1) u ON u.restaurant_id = r.id) q;
  RETURN jsonb_build_object('mes', to_char(ini AT TIME ZONE 'America/Bogota', 'YYYY-MM'), 'gasto_usd', round(gasto, 4), 'tope_usd', tope,
    'uso_pct', CASE WHEN tope > 0 THEN round(gasto / tope * 100, 1) END, 'alerta', gasto >= tope * pct / 100, 'restaurantes', filas);
END;
$function$;

-- ── Encender o apagar la IA de un restaurante (con motivo y registro) ──
CREATE OR REPLACE FUNCTION public.plataforma_ai_activar(p_restaurant uuid, p_activa boolean, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE antes boolean;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Cambiar la IA de un restaurante exige un motivo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant) THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  SELECT coalesce((SELECT ia_activa FROM public.ai_restaurant_settings WHERE restaurant_id = p_restaurant), false) INTO antes;
  INSERT INTO public.ai_restaurant_settings (restaurant_id, ia_activa, updated_by) VALUES (p_restaurant, p_activa, auth.uid())
    ON CONFLICT (restaurant_id) DO UPDATE SET ia_activa = excluded.ia_activa, updated_at = now(), updated_by = auth.uid();
  PERFORM public._auditar('ia_restaurante', 'ai_restaurant_settings', p_restaurant, jsonb_build_object('ia_activa', antes), jsonb_build_object('ia_activa', p_activa), p_motivo);
END;
$function$;

REVOKE ALL ON FUNCTION public.plataforma_ai_consumo(date), public.plataforma_ai_activar(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_ai_consumo(date), public.plataforma_ai_activar(uuid, boolean, text) TO authenticated;
