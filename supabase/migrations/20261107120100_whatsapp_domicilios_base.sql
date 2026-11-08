-- WhatsApp + domicilios, paso 2: dejar la base lista para el bot SIN conectar todavía ninguna API.
-- Diseño en docs/informes/FIDELIZACION_ARQUITECTURA.md (sección WhatsApp y domicilios).
--
--  * WhatsApp arranca DESACTIVADO (wa_config.modo = 'desactivado'). Mientras esté así, nada se encola ni se "simula" enviado.
--  * Todo mensaje saliente pasa por UNA cola (wa_mensajes, estado 'en_cola'). Un worker (Edge Function, aún no existe) la enviará.
--  * Los mensajes entrantes llegarán por un webhook (aún no existe) con rol de servicio; wa_message_id evita duplicados.
--  * Los tokens/secretos de la API NO se guardan en tablas: solo el NOMBRE del secreto en Supabase (secreto_nombre).
--  * Mensajes a clientes con fines comerciales (campaña / ARM) exigen consentimiento. Los de estado de pedido no.
--  * No se toca orders.status ni el cobro: el domicilio es una capa aparte que apunta al pedido.

-- ─── Repartidores / empresa de reparto (se configuran en Configuración) ─────
CREATE TABLE IF NOT EXISTS public.repartidores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre        text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 80),
  empresa       text CHECK (empresa IS NULL OR char_length(empresa) <= 80),
  telefono      text NOT NULL CHECK (telefono ~ '^[0-9]{8,15}$'),     -- WhatsApp, solo dígitos con indicativo
  activo        boolean NOT NULL DEFAULT true,
  notas         text CHECK (notas IS NULL OR char_length(notas) <= 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, telefono)
);
ALTER TABLE public.repartidores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.repartidores FROM anon;
REVOKE DELETE ON public.repartidores FROM authenticated;
CREATE POLICY "repartidores: leen admin y cajero" ON public.repartidores FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));
CREATE POLICY "repartidores: crea el admin" ON public.repartidores FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "repartidores: edita el admin" ON public.repartidores FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER repartidores_set_updated_at BEFORE UPDATE ON public.repartidores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Configuración de WhatsApp por restaurante ──────────────────────────────
-- numero_negocio es el número conectado a la API (puede ser distinto del WhatsApp de contacto de restaurant_config).
CREATE TABLE IF NOT EXISTS public.wa_config (
  restaurant_id   uuid PRIMARY KEY DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  modo            text NOT NULL DEFAULT 'desactivado' CHECK (modo IN ('desactivado','manual','bot')),
  proveedor       text CHECK (proveedor IS NULL OR proveedor IN ('meta_cloud','twilio','360dialog','otro')),
  numero_negocio  text CHECK (numero_negocio IS NULL OR numero_negocio ~ '^[0-9]{8,15}$'),
  phone_number_id text CHECK (phone_number_id IS NULL OR char_length(phone_number_id) <= 60),
  waba_id         text CHECK (waba_id IS NULL OR char_length(waba_id) <= 60),
  secreto_nombre  text CHECK (secreto_nombre IS NULL OR char_length(secreto_nombre) <= 80),   -- nombre del secreto en Supabase, NUNCA el token
  verificado_at   timestamptz,                                                                -- lo marca la prueba de conexión (futura)
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (modo = 'desactivado' OR (proveedor IS NOT NULL AND numero_negocio IS NOT NULL))
);
ALTER TABLE public.wa_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_config FROM anon;
REVOKE DELETE ON public.wa_config FROM authenticated;
CREATE POLICY "wa_config: lee el admin" ON public.wa_config FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "wa_config: crea el admin" ON public.wa_config FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "wa_config: edita el admin" ON public.wa_config FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER wa_config_set_updated_at BEFORE UPDATE ON public.wa_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Plantillas (WhatsApp solo deja iniciar conversación con plantillas aprobadas por Meta) ─
CREATE TABLE IF NOT EXISTS public.wa_plantillas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre        text NOT NULL CHECK (nombre ~ '^[a-z0-9_]{3,60}$'),     -- el nombre técnico que exige Meta
  uso           text NOT NULL CHECK (uso IN ('estado_pedido','repartidor','bienvenida','promocion','otro')),
  categoria     text NOT NULL DEFAULT 'utility' CHECK (categoria IN ('utility','marketing','authentication')),
  idioma        text NOT NULL DEFAULT 'es',
  cuerpo        text NOT NULL CHECK (char_length(cuerpo) BETWEEN 3 AND 1024),
  variables     text[] NOT NULL DEFAULT '{}',
  estado_meta   text NOT NULL DEFAULT 'borrador' CHECK (estado_meta IN ('borrador','enviada','aprobada','rechazada')),
  activa        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, nombre)
);
ALTER TABLE public.wa_plantillas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_plantillas FROM anon;
REVOKE DELETE ON public.wa_plantillas FROM authenticated;
CREATE POLICY "wa_plantillas: leen admin y cajero" ON public.wa_plantillas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));
CREATE POLICY "wa_plantillas: crea el admin" ON public.wa_plantillas FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "wa_plantillas: edita el admin" ON public.wa_plantillas FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER wa_plantillas_set_updated_at BEFORE UPDATE ON public.wa_plantillas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Conversaciones (una por teléfono y restaurante) ────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_conversaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  telefono           text NOT NULL CHECK (telefono ~ '^[0-9]{8,15}$'),
  tipo_contacto      text NOT NULL DEFAULT 'cliente' CHECK (tipo_contacto IN ('cliente','repartidor','otro')),
  cliente_id         uuid REFERENCES public.clientes (id),
  repartidor_id      uuid REFERENCES public.repartidores (id),
  nombre_perfil      text CHECK (nombre_perfil IS NULL OR char_length(nombre_perfil) <= 120),
  estado             text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','esperando_humano','cerrada')),
  flujo              text CHECK (flujo IS NULL OR flujo IN ('pedido','repartidor','soporte','promocion')),
  contexto           jsonb NOT NULL DEFAULT '{}'::jsonb,        -- estado del bot en esta conversación (carrito en curso, paso, etc.)
  ultimo_entrante_at timestamptz,                               -- WhatsApp solo permite texto libre dentro de las 24 h siguientes
  ultimo_mensaje_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, telefono)
);
CREATE INDEX IF NOT EXISTS wa_conversaciones_rest_idx ON public.wa_conversaciones (restaurant_id, ultimo_mensaje_at DESC);
ALTER TABLE public.wa_conversaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_conversaciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.wa_conversaciones FROM authenticated;
CREATE POLICY "wa_conversaciones: admin y cajero leen" ON public.wa_conversaciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Mensajes: entrantes + COLA de salientes ────────────────────────────────
-- campana_id se agrega en el paso 3 (cuando exista fid_campanas).
CREATE TABLE IF NOT EXISTS public.wa_mensajes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  conversacion_id  uuid NOT NULL REFERENCES public.wa_conversaciones (id),
  direccion        text NOT NULL CHECK (direccion IN ('entrante','saliente')),
  tipo             text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','plantilla','ubicacion','imagen','audio','documento','otro')),
  contenido        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- texto: {texto}; plantilla: {plantilla, vars}; ubicación: {lat,lng}
  plantilla_id     uuid REFERENCES public.wa_plantillas (id),
  origen           text NOT NULL DEFAULT 'sistema' CHECK (origen IN ('bot','manual','campana','arm','sistema','cliente')),
  domicilio_id     uuid,                                  -- FK se agrega abajo (domicilios se crea después)
  estado           text NOT NULL CHECK (estado IN ('en_cola','enviando','enviado','entregado','leido','fallido','recibido')),
  wa_message_id    text,                                  -- id que asigna WhatsApp: evita procesar dos veces el mismo webhook
  error            text CHECK (error IS NULL OR char_length(error) <= 500),
  intentos         int NOT NULL DEFAULT 0,
  programado_para  timestamptz NOT NULL DEFAULT now(),
  enviado_at       timestamptz,
  creado_por       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_mensajes_wa_id_uq ON public.wa_mensajes (restaurant_id, wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensajes_cola_idx ON public.wa_mensajes (programado_para) WHERE estado = 'en_cola';
CREATE INDEX IF NOT EXISTS wa_mensajes_conv_idx ON public.wa_mensajes (conversacion_id, created_at DESC);
ALTER TABLE public.wa_mensajes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_mensajes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.wa_mensajes FROM authenticated;
CREATE POLICY "wa_mensajes: admin y cajero leen" ON public.wa_mensajes FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Domicilios ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.domicilios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  order_id           uuid NOT NULL UNIQUE REFERENCES public.orders (id),
  cliente_id         uuid REFERENCES public.clientes (id),
  conversacion_id    uuid REFERENCES public.wa_conversaciones (id),
  contacto_nombre    text CHECK (contacto_nombre IS NULL OR char_length(contacto_nombre) <= 120),
  contacto_telefono  text CHECK (contacto_telefono IS NULL OR contacto_telefono ~ '^[0-9]{8,15}$'),
  direccion          text NOT NULL CHECK (char_length(btrim(direccion)) BETWEEN 5 AND 300),
  referencia         text CHECK (referencia IS NULL OR char_length(referencia) <= 300),
  lat                numeric CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng                numeric CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  costo_envio        numeric NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
  estado             text NOT NULL DEFAULT 'recibido' CHECK (estado IN
                       ('recibido','confirmado','preparando','listo','buscando_repartidor','asignado','recogido','en_camino','entregado','cancelado','fallido')),
  repartidor_id      uuid REFERENCES public.repartidores (id),
  eta_min            int CHECK (eta_min IS NULL OR eta_min BETWEEN 0 AND 600),
  seguimiento_token  text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  motivo             text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  entregado_at       timestamptz
);
CREATE INDEX IF NOT EXISTS domicilios_rest_estado_idx ON public.domicilios (restaurant_id, estado, created_at DESC);
ALTER TABLE public.domicilios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domicilios FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.domicilios FROM authenticated;
CREATE POLICY "domicilios: leen admin, cajero y mesero" ON public.domicilios FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE TRIGGER domicilios_set_updated_at BEFORE UPDATE ON public.domicilios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.wa_mensajes ADD CONSTRAINT wa_mensajes_domicilio_fk FOREIGN KEY (domicilio_id) REFERENCES public.domicilios (id);

CREATE TABLE IF NOT EXISTS public.domicilio_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  domicilio_id  uuid NOT NULL REFERENCES public.domicilios (id),
  estado        text NOT NULL,
  origen        text NOT NULL DEFAULT 'manual' CHECK (origen IN ('sistema','bot','repartidor','manual')),
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS domicilio_eventos_dom_idx ON public.domicilio_eventos (domicilio_id, created_at);
ALTER TABLE public.domicilio_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domicilio_eventos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.domicilio_eventos FROM authenticated;
CREATE POLICY "domicilio_eventos: leen admin, cajero y mesero" ON public.domicilio_eventos FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE TRIGGER domicilio_eventos_no_update BEFORE UPDATE ON public.domicilio_eventos FOR EACH ROW EXECUTE FUNCTION public._fid_no_editar();

-- Posiciones que el repartidor comparte por WhatsApp (ubicación en tiempo real): alimentan el mapa de seguimiento.
CREATE TABLE IF NOT EXISTS public.domicilio_ubicaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  domicilio_id  uuid NOT NULL REFERENCES public.domicilios (id),
  lat           numeric NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           numeric NOT NULL CHECK (lng BETWEEN -180 AND 180),
  fuente        text NOT NULL DEFAULT 'whatsapp' CHECK (fuente IN ('whatsapp','manual')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS domicilio_ubic_idx ON public.domicilio_ubicaciones (domicilio_id, created_at DESC);
ALTER TABLE public.domicilio_ubicaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domicilio_ubicaciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.domicilio_ubicaciones FROM authenticated;
CREATE POLICY "domicilio_ubicaciones: leen admin y cajero" ON public.domicilio_ubicaciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ═══════════════════════════ FUNCIONES INTERNAS ═══════════════════════════

-- ¿WhatsApp está encendido para este restaurante?
CREATE OR REPLACE FUNCTION public._wa_activo(p_rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT modo <> 'desactivado' FROM wa_config WHERE restaurant_id = p_rid), false);
$$;

-- Pone un mensaje en la cola. Si WhatsApp está desactivado NO hace nada (devuelve NULL): nunca se simula un envío.
CREATE OR REPLACE FUNCTION public._wa_encolar(
  p_rid uuid, p_telefono text, p_tipo_contacto text, p_cliente_id uuid, p_repartidor_id uuid,
  p_tipo text, p_contenido jsonb, p_plantilla_id uuid, p_origen text, p_domicilio_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_conv uuid; v_msg uuid;
BEGIN
  IF NOT _wa_activo(p_rid) OR p_telefono IS NULL THEN RETURN NULL; END IF;
  INSERT INTO wa_conversaciones (restaurant_id, telefono, tipo_contacto, cliente_id, repartidor_id, ultimo_mensaje_at)
  VALUES (p_rid, p_telefono, p_tipo_contacto, p_cliente_id, p_repartidor_id, now())
  ON CONFLICT (restaurant_id, telefono) DO UPDATE
     SET ultimo_mensaje_at = now(),
         cliente_id = COALESCE(wa_conversaciones.cliente_id, EXCLUDED.cliente_id),
         repartidor_id = COALESCE(wa_conversaciones.repartidor_id, EXCLUDED.repartidor_id)
  RETURNING id INTO v_conv;
  INSERT INTO wa_mensajes (restaurant_id, conversacion_id, direccion, tipo, contenido, plantilla_id, origen, domicilio_id, estado, creado_por)
  VALUES (p_rid, v_conv, 'saliente', p_tipo, p_contenido, p_plantilla_id, p_origen, p_domicilio_id, 'en_cola', auth.uid())
  RETURNING id INTO v_msg;
  RETURN v_msg;
END;
$$;

-- Aviso de cambio de estado al cliente. Solo si hay una plantilla de estado ACTIVA y APROBADA por Meta con el nombre dom_<estado>.
CREATE OR REPLACE FUNCTION public._dom_avisar_cliente(p_dom_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d domicilios%ROWTYPE; t wa_plantillas%ROWTYPE; v_tel text; v_nombre text;
BEGIN
  SELECT * INTO d FROM domicilios WHERE id = p_dom_id;
  IF NOT FOUND OR NOT _wa_activo(d.restaurant_id) THEN RETURN; END IF;
  SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = d.restaurant_id AND uso = 'estado_pedido' AND nombre = 'dom_' || d.estado AND activa AND estado_meta = 'aprobada';
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(d.contacto_telefono, c.telefono), COALESCE(d.contacto_nombre, c.nombre) INTO v_tel, v_nombre
    FROM (SELECT 1) x LEFT JOIN clientes c ON c.id = d.cliente_id;
  IF v_tel IS NULL THEN RETURN; END IF;
  PERFORM _wa_encolar(d.restaurant_id, v_tel, 'cliente', d.cliente_id, NULL, 'plantilla',
    jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma,
                       'vars', jsonb_build_object('nombre', split_part(COALESCE(v_nombre, ''), ' ', 1), 'estado', d.estado, 'eta_min', d.eta_min, 'token', d.seguimiento_token)),
    t.id, 'sistema', d.id);
END;
$$;

-- ═══════════════════════════ FUNCIONES PÚBLICAS (RPC) ═══════════════════════════

-- Crear el domicilio de un pedido ya existente (tipo DOMICILIO). Administrador, cajero o mesero.
CREATE OR REPLACE FUNCTION public.dom_crear(
  p_order_id uuid, p_direccion text, p_referencia text DEFAULT NULL, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_costo_envio numeric DEFAULT 0, p_cliente_id uuid DEFAULT NULL, p_contacto_nombre text DEFAULT NULL, p_contacto_telefono text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_id uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para crear domicilios'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND restaurant_id = v_rid AND tipo_pedido = 'DOMICILIO' AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'El pedido no existe o no es de tipo domicilio';
  END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid) THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  INSERT INTO domicilios (restaurant_id, order_id, cliente_id, contacto_nombre, contacto_telefono, direccion, referencia, lat, lng, costo_envio)
  VALUES (v_rid, p_order_id, p_cliente_id, NULLIF(btrim(p_contacto_nombre), ''), _fid_tel(p_contacto_telefono), btrim(p_direccion), NULLIF(btrim(p_referencia), ''), p_lat, p_lng, COALESCE(p_costo_envio, 0))
  RETURNING id INTO v_id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, creado_por) VALUES (v_rid, v_id, 'recibido', 'manual', auth.uid());
  RETURN v_id;
END;
$$;

-- Cambiar el estado (solo pasos válidos). Administrador o cajero. Avisa al cliente solo si WhatsApp está activo y hay plantilla aprobada.
CREATE OR REPLACE FUNCTION public.dom_cambiar_estado(p_id uuid, p_estado text, p_eta_min int DEFAULT NULL, p_motivo text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; v_ok text[];
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero cambian el estado del domicilio'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  v_ok := CASE d.estado
    WHEN 'recibido'            THEN ARRAY['confirmado','cancelado']
    WHEN 'confirmado'          THEN ARRAY['preparando','cancelado']
    WHEN 'preparando'          THEN ARRAY['listo','cancelado']
    WHEN 'listo'               THEN ARRAY['buscando_repartidor','asignado','cancelado']
    WHEN 'buscando_repartidor' THEN ARRAY['asignado','cancelado','fallido']
    WHEN 'asignado'            THEN ARRAY['recogido','buscando_repartidor','cancelado']
    WHEN 'recogido'            THEN ARRAY['en_camino','fallido']
    WHEN 'en_camino'           THEN ARRAY['entregado','fallido']
    ELSE ARRAY[]::text[] END;
  IF NOT (p_estado = ANY (v_ok)) THEN RAISE EXCEPTION 'No se puede pasar de "%" a "%"', d.estado, p_estado; END IF;
  IF p_estado IN ('cancelado','fallido') AND char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  UPDATE domicilios SET estado = p_estado, eta_min = COALESCE(p_eta_min, eta_min), motivo = COALESCE(NULLIF(btrim(p_motivo), ''), motivo),
         entregado_at = CASE WHEN p_estado = 'entregado' THEN now() ELSE entregado_at END
   WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, p_estado, 'manual', jsonb_build_object('motivo', p_motivo, 'eta_min', p_eta_min), auth.uid());
  PERFORM _dom_avisar_cliente(d.id);
END;
$$;

-- Asignar repartidor. Administrador o cajero. Si WhatsApp está activo y hay plantilla aprobada, se le encola el aviso al repartidor.
CREATE OR REPLACE FUNCTION public.dom_asignar_repartidor(p_id uuid, p_repartidor_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; r repartidores%ROWTYPE; t wa_plantillas%ROWTYPE; v_nombre text;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero asignan repartidores'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.estado NOT IN ('listo','buscando_repartidor','asignado') THEN RAISE EXCEPTION 'El pedido aún no está listo para asignar repartidor'; END IF;
  SELECT * INTO r FROM repartidores WHERE id = p_repartidor_id AND restaurant_id = v_rid AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado o inactivo'; END IF;
  UPDATE domicilios SET repartidor_id = r.id, estado = 'asignado' WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, 'asignado', 'manual', jsonb_build_object('repartidor', r.nombre), auth.uid());
  d.estado := 'asignado';
  PERFORM _dom_avisar_cliente(d.id);
  IF _wa_activo(v_rid) THEN
    SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = v_rid AND uso = 'repartidor' AND nombre = 'dom_asignado' AND activa AND estado_meta = 'aprobada';
    IF FOUND THEN
      SELECT COALESCE(d.contacto_nombre, c.nombre) INTO v_nombre FROM (SELECT 1) x LEFT JOIN clientes c ON c.id = d.cliente_id;
      PERFORM _wa_encolar(v_rid, r.telefono, 'repartidor', NULL, r.id, 'plantilla',
        jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma,
          'vars', jsonb_build_object('direccion', d.direccion, 'referencia', d.referencia, 'lat', d.lat, 'lng', d.lng,
                                     'cliente', split_part(COALESCE(v_nombre, ''), ' ', 1), 'costo_envio', d.costo_envio)),
        t.id, 'sistema', d.id);
    END IF;
  END IF;
END;
$$;

-- Seguimiento público: el cliente abre su enlace con el código. Sin sesión. Sin teléfonos ni datos de pago.
CREATE OR REPLACE FUNCTION public.dom_seguimiento_publico(p_token text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d domicilios%ROWTYPE; r restaurants%ROWTYPE; rep repartidores%ROWTYPE; u_lat numeric; u_lng numeric; u_at timestamptz; v_ev json;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO d FROM domicilios WHERE seguimiento_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r FROM restaurants WHERE id = d.restaurant_id;
  IF d.repartidor_id IS NOT NULL THEN SELECT * INTO rep FROM repartidores WHERE id = d.repartidor_id; END IF;
  IF d.estado IN ('recogido','en_camino') THEN
    SELECT lat, lng, created_at INTO u_lat, u_lng, u_at FROM domicilio_ubicaciones WHERE domicilio_id = d.id ORDER BY created_at DESC LIMIT 1;
  END IF;
  SELECT COALESCE(json_agg(e ORDER BY e.at), '[]'::json) INTO v_ev
    FROM (SELECT estado, created_at AS at FROM domicilio_eventos WHERE domicilio_id = d.id) e;
  RETURN json_build_object(
    'restaurante', r.name, 'estado', d.estado, 'eta_min', d.eta_min, 'direccion', d.direccion,
    'destino', CASE WHEN d.lat IS NULL THEN NULL ELSE json_build_object('lat', d.lat, 'lng', d.lng) END,
    'repartidor', CASE WHEN rep.id IS NULL THEN NULL ELSE split_part(btrim(rep.nombre), ' ', 1) END,
    'ubicacion_repartidor', CASE WHEN u_lat IS NULL THEN NULL ELSE json_build_object('lat', u_lat, 'lng', u_lng, 'at', u_at) END,
    'eventos', v_ev);
END;
$$;

-- Mensaje manual a un cliente (administrador o cajero). Reglas: WhatsApp activo; texto libre solo dentro de las 24 h
-- desde el último mensaje del cliente (si no, usar plantilla); los de promoción exigen consentimiento.
CREATE OR REPLACE FUNCTION public.wa_enviar_manual(p_cliente_id uuid, p_texto text DEFAULT NULL, p_plantilla text DEFAULT NULL, p_vars jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c clientes%ROWTYPE; t wa_plantillas%ROWTYPE; v_ult timestamptz; v_msg uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero envían mensajes'; END IF;
  IF NOT _wa_activo(v_rid) THEN RAISE EXCEPTION 'WhatsApp no está activado en este restaurante'; END IF;
  SELECT * INTO c FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid AND activo;
  IF NOT FOUND OR c.telefono IS NULL THEN RAISE EXCEPTION 'El cliente no existe o no tiene teléfono'; END IF;
  IF p_plantilla IS NOT NULL THEN
    SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = v_rid AND nombre = p_plantilla AND activa AND estado_meta = 'aprobada';
    IF NOT FOUND THEN RAISE EXCEPTION 'La plantilla no existe o aún no está aprobada por WhatsApp'; END IF;
    IF t.categoria = 'marketing' AND NOT c.consentimiento_marketing THEN RAISE EXCEPTION 'El cliente no aceptó recibir promociones'; END IF;
    v_msg := _wa_encolar(v_rid, c.telefono, 'cliente', c.id, NULL, 'plantilla', jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma, 'vars', COALESCE(p_vars, '{}'::jsonb)), t.id, 'manual');
  ELSE
    IF char_length(btrim(COALESCE(p_texto, ''))) < 1 THEN RAISE EXCEPTION 'Escribe el mensaje'; END IF;
    SELECT ultimo_entrante_at INTO v_ult FROM wa_conversaciones WHERE restaurant_id = v_rid AND telefono = c.telefono;
    IF v_ult IS NULL OR v_ult < now() - interval '24 hours' THEN
      RAISE EXCEPTION 'Pasaron más de 24 horas desde el último mensaje del cliente: usa una plantilla aprobada';
    END IF;
    v_msg := _wa_encolar(v_rid, c.telefono, 'cliente', c.id, NULL, 'texto', jsonb_build_object('texto', btrim(p_texto)), NULL, 'manual');
  END IF;
  RETURN v_msg;
END;
$$;

REVOKE ALL ON FUNCTION public._wa_activo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._wa_encolar(uuid, text, text, uuid, uuid, text, jsonb, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dom_avisar_cliente(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dom_crear(uuid, text, text, numeric, numeric, numeric, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cambiar_estado(uuid, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_asignar_repartidor(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_seguimiento_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wa_enviar_manual(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dom_crear(uuid, text, text, numeric, numeric, numeric, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cambiar_estado(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_asignar_repartidor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_seguimiento_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_enviar_manual(uuid, text, text, jsonb) TO authenticated;
