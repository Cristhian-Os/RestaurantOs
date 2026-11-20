-- Central Crecimiento · FASE 1: fuente de verdad y gobernanza (aditiva; no toca restaurantes, pedidos ni dinero).
-- Crea:  growth_funciones (matriz de funciones reales)  ·  growth_autorizaciones (campañas y calendarios editoriales aprobados)
--        growth_supresion (lista de "no contactar", solo se agrega)  ·  funciones para activar/revocar y consultar.
-- Reglas que hace cumplir la base (no la pantalla):
--   · Todo bajo central_autorizado() (solo el dueño con 2 pasos); el servidor (service_role) puede consultar la lista y agregar bajas.
--   · Una función "en producción" o "parcial" exige evidencia y fecha de verificación.
--   · Una autorización solo pasa a "vigente" con todos sus campos obligatorios y fecha de vencimiento; una vez vigente su alcance
--     no se edita (si el alcance cambia, se crea otra); revocada o vencida no vuelve a vigente.
--   · La lista de "no contactar" no se edita ni se borra; los contactos se guardan normalizados.
-- Depende de: 20261114140000_central_nucleo (central_autorizado, central_auditar, central_tocar).
-- Reversa: supabase/rollback/20261119120000_crecimiento_fase1_down.sql

-- ── Normalizar un dato de contacto para compararlo (correo en minúsculas, teléfono solo dígitos sin 57) ──
CREATE OR REPLACE FUNCTION public.growth_normalizar_contacto(p_canal text, p_valor text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_canal IN ('whatsapp', 'telefono') THEN
      CASE WHEN length(regexp_replace(coalesce(p_valor, ''), '\D', '', 'g')) = 12 AND regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') LIKE '57%'
           THEN substr(regexp_replace(coalesce(p_valor, ''), '\D', '', 'g'), 3)
           ELSE regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') END
    ELSE lower(btrim(coalesce(p_valor, '')))
  END;
$function$;

-- ── 1. Matriz de funciones reales ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.growth_funciones (
  id             text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{3,60}$'),
  nombre         text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 120),
  area           text NOT NULL DEFAULT 'General' CHECK (char_length(area) BETWEEN 2 AND 60),
  estado         text NOT NULL DEFAULT 'sin_verificar' CHECK (estado IN ('produccion', 'parcial', 'desarrollo', 'planeada', 'no_existe', 'sin_verificar')),
  plan_minimo    text CHECK (plan_minimo IS NULL OR plan_minimo IN ('emprende', 'pro', 'premium')),
  limitaciones   text NOT NULL DEFAULT '' CHECK (char_length(limitaciones) <= 1000),
  evidencia      text NOT NULL DEFAULT '' CHECK (char_length(evidencia) <= 1000),
  verificado_en  date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (estado NOT IN ('produccion', 'parcial') OR (char_length(btrim(evidencia)) >= 5 AND verificado_en IS NOT NULL))
);

-- ── 2. Autorizaciones de campaña y editoriales ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.growth_autorizaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('campana', 'editorial')),
  nombre          text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 120),
  alcance         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(alcance) = 'object'),
  estado          text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'vigente', 'revocada', 'vencida')),
  vigente_desde   timestamptz,
  vigente_hasta   timestamptz,
  revocada_en     timestamptz,
  revocada_motivo text CHECK (revocada_motivo IS NULL OR char_length(revocada_motivo) <= 500),
  creado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'vigente' OR (vigente_desde IS NOT NULL AND vigente_hasta IS NOT NULL AND vigente_hasta > vigente_desde)),
  CHECK (estado <> 'revocada' OR revocada_en IS NOT NULL)
);

-- Campos obligatorios para activar (campaña: §2 "Autorización de campaña comercial"; editorial: "Autorización editorial").
CREATE OR REPLACE FUNCTION public.growth_autorizacion_reglas()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req  text[];
  v_falta text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado IN ('revocada', 'vencida') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'Una autorización revocada o vencida no puede volver a activarse: crea otra.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.estado <> 'borrador' AND NEW.alcance IS DISTINCT FROM OLD.alcance THEN
      RAISE EXCEPTION 'El alcance de una autorización ya activa no se edita: revócala y crea otra.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.estado = 'vigente' THEN
    v_req := CASE NEW.tipo
      WHEN 'campana'   THEN ARRAY['objetivo', 'ciudad', 'segmento', 'criterios_exclusion', 'max_prospectos', 'max_contactos_por_prospecto', 'canales', 'horario', 'plantillas', 'planes_permitidos', 'descuentos_permitidos', 'frecuencia_seguimiento', 'criterios_detencion']
      ELSE                  ARRAY['canales', 'temas', 'tono', 'formatos', 'frecuencia', 'guia_visual', 'limites']
    END;
    SELECT coalesce(array_agg(k), ARRAY[]::text[]) INTO v_falta FROM unnest(v_req) k WHERE NOT (NEW.alcance ? k);
    IF array_length(v_falta, 1) > 0 THEN
      RAISE EXCEPTION 'Faltan datos para activar esta autorización: %.', array_to_string(v_falta, ', ') USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS growth_autorizaciones_reglas ON public.growth_autorizaciones;
CREATE TRIGGER growth_autorizaciones_reglas BEFORE INSERT OR UPDATE ON public.growth_autorizaciones
  FOR EACH ROW EXECUTE FUNCTION public.growth_autorizacion_reglas();

-- Activar: solo el dueño con 2 pasos, con fecha de vencimiento obligatoria.
CREATE OR REPLACE FUNCTION public.growth_activar_autorizacion(p_id uuid, p_hasta timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  IF p_hasta IS NULL OR p_hasta <= now() THEN RAISE EXCEPTION 'La fecha de vencimiento debe ser futura.' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.growth_autorizaciones SET estado = 'vigente', vigente_desde = now(), vigente_hasta = p_hasta
   WHERE id = p_id AND estado = 'borrador';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se puede activar un borrador.' USING ERRCODE = 'P0001'; END IF;
END;
$function$;

-- Revocar: detiene de inmediato todo lo que dependa de esta autorización.
CREATE OR REPLACE FUNCTION public.growth_revocar_autorizacion(p_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  UPDATE public.growth_autorizaciones SET estado = 'revocada', revocada_en = now(), revocada_motivo = left(nullif(btrim(p_motivo), ''), 500)
   WHERE id = p_id AND estado IN ('borrador', 'vigente');
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa autorización ya estaba cerrada.' USING ERRCODE = 'P0001'; END IF;
END;
$function$;

-- Consulta para quien vaya a actuar (los agentes y funciones de envío la llaman antes de cada acción).
CREATE OR REPLACE FUNCTION public.growth_autorizacion_vigente(p_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.growth_autorizaciones
                  WHERE id = p_id AND estado = 'vigente' AND now() >= vigente_desde AND now() < vigente_hasta)
         AND (public.central_autorizado() OR auth.role() = 'service_role');
$function$;

-- ── 3. Lista de "no contactar" (solo se agrega) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.growth_supresion (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  canal      text NOT NULL CHECK (canal IN ('correo', 'whatsapp', 'telefono', 'redes')),
  valor_norm text NOT NULL CHECK (char_length(valor_norm) BETWEEN 3 AND 200),
  motivo     text NOT NULL DEFAULT 'baja_solicitada' CHECK (motivo IN ('baja_solicitada', 'queja', 'rebote', 'manual')),
  fuente     text NOT NULL DEFAULT '' CHECK (char_length(fuente) <= 300),
  creado_por uuid DEFAULT auth.uid(),
  UNIQUE (canal, valor_norm)
);

CREATE OR REPLACE FUNCTION public.growth_suprimir(p_canal text, p_valor text, p_motivo text DEFAULT 'baja_solicitada', p_fuente text DEFAULT '')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (public.central_autorizado() OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.growth_supresion (canal, valor_norm, motivo, fuente)
  VALUES (p_canal, public.growth_normalizar_contacto(p_canal, p_valor), p_motivo, left(coalesce(p_fuente, ''), 300))
  ON CONFLICT (canal, valor_norm) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.growth_esta_suprimido(p_canal text, p_valor text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (public.central_autorizado() OR auth.role() = 'service_role')
     AND EXISTS (SELECT 1 FROM public.growth_supresion WHERE canal = p_canal AND valor_norm = public.growth_normalizar_contacto(p_canal, p_valor));
$function$;

-- ── Disparadores comunes y permisos ─────────────────────────────────────────
DROP TRIGGER IF EXISTS growth_funciones_tocar ON public.growth_funciones;
CREATE TRIGGER growth_funciones_tocar BEFORE UPDATE ON public.growth_funciones FOR EACH ROW EXECUTE FUNCTION public.central_tocar();
DROP TRIGGER IF EXISTS growth_funciones_auditar ON public.growth_funciones;
CREATE TRIGGER growth_funciones_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_funciones FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');
DROP TRIGGER IF EXISTS growth_autorizaciones_auditar ON public.growth_autorizaciones;
CREATE TRIGGER growth_autorizaciones_auditar AFTER INSERT OR UPDATE OR DELETE ON public.growth_autorizaciones FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');
DROP TRIGGER IF EXISTS growth_supresion_auditar ON public.growth_supresion;
CREATE TRIGGER growth_supresion_auditar AFTER INSERT ON public.growth_supresion FOR EACH ROW EXECUTE FUNCTION public.central_auditar('valor_norm');

DO $$
DECLARE t text;
  reglas jsonb := jsonb_build_object(
    'growth_funciones',       'SELECT, INSERT, UPDATE',
    'growth_autorizaciones',  'SELECT, INSERT',        -- activar/revocar: solo con las funciones de arriba
    'growth_supresion',       'SELECT'                 -- agregar: solo con growth_suprimir()
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
-- Nombre y alcance de una autorización solo se editan mientras es borrador (el disparador lo exige); el resto, con las funciones.
GRANT UPDATE (nombre, alcance) ON public.growth_autorizaciones TO authenticated;

REVOKE ALL ON FUNCTION public.growth_activar_autorizacion(uuid, timestamptz), public.growth_revocar_autorizacion(uuid, text),
  public.growth_autorizacion_vigente(uuid), public.growth_suprimir(text, text, text, text), public.growth_esta_suprimido(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_activar_autorizacion(uuid, timestamptz), public.growth_revocar_autorizacion(uuid, text),
  public.growth_autorizacion_vigente(uuid), public.growth_suprimir(text, text, text, text), public.growth_esta_suprimido(text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.growth_autorizacion_reglas() FROM PUBLIC, anon, authenticated;

-- ── Primeras filas de la matriz: SOLO lo que ya tiene evidencia; el resto queda "sin verificar" a propósito ──
INSERT INTO public.growth_funciones (id, nombre, area, estado, plan_minimo, limitaciones, evidencia, verificado_en) VALUES
  ('planes_precios',   'Planes y precios', 'Comercial', 'produccion', NULL, 'Premium figura como "Próximamente" (no se puede elegir). Los límites de mesas y usuarios están guardados pero no se hacen cumplir.', 'Tabla planes en producción: Esencial 160.000, Pro 260.000, Premium 325.000 COP/mes (consulta del 2026-11-19).', DATE '2026-11-19'),
  ('pagos_wompi',      'Cobro de suscripción (Wompi)', 'Comercial', 'parcial', NULL, 'El cobro real está apagado hasta tener RUT con IVA y factura electrónica. No se puede confirmar "cliente pagador".', 'Funciones wompi-init, wompi-subscribe, wompi-charge y wompi-webhook desplegadas; informe BLOQUE6_PLANES_Y_PRECIOS.', DATE '2026-11-19'),
  ('ia_resti',         'Resti (asistente de IA del restaurante)', 'Producto', 'parcial', NULL, 'Está en producción pero apagado en todos los restaurantes.', 'Funciones resti-brain, resti-acciones y resti-voz desplegadas; informe RESTI_IA_ENTREGA.', DATE '2026-11-19'),
  ('multisedes',       'Varias sedes (multi-sucursal)', 'Producto', 'no_existe', 'premium', 'No ofrecer ni prometer. Premium figura como "Próximamente".', 'planes.max_sedes = 1 en todos los planes y premium.disponible = false (2026-11-19).', NULL),
  ('dian_factura',     'DIAN / facturación electrónica', 'Cumplimiento', 'sin_verificar', NULL, 'No ofrecer hasta verificar: los planes guardan límites de documentos DIAN pero el proyecto indica "sin DIAN".', '', NULL),
  ('modo_offline',     'Funcionar sin internet', 'Producto', 'sin_verificar', NULL, 'No afirmar hasta verificar.', '', NULL),
  ('mesas_pedidos',    'Mesas y pedidos', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('cocina',           'Pantalla de cocina', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('inventario',       'Inventario y proveedores', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('recetas_costos',   'Recetas y costos', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('caja_cierres',     'Caja y cierres', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('personal_turnos',  'Personal, turnos y tareas', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('menu_qr',          'Menú QR para clientes', 'Operación', 'sin_verificar', NULL, '', '', NULL),
  ('metricas_ventas',  'Métricas y reportes de ventas', 'Operación', 'sin_verificar', NULL, '', '', NULL)
ON CONFLICT (id) DO NOTHING;
