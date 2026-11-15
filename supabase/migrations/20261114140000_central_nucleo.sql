-- RestaurantOS Central · núcleo institucional (fases 2 a 8 de la orden maestra).
-- ESTADO: probada SOLO en el Postgres local (PGlite). NO aplicada en el proyecto de prueba ni en producción.
-- Depende de: 20261114120000_cerrar_escalada_de_rol y 20261114130000_central_acceso_auditoria (central_autorizado, central_auditoria).
--
-- Qué crea (todo bajo la misma regla: solo el super admin con 2 pasos, central_autorizado(), lee o escribe):
--   Estructura:   central_departamentos (los 4 anillos), central_agentes (organigrama aprobado), central_ubicaciones.
--   Trabajo:      central_proyectos, central_tareas, central_aprobaciones (+ central_decidir_aprobacion).
--   Comunicación: central_conversaciones, central_mensajes, central_reuniones, central_notificaciones.
--   Conocimiento: central_documentos, central_memoria, central_versiones (historial de versiones).
--   Gobierno:     central_integraciones, central_consumo, central_config, central_permite() (motor de niveles N0–N3).
--   Datos reales: central_restaurantes() (solo lectura de restaurantes, con ubicación si el dueño la cargó).
-- Reglas que hace cumplir la propia base (no la pantalla):
--   · Un agente nuevo nace en N0 (solo lectura), "diseñado", sin conexión. Un agente nunca pasa de N2: N3 es solo humano.
--   · Una tarea N3 solo puede tener responsable humano; un agente N0 no puede ser responsable de nada que escriba.
--   · Una tarea N2/N3 no pasa a aprobada, en ejecución ni completada sin una aprobación humana registrada.
--   · Una tarea no se completa sin resultado ni con tareas previas sin completar.
--   · Las aprobaciones solo se deciden con central_decidir_aprobacion() (nadie edita la fila a mano) y quedan con aprobador.
--   · Un mensaje de agente solo puede guardarse como "simulación local" desde la app; "real" queda reservado al servidor.
--   · Toda escritura queda en central_auditoria (solo se agrega).
-- Reversa: supabase/rollback/20261114140000_central_nucleo_down.sql (borra estas tablas y lo que Central haya guardado en ellas).

-- ── Motor de niveles (sin datos: solo reglas) ───────────────────────────────
-- Devuelve qué puede hacer un agente de nivel p_nivel_agente ante una acción de nivel p_nivel_accion.
CREATE OR REPLACE FUNCTION public.central_permite(p_nivel_agente text, p_nivel_accion text, p_hay_aprobacion boolean DEFAULT false)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_nivel_accion = 'N0' THEN 'ejecutar'                       -- leer y analizar
    WHEN p_nivel_accion = 'N3' THEN 'prohibido'                      -- exclusivamente humano
    WHEN p_nivel_agente IS DISTINCT FROM 'N1' AND p_nivel_agente IS DISTINCT FROM 'N2' THEN 'prohibido'   -- N0: solo lectura
    WHEN p_nivel_accion = 'N1' THEN 'ejecutar'                       -- reversible y dentro de lo aprobado
    WHEN p_nivel_accion = 'N2' THEN CASE WHEN p_hay_aprobacion THEN 'ejecutar' ELSE 'requiere_aprobacion' END
    ELSE 'prohibido'
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_permite(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_permite(text, text, boolean) TO authenticated;

-- ── Funciones de apoyo para los disparadores ────────────────────────────────
CREATE OR REPLACE FUNCTION public.central_tocar()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;

-- Registro de auditoría de cada escritura. TG_ARGV[0] = columnas que NO se copian al registro (p. ej. el texto de un mensaje).
CREATE OR REPLACE FUNCTION public.central_auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_omitir  text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  v_new     jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - v_omitir END;
  v_old     jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - v_omitir END;
  v_ref     jsonb := coalesce(v_new, v_old);
  v_cambios jsonb;
  v_nivel   text := coalesce(v_ref ->> 'nivel_requerido', v_ref ->> 'nivel');
  v_uid     uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', v_old -> n.key, 'despues', n.value)), '{}'::jsonb)
      INTO v_cambios
      FROM jsonb_each(v_new) n
     WHERE v_old -> n.key IS DISTINCT FROM n.value AND n.key <> 'updated_at';
    IF v_cambios = '{}'::jsonb THEN RETURN NEW; END IF;    -- no cambió nada que valga la pena anotar
  ELSE
    v_cambios := jsonb_build_object('fila', v_ref);
  END IF;
  INSERT INTO public.central_auditoria (actor_tipo, actor_id, accion, recurso, nivel, aprobador_id, resultado, detalle, correlacion_id)
  VALUES (
    CASE WHEN v_uid IS NULL THEN 'sistema' ELSE 'humano' END, v_uid,
    left(lower(TG_OP) || '_' || regexp_replace(TG_TABLE_NAME, '^central_', ''), 80),
    left(TG_TABLE_NAME || ':' || coalesce(v_ref ->> 'id', v_ref ->> 'clave', v_ref ->> 'restaurante_id', ''), 200),
    CASE WHEN v_nivel IN ('N0', 'N1', 'N2', 'N3') THEN v_nivel END,
    CASE WHEN TG_TABLE_NAME = 'central_aprobaciones' THEN nullif(v_ref ->> 'decidido_por', '')::uuid END,
    'ok', v_cambios,
    coalesce(nullif(v_ref ->> 'correlacion_id', '')::uuid, gen_random_uuid())
  );
  RETURN coalesce(NEW, OLD);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_auditar() FROM PUBLIC, anon, authenticated;

-- Historial de versiones (documentos y memoria): guarda la fila anterior y sube el número de versión.
CREATE TABLE IF NOT EXISTS public.central_versiones (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  tabla       text NOT NULL,
  registro_id text NOT NULL,
  version     integer NOT NULL,
  datos       jsonb NOT NULL,
  actor_id    uuid
);
DROP TRIGGER IF EXISTS central_versiones_no_editar ON public.central_versiones;
CREATE TRIGGER central_versiones_no_editar BEFORE UPDATE OR DELETE ON public.central_versiones
  FOR EACH ROW EXECUTE FUNCTION public._auditoria_inmutable();
CREATE OR REPLACE FUNCTION public.central_versionar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.central_versiones (tabla, registro_id, version, datos, actor_id)
  VALUES (TG_TABLE_NAME, OLD.id::text, OLD.version, to_jsonb(OLD), auth.uid());
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_versionar() FROM PUBLIC, anon, authenticated;

-- ── Estructura: departamentos y agentes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.central_departamentos (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  nombre      text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  tipo        text NOT NULL CHECK (tipo IN ('direccion', 'supervision', 'reuniones', 'planificacion', 'departamento', 'servicio')),
  anillo      smallint NOT NULL CHECK (anillo BETWEEN 2 AND 4),
  orden       smallint NOT NULL DEFAULT 0,
  color       text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  descripcion text NOT NULL DEFAULT '' CHECK (char_length(descripcion) <= 500),
  privacidad  text NOT NULL DEFAULT 'semiprivado' CHECK (privacidad IN ('abierto', 'semiprivado', 'privado')),
  estado      text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'en_construccion')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.central_agentes (
  id                  text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  nombre              text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  departamento_id     text NOT NULL REFERENCES public.central_departamentos (id),
  rol                 text NOT NULL CHECK (rol IN ('chef_mayor', 'jefe', 'subordinado', 'asistente')),
  especialidad        text NOT NULL DEFAULT '' CHECK (char_length(especialidad) <= 200),
  objetivos           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objetivos) = 'array'),
  ciclo               text NOT NULL DEFAULT 'disenado' CHECK (ciclo IN ('disenado', 'configuracion', 'pruebas', 'activo', 'suspendido', 'en_revision', 'retirado')),
  nivel               text NOT NULL DEFAULT 'N0' CHECK (nivel IN ('N0', 'N1', 'N2')),     -- N3 es solo humano: ningún agente lo tiene
  proveedor_estado    text NOT NULL DEFAULT 'no_conectado' CHECK (proveedor_estado IN ('no_conectado', 'simulacion_local', 'pendiente_configuracion', 'activo')),
  modelos             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(modelos) = 'array'),
  herramientas        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(herramientas) = 'array'),
  presupuesto_mensual numeric(12, 2) NOT NULL DEFAULT 0 CHECK (presupuesto_mensual >= 0),
  reporta_a           text REFERENCES public.central_agentes (id),
  orden               smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- "Activo" solo si hay un proveedor realmente configurado: no se puede declarar activo a un agente sin conexión.
  CHECK (ciclo <> 'activo' OR proveedor_estado IN ('simulacion_local', 'activo'))
);
CREATE INDEX IF NOT EXISTS central_agentes_depto_idx ON public.central_agentes (departamento_id);

-- Ubicación de cada restaurante en el globo: la carga el dueño (nada inventado).
CREATE TABLE IF NOT EXISTS public.central_ubicaciones (
  restaurante_id uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  ciudad         text NOT NULL CHECK (char_length(ciudad) BETWEEN 2 AND 80),
  pais           text NOT NULL DEFAULT 'Colombia' CHECK (char_length(pais) BETWEEN 2 AND 80),
  lat            numeric(8, 5) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            numeric(8, 5) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Trabajo: proyectos, tareas y aprobaciones ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.central_proyectos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 120),
  descripcion     text NOT NULL DEFAULT '' CHECK (char_length(descripcion) <= 2000),
  estado          text NOT NULL DEFAULT 'planeado' CHECK (estado IN ('planeado', 'en_curso', 'pausado', 'completado', 'cancelado')),
  departamento_id text REFERENCES public.central_departamentos (id),
  presupuesto     numeric(14, 2) CHECK (presupuesto IS NULL OR presupuesto >= 0),
  fecha_inicio    date,
  fecha_fin       date,
  hitos           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hitos) = 'array'),
  riesgos         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(riesgos) = 'array'),
  creado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS public.central_tareas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                bigint GENERATED ALWAYS AS IDENTITY,
  titulo                text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 160),
  descripcion           text NOT NULL DEFAULT '' CHECK (char_length(descripcion) <= 4000),
  solicitante_tipo      text NOT NULL DEFAULT 'humano' CHECK (solicitante_tipo IN ('humano', 'agente')),
  solicitante_id        text NOT NULL DEFAULT coalesce(auth.uid()::text, 'sistema'),
  responsable_agente_id text REFERENCES public.central_agentes (id),
  departamento_id       text REFERENCES public.central_departamentos (id),
  proyecto_id           uuid REFERENCES public.central_proyectos (id) ON DELETE SET NULL,
  prioridad             text NOT NULL DEFAULT 'P3' CHECK (prioridad IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  estado                text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'pendiente_aprobacion', 'aprobada', 'en_ejecucion', 'bloqueada', 'completada', 'rechazada', 'cancelada')),
  nivel_requerido       text NOT NULL DEFAULT 'N0' CHECK (nivel_requerido IN ('N0', 'N1', 'N2', 'N3')),
  depende_de            uuid[] NOT NULL DEFAULT '{}',
  fecha_limite          date,
  presupuesto           numeric(14, 2) CHECK (presupuesto IS NULL OR presupuesto >= 0),
  evidencias            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidencias) = 'array'),
  resultado             text CHECK (resultado IS NULL OR char_length(resultado) <= 4000),
  comentarios           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(comentarios) = 'array'),
  creado_por            uuid DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Un borrador o una propuesta no cuentan como trabajo hecho: completar exige dejar el resultado.
  CHECK (estado <> 'completada' OR char_length(btrim(coalesce(resultado, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS central_tareas_estado_idx ON public.central_tareas (estado, prioridad);

CREATE TABLE IF NOT EXISTS public.central_aprobaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id       uuid REFERENCES public.central_tareas (id) ON DELETE SET NULL,
  accion         text NOT NULL CHECK (char_length(accion) BETWEEN 3 AND 300),         -- exactamente qué se autoriza
  nivel          text NOT NULL CHECK (nivel IN ('N1', 'N2', 'N3')),
  alcance        text NOT NULL DEFAULT '' CHECK (char_length(alcance) <= 1000),
  impacto        text NOT NULL DEFAULT '' CHECK (char_length(impacto) <= 2000),       -- resumen de impacto antes de decidir
  solicitada_por text NOT NULL DEFAULT coalesce(auth.uid()::text, 'sistema'),
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'expirada', 'revocada')),
  decidido_por   uuid,
  decidido_en    timestamptz,
  nota_decision  text CHECK (nota_decision IS NULL OR char_length(nota_decision) <= 1000),
  expira_en      timestamptz,
  correlacion_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'pendiente') = (decidido_por IS NULL AND decidido_en IS NULL) OR estado IN ('expirada', 'revocada'))
);

-- ── Comunicación ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.central_conversaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('directo', 'canal_departamento', 'canal_interdepartamental', 'canal_institucional', 'grupo_temporal', 'reunion')),
  titulo          text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 120),
  agente_id       text REFERENCES public.central_agentes (id),
  departamento_id text REFERENCES public.central_departamentos (id),
  tarea_id        uuid REFERENCES public.central_tareas (id) ON DELETE SET NULL,
  miembros        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(miembros) = 'array'),
  archivada       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo <> 'directo' OR agente_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS central_conv_directo_uq ON public.central_conversaciones (agente_id) WHERE tipo = 'directo';
CREATE UNIQUE INDEX IF NOT EXISTS central_conv_canal_depto_uq ON public.central_conversaciones (departamento_id) WHERE tipo = 'canal_departamento';

CREATE TABLE IF NOT EXISTS public.central_mensajes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id uuid NOT NULL REFERENCES public.central_conversaciones (id) ON DELETE CASCADE,
  autor_tipo      text NOT NULL CHECK (autor_tipo IN ('humano', 'agente', 'sistema')),
  autor_id        text NOT NULL,
  contenido       text NOT NULL CHECK (char_length(btrim(contenido)) BETWEEN 1 AND 4000),
  modo            text NOT NULL DEFAULT 'real' CHECK (modo IN ('real', 'simulacion_local')),
  responde_a      bigint REFERENCES public.central_mensajes (id),               -- hilos
  menciones       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(menciones) = 'array'),
  adjuntos        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(adjuntos) = 'array'),   -- referencias a documentos autorizados
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS central_mensajes_conv_idx ON public.central_mensajes (conversacion_id, id);

CREATE TABLE IF NOT EXISTS public.central_reuniones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 160),
  inicio          timestamptz NOT NULL,
  fin             timestamptz,
  participantes   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participantes) = 'array'),   -- ids de agentes
  agenda          text NOT NULL DEFAULT '' CHECK (char_length(agenda) <= 4000),
  acta            text NOT NULL DEFAULT '' CHECK (char_length(acta) <= 8000),
  estado          text NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'en_curso', 'realizada', 'cancelada')),
  creado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (fin IS NULL OR fin >= inicio)
);

CREATE TABLE IF NOT EXISTS public.central_notificaciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       text NOT NULL CHECK (tipo IN ('info', 'tarea', 'alerta', 'aprobacion', 'reunion')),
  severidad  text NOT NULL DEFAULT 'info' CHECK (severidad IN ('info', 'importante', 'critica')),
  titulo     text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 200),
  detalle    text NOT NULL DEFAULT '' CHECK (char_length(detalle) <= 1000),
  origen     text NOT NULL DEFAULT 'sistema' CHECK (char_length(origen) <= 80),
  enlace     text CHECK (enlace IS NULL OR enlace ~ '^/central(/[a-z0-9/_-]*)?$'),
  leida      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Conocimiento: biblioteca y memoria institucional ────────────────────────
CREATE TABLE IF NOT EXISTS public.central_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 160),
  tipo            text NOT NULL DEFAULT 'nota' CHECK (tipo IN ('nota', 'politica', 'procedimiento', 'informe', 'acta', 'contrato', 'otro')),
  contenido       text NOT NULL DEFAULT '' CHECK (char_length(contenido) <= 50000),
  departamento_id text REFERENCES public.central_departamentos (id),
  version         integer NOT NULL DEFAULT 1,
  vigente_desde   date,
  vigente_hasta   date,
  confiabilidad   text NOT NULL DEFAULT 'media' CHECK (confiabilidad IN ('alta', 'media', 'baja')),
  procedencia     text NOT NULL DEFAULT '' CHECK (char_length(procedencia) <= 300),
  creado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.central_memoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa            text NOT NULL CHECK (capa IN ('operativa', 'permanente', 'institucional', 'historica')),
  titulo          text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 160),
  contenido       text NOT NULL DEFAULT '' CHECK (char_length(contenido) <= 20000),
  departamento_id text REFERENCES public.central_departamentos (id),
  restaurante_id  uuid REFERENCES public.restaurants (id) ON DELETE CASCADE,   -- memoria de UN restaurante: nunca se mezcla con otro
  version         integer NOT NULL DEFAULT 1,
  procedencia     text NOT NULL DEFAULT '' CHECK (char_length(procedencia) <= 300),
  confiabilidad   text NOT NULL DEFAULT 'media' CHECK (confiabilidad IN ('alta', 'media', 'baja')),
  vigente_hasta   date,
  creado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Gobierno: integraciones, consumo y configuración ────────────────────────
CREATE TABLE IF NOT EXISTS public.central_integraciones (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
  nombre          text NOT NULL,
  descripcion     text NOT NULL DEFAULT '',
  estado          text NOT NULL DEFAULT 'no_conectada' CHECK (estado IN ('no_conectada', 'pendiente_autorizacion', 'activa')),
  adaptador       text NOT NULL DEFAULT 'ninguno' CHECK (adaptador IN ('ninguno', 'mock_local', 'real')),
  scopes          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scopes) = 'array'),   -- permisos mínimos que pediría
  notas           text NOT NULL DEFAULT '' CHECK (char_length(notas) <= 2000),
  autorizada_por  uuid,
  autorizada_en   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Una integración solo está "activa" si hay adaptador real y una autorización humana registrada.
  CHECK (estado <> 'activa' OR (adaptador = 'real' AND autorizada_por IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.central_consumo (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agente_id  text NOT NULL REFERENCES public.central_agentes (id),
  periodo    date NOT NULL,                           -- primer día del mes
  proveedor  text NOT NULL DEFAULT '' CHECK (char_length(proveedor) <= 80),
  tokens     bigint NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  costo      numeric(12, 4) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.central_config (
  clave      text PRIMARY KEY CHECK (clave ~ '^[a-z0-9_]{2,40}$'),
  valor      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Reglas de negocio (disparadores) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.central_validar_tarea()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nivel_agente text;
  v_pendientes   integer;
BEGIN
  IF NEW.nivel_requerido = 'N3' AND NEW.responsable_agente_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una tarea de nivel N3 solo la ejecuta una persona, no un agente';
  END IF;
  IF NEW.responsable_agente_id IS NOT NULL THEN
    SELECT nivel INTO v_nivel_agente FROM public.central_agentes WHERE id = NEW.responsable_agente_id;
    IF public.central_permite(v_nivel_agente, NEW.nivel_requerido, true) = 'prohibido' THEN
      RAISE EXCEPTION 'El agente % (nivel %) no puede ser responsable de una tarea de nivel %', NEW.responsable_agente_id, v_nivel_agente, NEW.nivel_requerido;
    END IF;
  END IF;
  IF NEW.estado IN ('aprobada', 'en_ejecucion', 'completada') AND NEW.nivel_requerido IN ('N2', 'N3')
     AND (TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.central_aprobaciones a
       WHERE a.tarea_id = NEW.id AND a.estado = 'aprobada'
         AND (NEW.estado <> 'en_ejecucion' OR a.expira_en IS NULL OR a.expira_en > now())
    ) THEN
      RAISE EXCEPTION 'Esta tarea exige una aprobación humana vigente antes de pasar a %', NEW.estado;
    END IF;
  END IF;
  IF NEW.estado IN ('en_ejecucion', 'completada') AND coalesce(array_length(NEW.depende_de, 1), 0) > 0
     AND (TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado) THEN
    SELECT count(*) INTO v_pendientes FROM unnest(NEW.depende_de) d
     WHERE NOT EXISTS (SELECT 1 FROM public.central_tareas t WHERE t.id = d AND t.estado = 'completada');
    IF v_pendientes > 0 THEN
      RAISE EXCEPTION 'Hay % tarea(s) previas sin completar', v_pendientes;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS central_tareas_validar ON public.central_tareas;
CREATE TRIGGER central_tareas_validar BEFORE INSERT OR UPDATE ON public.central_tareas
  FOR EACH ROW EXECUTE FUNCTION public.central_validar_tarea();

-- Mensajes: lo que escribe un humano debe ir a su nombre; lo de un agente, desde la app, solo como simulación.
CREATE OR REPLACE FUNCTION public.central_validar_mensaje()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.autor_tipo = 'humano' THEN
      IF NEW.autor_id IS DISTINCT FROM auth.uid()::text OR NEW.modo <> 'real' THEN
        RAISE EXCEPTION 'Un mensaje humano debe ir a nombre de quien lo escribe';
      END IF;
    ELSIF NEW.autor_tipo = 'agente' THEN
      IF NEW.modo <> 'simulacion_local' THEN
        RAISE EXCEPTION 'Desde la app, la respuesta de un agente solo puede guardarse como simulación local';
      END IF;
    ELSE
      RAISE EXCEPTION 'Los mensajes del sistema los escribe el servidor';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS central_mensajes_validar ON public.central_mensajes;
CREATE TRIGGER central_mensajes_validar BEFORE INSERT ON public.central_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.central_validar_mensaje();

-- Avisos automáticos: una aprobación pendiente y las tareas críticas o urgentes llegan a la campana.
CREATE OR REPLACE FUNCTION public.central_avisar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'central_aprobaciones' THEN
    INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
    VALUES ('aprobacion', 'importante', 'Aprobación pendiente (' || NEW.nivel || ')', left(NEW.accion, 300), 'aprobaciones', '/central/tareas');
  ELSIF TG_TABLE_NAME = 'central_tareas' AND NEW.prioridad IN ('P0', 'P1') THEN
    INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
    VALUES ('tarea', CASE WHEN NEW.prioridad = 'P0' THEN 'critica' ELSE 'importante' END,
            'Tarea ' || NEW.prioridad || ': ' || left(NEW.titulo, 150), '', 'tareas', '/central/tareas');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_avisar() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS central_aprobaciones_avisar ON public.central_aprobaciones;
CREATE TRIGGER central_aprobaciones_avisar AFTER INSERT ON public.central_aprobaciones FOR EACH ROW EXECUTE FUNCTION public.central_avisar();
DROP TRIGGER IF EXISTS central_tareas_avisar ON public.central_tareas;
CREATE TRIGGER central_tareas_avisar AFTER INSERT ON public.central_tareas FOR EACH ROW EXECUTE FUNCTION public.central_avisar();

-- Las aprobaciones se deciden SOLO con esta función (nadie edita la fila a mano).
CREATE OR REPLACE FUNCTION public.central_decidir_aprobacion(p_id uuid, p_decision text, p_nota text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ap  public.central_aprobaciones%ROWTYPE;
BEGIN
  IF NOT public.central_autorizado() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('aprobada', 'rechazada') THEN
    RAISE EXCEPTION 'La decisión debe ser aprobada o rechazada';
  END IF;
  SELECT * INTO v_ap FROM public.central_aprobaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La aprobación no existe'; END IF;
  IF v_ap.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta aprobación ya fue decidida (%)', v_ap.estado; END IF;
  IF v_ap.expira_en IS NOT NULL AND v_ap.expira_en <= now() THEN
    RAISE EXCEPTION 'Esta aprobación expiró; pide una nueva';
  END IF;
  UPDATE public.central_aprobaciones
     SET estado = p_decision, decidido_por = v_uid, decidido_en = now(), nota_decision = left(p_nota, 1000)
   WHERE id = p_id;
  IF v_ap.tarea_id IS NOT NULL THEN
    IF p_decision = 'aprobada' THEN
      UPDATE public.central_tareas SET estado = 'aprobada'
       WHERE id = v_ap.tarea_id AND estado IN ('propuesta', 'pendiente_aprobacion');
    ELSE
      UPDATE public.central_tareas SET estado = 'rechazada'
       WHERE id = v_ap.tarea_id AND estado IN ('propuesta', 'pendiente_aprobacion');
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_id, 'estado', p_decision);
END;
$function$;
REVOKE ALL ON FUNCTION public.central_decidir_aprobacion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_decidir_aprobacion(uuid, text, text) TO authenticated;

-- Lectura de restaurantes para el globo y la supervisión (solo lectura; "cobrado hoy" es referencia, no el corte de caja).
CREATE OR REPLACE FUNCTION public.central_restaurantes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.central_autorizado() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'nombre', r.name, 'slug', r.slug, 'pais', r.country, 'activo', r.active, 'plan', r.plan,
      'suscripcion', s.status, 'periodo_hasta', s.current_period_end, 'prueba_hasta', coalesce(s.trial_ends_at, r.trial_ends_at),
      'creado', r.created_at,
      'ciudad', u.ciudad, 'lat', u.lat, 'lng', u.lng,
      'pedidos_hoy', (SELECT count(*) FROM public.orders o
                       WHERE o.restaurant_id = r.id AND o.status <> 'cancelled'
                         AND (o.created_at AT TIME ZONE 'America/Bogota')::date = public.hoy_local()),
      'cobrado_hoy', (SELECT coalesce(sum(o.total), 0) FROM public.orders o
                       WHERE o.restaurant_id = r.id AND o.status <> 'cancelled' AND o.paid_at IS NOT NULL
                         AND (o.paid_at AT TIME ZONE 'America/Bogota')::date = public.hoy_local())
    ) ORDER BY r.name)
    FROM public.restaurants r
    LEFT JOIN LATERAL (SELECT status, current_period_end, trial_ends_at FROM public.subscriptions
                        WHERE restaurant_id = r.id ORDER BY created_at DESC LIMIT 1) s ON true
    LEFT JOIN public.central_ubicaciones u ON u.restaurante_id = r.id
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.central_restaurantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_restaurantes() TO authenticated;

-- ── Disparadores comunes: hora de edición, versiones y auditoría ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['central_departamentos', 'central_agentes', 'central_ubicaciones', 'central_proyectos', 'central_tareas',
                           'central_reuniones', 'central_integraciones', 'central_config'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_tocar', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.central_tocar()', t || '_tocar', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['central_documentos', 'central_memoria'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_versionar', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.central_versionar()', t || '_versionar', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['central_departamentos', 'central_agentes', 'central_ubicaciones', 'central_proyectos', 'central_tareas',
                           'central_aprobaciones', 'central_conversaciones', 'central_reuniones', 'central_documentos',
                           'central_memoria', 'central_integraciones', 'central_consumo', 'central_config'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_auditar', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.central_auditar(%L)',
                   t || '_auditar', t, CASE t WHEN 'central_documentos' THEN 'contenido' WHEN 'central_memoria' THEN 'contenido' ELSE '' END);
  END LOOP;
END $$;
-- Los mensajes se anotan sin copiar su texto.
DROP TRIGGER IF EXISTS central_mensajes_auditar ON public.central_mensajes;
CREATE TRIGGER central_mensajes_auditar AFTER INSERT ON public.central_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.central_auditar('contenido,adjuntos,menciones');

-- ── Permisos y filas: solo central_autorizado() ─────────────────────────────
DO $$
DECLARE
  t text;
  -- tabla → privilegios que recibe quien pasa la política. Lo que no aparece, no se puede hacer.
  reglas jsonb := jsonb_build_object(
    'central_departamentos', 'SELECT, INSERT, UPDATE',
    'central_agentes',       'SELECT, INSERT, UPDATE',
    'central_ubicaciones',   'SELECT, INSERT, UPDATE, DELETE',
    'central_proyectos',     'SELECT, INSERT, UPDATE',
    'central_tareas',        'SELECT, INSERT, UPDATE',
    'central_aprobaciones',  'SELECT, INSERT',                 -- decidir: solo central_decidir_aprobacion()
    'central_conversaciones','SELECT, INSERT, UPDATE',
    'central_mensajes',      'SELECT, INSERT',                 -- los mensajes no se editan ni se borran
    'central_reuniones',     'SELECT, INSERT, UPDATE',
    'central_notificaciones','SELECT, INSERT, UPDATE',
    'central_documentos',    'SELECT, INSERT, UPDATE',
    'central_memoria',       'SELECT, INSERT, UPDATE',
    'central_versiones',     'SELECT',
    'central_integraciones', 'SELECT, UPDATE',
    'central_consumo',       'SELECT',
    'central_config',        'SELECT, INSERT, UPDATE'
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
-- Integraciones: desde la app solo se mueve el estado y las notas. "Activa" exige adaptador real, que solo instala el servidor.
REVOKE UPDATE ON public.central_integraciones FROM authenticated;
GRANT UPDATE (estado, notas, autorizada_por, autorizada_en) ON public.central_integraciones TO authenticated;
-- Las nuevas aprobaciones entran siempre pendientes (decidirlas es cosa de central_decidir_aprobacion).
DROP POLICY IF EXISTS "Central: solo el dueño con 2 pasos" ON public.central_aprobaciones;
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_aprobaciones;
DROP POLICY IF EXISTS "Central: propone el dueño con 2 pasos" ON public.central_aprobaciones;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_aprobaciones FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));
CREATE POLICY "Central: propone el dueño con 2 pasos" ON public.central_aprobaciones FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.central_autorizado()) AND estado = 'pendiente' AND decidido_por IS NULL AND decidido_en IS NULL);
-- Ni siquiera con permisos de tabla se decide a mano: solo a través de central_decidir_aprobacion().
CREATE OR REPLACE FUNCTION public.central_proteger_aprobacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Las aprobaciones solo se deciden con central_decidir_aprobacion()';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS central_aprobaciones_proteger ON public.central_aprobaciones;
CREATE TRIGGER central_aprobaciones_proteger BEFORE UPDATE ON public.central_aprobaciones
  FOR EACH ROW EXECUTE FUNCTION public.central_proteger_aprobacion();

-- ── Datos fijos aprobados (no son datos del negocio) ────────────────────────
INSERT INTO public.central_departamentos (id, nombre, tipo, anillo, orden, color, descripcion, privacidad, estado) VALUES
  ('direccion',     'Dirección general',            'direccion',     2, 1, '#FF7A1A', 'Oficina del director, mesa interactiva y consulta privada con Cristhian. Acceso al núcleo.', 'privado',     'activo'),
  ('supervision',   'Supervisión global',           'supervision',   2, 2, '#38BDF8', 'Pared panorámica con el estado de restaurantes, agentes, alertas y operaciones.',            'semiprivado', 'activo'),
  ('reuniones',     'Reuniones y coordinación',     'reuniones',     2, 3, '#A78BFA', 'Mesa interactiva multiagente, pantallas y sesiones de coordinación.',                         'semiprivado', 'activo'),
  ('planificacion', 'Planificación estratégica',    'planificacion', 2, 4, '#4ADE80', 'Mesa de planificación, pared de inteligencia, escenarios y archivo estratégico.',              'semiprivado', 'activo'),
  ('soporte',       'Soporte',                      'departamento',  3, 1, '#3D8BFF', 'Atención y resolución de casos de los restaurantes.',                                          'semiprivado', 'activo'),
  ('ventas',        'Ventas',                       'departamento',  3, 2, '#34C759', 'Comercial y crecimiento.',                                                                     'semiprivado', 'activo'),
  ('exito',         'Éxito del Cliente',            'departamento',  3, 3, '#A855F7', 'Satisfacción y retención de los restaurantes.',                                                'semiprivado', 'activo'),
  ('producto',      'Producto',                     'departamento',  3, 4, '#E8399A', 'Innovación y desarrollo del producto.',                                                        'semiprivado', 'activo'),
  ('ingenieria',    'Ingeniería',                   'departamento',  3, 5, '#14B8A6', 'Tecnología y sistemas.',                                                                       'semiprivado', 'activo'),
  ('monitoreo',     'Monitoreo',                    'departamento',  3, 6, '#FACC15', 'Rendimiento y alertas de la plataforma.',                                                      'semiprivado', 'activo'),
  ('legal',         'Legal & DIAN',                 'departamento',  3, 7, '#6366F1', 'Normativa y cumplimiento.',                                                                    'privado',     'activo'),
  ('finanzas',      'Finanzas',                     'departamento',  3, 8, '#22D3EE', 'Presupuesto y rentabilidad.',                                                                  'privado',     'activo'),
  ('marca',         'Marca & Comunidad',            'departamento',  3, 9, '#FB6F92', 'Imagen y comunidad.',                                                                          'abierto',     'activo'),
  ('calidad',       'Calidad',                      'departamento',  3, 10,'#9CA3AF', 'Función independiente: reporta directamente a Cristhian. Sin jefe permanente; en construcción.', 'privado',  'en_construccion'),
  ('cafeteria',     'Cafetería y comedor',          'servicio',      4, 1, '#F59E0B', 'Servicio de cafetería y comedor.',                                                             'abierto',     'activo'),
  ('descanso',      'Área de descanso',             'servicio',      4, 2, '#34D399', 'Espacio de descanso.',                                                                         'abierto',     'activo'),
  ('recreacion',    'Recreación',                   'servicio',      4, 3, '#60A5FA', 'Espacio de recreación.',                                                                       'abierto',     'activo'),
  ('bienestar',     'Deporte y bienestar',          'servicio',      4, 4, '#F472B6', 'Deporte y bienestar.',                                                                         'abierto',     'activo'),
  ('jardines',      'Jardines',                     'servicio',      4, 5, '#84CC16', 'Jardines y paisajismo.',                                                                       'abierto',     'activo')
ON CONFLICT (id) DO NOTHING;

-- Organigrama aprobado. Todos nacen "diseñados", sin conexión y en N0 (solo lectura): nadie se activa solo.
INSERT INTO public.central_agentes (id, nombre, departamento_id, rol, especialidad, orden) VALUES
  ('chef-mayor', 'Chef Mayor', 'direccion',  'chef_mayor', 'Liderazgo y estrategia', 1),
  ('sofia',      'Sofía',      'soporte',    'jefe',       'Atención y resolución', 2),
  ('mateo',      'Mateo',      'ventas',     'jefe',       'Comercial y crecimiento', 3),
  ('crystal',    'Crystal',    'exito',      'jefe',       'Satisfacción y retención', 4),
  ('lucia',      'Lucía',      'producto',   'jefe',       'Innovación y desarrollo', 5),
  ('tomi',       'Tomi',       'ingenieria', 'jefe',       'Tecnología y sistemas', 6),
  ('ronda',      'Ronda',      'monitoreo',  'jefe',       'Rendimiento y alertas', 7),
  ('vera',       'Vera',       'legal',      'jefe',       'Normativa y cumplimiento', 8),
  ('dani',       'Dani',       'finanzas',   'jefe',       'Presupuesto y rentabilidad', 9),
  ('nico',       'Nico',       'marca',      'jefe',       'Imagen y comunidad', 10),
  ('resti',      'Resti',      'direccion',  'asistente',  'Asistente personal de Cristhian', 11)
ON CONFLICT (id) DO NOTHING;
UPDATE public.central_agentes SET reporta_a = 'chef-mayor' WHERE id <> 'chef-mayor' AND reporta_a IS NULL AND rol IN ('jefe', 'asistente');

INSERT INTO public.central_integraciones (id, nombre, descripcion, scopes, notas) VALUES
  ('restaurantos',      'RestaurantOS',        'Datos de los restaurantes.',
     '["lectura agregada de restaurantes, suscripción y pedidos del día"]'::jsonb,
     'Tú ya ves los restaurantes desde Central (solo lectura). Los agentes todavía no tienen acceso a ningún dato.'),
  ('telegram',          'Telegram',            'Canal externo para alertas, resúmenes y solicitudes de aprobación.',
     '["enviar mensajes a usuarios vinculados", "recibir confirmaciones"]'::jsonb,
     'Requiere vincular y verificar tu identidad. Sin conexión real hasta que la autorices.'),
  ('google_workspace',  'Google Workspace',    'Correo, documentos y calendarios institucionales.',
     '["borradores de correo", "Shared Drives (lectura)", "calendarios compartidos"]'::jsonb,
     'Sin Domain-Wide Delegation. Los agentes preparan borradores; el envío real exige tu autorización.'),
  ('github',            'GitHub',              'Repositorio del código.',
     '["lectura de repositorio", "propuestas de cambio (pull requests)"]'::jsonb,
     'Ningún agente publica ni despliega solo: los despliegues son nivel N3 (solo humano).'),
  ('modelos_ia',        'Proveedores de modelos de IA', 'Modelos que darán voz a los agentes.',
     '["generación de texto con límites de consumo por agente"]'::jsonb,
     'Mientras no haya proveedor configurado, los agentes responden como "Simulación local".'),
  ('investigacion',     'Herramientas de investigación', 'Búsqueda y análisis de fuentes externas.',
     '["búsqueda web de solo lectura"]'::jsonb,
     'Pendiente de decidir proveedor y límites.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.central_config (clave, valor) VALUES
  ('modo_oficina', '"3d"'::jsonb), ('iluminacion', '"auto"'::jsonb), ('calidad_grafica', '"auto"'::jsonb),
  ('idioma', '"es"'::jsonb), ('sonido', 'false'::jsonb), ('notificaciones', 'true'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- Canales: uno institucional y uno por cada área de dirección/departamento.
INSERT INTO public.central_conversaciones (tipo, titulo)
SELECT 'canal_institucional', 'General' WHERE NOT EXISTS (SELECT 1 FROM public.central_conversaciones WHERE tipo = 'canal_institucional' AND titulo = 'General');
INSERT INTO public.central_conversaciones (tipo, titulo, departamento_id)
SELECT 'canal_departamento', d.nombre, d.id FROM public.central_departamentos d
 WHERE d.tipo IN ('direccion', 'departamento')
   AND NOT EXISTS (SELECT 1 FROM public.central_conversaciones c WHERE c.tipo = 'canal_departamento' AND c.departamento_id = d.id);

-- Memoria institucional inicial: lo que ya está aprobado en la orden maestra (no son datos del negocio).
INSERT INTO public.central_memoria (capa, titulo, contenido, procedencia, confiabilidad)
SELECT * FROM (VALUES
  ('institucional', 'Organigrama aprobado',
   'Dirección: Chef Mayor. Soporte: Sofía. Ventas: Mateo. Éxito del Cliente: Crystal. Producto: Lucía. Ingeniería: Tomi. Monitoreo: Ronda. Legal & DIAN: Vera. Finanzas: Dani. Marca & Comunidad: Nico. Calidad: función independiente, sin jefe permanente, reporta directamente a Cristhian. Resti es el asistente personal.',
   'Orden maestra de Central', 'alta'),
  ('institucional', 'Niveles de autorización',
   'N0 solo lectura. N1 autonomía controlada (acciones reversibles ya aprobadas). N2 requiere aprobación humana (precios, descuentos, contratos, mensajes, dinero, configuración, acciones sobre clientes). N3 exclusivamente humano (borrado destructivo, seguridad, dinero crítico, cuenta principal, despliegues a producción). Un agente nunca se aprueba a sí mismo ni eleva sus permisos.',
   'Orden maestra de Central', 'alta'),
  ('permanente', 'Diseño físico de la oficina',
   'Un solo nivel circular con cuatro anillos: núcleo central (RestaurantOS); anillo 2 de dirección y supervisión; anillo 3 de departamentos; anillo 4 de servicios y bienestar.',
   'Orden maestra de Central', 'alta'),
  ('permanente', 'Regla de integraciones',
   'Los jefes pueden solicitar integraciones; solo Cristhian las autoriza. Las credenciales nunca las ven los agentes. Una integración disponible no implica autorización para usarla.',
   'Orden maestra de Central', 'alta')
) AS v(capa, titulo, contenido, procedencia, confiabilidad)
WHERE NOT EXISTS (SELECT 1 FROM public.central_memoria m WHERE m.titulo = v.titulo);
