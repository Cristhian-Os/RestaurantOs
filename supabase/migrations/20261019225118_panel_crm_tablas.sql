-- Bloque 7, paso 1: tablas del panel de plataforma (seguimiento comercial). Anexo C, secciones 5 y 9.
-- Todo es SOLO del dueño de la plataforma: las tablas no tienen permisos para anon ni authenticated y se leen/escriben
-- únicamente por funciones SECURITY DEFINER que exigen is_super_admin() y verificación de 2 pasos.
-- Los datos internos (notas, estado comercial, vendedor) van en `restaurant_crm`, NO en `restaurants`: el administrador de
-- cada restaurante puede leer su propia fila de `restaurants` y no debe ver esto.

CREATE TABLE IF NOT EXISTS public.vendedores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             text NOT NULL CHECK (tipo IN ('vendedor','aliado')),
  nombre           text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  codigo           text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
  correo           text CHECK (correo IS NULL OR char_length(correo) <= 160),
  telefono         text CHECK (telefono IS NULL OR char_length(telefono) <= 40),
  activo           boolean NOT NULL DEFAULT false,      -- no se activa sin contrato (Bloque 8)
  contrato_ruta    text,
  contrato_version text,
  firmado_at       date,
  vigente_hasta    date,
  terminos         jsonb,
  motivo_estado    text CHECK (motivo_estado IS NULL OR char_length(motivo_estado) <= 500),
  medio_pago       text CHECK (medio_pago IS NULL OR medio_pago IN ('nequi','bancolombia','otro')),
  datos_pago       text CHECK (datos_pago IS NULL OR char_length(datos_pago) <= 300),
  notas            text CHECK (notas IS NULL OR char_length(notas) <= 2000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT activo OR contrato_ruta IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.restaurant_crm (
  restaurant_id         uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  origen                text CHECK (origen IS NULL OR origen IN ('vendedor','redes','restaurante','aliado','google','evento','otro')),
  origen_detalle        text CHECK (origen_detalle IS NULL OR char_length(origen_detalle) <= 200),
  codigo_usado          text CHECK (codigo_usado IS NULL OR char_length(codigo_usado) <= 30),
  codigo_estado         text CHECK (codigo_estado IS NULL OR codigo_estado IN ('valido','invalido','inactivo')),
  vendedor_id           uuid REFERENCES public.vendedores (id) ON DELETE SET NULL,
  vendedor_asignado_at  timestamptz,
  estado_comercial      text NOT NULL DEFAULT 'prueba' CHECK (estado_comercial IN ('prospecto','demo','prueba','piloto','activo','en_riesgo','cancelado')),
  notas                 text CHECK (notas IS NULL OR char_length(notas) <= 4000),
  proxima_accion        text CHECK (proxima_accion IS NULL OR char_length(proxima_accion) <= 300),
  proxima_accion_fecha  date,
  ultimo_contacto_at    timestamptz,
  precio_especial_cop   numeric CHECK (precio_especial_cop IS NULL OR precio_especial_cop >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_crm_vendedor_idx ON public.restaurant_crm (vendedor_id);
CREATE INDEX IF NOT EXISTS restaurant_crm_estado_idx ON public.restaurant_crm (estado_comercial);

CREATE TABLE IF NOT EXISTS public.restaurant_contactos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  fecha          date NOT NULL DEFAULT current_date,
  canal          text NOT NULL CHECK (canal IN ('visita','whatsapp','llamada','correo','otro')),
  resumen        text NOT NULL CHECK (char_length(btrim(resumen)) BETWEEN 1 AND 1000),
  creado_por     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_contactos_rest_idx ON public.restaurant_contactos (restaurant_id, fecha DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.auditoria_plataforma (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  accion      text NOT NULL,
  tabla       text NOT NULL,
  registro_id uuid,
  antes       jsonb,
  despues     jsonb,
  motivo      text CHECK (motivo IS NULL OR char_length(motivo) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_plataforma_idx ON public.auditoria_plataforma (created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_plataforma_tabla_idx ON public.auditoria_plataforma (tabla, created_at DESC);

-- Nadie edita ni borra el registro de cambios.
CREATE OR REPLACE FUNCTION public._auditoria_inmutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION 'El registro de cambios no se puede editar ni borrar'; END; $function$;
CREATE TRIGGER auditoria_plataforma_no_editar BEFORE UPDATE OR DELETE ON public.auditoria_plataforma
  FOR EACH ROW EXECUTE FUNCTION public._auditoria_inmutable();
CREATE TRIGGER auditoria_plataforma_no_truncar BEFORE TRUNCATE ON public.auditoria_plataforma
  FOR EACH STATEMENT EXECUTE FUNCTION public._auditoria_inmutable();

-- Sin permisos directos: todo pasa por funciones del dueño de la plataforma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendedores','restaurant_crm','restaurant_contactos','auditoria_plataforma'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Escribe una línea en el registro de cambios. Solo la llaman otras funciones del panel (no es pública).
CREATE OR REPLACE FUNCTION public._auditar(p_accion text, p_tabla text, p_registro uuid, p_antes jsonb, p_despues jsonb, p_motivo text DEFAULT NULL)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO auditoria_plataforma (actor_id, accion, tabla, registro_id, antes, despues, motivo)
  VALUES (auth.uid(), p_accion, p_tabla, p_registro, p_antes, p_despues, NULLIF(btrim(p_motivo), ''));
$function$;
REVOKE ALL ON FUNCTION public._auditar(text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Todo restaurante nuevo nace con su ficha de seguimiento (por la vía que sea que se cree).
CREATE OR REPLACE FUNCTION public._crm_ficha_nueva() RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO restaurant_crm (restaurant_id) VALUES (NEW.id) ON CONFLICT (restaurant_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._crm_ficha_nueva() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER restaurants_crm_ficha AFTER INSERT ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public._crm_ficha_nueva();

-- Fichas de los restaurantes que ya existen, con su estado comercial inicial.
INSERT INTO public.restaurant_crm (restaurant_id, estado_comercial)
SELECT r.id, CASE r.slug WHEN 'cholaos' THEN 'piloto' WHEN 'bremantia' THEN 'piloto' WHEN 'demo' THEN 'demo' ELSE 'prueba' END
  FROM public.restaurants r
ON CONFLICT (restaurant_id) DO NOTHING;
