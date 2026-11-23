-- Central · RUNTIME de trabajos (paso 1 de la V2): cola durable + interruptores + guardián de políticas.
-- Aditiva: tablas nuevas y filas de configuración. NO toca restaurantes, pedidos, caja ni dinero. NO envía nada a nadie.
-- Qué da:
--   · central_trabajos: cola con estado durable, intentos, vencimiento, clave de idempotencia (no se duplica un trabajo).
--   · central_trabajos_log: cada cambio de estado, solo se agrega.
--   · Interruptores en central_config: agentes_activos (global, APAGADO de fábrica), pausa_agentes, pausa_tipos.
--   · Guardián: antes de entregar un trabajo comprueba interruptores, IA encendida, tope de gasto, vencimiento y autorización vigente.
--   · Reintentos con espera creciente + azar, trabajos fallidos definitivos ("cola de muertos") con aviso, corte automático por fallos repetidos
--     y recuperación de trabajos que quedaron "corriendo" tras un reinicio.
--   · Revocar o vencer una autorización cancela sus trabajos pendientes.
-- Solo el servidor (service_role) toma y cierra trabajos; el dueño con 2 pasos los lee, los encola y mueve los interruptores.
-- Depende de: central_nucleo (central_autorizado, central_config, central_consumo, central_notificaciones, _auditoria_inmutable) y crecimiento_fase1.
-- Reversa: supabase/rollback/20261124120000_central_runtime_trabajos_down.sql

-- ── 1. Interruptores (de fábrica: todo detenido) ────────────────────────────
INSERT INTO public.central_config (clave, valor) VALUES
  ('agentes_activos', 'false'::jsonb),
  ('pausa_agentes',   '[]'::jsonb),
  ('pausa_tipos',     '[]'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. Cola de trabajos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.central_trabajos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo               text NOT NULL CHECK (tipo IN ('prueba', 'informe_diario', 'investigar_prospectos', 'redactar_borrador')),
  agente_id          text NOT NULL REFERENCES public.central_agentes (id),
  autorizacion_id    uuid REFERENCES public.growth_autorizaciones (id),
  estado             text NOT NULL DEFAULT 'pending' CHECK (estado IN
                       ('pending', 'scheduled', 'running', 'waiting_approval', 'succeeded', 'failed', 'retrying', 'cancelled', 'expired', 'paused')),
  prioridad          integer NOT NULL DEFAULT 5 CHECK (prioridad BETWEEN 1 AND 9),   -- 1 = más urgente
  ejecutar_en        timestamptz NOT NULL DEFAULT now(),
  vence_en           timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  intentos           integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  max_intentos       integer NOT NULL DEFAULT 3 CHECK (max_intentos BETWEEN 1 AND 6),
  clave_idempotencia text NOT NULL UNIQUE CHECK (char_length(clave_idempotencia) BETWEEN 6 AND 160),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  resultado          jsonb,
  error              text CHECK (error IS NULL OR char_length(error) <= 500),
  costo              numeric(12, 4) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  bloqueado_por      text,
  bloqueo_hasta      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Todo lo que trabaja para una campaña exige su autorización (solo prueba e informe interno quedan libres).
  CHECK (tipo IN ('prueba', 'informe_diario') OR autorizacion_id IS NOT NULL),
  CHECK (vence_en > created_at)
);
CREATE INDEX IF NOT EXISTS central_trabajos_cola_idx ON public.central_trabajos (estado, ejecutar_en, prioridad);
CREATE INDEX IF NOT EXISTS central_trabajos_autorizacion_idx ON public.central_trabajos (autorizacion_id) WHERE autorizacion_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.central_trabajos_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  trabajo_id  uuid NOT NULL,
  de          text,
  a           text NOT NULL,
  motivo      text NOT NULL DEFAULT '' CHECK (char_length(motivo) <= 300)
);
CREATE INDEX IF NOT EXISTS central_trabajos_log_trabajo_idx ON public.central_trabajos_log (trabajo_id, id);
DROP TRIGGER IF EXISTS central_trabajos_log_no_editar ON public.central_trabajos_log;
CREATE TRIGGER central_trabajos_log_no_editar BEFORE UPDATE OR DELETE ON public.central_trabajos_log
  FOR EACH ROW EXECUTE FUNCTION public._auditoria_inmutable();

CREATE OR REPLACE FUNCTION public.central_trabajos_registrar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.central_trabajos_log (trabajo_id, de, a, motivo) VALUES (NEW.id, NULL, NEW.estado, 'creado');
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO public.central_trabajos_log (trabajo_id, de, a, motivo) VALUES (NEW.id, OLD.estado, NEW.estado, coalesce(left(NEW.error, 300), ''));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_trabajos_registrar() FROM PUBLIC, anon, authenticated;
-- BEFORE para poder fijar updated_at; el log solo guarda el cambio ya decidido.
DROP TRIGGER IF EXISTS central_trabajos_registrar ON public.central_trabajos;
CREATE TRIGGER central_trabajos_registrar BEFORE UPDATE ON public.central_trabajos
  FOR EACH ROW EXECUTE FUNCTION public.central_trabajos_registrar();
DROP TRIGGER IF EXISTS central_trabajos_registrar_alta ON public.central_trabajos;
CREATE TRIGGER central_trabajos_registrar_alta AFTER INSERT ON public.central_trabajos
  FOR EACH ROW EXECUTE FUNCTION public.central_trabajos_registrar();

-- Un trabajo ya cerrado no se reabre desde fuera de las funciones de este archivo.
CREATE OR REPLACE FUNCTION public.central_trabajos_cerrado()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.estado IN ('succeeded', 'failed', 'cancelled', 'expired') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'Un trabajo cerrado no se reabre: encola otro.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS central_trabajos_cerrado ON public.central_trabajos;
CREATE TRIGGER central_trabajos_cerrado BEFORE UPDATE ON public.central_trabajos
  FOR EACH ROW EXECUTE FUNCTION public.central_trabajos_cerrado();

-- ── 3. Seguridad de filas ───────────────────────────────────────────────────
ALTER TABLE public.central_trabajos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.central_trabajos_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.central_trabajos, public.central_trabajos_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.central_trabajos, public.central_trabajos_log TO authenticated;
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_trabajos;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_trabajos FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_trabajos_log;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_trabajos_log FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));

-- ── 4. Guardián de políticas: devuelve NULL si puede correr, o el motivo si no ─
CREATE OR REPLACE FUNCTION public._central_trabajo_motivo(p_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t record;
  v_tope numeric; v_gasto numeric;
BEGIN
  SELECT * INTO t FROM public.central_trabajos WHERE id = p_id;
  IF NOT FOUND THEN RETURN 'no_existe'; END IF;
  IF t.vence_en <= now() THEN RETURN 'vencido'; END IF;
  IF t.tipo <> 'prueba' AND coalesce((SELECT valor FROM public.central_config WHERE clave = 'agentes_activos'), 'false'::jsonb) <> 'true'::jsonb THEN
    RETURN 'interruptor_global_apagado';
  END IF;
  IF coalesce((SELECT valor FROM public.central_config WHERE clave = 'pausa_agentes'), '[]'::jsonb) ? t.agente_id THEN RETURN 'agente_pausado'; END IF;
  IF coalesce((SELECT valor FROM public.central_config WHERE clave = 'pausa_tipos'), '[]'::jsonb) ? t.tipo THEN RETURN 'tipo_pausado'; END IF;
  IF t.autorizacion_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.growth_autorizaciones a
        WHERE a.id = t.autorizacion_id AND a.estado = 'vigente' AND now() >= a.vigente_desde AND now() < a.vigente_hasta) THEN
    RETURN 'autorizacion_no_vigente';
  END IF;
  IF t.tipo IN ('investigar_prospectos', 'redactar_borrador') THEN
    IF coalesce((SELECT valor FROM public.central_config WHERE clave = 'ia_encendida'), 'false'::jsonb) <> 'true'::jsonb THEN RETURN 'ia_apagada'; END IF;
    SELECT coalesce((valor #>> '{}')::numeric, 0) INTO v_tope FROM public.central_config WHERE clave = 'ia_tope_mensual_usd';
    SELECT coalesce(sum(costo), 0) INTO v_gasto FROM public.central_consumo
     WHERE periodo = date_trunc('month', (now() AT TIME ZONE 'America/Bogota'))::date;
    IF coalesce(v_tope, 0) <= 0 OR v_gasto >= v_tope THEN RETURN 'tope_mensual'; END IF;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._central_trabajo_motivo(uuid) FROM PUBLIC, anon, authenticated;

-- El trabajador la llama otra vez justo antes de cualquier acción externa (el interruptor puede haberse apagado mientras corría).
CREATE OR REPLACE FUNCTION public.central_trabajo_puede(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  IF (SELECT estado FROM public.central_trabajos WHERE id = p_id) IN ('cancelled', 'expired', 'failed', 'succeeded') THEN
    RETURN jsonb_build_object('puede', false, 'motivo', 'trabajo_cerrado');
  END IF;
  v := public._central_trabajo_motivo(p_id);
  RETURN jsonb_build_object('puede', v IS NULL, 'motivo', v);
END;
$function$;
REVOKE ALL ON FUNCTION public.central_trabajo_puede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_trabajo_puede(uuid) TO authenticated, service_role;

-- ── 5. Encolar (idempotente) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.central_trabajo_encolar(
  p_tipo text, p_agente text, p_clave text, p_autorizacion uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb,
  p_ejecutar_en timestamptz DEFAULT now(), p_vence_en timestamptz DEFAULT NULL, p_prioridad integer DEFAULT 5)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.central_trabajos (tipo, agente_id, autorizacion_id, clave_idempotencia, payload, ejecutar_en, vence_en, prioridad)
  VALUES (p_tipo, p_agente, p_autorizacion, p_clave, coalesce(p_payload, '{}'::jsonb), coalesce(p_ejecutar_en, now()),
          coalesce(p_vence_en, now() + interval '1 day'), coalesce(p_prioridad, 5))
  ON CONFLICT (clave_idempotencia) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.central_trabajos WHERE clave_idempotencia = p_clave; END IF;   -- ya existía: no se duplica
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_trabajo_encolar(text, text, text, uuid, jsonb, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_trabajo_encolar(text, text, text, uuid, jsonb, timestamptz, timestamptz, integer) TO authenticated, service_role;

-- ── 6. Tomar trabajos (solo el servidor). Recupera, vence y respeta al guardián ─
CREATE OR REPLACE FUNCTION public.central_trabajo_tomar(p_trabajador text, p_limite integer DEFAULT 1)
 RETURNS SETOF public.central_trabajos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.central_trabajos;
  v text; n integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Solo el servidor puede tomar trabajos.' USING ERRCODE = '42501'; END IF;
  -- Vencidos
  UPDATE public.central_trabajos SET estado = 'expired', error = 'venció antes de correr'
   WHERE estado IN ('pending', 'scheduled', 'retrying', 'paused', 'waiting_approval') AND vence_en <= now();
  -- Recuperación: corriendo con el bloqueo vencido (el trabajador murió). Se reintenta sin repetir efectos: la clave de idempotencia viaja en el trabajo.
  UPDATE public.central_trabajos SET estado = CASE WHEN intentos >= max_intentos THEN 'failed' ELSE 'retrying' END,
         error = 'se perdió el trabajador; se recupera', bloqueado_por = NULL, bloqueo_hasta = NULL, ejecutar_en = now()
   WHERE estado = 'running' AND bloqueo_hasta IS NOT NULL AND bloqueo_hasta < now();
  -- Los pausados por interruptor vuelven a la cola cuando el guardián ya los deja pasar
  FOR t IN SELECT * FROM public.central_trabajos WHERE estado = 'paused' FOR UPDATE SKIP LOCKED LOOP
    IF public._central_trabajo_motivo(t.id) IS NULL THEN UPDATE public.central_trabajos SET estado = 'pending', error = NULL WHERE id = t.id; END IF;
  END LOOP;

  FOR t IN
    SELECT * FROM public.central_trabajos
     WHERE estado IN ('pending', 'scheduled', 'retrying') AND ejecutar_en <= now()
     ORDER BY prioridad, ejecutar_en
     FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN n >= greatest(coalesce(p_limite, 1), 1);
    v := public._central_trabajo_motivo(t.id);
    IF v IS NULL THEN
      UPDATE public.central_trabajos SET estado = 'running', intentos = intentos + 1, bloqueado_por = left(p_trabajador, 80),
             bloqueo_hasta = now() + interval '10 minutes', error = NULL
       WHERE id = t.id RETURNING * INTO t;
      n := n + 1;
      RETURN NEXT t;
    ELSIF v = 'autorizacion_no_vigente' THEN
      UPDATE public.central_trabajos SET estado = 'cancelled', error = v WHERE id = t.id;
    ELSIF v = 'vencido' THEN
      UPDATE public.central_trabajos SET estado = 'expired', error = v WHERE id = t.id;
    ELSE
      UPDATE public.central_trabajos SET estado = 'paused', error = v WHERE id = t.id;
    END IF;
  END LOOP;
  RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_trabajo_tomar(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.central_trabajo_tomar(text, integer) TO service_role;

-- ── 7. Terminar un trabajo: éxito, reintento con espera creciente, o cola de muertos + corte ─
CREATE OR REPLACE FUNCTION public.central_trabajo_terminar(
  p_id uuid, p_ok boolean, p_resultado jsonb DEFAULT NULL, p_error text DEFAULT NULL, p_costo numeric DEFAULT 0)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.central_trabajos;
  v_espera interval; v_fallos integer; v_nuevo text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Solo el servidor puede cerrar trabajos.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.central_trabajos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe ese trabajo.' USING ERRCODE = 'P0001'; END IF;
  -- Si lo cancelaron mientras corría (revocación, interruptor), se respeta la cancelación.
  IF t.estado <> 'running' THEN RETURN t.estado; END IF;

  -- El costo se anota SIEMPRE (también si falló) y cuenta contra el tope mensual.
  IF coalesce(p_costo, 0) > 0 THEN
    INSERT INTO public.central_consumo (agente_id, periodo, proveedor, tokens, costo)
    VALUES (t.agente_id, date_trunc('month', (now() AT TIME ZONE 'America/Bogota'))::date, 'trabajo:' || t.tipo, 0, p_costo);
  END IF;

  IF p_ok THEN
    v_nuevo := 'succeeded';
    UPDATE public.central_trabajos SET estado = v_nuevo, resultado = p_resultado, error = NULL, costo = costo + coalesce(p_costo, 0),
           bloqueado_por = NULL, bloqueo_hasta = NULL WHERE id = p_id;
    RETURN v_nuevo;
  END IF;

  IF t.intentos < t.max_intentos THEN
    v_nuevo := 'retrying';
    -- espera 1, 2, 4… minutos (por intento) + hasta 30 % de azar para no chocar con otros
    v_espera := make_interval(secs => (60 * power(2, t.intentos - 1)) * (1 + random() * 0.3));
    UPDATE public.central_trabajos SET estado = v_nuevo, error = left(coalesce(p_error, 'falló'), 500), costo = costo + coalesce(p_costo, 0),
           ejecutar_en = now() + v_espera, bloqueado_por = NULL, bloqueo_hasta = NULL WHERE id = p_id;
    RETURN v_nuevo;
  END IF;

  v_nuevo := 'failed';   -- cola de muertos: no se reintenta solo
  UPDATE public.central_trabajos SET estado = v_nuevo, error = left(coalesce(p_error, 'falló'), 500), costo = costo + coalesce(p_costo, 0),
         bloqueado_por = NULL, bloqueo_hasta = NULL WHERE id = p_id;
  INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
  VALUES ('alerta', 'importante', 'Un trabajo de los agentes falló del todo',
          left('Tipo ' || t.tipo || ' · agente ' || t.agente_id || ' · ' || coalesce(p_error, 'sin detalle'), 1000), 'runtime', '/central');
  -- Corte automático: 3 fallos definitivos del mismo tipo en 1 hora pausan ese tipo hasta que el dueño lo reanude.
  SELECT count(*) INTO v_fallos FROM public.central_trabajos WHERE tipo = t.tipo AND estado = 'failed' AND updated_at > now() - interval '1 hour';
  IF v_fallos >= 3 THEN
    UPDATE public.central_config SET valor = valor || to_jsonb(t.tipo)
     WHERE clave = 'pausa_tipos' AND NOT (valor ? t.tipo);
    INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
    VALUES ('alerta', 'critica', 'Se pausó un tipo de trabajo por fallos repetidos',
            'El tipo ' || t.tipo || ' falló 3 veces en una hora. Revisa y reanúdalo desde Central cuando esté arreglado.', 'runtime', '/central');
  END IF;
  RETURN v_nuevo;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_trabajo_terminar(uuid, boolean, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.central_trabajo_terminar(uuid, boolean, jsonb, text, numeric) TO service_role;

-- ── 8. Interruptores: solo el dueño con 2 pasos ─────────────────────────────
CREATE OR REPLACE FUNCTION public.central_interruptor(p_clave text, p_valor jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  IF p_clave NOT IN ('agentes_activos', 'pausa_agentes', 'pausa_tipos') THEN RAISE EXCEPTION 'Interruptor desconocido.' USING ERRCODE = 'P0001'; END IF;
  IF p_clave = 'agentes_activos' AND jsonb_typeof(p_valor) <> 'boolean' THEN RAISE EXCEPTION 'Debe ser verdadero o falso.' USING ERRCODE = 'P0001'; END IF;
  IF p_clave <> 'agentes_activos' AND jsonb_typeof(p_valor) <> 'array' THEN RAISE EXCEPTION 'Debe ser una lista.' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.central_config SET valor = p_valor WHERE clave = p_clave;
  -- Apagar el global detiene también lo que ya corre: se pausa, no se borra.
  IF p_clave = 'agentes_activos' AND p_valor = 'false'::jsonb THEN
    UPDATE public.central_trabajos SET estado = 'paused', error = 'interruptor_global_apagado', bloqueado_por = NULL, bloqueo_hasta = NULL
     WHERE estado IN ('pending', 'scheduled', 'retrying', 'running') AND tipo <> 'prueba';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_interruptor(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_interruptor(text, jsonb) TO authenticated;

-- ── 9. Revocar o vencer una autorización cancela sus trabajos ───────────────
CREATE OR REPLACE FUNCTION public.central_trabajos_por_autorizacion()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IN ('revocada', 'vencida') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE public.central_trabajos SET estado = 'cancelled', error = 'autorizacion_' || NEW.estado, bloqueado_por = NULL, bloqueo_hasta = NULL
     WHERE autorizacion_id = NEW.id AND estado IN ('pending', 'scheduled', 'retrying', 'paused', 'waiting_approval', 'running');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_trabajos_por_autorizacion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS central_trabajos_por_autorizacion ON public.growth_autorizaciones;
CREATE TRIGGER central_trabajos_por_autorizacion AFTER UPDATE OF estado ON public.growth_autorizaciones
  FOR EACH ROW EXECUTE FUNCTION public.central_trabajos_por_autorizacion();
