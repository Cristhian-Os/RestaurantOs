-- Central · PROPUESTAS de herramientas y conectores (Tomi propone, el dueño decide, solo lo aprobado avanza). Aditiva: una tabla nueva y funciones.
-- Reglas que hace cumplir la base (no la pantalla):
--   · Solo el dueño con 2 pasos (central_autorizado) aprueba o rechaza, y solo desde "propuesta". Un cambio directo a "aprobada" o "rechazada" se rechaza.
--   · El avance (en desarrollo → para revisar → publicada) solo lo hace el servidor y solo si ya fue aprobada por una persona; no se salta pasos.
--   · Cada propuesta nueva avisa en la campana de Central; todo cambio queda en el registro de auditoría.
-- Depende de: central_nucleo (central_autorizado, central_auditar, central_notificaciones, central_agentes).
-- Reversa: supabase/rollback/20261124180000_central_propuestas_down.sql

CREATE TABLE IF NOT EXISTS public.central_propuestas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL CHECK (tipo IN ('herramienta', 'conector')),
  titulo         text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 140),
  para_que       text NOT NULL CHECK (char_length(para_que) BETWEEN 10 AND 600),
  necesita       text NOT NULL DEFAULT '' CHECK (char_length(necesita) <= 600),   -- cuentas, claves o permisos que debe poner el dueño
  costo          text NOT NULL DEFAULT '' CHECK (char_length(costo) <= 300),      -- texto honesto: "por confirmar" si no se sabe
  riesgo         text NOT NULL DEFAULT 'medio' CHECK (riesgo IN ('bajo', 'medio', 'alto')),
  plan_pruebas   text NOT NULL DEFAULT '' CHECK (char_length(plan_pruebas) <= 600),
  proponente     text NOT NULL DEFAULT 'tomi' REFERENCES public.central_agentes (id),
  estado         text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'aprobada', 'rechazada', 'en_desarrollo', 'para_revisar', 'publicada', 'cancelada')),
  decidido_por   uuid,
  decidido_en    timestamptz,
  nota_decision  text CHECK (nota_decision IS NULL OR char_length(nota_decision) <= 500),
  enlace         text CHECK (enlace IS NULL OR char_length(enlace) <= 300),       -- rama o cambio de código a revisar
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS central_propuestas_titulo_uq ON public.central_propuestas (lower(titulo));

-- Máquina de estados: qué cambios son válidos y quién puede hacerlos.
CREATE OR REPLACE FUNCTION public.central_propuestas_reglas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'propuesta' THEN RAISE EXCEPTION 'Una propuesta nueva siempre empieza como "propuesta".' USING ERRCODE = 'P0001'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    -- Solo la función de decisión (dueño con 2 pasos) puede aprobar o rechazar.
    IF NEW.estado IN ('aprobada', 'rechazada') AND coalesce(current_setting('central.decidiendo', true), '') <> '1' THEN
      RAISE EXCEPTION 'Solo el dueño puede aprobar o rechazar una propuesta.' USING ERRCODE = '42501';
    END IF;
    v_ok := (OLD.estado = 'propuesta'     AND NEW.estado IN ('aprobada', 'rechazada', 'cancelada'))
         OR (OLD.estado = 'aprobada'      AND NEW.estado IN ('en_desarrollo', 'cancelada'))
         OR (OLD.estado = 'en_desarrollo' AND NEW.estado IN ('para_revisar', 'cancelada'))
         OR (OLD.estado = 'para_revisar'  AND NEW.estado IN ('en_desarrollo', 'publicada', 'cancelada'));
    IF NOT v_ok THEN RAISE EXCEPTION 'Cambio de estado no permitido: de "%" a "%".', OLD.estado, NEW.estado USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.para_que IS DISTINCT FROM OLD.para_que
     OR NEW.necesita IS DISTINCT FROM OLD.necesita OR NEW.costo IS DISTINCT FROM OLD.costo OR NEW.riesgo IS DISTINCT FROM OLD.riesgo THEN
    IF OLD.estado <> 'propuesta' THEN RAISE EXCEPTION 'Lo que se aprobó no se edita: crea otra propuesta.' USING ERRCODE = 'P0001'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS central_propuestas_reglas ON public.central_propuestas;
CREATE TRIGGER central_propuestas_reglas BEFORE INSERT OR UPDATE ON public.central_propuestas
  FOR EACH ROW EXECUTE FUNCTION public.central_propuestas_reglas();

DROP TRIGGER IF EXISTS central_propuestas_auditar ON public.central_propuestas;
CREATE TRIGGER central_propuestas_auditar AFTER INSERT OR UPDATE OR DELETE ON public.central_propuestas
  FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');

-- Aviso en la campana cuando llega una propuesta nueva.
CREATE OR REPLACE FUNCTION public.central_propuestas_avisar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
  VALUES ('aprobacion', 'importante', left('Tomi propone: ' || NEW.titulo, 200), left(NEW.para_que, 400), 'propuestas', '/central');
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.central_propuestas_avisar() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS central_propuestas_avisar ON public.central_propuestas;
CREATE TRIGGER central_propuestas_avisar AFTER INSERT ON public.central_propuestas
  FOR EACH ROW EXECUTE FUNCTION public.central_propuestas_avisar();

ALTER TABLE public.central_propuestas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.central_propuestas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.central_propuestas TO authenticated;
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_propuestas;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_propuestas FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));

-- El dueño decide (con 2 pasos).
CREATE OR REPLACE FUNCTION public.central_decidir_propuesta(p_id uuid, p_decision text, p_nota text DEFAULT NULL)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_nuevo text; v_filas integer;
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('aprobar', 'rechazar') THEN RAISE EXCEPTION 'Decisión no válida.' USING ERRCODE = 'P0001'; END IF;
  v_nuevo := CASE p_decision WHEN 'aprobar' THEN 'aprobada' ELSE 'rechazada' END;
  PERFORM set_config('central.decidiendo', '1', true);
  UPDATE public.central_propuestas SET estado = v_nuevo, decidido_por = auth.uid(), decidido_en = now(), nota_decision = left(nullif(btrim(p_nota), ''), 500)
   WHERE id = p_id AND estado = 'propuesta';
  GET DIAGNOSTICS v_filas = ROW_COUNT;   -- antes de cualquier otra instrucción (PERFORM cambia FOUND)
  PERFORM set_config('central.decidiendo', '', true);
  IF v_filas = 0 THEN RAISE EXCEPTION 'Esa propuesta ya fue decidida o no existe.' USING ERRCODE = 'P0001'; END IF;
  RETURN v_nuevo;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_decidir_propuesta(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_decidir_propuesta(uuid, text, text) TO authenticated;

-- El servidor (quien desarrolla) avanza una propuesta YA aprobada: nunca puede aprobarla él mismo.
CREATE OR REPLACE FUNCTION public.central_avanzar_propuesta(p_id uuid, p_estado text, p_enlace text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Solo el servidor puede avanzar una propuesta.' USING ERRCODE = '42501'; END IF;
  IF p_estado NOT IN ('en_desarrollo', 'para_revisar', 'cancelada') THEN RAISE EXCEPTION 'Ese estado lo decide el dueño.' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.central_propuestas SET estado = p_estado, enlace = coalesce(left(nullif(btrim(p_enlace), ''), 300), enlace) WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa propuesta.' USING ERRCODE = 'P0001'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_avanzar_propuesta(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.central_avanzar_propuesta(uuid, text, text) TO service_role;

-- Primeras propuestas de Tomi. Costos "por confirmar" donde no se conoce el dato: no se inventan cifras.
INSERT INTO public.central_propuestas (tipo, titulo, para_que, necesita, costo, riesgo, plan_pruebas) VALUES
 ('conector', 'Correo de ventas: envío y bandeja',
  'Enviar los mensajes que tú apruebes a prospectos, registrar respuestas y bajas, y dar seguimiento sin duplicar envíos.',
  'Un buzón dedicado a ventas (no el personal), configuración SPF/DKIM/DMARC del dominio y que tú autorices la conexión (OAuth).',
  'Por confirmar: depende del proveedor de correo elegido.', 'medio',
  'Enviar un correo de prueba a un buzón tuyo, ver el ID del envío, probar que una baja bloquea envíos futuros y que no se duplica.'),
 ('conector', 'Facebook e Instagram de negocio: publicar contenido aprobado',
  'Que Nico publique en tu página, solo lo que tú hayas aprobado, y guarde el enlace de cada publicación como prueba.',
  'Una página de Facebook del negocio (y cuenta de Instagram de empresa si se quiere), una app de desarrollador en Meta y un token que tú generas y pegas en el formulario seguro.',
  'Por confirmar: publicar en tu propia página normalmente no tiene costo de API.', 'medio',
  'Publicar una pieza de prueba aprobada, comprobar que sale el enlace, y que una pieza sin aprobar nunca se publica.'),
 ('herramienta', 'Aprobación de contenido y estados de publicación',
  'Pasar los borradores de Nico por borrador, aprobado, publicado o fallido, con botones de aprobar y rechazar, en vez de documentos sueltos.',
  'Solo tu aprobación. Requiere crear una tabla nueva en la base de datos.', 'Sin costo adicional.', 'bajo',
  'Pruebas en base local: nadie publica sin aprobación, no se salta de estado, queda el registro.'),
 ('conector', 'Calendario para agendar demostraciones',
  'Proponer horarios, confirmar la demo solo cuando el prospecto acepta, y dejarte el paquete de la llamada.',
  'Una cuenta de calendario (por ejemplo Google) y que tú autorices la conexión.', 'Por confirmar: normalmente gratuito con tu cuenta.', 'bajo',
  'Crear una cita de prueba, verificar que no se confirma sin aceptación y que aparece en tu calendario.'),
 ('herramienta', 'Videos y animaciones cortas para Nico',
  'Que Nico acompañe sus borradores con animaciones o videos cortos generados con IA, siempre como borrador para tu aprobación.',
  'Una cuenta de un servicio de generación de video con créditos y su clave (la pegas en el formulario seguro) y un tope de gasto para este uso.',
  'Por confirmar: se paga por cada video; hay que fijar un tope mensual.', 'medio',
  'Generar un video de prueba, medir el costo real y revisar que no muestre funciones sin verificar.'),
 ('conector', 'WhatsApp Business oficial para contactar prospectos',
  'Contactar prospectos aprobados por WhatsApp con plantillas autorizadas, respetando bajas y horarios.',
  'Verificación del negocio en Meta, un número dedicado y plantillas aprobadas por Meta (puede tardar semanas).',
  'Por confirmar: Meta cobra por conversación.', 'alto',
  'Enviar una plantilla aprobada a un número tuyo, probar baja inmediata y límites de frecuencia.')
ON CONFLICT DO NOTHING;
