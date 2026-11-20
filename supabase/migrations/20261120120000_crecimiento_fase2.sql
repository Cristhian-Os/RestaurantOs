-- Central Crecimiento · FASE 2: prospectos (CRM), expedientes comerciales e historial. Aditiva; no toca restaurantes, pedidos ni dinero.
-- Crea:  growth_prospectos (17 etapas, deduplicación por nombre+ciudad, correo, teléfono y web)
--        growth_expedientes (investigación / ventas / fundador)  ·  growth_historial (solo se agrega)
-- Reglas que hace cumplir la base (no la pantalla):
--   · Todo bajo central_autorizado(). Un prospecto nace siempre en "prospecto_identificado" y con su fuente registrada.
--   · No hay dos prospectos iguales (mismo nombre y ciudad, correo, teléfono o web), aunque cambien mayúsculas, tildes o el +57.
--   · Pasar de "identificado" exige expediente con fuentes y hechos. "Contactado" exige una campaña vigente de tipo campaña y que el
--     contacto NO esté en la lista de no contactar; la campaña tiene tope de prospectos. Los prospectos de ejemplo (ficticios) nunca pasan a contactado.
--   · "Demostración confirmada" exige fecha y hora acordadas; "perdido" exige motivo; "cliente activado" exige un restaurante con suscripción.
--   · Cada cambio de etapa queda en el historial (no se edita ni se borra). "No contactar" agrega sus datos a la lista de supresión.
-- Depende de: Fase 1 (growth_autorizaciones, growth_supresion, growth_normalizar_contacto) y del núcleo de Central.
-- Reversa: supabase/rollback/20261120120000_crecimiento_fase2_down.sql

CREATE OR REPLACE FUNCTION public.growth_clave_nombre(p text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(translate(lower(btrim(coalesce(p, ''))), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '[^a-z0-9]', '', 'g');
$function$;

CREATE OR REPLACE FUNCTION public.growth_clave_web(p text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '^(https?://)?(www\.)?', ''), '/+$', ''), '');
$function$;

CREATE TABLE IF NOT EXISTS public.growth_prospectos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial        text NOT NULL CHECK (char_length(btrim(nombre_comercial)) BETWEEN 2 AND 160),
  ciudad                  text NOT NULL DEFAULT '' CHECK (char_length(ciudad) <= 100),
  ubicacion_publica       text NOT NULL DEFAULT '' CHECK (char_length(ubicacion_publica) <= 300),
  segmento                text NOT NULL DEFAULT '' CHECK (char_length(segmento) <= 100),
  fuente                  text NOT NULL CHECK (char_length(btrim(fuente)) BETWEEN 3 AND 300),
  fuente_url              text CHECK (fuente_url IS NULL OR char_length(fuente_url) <= 500),
  fuente_fecha            date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date),
  correo                  text CHECK (correo IS NULL OR char_length(correo) <= 200),
  telefono                text CHECK (telefono IS NULL OR char_length(telefono) <= 40),
  web                     text CHECK (web IS NULL OR char_length(web) <= 300),
  redes                   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(redes) = 'object'),
  etapa                   text NOT NULL DEFAULT 'prospecto_identificado' CHECK (etapa IN (
    'prospecto_identificado', 'investigado', 'contacto_pendiente', 'contactado', 'conversacion_iniciada', 'calificado',
    'demostracion_propuesta', 'demostracion_confirmada', 'demostracion_realizada', 'propuesta_presentada', 'seguimiento',
    'negociacion', 'aprobacion_pendiente', 'cliente_activado', 'perdido', 'recontacto_futuro', 'no_contactar')),
  responsable_agente_id   text REFERENCES public.central_agentes (id) DEFAULT 'mateo',
  campana_id              uuid REFERENCES public.growth_autorizaciones (id),
  restaurante_id          uuid REFERENCES public.restaurants (id),
  necesidades_confirmadas text NOT NULL DEFAULT '' CHECK (char_length(necesidades_confirmadas) <= 1000),
  proxima_accion          text NOT NULL DEFAULT '' CHECK (char_length(proxima_accion) <= 300),
  proxima_accion_en       timestamptz,
  ultima_interaccion      timestamptz,
  motivo_perdida          text CHECK (motivo_perdida IS NULL OR char_length(motivo_perdida) <= 300),
  es_ficticio             boolean NOT NULL DEFAULT false,
  clave_nombre            text GENERATED ALWAYS AS (public.growth_clave_nombre(nombre_comercial) || ':' || public.growth_clave_nombre(ciudad)) STORED,
  correo_norm             text GENERATED ALWAYS AS (nullif(public.growth_normalizar_contacto('correo', correo), '')) STORED,
  telefono_norm           text GENERATED ALWAYS AS (nullif(public.growth_normalizar_contacto('telefono', telefono), '')) STORED,
  web_norm                text GENERATED ALWAYS AS (public.growth_clave_web(web)) STORED,
  creado_por              uuid DEFAULT auth.uid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_prospectos_u_nombre   ON public.growth_prospectos (clave_nombre);
CREATE UNIQUE INDEX IF NOT EXISTS growth_prospectos_u_correo   ON public.growth_prospectos (correo_norm)   WHERE correo_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS growth_prospectos_u_telefono ON public.growth_prospectos (telefono_norm) WHERE telefono_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS growth_prospectos_u_web      ON public.growth_prospectos (web_norm)      WHERE web_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS growth_prospectos_etapa ON public.growth_prospectos (etapa);

CREATE TABLE IF NOT EXISTS public.growth_expedientes (
  prospecto_id  uuid PRIMARY KEY REFERENCES public.growth_prospectos (id),
  investigacion jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(investigacion) = 'object'),
  ventas        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ventas) = 'object'),
  fundador      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fundador) = 'object'),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_historial (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  prospecto_id uuid NOT NULL REFERENCES public.growth_prospectos (id),
  tipo        text NOT NULL CHECK (tipo IN ('etapa', 'nota', 'contacto', 'sistema')),
  de_etapa    text,
  a_etapa     text,
  detalle     text NOT NULL DEFAULT '' CHECK (char_length(detalle) <= 2000),
  actor_tipo  text NOT NULL DEFAULT 'humano' CHECK (actor_tipo IN ('humano', 'agente', 'sistema')),
  actor_id    text NOT NULL DEFAULT coalesce(auth.uid()::text, 'sistema')
);
CREATE INDEX IF NOT EXISTS growth_historial_prospecto ON public.growth_historial (prospecto_id, created_at DESC);
DROP TRIGGER IF EXISTS growth_historial_no_editar ON public.growth_historial;
CREATE TRIGGER growth_historial_no_editar BEFORE UPDATE OR DELETE ON public.growth_historial
  FOR EACH ROW EXECUTE FUNCTION public._auditoria_inmutable();

-- ── Reglas de etapa (antes de guardar) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_prospecto_reglas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_etapas text[] := ARRAY['prospecto_identificado', 'investigado', 'contacto_pendiente', 'contactado', 'conversacion_iniciada', 'calificado',
    'demostracion_propuesta', 'demostracion_confirmada', 'demostracion_realizada', 'propuesta_presentada', 'seguimiento',
    'negociacion', 'aprobacion_pendiente', 'cliente_activado', 'perdido', 'recontacto_futuro', 'no_contactar'];
  v_i int := array_position(v_etapas, NEW.etapa);
  v_inv jsonb; v_alc jsonb; v_max int; v_n int;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.etapa <> 'prospecto_identificado' THEN
    RAISE EXCEPTION 'Un prospecto nuevo empieza siempre como "prospecto identificado".' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.es_ficticio IS DISTINCT FROM OLD.es_ficticio THEN
    RAISE EXCEPTION 'No se puede cambiar si un prospecto es de ejemplo.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    IF v_i BETWEEN 2 AND 14 THEN
      SELECT investigacion INTO v_inv FROM public.growth_expedientes WHERE prospecto_id = NEW.id;
      IF v_inv IS NULL OR jsonb_typeof(v_inv -> 'fuentes') IS DISTINCT FROM 'array' OR jsonb_array_length(v_inv -> 'fuentes') = 0
         OR jsonb_typeof(v_inv -> 'hechos') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Antes de avanzar, el expediente debe tener investigación con fuentes y hechos.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF v_i BETWEEN 4 AND 14 AND NEW.es_ficticio THEN
      RAISE EXCEPTION 'Un prospecto de ejemplo no se puede contactar.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.etapa = 'contactado' THEN
      IF NEW.campana_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.growth_autorizaciones a WHERE a.id = NEW.campana_id AND a.tipo = 'campana'
           AND a.estado = 'vigente' AND now() >= a.vigente_desde AND now() < a.vigente_hasta) THEN
        RAISE EXCEPTION 'Para contactar hace falta una campaña vigente asignada al prospecto.' USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.growth_supresion s WHERE (s.canal = 'correo' AND s.valor_norm = NEW.correo_norm)
                    OR (s.canal IN ('telefono', 'whatsapp') AND s.valor_norm = NEW.telefono_norm)) THEN
        RAISE EXCEPTION 'Este contacto está en la lista de no contactar.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF NEW.etapa = 'demostracion_confirmada' AND NEW.proxima_accion_en IS NULL THEN
      RAISE EXCEPTION 'Una demostración solo se confirma con la fecha y hora que el prospecto aceptó.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.etapa = 'perdido' AND coalesce(btrim(NEW.motivo_perdida), '') = '' THEN
      RAISE EXCEPTION 'Indica el motivo de pérdida.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.etapa = 'cliente_activado' AND (NEW.restaurante_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.restaurant_id = NEW.restaurante_id)) THEN
      RAISE EXCEPTION 'Un cliente solo se activa cuando ya existe su restaurante con suscripción.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.campana_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.campana_id IS DISTINCT FROM OLD.campana_id) THEN
    SELECT alcance INTO v_alc FROM public.growth_autorizaciones WHERE id = NEW.campana_id AND tipo = 'campana';
    IF v_alc IS NULL THEN RAISE EXCEPTION 'Esa campaña no existe.' USING ERRCODE = 'P0001'; END IF;
    v_max := nullif(v_alc ->> 'max_prospectos', '')::int;
    SELECT count(*) INTO v_n FROM public.growth_prospectos WHERE campana_id = NEW.campana_id AND id <> NEW.id;
    IF v_max IS NOT NULL AND v_n >= v_max THEN
      RAISE EXCEPTION 'La campaña ya llegó a su máximo de % prospectos.', v_max USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS growth_prospectos_reglas ON public.growth_prospectos;
CREATE TRIGGER growth_prospectos_reglas BEFORE INSERT OR UPDATE ON public.growth_prospectos
  FOR EACH ROW EXECUTE FUNCTION public.growth_prospecto_reglas();

-- ── Historial automático y lista de no contactar (después de guardar) ───────
CREATE OR REPLACE FUNCTION public.growth_prospecto_historial()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.growth_historial (prospecto_id, tipo, a_etapa, detalle, actor_tipo)
    VALUES (NEW.id, 'sistema', NEW.etapa, 'Prospecto creado. Fuente: ' || left(NEW.fuente, 200), CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'humano' END);
  ELSIF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    INSERT INTO public.growth_historial (prospecto_id, tipo, de_etapa, a_etapa, actor_tipo)
    VALUES (NEW.id, 'etapa', OLD.etapa, NEW.etapa, CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'humano' END);
    IF NEW.etapa = 'no_contactar' THEN
      IF NEW.correo_norm IS NOT NULL THEN
        INSERT INTO public.growth_supresion (canal, valor_norm, motivo, fuente) VALUES ('correo', NEW.correo_norm, 'manual', 'Prospecto marcado como no contactar') ON CONFLICT DO NOTHING;
      END IF;
      IF NEW.telefono_norm IS NOT NULL THEN
        INSERT INTO public.growth_supresion (canal, valor_norm, motivo, fuente) VALUES ('telefono', NEW.telefono_norm, 'manual', 'Prospecto marcado como no contactar') ON CONFLICT DO NOTHING;
        INSERT INTO public.growth_supresion (canal, valor_norm, motivo, fuente) VALUES ('whatsapp', NEW.telefono_norm, 'manual', 'Prospecto marcado como no contactar') ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS growth_prospectos_historial ON public.growth_prospectos;
CREATE TRIGGER growth_prospectos_historial AFTER INSERT OR UPDATE ON public.growth_prospectos
  FOR EACH ROW EXECUTE FUNCTION public.growth_prospecto_historial();
REVOKE EXECUTE ON FUNCTION public.growth_prospecto_reglas(), public.growth_prospecto_historial() FROM PUBLIC, anon, authenticated;

-- ── Disparadores comunes y permisos ─────────────────────────────────────────
DROP TRIGGER IF EXISTS growth_expedientes_tocar ON public.growth_expedientes;
CREATE TRIGGER growth_expedientes_tocar BEFORE UPDATE ON public.growth_expedientes FOR EACH ROW EXECUTE FUNCTION public.central_tocar();
DROP TRIGGER IF EXISTS growth_prospectos_auditar ON public.growth_prospectos;
CREATE TRIGGER growth_prospectos_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_prospectos FOR EACH ROW EXECUTE FUNCTION public.central_auditar('clave_nombre,correo_norm,telefono_norm,web_norm');
DROP TRIGGER IF EXISTS growth_expedientes_auditar ON public.growth_expedientes;
CREATE TRIGGER growth_expedientes_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_expedientes FOR EACH ROW EXECUTE FUNCTION public.central_auditar('investigacion,ventas,fundador');

DO $$
DECLARE t text;
  reglas jsonb := jsonb_build_object(
    'growth_prospectos',   'SELECT, INSERT, UPDATE',
    'growth_expedientes',  'SELECT, INSERT, UPDATE',
    'growth_historial',    'SELECT, INSERT'
  );
BEGIN
  FOR t IN SELECT jsonb_object_keys(reglas) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT %s ON public.%I TO authenticated', reglas ->> t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Central: solo el dueño con 2 pasos" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Central: solo el dueño con 2 pasos" ON public.%I FOR ALL TO authenticated USING ((SELECT public.central_autorizado())) WITH CHECK ((SELECT public.central_autorizado()))', t);
  END LOOP;
END $$;
