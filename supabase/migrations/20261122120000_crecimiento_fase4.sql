-- Central Crecimiento · FASE 4 (primera parte): Contact Center en modo BORRADOR. Aditiva; no toca restaurantes, pedidos ni dinero.
-- Crea growth_mensajes: la bandeja por prospecto y canal (correo, WhatsApp, teléfono). TODAVÍA NO HAY ENVÍO AUTOMÁTICO:
-- no existe una cuenta de correo conectada, así que nada sale solo. Un mensaje aprobado queda "listo"; si el fundador lo manda él mismo
-- lo registra como "hecho_manual". Los estados enviado / fallido / recibido solo los podrá poner el servidor cuando exista la integración.
-- Reglas que hace cumplir la base (no la pantalla):
--   · Todo mensaje nuevo nace como borrador. Un prospecto de ejemplo, perdido o en "no contactar" nunca llega a aprobado.
--   · Aprobar exige: prospecto investigado, dato de contacto del canal, que no esté en la lista de no contactar, una campaña vigente que
--     incluya ese canal, no pasar el máximo de contactos de la campaña, texto completo y, en correo, la forma de darse de baja.
--   · Sin duplicados (un mensaje por prospecto, canal y paso). Un seguimiento solo después de enviar el paso anterior.
--   · El texto aprobado no se edita (se retira la aprobación primero). Un mensaje cerrado no se reabre.
--   · Una baja cancela los borradores y aprobados de ese contacto; revocar la campaña devuelve a borrador lo aprobado con ella.
-- Reversa: supabase/rollback/20261122120000_crecimiento_fase4_down.sql

CREATE TABLE IF NOT EXISTS public.growth_mensajes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.growth_prospectos (id),
  direccion    text NOT NULL DEFAULT 'saliente' CHECK (direccion IN ('saliente', 'entrante')),
  canal        text NOT NULL CHECK (canal IN ('correo', 'whatsapp', 'telefono')),
  paso         integer NOT NULL DEFAULT 1 CHECK (paso BETWEEN 1 AND 3),
  estado       text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'enviado', 'fallido', 'recibido', 'cancelado', 'hecho_manual')),
  asunto       text NOT NULL DEFAULT '' CHECK (char_length(asunto) <= 200),
  cuerpo       text NOT NULL DEFAULT '' CHECK (char_length(cuerpo) <= 4000),
  campana_id   uuid REFERENCES public.growth_autorizaciones (id),
  aprobado_en  timestamptz,
  aprobado_por uuid,
  proveedor    text CHECK (proveedor IS NULL OR char_length(proveedor) <= 40),
  proveedor_id text CHECK (proveedor_id IS NULL OR char_length(proveedor_id) <= 200),
  enviado_en   timestamptz,
  error        text CHECK (error IS NULL OR char_length(error) <= 500),
  creado_por   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'enviado' OR (proveedor_id IS NOT NULL AND enviado_en IS NOT NULL)),
  CHECK (direccion = 'saliente' OR estado = 'recibido')
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_mensajes_u_paso ON public.growth_mensajes (prospecto_id, canal, paso)
  WHERE direccion = 'saliente' AND estado IN ('borrador', 'aprobado', 'enviado', 'hecho_manual');
CREATE INDEX IF NOT EXISTS growth_mensajes_estado ON public.growth_mensajes (estado, created_at DESC);

CREATE OR REPLACE FUNCTION public.growth_mensaje_reglas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_humano boolean := auth.uid() IS NOT NULL;
  v_p record; v_inv jsonb; v_alc jsonb; v_valor text; v_max int; v_n int;
  v_cambia boolean := TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_humano AND (NEW.direccion <> 'saliente' OR NEW.estado <> 'borrador') THEN
      RAISE EXCEPTION 'Un mensaje nuevo siempre empieza como borrador.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF OLD.estado IN ('enviado', 'fallido', 'recibido', 'cancelado', 'hecho_manual') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'Un mensaje cerrado no se reabre: crea otro.' USING ERRCODE = 'P0001';
    END IF;
    IF v_humano AND v_cambia AND NEW.estado IN ('enviado', 'fallido', 'recibido') THEN
      RAISE EXCEPTION 'Solo el sistema de envío puede marcar un mensaje como enviado, fallido o recibido.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado <> 'borrador' AND (NEW.asunto IS DISTINCT FROM OLD.asunto OR NEW.cuerpo IS DISTINCT FROM OLD.cuerpo OR NEW.campana_id IS DISTINCT FROM OLD.campana_id) THEN
      RAISE EXCEPTION 'El texto y la campaña de un mensaje aprobado no se editan: retira la aprobación primero.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado = 'aprobado' AND NEW.estado = 'borrador' THEN NEW.aprobado_en := NULL; NEW.aprobado_por := NULL; END IF;
  END IF;

  IF NEW.direccion = 'saliente' AND NEW.estado IN ('aprobado', 'hecho_manual') AND v_cambia THEN
    IF NEW.estado = 'hecho_manual' AND OLD.estado IS DISTINCT FROM 'aprobado' THEN
      RAISE EXCEPTION 'Primero aprueba el mensaje y después registra que lo enviaste.' USING ERRCODE = 'P0001';
    END IF;
    SELECT etapa, es_ficticio, correo_norm, telefono_norm INTO v_p FROM public.growth_prospectos WHERE id = NEW.prospecto_id;
    IF v_p.es_ficticio THEN RAISE EXCEPTION 'Un prospecto de ejemplo no se puede contactar: el mensaje solo puede quedar como borrador.' USING ERRCODE = 'P0001'; END IF;
    IF v_p.etapa IN ('perdido', 'no_contactar') THEN RAISE EXCEPTION 'Este prospecto está perdido o en no contactar.' USING ERRCODE = 'P0001'; END IF;
    v_valor := CASE WHEN NEW.canal = 'correo' THEN v_p.correo_norm ELSE v_p.telefono_norm END;
    IF v_valor IS NULL THEN RAISE EXCEPTION 'Este prospecto no tiene ese dato de contacto.' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.growth_supresion s WHERE s.valor_norm = v_valor
                 AND ((NEW.canal = 'correo' AND s.canal = 'correo') OR (NEW.canal <> 'correo' AND s.canal IN ('telefono', 'whatsapp')))) THEN
      RAISE EXCEPTION 'Este contacto está en la lista de no contactar.' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.estado = 'aprobado' THEN
      SELECT investigacion INTO v_inv FROM public.growth_expedientes WHERE prospecto_id = NEW.prospecto_id;
      IF v_inv IS NULL OR jsonb_typeof(v_inv -> 'fuentes') IS DISTINCT FROM 'array' OR jsonb_array_length(v_inv -> 'fuentes') = 0 THEN
        RAISE EXCEPTION 'Antes de contactar, investiga al prospecto: el expediente debe tener fuentes.' USING ERRCODE = 'P0001';
      END IF;
      SELECT alcance INTO v_alc FROM public.growth_autorizaciones
       WHERE id = NEW.campana_id AND tipo = 'campana' AND estado = 'vigente' AND now() >= vigente_desde AND now() < vigente_hasta;
      IF v_alc IS NULL THEN RAISE EXCEPTION 'Para aprobar hace falta elegir una campaña vigente.' USING ERRCODE = 'P0001'; END IF;
      IF jsonb_typeof(v_alc -> 'canales') = 'array' AND NOT ((v_alc -> 'canales') ? NEW.canal) THEN
        RAISE EXCEPTION 'La campaña elegida no incluye ese canal.' USING ERRCODE = 'P0001';
      END IF;
      v_max := coalesce(nullif(v_alc ->> 'max_contactos_por_prospecto', '')::int, 3);
      SELECT count(*) INTO v_n FROM public.growth_mensajes WHERE prospecto_id = NEW.prospecto_id AND direccion = 'saliente'
         AND estado IN ('aprobado', 'enviado', 'hecho_manual') AND id <> NEW.id;
      IF v_n >= v_max THEN RAISE EXCEPTION 'Este prospecto ya llegó al máximo de % contactos de la campaña.', v_max USING ERRCODE = 'P0001'; END IF;
      IF NEW.paso > 1 AND NOT EXISTS (SELECT 1 FROM public.growth_mensajes WHERE prospecto_id = NEW.prospecto_id AND canal = NEW.canal
                                         AND paso = NEW.paso - 1 AND direccion = 'saliente' AND estado IN ('enviado', 'hecho_manual')) THEN
        RAISE EXCEPTION 'El seguimiento solo se aprueba después de enviar el paso anterior.' USING ERRCODE = 'P0001';
      END IF;
      IF char_length(btrim(NEW.cuerpo)) < 20 THEN RAISE EXCEPTION 'Escribe el mensaje completo (mínimo 20 letras).' USING ERRCODE = 'P0001'; END IF;
      IF NEW.canal = 'correo' THEN
        IF char_length(btrim(NEW.asunto)) < 3 THEN RAISE EXCEPTION 'El correo necesita un asunto.' USING ERRCODE = 'P0001'; END IF;
        IF NEW.cuerpo !~* 'baja' THEN RAISE EXCEPTION 'Todo correo debe decir cómo darse de baja (incluye la palabra "baja").' USING ERRCODE = 'P0001'; END IF;
      END IF;
      NEW.aprobado_en := now(); NEW.aprobado_por := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS growth_mensajes_reglas ON public.growth_mensajes;
CREATE TRIGGER growth_mensajes_reglas BEFORE INSERT OR UPDATE ON public.growth_mensajes FOR EACH ROW EXECUTE FUNCTION public.growth_mensaje_reglas();
REVOKE EXECUTE ON FUNCTION public.growth_mensaje_reglas() FROM PUBLIC, anon, authenticated;

-- Historial del prospecto: queda constancia de cada contacto registrado o respuesta recibida.
CREATE OR REPLACE FUNCTION public.growth_mensaje_historial()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IN ('hecho_manual', 'enviado', 'fallido', 'recibido') AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
    INSERT INTO public.growth_historial (prospecto_id, tipo, detalle, actor_tipo)
    VALUES (NEW.prospecto_id, 'contacto',
      CASE NEW.estado WHEN 'hecho_manual' THEN 'Contacto por ' || NEW.canal || ' (paso ' || NEW.paso || ') registrado como enviado por el fundador'
                      WHEN 'enviado' THEN 'Mensaje por ' || NEW.canal || ' (paso ' || NEW.paso || ') enviado por el sistema'
                      WHEN 'fallido' THEN 'Falló el envío por ' || NEW.canal || ' (paso ' || NEW.paso || ')'
                      ELSE 'Respuesta recibida por ' || NEW.canal END,
      CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'humano' END);
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS growth_mensajes_historial ON public.growth_mensajes;
CREATE TRIGGER growth_mensajes_historial AFTER INSERT OR UPDATE OF estado ON public.growth_mensajes FOR EACH ROW EXECUTE FUNCTION public.growth_mensaje_historial();
REVOKE EXECUTE ON FUNCTION public.growth_mensaje_historial() FROM PUBLIC, anon, authenticated;

-- Una baja cancela lo pendiente de ese contacto.
CREATE OR REPLACE FUNCTION public.growth_mensajes_por_baja()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.growth_mensajes m SET estado = 'cancelado'
   WHERE m.direccion = 'saliente' AND m.estado IN ('borrador', 'aprobado')
     AND m.prospecto_id IN (SELECT p.id FROM public.growth_prospectos p
                             WHERE (NEW.canal = 'correo' AND m.canal = 'correo' AND p.correo_norm = NEW.valor_norm)
                                OR (NEW.canal IN ('telefono', 'whatsapp') AND m.canal IN ('telefono', 'whatsapp') AND p.telefono_norm = NEW.valor_norm));
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS growth_supresion_cancela_mensajes ON public.growth_supresion;
CREATE TRIGGER growth_supresion_cancela_mensajes AFTER INSERT ON public.growth_supresion FOR EACH ROW EXECUTE FUNCTION public.growth_mensajes_por_baja();
REVOKE EXECUTE ON FUNCTION public.growth_mensajes_por_baja() FROM PUBLIC, anon, authenticated;

-- Un prospecto perdido o en no contactar deja de tener mensajes pendientes.
CREATE OR REPLACE FUNCTION public.growth_mensajes_por_etapa()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.etapa IN ('perdido', 'no_contactar') AND OLD.etapa IS DISTINCT FROM NEW.etapa THEN
    UPDATE public.growth_mensajes SET estado = 'cancelado' WHERE prospecto_id = NEW.id AND direccion = 'saliente' AND estado IN ('borrador', 'aprobado');
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS growth_prospectos_cancela_mensajes ON public.growth_prospectos;
CREATE TRIGGER growth_prospectos_cancela_mensajes AFTER UPDATE OF etapa ON public.growth_prospectos FOR EACH ROW EXECUTE FUNCTION public.growth_mensajes_por_etapa();
REVOKE EXECUTE ON FUNCTION public.growth_mensajes_por_etapa() FROM PUBLIC, anon, authenticated;

-- Revocar o vencer una campaña devuelve a borrador lo aprobado con ella (hay que aprobarlo de nuevo bajo otra campaña).
CREATE OR REPLACE FUNCTION public.growth_mensajes_por_campana()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IN ('revocada', 'vencida') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE public.growth_mensajes SET estado = 'borrador' WHERE campana_id = NEW.id AND direccion = 'saliente' AND estado = 'aprobado';
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS growth_autorizaciones_detiene_mensajes ON public.growth_autorizaciones;
CREATE TRIGGER growth_autorizaciones_detiene_mensajes AFTER UPDATE OF estado ON public.growth_autorizaciones FOR EACH ROW EXECUTE FUNCTION public.growth_mensajes_por_campana();
REVOKE EXECUTE ON FUNCTION public.growth_mensajes_por_campana() FROM PUBLIC, anon, authenticated;

-- Auditoría (sin guardar el texto de los mensajes) y permisos: el dueño crea borradores y solo cambia texto, campaña y estado.
DROP TRIGGER IF EXISTS growth_mensajes_auditar ON public.growth_mensajes;
CREATE TRIGGER growth_mensajes_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_mensajes FOR EACH ROW EXECUTE FUNCTION public.central_auditar('asunto,cuerpo');
ALTER TABLE public.growth_mensajes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_mensajes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.growth_mensajes TO authenticated;
GRANT INSERT (prospecto_id, canal, paso, asunto, cuerpo, campana_id) ON public.growth_mensajes TO authenticated;
GRANT UPDATE (asunto, cuerpo, campana_id, estado) ON public.growth_mensajes TO authenticated;
DROP POLICY IF EXISTS "Central: solo el dueño con 2 pasos" ON public.growth_mensajes;
CREATE POLICY "Central: solo el dueño con 2 pasos" ON public.growth_mensajes FOR ALL TO authenticated
  USING ((SELECT public.central_autorizado())) WITH CHECK ((SELECT public.central_autorizado()));
