-- Central Crecimiento · FASE 3: Founder Execution Center y agenda comercial. Aditiva; no toca restaurantes, pedidos ni dinero.
-- Crea:  growth_citas (agenda interna de llamadas y demostraciones)  ·  growth_misiones (la misión de cada día y su cierre)
--        + programación: central_mision_programada() y 2 tareas automáticas (misión 7:00 a. m. y cierre 7:30 p. m., hora de Colombia).
-- Reglas que hace cumplir la base (no la pantalla):
--   · Una cita solo se CONFIRMA con fecha y hora futuras y con constancia de cómo y cuándo la aceptó el prospecto; nunca con prospectos de ejemplo,
--     perdidos o en "no contactar". Solo se marca "realizada" si ya pasó la hora y con su resultado. Una cita cerrada no se reabre.
--   · Una misión por día; "bloqueada" exige decir qué bloqueó; máximo 3 tareas; el dueño solo cambia su estado (la crea el servidor).
-- Depende de: Fase 2 y de la programación del vigía (secretos central_vigia_url / central_vigia_jwt / central_vigia_secreto).
-- Reversa: supabase/rollback/20261121120000_crecimiento_fase3_down.sql

CREATE TABLE IF NOT EXISTS public.growth_citas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.growth_prospectos (id),
  tipo         text NOT NULL DEFAULT 'demostracion' CHECK (tipo IN ('llamada', 'demostracion', 'visita', 'seguimiento')),
  estado       text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'confirmada', 'realizada', 'cancelada', 'no_asistio')),
  fecha_hora   timestamptz,
  canal        text NOT NULL DEFAULT 'telefono' CHECK (canal IN ('telefono', 'whatsapp', 'correo', 'presencial', 'videollamada', 'otro')),
  contacto     text NOT NULL DEFAULT '' CHECK (char_length(contacto) <= 200),
  aceptacion   text NOT NULL DEFAULT '' CHECK (char_length(aceptacion) <= 300),
  resumen      text NOT NULL DEFAULT '' CHECK (char_length(resumen) <= 2000),
  necesidades  text NOT NULL DEFAULT '' CHECK (char_length(necesidades) <= 2000),
  objeciones   text NOT NULL DEFAULT '' CHECK (char_length(objeciones) <= 2000),
  guia         text NOT NULL DEFAULT '' CHECK (char_length(guia) <= 2000),
  resultado    text NOT NULL DEFAULT '' CHECK (char_length(resultado) <= 2000),
  creado_por   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_citas_fecha ON public.growth_citas (fecha_hora);
CREATE INDEX IF NOT EXISTS growth_citas_prospecto ON public.growth_citas (prospecto_id);

CREATE OR REPLACE FUNCTION public.growth_cita_reglas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_p record;
BEGIN
  SELECT etapa, es_ficticio INTO v_p FROM public.growth_prospectos WHERE id = NEW.prospecto_id;
  IF v_p.es_ficticio AND NEW.estado <> 'propuesta' THEN
    RAISE EXCEPTION 'Con un prospecto de ejemplo la cita solo puede quedar como propuesta.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado IN ('realizada', 'cancelada', 'no_asistio') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'Una cita cerrada no se reabre: crea otra.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado = 'confirmada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'confirmada' OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora) THEN
    IF NEW.fecha_hora IS NULL OR NEW.fecha_hora <= now() THEN
      RAISE EXCEPTION 'Una cita se confirma con una fecha y hora futuras que el prospecto aceptó.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(NEW.aceptacion)) < 3 THEN
      RAISE EXCEPTION 'Para confirmar anota cómo y cuándo aceptó el prospecto (ej. "respondió por WhatsApp el 20 nov").' USING ERRCODE = 'P0001';
    END IF;
    IF v_p.etapa IN ('perdido', 'no_contactar') THEN
      RAISE EXCEPTION 'Este prospecto está perdido o en no contactar.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.estado = 'realizada' THEN
    IF NEW.fecha_hora IS NULL OR NEW.fecha_hora > now() THEN
      RAISE EXCEPTION 'Una cita solo se marca realizada cuando ya pasó su hora.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(NEW.resultado)) < 3 THEN
      RAISE EXCEPTION 'Anota el resultado de la cita.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS growth_citas_reglas ON public.growth_citas;
CREATE TRIGGER growth_citas_reglas BEFORE INSERT OR UPDATE ON public.growth_citas FOR EACH ROW EXECUTE FUNCTION public.growth_cita_reglas();
REVOKE EXECUTE ON FUNCTION public.growth_cita_reglas() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.growth_misiones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             date NOT NULL UNIQUE,
  mision            text NOT NULL CHECK (char_length(btrim(mision)) BETWEEN 3 AND 200),
  por_que           text NOT NULL DEFAULT '' CHECK (char_length(por_que) <= 600),
  resultado_esperado text NOT NULL DEFAULT '' CHECK (char_length(resultado_esperado) <= 400),
  minutos           integer NOT NULL DEFAULT 30 CHECK (minutos BETWEEN 1 AND 480),
  primer_paso       text NOT NULL DEFAULT '' CHECK (char_length(primer_paso) <= 400),
  agente_apoyo      text REFERENCES public.central_agentes (id),
  tareas            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tareas) = 'array' AND jsonb_array_length(tareas) <= 3),
  estado            text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'en_curso', 'completada', 'bloqueada')),
  bloqueo           text CHECK (bloqueo IS NULL OR char_length(bloqueo) <= 500),
  origen            text NOT NULL DEFAULT 'reglas' CHECK (origen IN ('reglas', 'manual')),
  cierre            jsonb CHECK (cierre IS NULL OR jsonb_typeof(cierre) = 'object'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'bloqueada' OR char_length(btrim(coalesce(bloqueo, ''))) >= 3)
);

-- ── Disparadores comunes y permisos ─────────────────────────────────────────
DROP TRIGGER IF EXISTS growth_misiones_tocar ON public.growth_misiones;
CREATE TRIGGER growth_misiones_tocar BEFORE UPDATE ON public.growth_misiones FOR EACH ROW EXECUTE FUNCTION public.central_tocar();
DROP TRIGGER IF EXISTS growth_citas_auditar ON public.growth_citas;
CREATE TRIGGER growth_citas_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_citas FOR EACH ROW EXECUTE FUNCTION public.central_auditar('resumen,necesidades,objeciones,guia,resultado');
DROP TRIGGER IF EXISTS growth_misiones_auditar ON public.growth_misiones;
CREATE TRIGGER growth_misiones_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_misiones FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');

DO $$
DECLARE t text;
  reglas jsonb := jsonb_build_object('growth_citas', 'SELECT, INSERT, UPDATE', 'growth_misiones', 'SELECT');
BEGIN
  FOR t IN SELECT jsonb_object_keys(reglas) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT %s ON public.%I TO authenticated', reglas ->> t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Central: solo el dueño con 2 pasos" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Central: solo el dueño con 2 pasos" ON public.%I FOR ALL TO authenticated USING ((SELECT public.central_autorizado())) WITH CHECK ((SELECT public.central_autorizado()))', t);
  END LOOP;
END $$;
-- La misión la crea el servidor; el dueño solo cambia su estado y el motivo de bloqueo.
GRANT UPDATE (estado, bloqueo) ON public.growth_misiones TO authenticated;

-- ── Programación: misión a las 7:00 a. m. y cierre a las 7:30 p. m. (hora de Colombia, lunes a sábado) ──
CREATE OR REPLACE FUNCTION public.central_mision_programada(p_modo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_url text; v_jwt text; v_sec text;
BEGIN
  SELECT replace(value, 'central-vigia', 'central-mision') INTO v_url FROM public.platform_secrets WHERE key = 'central_vigia_url';
  SELECT value INTO v_jwt FROM public.platform_secrets WHERE key = 'central_vigia_jwt';
  SELECT value INTO v_sec FROM public.platform_secrets WHERE key = 'central_vigia_secreto';
  IF v_url IS NULL OR v_jwt IS NULL OR v_sec IS NULL OR p_modo NOT IN ('manana', 'cierre') THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_jwt, 'x-vigia-secreto', v_sec),
    body := jsonb_build_object('modo', p_modo),
    timeout_milliseconds := 20000
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.central_mision_programada(text) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('central-mision-manana', 'central-mision-cierre');
-- pg_cron usa hora UTC: 7:00 a. m. Colombia = 12:00 UTC (lun-sáb); 7:30 p. m. Colombia = 00:30 UTC del día siguiente (mar-dom).
SELECT cron.schedule('central-mision-manana', '0 12 * * 1-6', $$select public.central_mision_programada('manana')$$);
SELECT cron.schedule('central-mision-cierre', '30 0 * * 0,2-6', $$select public.central_mision_programada('cierre')$$);
