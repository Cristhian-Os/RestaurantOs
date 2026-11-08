-- WhatsApp · paso 6: el bot (webhook + cola de envío). Diseño en docs/informes/WHATSAPP_PASO_A_PRODUCCION.md
--  * Credenciales de Meta: SOLO escritura desde el navegador. La app de Meta es UNA para toda la plataforma
--    (app_secret y verify_token son de la plataforma); el access_token es de cada restaurante.
--    Los valores viven cifrados en Supabase Vault; las tablas solo guardan el id del secreto.
--    Ninguna función devuelve un secreto al navegador: solo las lee el rol de servicio (Edge Functions).
--  * Lo que escribe el bot (mensajes entrantes, estados, cierre de entrega, comprobantes) pasa por funciones
--    SOLO de servicio; el navegador no puede llamarlas.
--  * No toca el cobro ni orders.status.

-- ─── Tablas de credenciales (cerradas: sin políticas, sin permisos para anon ni authenticated) ───
CREATE TABLE IF NOT EXISTS public.wa_plataforma (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),     -- una sola fila
  app_secret_id    uuid,                                            -- vault.secrets.id
  verify_token_id  uuid,
  cron_secret_id   uuid,                                            -- lo exige whatsapp-enviar en la cabecera x-cron-secret
  access_token_id  uuid,                                            -- token de la plataforma (usuario del sistema): sirve para todos los números salvo que un restaurante tenga el suyo
  updated_at       timestamptz                                      -- se llena al guardar app_secret / verify_token
);
CREATE TABLE IF NOT EXISTS public.wa_credenciales (
  restaurant_id    uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  access_token_id  uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Quién pidió no recibir más mensajes (BAJA). No exige que exista como cliente.
CREATE TABLE IF NOT EXISTS public.wa_bajas (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  telefono      text NOT NULL CHECK (telefono ~ '^[0-9]{8,15}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, telefono)
);
ALTER TABLE public.wa_plataforma   ADD COLUMN IF NOT EXISTS access_token_id uuid;   -- (por si la tabla ya existía sin esta columna)
ALTER TABLE public.wa_plataforma   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bajas        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_plataforma, public.wa_credenciales, public.wa_bajas FROM PUBLIC, anon, authenticated;

-- Al borrar las credenciales (o el restaurante) se borra también el secreto del Vault.
CREATE OR REPLACE FUNCTION public._wa_cred_borrar_secreto() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = OLD.access_token_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS wa_credenciales_borra_secreto ON public.wa_credenciales;
CREATE TRIGGER wa_credenciales_borra_secreto AFTER DELETE ON public.wa_credenciales FOR EACH ROW EXECUTE FUNCTION public._wa_cred_borrar_secreto();

-- Un mismo número de WhatsApp no puede pertenecer a dos restaurantes (el webhook enruta por este dato).
CREATE UNIQUE INDEX IF NOT EXISTS wa_config_phone_uq ON public.wa_config (phone_number_id) WHERE phone_number_id IS NOT NULL;

ALTER TABLE public.domicilios ADD COLUMN IF NOT EXISTS recordatorio_entrega_at timestamptz;   -- ya se le pidió al repartidor confirmar la entrega

-- Fila única de plataforma + secreto de cron (generado aquí, nunca escrito en el archivo).
INSERT INTO public.wa_plataforma (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
UPDATE public.wa_plataforma
   SET cron_secret_id = vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'wa_cron_secret', 'WhatsApp: secreto de la cola de envío')
 WHERE id AND cron_secret_id IS NULL;

-- Guarda/actualiza un secreto en Vault y devuelve su id.
CREATE OR REPLACE FUNCTION public._wa_guardar_secreto(p_id uuid, p_valor text, p_nombre text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = p_id) THEN
    PERFORM vault.update_secret(p_id, p_valor);
    RETURN p_id;
  END IF;
  DELETE FROM vault.secrets WHERE name = p_nombre;
  RETURN vault.create_secret(p_valor, p_nombre);
END;
$$;

-- ═════════════ RPC del superadmin (el navegador SOLO escribe; nunca lee un secreto) ═════════════

DROP FUNCTION IF EXISTS public.wa_plataforma_guardar(text, text);   -- versión de 2 argumentos: se borra para no dejar sobrecarga
CREATE OR REPLACE FUNCTION public.wa_plataforma_guardar(p_app_secret text DEFAULT NULL, p_verify_token text DEFAULT NULL, p_access_token text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_app text := NULLIF(btrim(p_app_secret), ''); v_ver text := NULLIF(btrim(p_verify_token), ''); v_tok text := NULLIF(btrim(p_access_token), '');
BEGIN
  IF get_user_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo el superadmin'; END IF;
  IF char_length(COALESCE(v_app, '')) > 500 OR char_length(COALESCE(v_ver, '')) > 500 OR char_length(COALESCE(v_tok, '')) > 1000 THEN RAISE EXCEPTION 'Valor demasiado largo'; END IF;
  INSERT INTO wa_plataforma (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
  UPDATE wa_plataforma SET
    app_secret_id   = CASE WHEN v_app IS NULL THEN app_secret_id   ELSE _wa_guardar_secreto(app_secret_id,   v_app, 'wa_app_secret')   END,
    verify_token_id = CASE WHEN v_ver IS NULL THEN verify_token_id ELSE _wa_guardar_secreto(verify_token_id, v_ver, 'wa_verify_token') END,
    access_token_id = CASE WHEN v_tok IS NULL THEN access_token_id ELSE _wa_guardar_secreto(access_token_id, v_tok, 'wa_platform_token') END,
    updated_at      = CASE WHEN v_app IS NULL AND v_ver IS NULL AND v_tok IS NULL THEN updated_at ELSE now() END
  WHERE id;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_plataforma_estado() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p wa_plataforma%ROWTYPE;
BEGIN
  IF get_user_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo el superadmin'; END IF;
  SELECT * INTO p FROM wa_plataforma WHERE id;
  RETURN jsonb_build_object('tiene_app_secret', p.app_secret_id IS NOT NULL, 'tiene_verify_token', p.verify_token_id IS NOT NULL, 'tiene_access_token', p.access_token_id IS NOT NULL, 'actualizado_at', p.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_credenciales_guardar(p_restaurant_id uuid, p_access_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tok text := NULLIF(btrim(p_access_token), ''); v_id uuid;
BEGIN
  IF get_user_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo el superadmin'; END IF;
  IF v_tok IS NULL OR char_length(v_tok) > 1000 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  SELECT access_token_id INTO v_id FROM wa_credenciales WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  v_id := _wa_guardar_secreto(v_id, v_tok, 'wa_token_' || p_restaurant_id::text);
  INSERT INTO wa_credenciales (restaurant_id, access_token_id, updated_at) VALUES (p_restaurant_id, v_id, now())
  ON CONFLICT (restaurant_id) DO UPDATE SET access_token_id = EXCLUDED.access_token_id, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_credenciales_estado(p_restaurant_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_at timestamptz; v_ok boolean;
BEGIN
  IF get_user_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo el superadmin'; END IF;
  SELECT true, updated_at INTO v_ok, v_at FROM wa_credenciales WHERE restaurant_id = p_restaurant_id;
  RETURN jsonb_build_object('tiene_token', COALESCE(v_ok, false), 'actualizado_at', v_at,
    'usa_plataforma', NOT COALESCE(v_ok, false) AND EXISTS (SELECT 1 FROM wa_plataforma WHERE access_token_id IS NOT NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_credenciales_borrar(p_restaurant_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF get_user_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo el superadmin'; END IF;
  DELETE FROM wa_credenciales WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- ═════════════ Funciones SOLO de servicio (Edge Functions) ═════════════

-- Secretos de la plataforma, descifrados. Únicamente el rol de servicio puede llamarla.
CREATE OR REPLACE FUNCTION public.wa_leer_plataforma() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'app_secret',   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p.app_secret_id),
    'verify_token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p.verify_token_id),
    'cron_secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p.cron_secret_id),
    'access_token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p.access_token_id))
  FROM wa_plataforma p WHERE p.id;
$$;

CREATE OR REPLACE FUNCTION public.wa_leer_token(p_rid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- token propio del restaurante si existe; si no, el de la plataforma
  SELECT COALESCE(
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = (SELECT access_token_id FROM wa_credenciales WHERE restaurant_id = p_rid)),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = (SELECT access_token_id FROM wa_plataforma WHERE id)));
$$;

-- phone_number_id de Meta → restaurante (solo si WhatsApp no está desactivado).
CREATE OR REPLACE FUNCTION public.wa_config_por_numero(p_phone_number_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('restaurant_id', restaurant_id, 'modo', modo) FROM wa_config WHERE phone_number_id = p_phone_number_id AND modo <> 'desactivado';
$$;

-- Guarda un mensaje entrante (y crea/actualiza la conversación). Ignora repetidos (mismo wa_message_id).
CREATE OR REPLACE FUNCTION public.wa_registrar_entrante(p_rid uuid, p_telefono text, p_nombre text, p_wa_id text, p_tipo text, p_contenido jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); v_rep uuid; v_cli uuid; v_conv uuid; v_msg uuid;
        v_tipo text := CASE WHEN p_tipo IN ('texto','imagen','audio','documento','ubicacion') THEN p_tipo ELSE 'otro' END;
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' OR p_wa_id IS NULL THEN RETURN jsonb_build_object('ignorado', true); END IF;
  SELECT id INTO v_rep FROM repartidores WHERE restaurant_id = p_rid AND telefono = v_tel AND activo;
  SELECT id INTO v_cli FROM clientes WHERE restaurant_id = p_rid AND telefono = v_tel AND activo;
  INSERT INTO wa_conversaciones (restaurant_id, telefono, tipo_contacto, cliente_id, repartidor_id, nombre_perfil)
  VALUES (p_rid, v_tel, CASE WHEN v_rep IS NOT NULL THEN 'repartidor' ELSE 'cliente' END,
          CASE WHEN v_rep IS NULL THEN v_cli END, v_rep, NULLIF(left(btrim(COALESCE(p_nombre, '')), 120), ''))
  ON CONFLICT (restaurant_id, telefono) DO UPDATE SET
    nombre_perfil = COALESCE(EXCLUDED.nombre_perfil, wa_conversaciones.nombre_perfil),
    cliente_id    = COALESCE(wa_conversaciones.cliente_id, EXCLUDED.cliente_id),
    repartidor_id = COALESCE(EXCLUDED.repartidor_id, wa_conversaciones.repartidor_id),
    tipo_contacto = CASE WHEN EXCLUDED.repartidor_id IS NOT NULL THEN 'repartidor' ELSE wa_conversaciones.tipo_contacto END
  RETURNING id INTO v_conv;
  INSERT INTO wa_mensajes (restaurant_id, conversacion_id, direccion, tipo, contenido, origen, estado, wa_message_id)
  VALUES (p_rid, v_conv, 'entrante', v_tipo, COALESCE(p_contenido, '{}'::jsonb), 'cliente', 'recibido', p_wa_id)
  ON CONFLICT (restaurant_id, wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN RETURN jsonb_build_object('duplicado', true); END IF;
  UPDATE wa_conversaciones SET ultimo_entrante_at = now(), ultimo_mensaje_at = now(),
         estado = CASE WHEN estado = 'cerrada' THEN 'abierta' ELSE estado END WHERE id = v_conv;
  UPDATE wa_config SET verificado_at = now() WHERE restaurant_id = p_rid AND verificado_at IS NULL;
  RETURN jsonb_build_object('duplicado', false, 'conversacion_id', v_conv, 'mensaje_id', v_msg, 'telefono', v_tel, 'es_repartidor', v_rep IS NOT NULL);
END;
$$;

-- Estado que Meta informa de un mensaje que enviamos. Nunca retrocede (leído no vuelve a entregado).
CREATE OR REPLACE FUNCTION public.wa_actualizar_estado(p_rid uuid, p_wa_id text, p_estado text, p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_estado NOT IN ('enviado','entregado','leido','fallido') OR p_wa_id IS NULL THEN RETURN; END IF;
  UPDATE wa_mensajes SET estado = p_estado, error = CASE WHEN p_estado = 'fallido' THEN left(COALESCE(p_error, 'WhatsApp no pudo entregar el mensaje'), 500) ELSE error END
   WHERE restaurant_id = p_rid AND wa_message_id = p_wa_id AND direccion = 'saliente'
     AND CASE estado WHEN 'enviando' THEN 1 WHEN 'enviado' THEN 2 WHEN 'entregado' THEN 3 WHEN 'leido' THEN 4 ELSE 9 END
       < CASE p_estado WHEN 'enviado' THEN 2 WHEN 'entregado' THEN 3 WHEN 'leido' THEN 4 ELSE 3 END;   -- "fallido" solo si aún estaba enviando/enviado
  UPDATE wa_config SET verificado_at = now() WHERE restaurant_id = p_rid AND verificado_at IS NULL;
END;
$$;

-- BAJA: deja de recibir avisos y promociones. Corta lo que ya estaba en cola y retira el consentimiento.
CREATE OR REPLACE FUNCTION public.wa_registrar_baja(p_rid uuid, p_telefono text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g');
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RETURN; END IF;
  INSERT INTO wa_bajas (restaurant_id, telefono) VALUES (p_rid, v_tel) ON CONFLICT DO NOTHING;
  UPDATE clientes SET consentimiento_marketing = false, consentimiento_canal = NULL WHERE restaurant_id = p_rid AND telefono = v_tel AND consentimiento_marketing;
  UPDATE fid_campana_destinatarios d SET estado = 'omitido_sin_consentimiento'
    FROM clientes c WHERE c.id = d.cliente_id AND c.restaurant_id = p_rid AND c.telefono = v_tel AND d.estado = 'pendiente';
  UPDATE wa_mensajes m SET estado = 'fallido', error = 'El cliente pidió no recibir mensajes (BAJA)'
    FROM wa_conversaciones cv
   WHERE cv.id = m.conversacion_id AND cv.restaurant_id = p_rid AND cv.telefono = v_tel AND cv.tipo_contacto = 'cliente'
     AND m.estado = 'en_cola' AND m.direccion = 'saliente' AND m.origen IN ('campana','arm','sistema');
END;
$$;

-- Respuesta automática del bot: entra a la misma cola (origen 'bot').
CREATE OR REPLACE FUNCTION public.wa_bot_responder(p_rid uuid, p_telefono text, p_texto text, p_domicilio_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cv wa_conversaciones%ROWTYPE;
BEGIN
  SELECT * INTO cv FROM wa_conversaciones WHERE restaurant_id = p_rid AND telefono = p_telefono;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN _wa_encolar(p_rid, cv.telefono, cv.tipo_contacto, cv.cliente_id, cv.repartidor_id, 'texto', jsonb_build_object('texto', left(p_texto, 1000)), NULL, 'bot', p_domicilio_id);
END;
$$;

-- Tope de respuestas automáticas "genéricas": 1 cada 30 min por conversación. Siempre deja la conversación para el humano.
CREATE OR REPLACE FUNCTION public.wa_bot_menu_turno(p_conv uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ok boolean;
BEGIN
  WITH u AS (
    UPDATE wa_conversaciones SET contexto = contexto || jsonb_build_object('auto_at', now()), estado = 'esperando_humano'
     WHERE id = p_conv AND (NULLIF(contexto->>'auto_at', '') IS NULL OR (contexto->>'auto_at')::timestamptz < now() - interval '30 minutes')
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u) INTO v_ok;
  IF NOT v_ok THEN UPDATE wa_conversaciones SET estado = 'esperando_humano' WHERE id = p_conv AND estado = 'abierta'; END IF;
  RETURN v_ok;
END;
$$;

-- Domicilio abierto más reciente de un cliente (por teléfono). p_solo_pago: solo los que esperan comprobante de transferencia.
CREATE OR REPLACE FUNCTION public.wa_dom_de_cliente(p_rid uuid, p_telefono text, p_solo_pago boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); r record;
BEGIN
  SELECT d.id, d.estado, d.pago_estado, d.metodo_pago, d.eta_min, o.order_number_today AS numero INTO r
    FROM domicilios d LEFT JOIN orders o ON o.id = d.order_id
   WHERE d.restaurant_id = p_rid AND d.estado NOT IN ('entregado','cancelado','fallido')
     AND (d.contacto_telefono = v_tel OR (d.contacto_telefono IS NULL AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = d.cliente_id AND c.telefono = v_tel)))
     AND (NOT p_solo_pago OR (d.metodo_pago = 'transferencia' AND d.pago_estado IN ('pendiente_comprobante','comprobante_enviado')))
   ORDER BY d.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', r.id, 'estado', r.estado, 'pago_estado', r.pago_estado, 'metodo_pago', r.metodo_pago, 'eta_min', r.eta_min, 'numero', r.numero);
END;
$$;

-- Entregas en camino asignadas a un repartidor (por su teléfono).
CREATE OR REPLACE FUNCTION public.wa_dom_de_repartidor(p_rid uuid, p_telefono text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('n', count(*), 'numero', CASE WHEN count(*) = 1 THEN min(o.order_number_today) END)
    FROM domicilios d JOIN repartidores r ON r.id = d.repartidor_id AND r.activo
    LEFT JOIN orders o ON o.id = d.order_id
   WHERE d.restaurant_id = p_rid AND r.restaurant_id = p_rid AND r.telefono = regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g')
     AND d.estado IN ('recogido','en_camino');
$$;

-- El repartidor escribe el código de 4 números del cliente. Solo ve y cierra SUS entregas en camino.
-- Mismo conteo de intentos que dom_cerrar_entrega: tras 5 fallos queda bloqueado (lo cierra el cajero "sin código").
CREATE OR REPLACE FUNCTION public.dom_cerrar_entrega_bot(p_restaurant_id uuid, p_telefono text, p_codigo text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rep repartidores%ROWTYPE; d domicilios%ROWTYPE; v_cod text := btrim(COALESCE(p_codigo, '')); v_n int; v_libres int; v_max int; v_num int;
BEGIN
  SELECT * INTO rep FROM repartidores WHERE restaurant_id = p_restaurant_id AND activo AND telefono = regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'no_repartidor'); END IF;
  IF v_cod !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'formato'); END IF;
  PERFORM 1 FROM domicilios WHERE restaurant_id = p_restaurant_id AND repartidor_id = rep.id AND estado IN ('recogido','en_camino') ORDER BY id FOR UPDATE;
  SELECT count(*), count(*) FILTER (WHERE intentos_codigo < 5) INTO v_n, v_libres
    FROM domicilios WHERE restaurant_id = p_restaurant_id AND repartidor_id = rep.id AND estado IN ('recogido','en_camino');
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sin_pedido'); END IF;
  IF v_libres = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'bloqueado'); END IF;
  SELECT * INTO d FROM domicilios WHERE restaurant_id = p_restaurant_id AND repartidor_id = rep.id AND estado IN ('recogido','en_camino')
     AND codigo_entrega = v_cod AND intentos_codigo < 5 LIMIT 1;
  IF FOUND THEN
    UPDATE domicilios SET estado = 'entregado', entregado_at = now() WHERE id = d.id;
    INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle)
    VALUES (p_restaurant_id, d.id, 'entregado', 'repartidor', jsonb_build_object('con_codigo', true, 'via', 'whatsapp'));
    PERFORM _dom_avisar_cliente(d.id);
    SELECT order_number_today INTO v_num FROM orders WHERE id = d.order_id;
    RETURN jsonb_build_object('ok', true, 'numero', v_num);
  END IF;
  UPDATE domicilios SET intentos_codigo = intentos_codigo + 1
   WHERE restaurant_id = p_restaurant_id AND repartidor_id = rep.id AND estado IN ('recogido','en_camino') AND intentos_codigo < 5;
  SELECT max(intentos_codigo) INTO v_max FROM domicilios WHERE restaurant_id = p_restaurant_id AND repartidor_id = rep.id AND estado IN ('recogido','en_camino');
  RETURN jsonb_build_object('ok', false, 'motivo', 'incorrecto', 'restantes', greatest(0, 5 - v_max));
END;
$$;

-- El cliente manda la foto del comprobante por WhatsApp (el archivo ya está en el bucket). Mismo efecto que dom_adjuntar_comprobante.
-- Devuelve el id del domicilio, o NULL si el cliente no tiene ninguno esperando comprobante.
CREATE OR REPLACE FUNCTION public.dom_adjuntar_comprobante_bot(p_restaurant_id uuid, p_telefono text, p_path text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); d domicilios%ROWTYPE;
BEGIN
  SELECT d2.* INTO d FROM domicilios d2
   WHERE d2.restaurant_id = p_restaurant_id AND d2.metodo_pago = 'transferencia' AND d2.pago_estado IN ('pendiente_comprobante','comprobante_enviado')
     AND d2.estado NOT IN ('entregado','cancelado','fallido')
     AND (d2.contacto_telefono = v_tel OR (d2.contacto_telefono IS NULL AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = d2.cliente_id AND c.telefono = v_tel)))
   ORDER BY d2.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_path IS NULL OR p_path NOT LIKE p_restaurant_id::text || '/' || d.id::text || '-%' THEN RAISE EXCEPTION 'Ruta de comprobante inválida'; END IF;
  UPDATE domicilios SET comprobante_path = p_path, comprobante_at = now(), pago_estado = 'comprobante_enviado', pago_rechazo = NULL WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle)
  VALUES (p_restaurant_id, d.id, d.estado, 'bot', jsonb_build_object('pago', 'comprobante_enviado', 'via', 'whatsapp'));
  RETURN d.id;
END;
$$;

-- Recordatorio al repartidor: pasados N minutos (wa_config.minutos_confirmar_entrega) desde que salió con el pedido
-- y sin cierre, se le pide UNA vez el código del cliente. Devuelve cuántos recordatorios encoló.
CREATE OR REPLACE FUNCTION public.wa_recordar_repartidores() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; t wa_plantillas%ROWTYPE; v_n int := 0; v_txt text; v_found boolean;
BEGIN
  FOR r IN
    SELECT d.id, d.restaurant_id, d.repartidor_id, rep.telefono, o.order_number_today AS numero
      FROM domicilios d
      JOIN wa_config c ON c.restaurant_id = d.restaurant_id AND c.modo <> 'desactivado'
      JOIN repartidores rep ON rep.id = d.repartidor_id AND rep.activo
      LEFT JOIN orders o ON o.id = d.order_id
     WHERE d.estado IN ('recogido','en_camino') AND d.recordatorio_entrega_at IS NULL
       AND COALESCE((SELECT min(e.created_at) FROM domicilio_eventos e WHERE e.domicilio_id = d.id AND e.estado IN ('recogido','en_camino')), d.created_at)
           <= now() - make_interval(mins => c.minutos_confirmar_entrega)
       FOR UPDATE OF d SKIP LOCKED
  LOOP
    UPDATE domicilios SET recordatorio_entrega_at = now() WHERE id = r.id;
    SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = r.restaurant_id AND nombre = 'dom_recordar_entrega' AND uso = 'repartidor' AND activa AND estado_meta = 'aprobada';
    v_found := FOUND;
    v_txt := '¿Ya entregaste el pedido #' || COALESCE(r.numero::text, '') || '? Escribe el código de 4 números del cliente.';
    IF v_found THEN   -- fuera de las 24 h solo se puede con plantilla aprobada
      PERFORM _wa_encolar(r.restaurant_id, r.telefono, 'repartidor', NULL, r.repartidor_id, 'plantilla',
        jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma, 'vars', jsonb_build_object('numero', COALESCE(r.numero::text, ''))), t.id, 'sistema', r.id);
    ELSE
      PERFORM _wa_encolar(r.restaurant_id, r.telefono, 'repartidor', NULL, r.repartidor_id, 'texto', jsonb_build_object('texto', v_txt), NULL, 'sistema', r.id);
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Cola de envío: toma hasta p_limite mensajes vencidos y los pasa a 'enviando' (FOR UPDATE SKIP LOCKED: dos llamadas
-- a la vez nunca toman el mismo). Salta restaurantes sin credenciales o desactivados. Devuelve lo necesario para enviar.
CREATE OR REPLACE FUNCTION public.wa_reclamar_cola(p_limite int DEFAULT 20) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Envíos que quedaron "enviando" por un corte: se reintentan (o fallan si ya agotaron los intentos).
  UPDATE wa_mensajes SET estado = CASE WHEN intentos + 1 >= 3 THEN 'fallido' ELSE 'en_cola' END, intentos = intentos + 1,
         error = 'El envío se interrumpió; se reintenta', programado_para = now()
   WHERE direccion = 'saliente' AND estado = 'enviando' AND programado_para < now() - interval '10 minutes';
  -- Quien pidió BAJA no recibe campañas, ARM ni avisos (a repartidores y mensajes manuales no les aplica).
  UPDATE wa_mensajes m SET estado = 'fallido', error = 'El cliente pidió no recibir mensajes (BAJA)'
    FROM wa_conversaciones cv
   WHERE cv.id = m.conversacion_id AND m.estado = 'en_cola' AND m.direccion = 'saliente' AND m.origen IN ('campana','arm','sistema')
     AND cv.tipo_contacto = 'cliente' AND EXISTS (SELECT 1 FROM wa_bajas b WHERE b.restaurant_id = m.restaurant_id AND b.telefono = cv.telefono);
  RETURN QUERY
  WITH cand AS (
    SELECT m.id FROM wa_mensajes m
      JOIN wa_config c ON c.restaurant_id = m.restaurant_id AND c.modo <> 'desactivado' AND c.phone_number_id IS NOT NULL
     WHERE m.direccion = 'saliente' AND m.estado = 'en_cola' AND m.programado_para <= now()
       AND (EXISTS (SELECT 1 FROM wa_credenciales k WHERE k.restaurant_id = m.restaurant_id) OR EXISTS (SELECT 1 FROM wa_plataforma WHERE access_token_id IS NOT NULL))
     ORDER BY m.programado_para LIMIT greatest(1, least(COALESCE(p_limite, 20), 100))
       FOR UPDATE OF m SKIP LOCKED),
  upd AS (
    UPDATE wa_mensajes m SET estado = 'enviando', programado_para = now() FROM cand WHERE m.id = cand.id RETURNING m.*)
  SELECT jsonb_build_object(
      'id', u.id, 'restaurant_id', u.restaurant_id, 'telefono', cv.telefono, 'tipo', u.tipo, 'contenido', u.contenido, 'intentos', u.intentos,
      'phone_number_id', c.phone_number_id,
      'dentro_ventana', COALESCE(cv.ultimo_entrante_at > now() - interval '24 hours', false),
      'plantilla', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('nombre', t.nombre, 'idioma', t.idioma, 'variables', to_jsonb(t.variables), 'aprobada', t.activa AND t.estado_meta = 'aprobada') END)
    FROM upd u
    JOIN wa_conversaciones cv ON cv.id = u.conversacion_id
    JOIN wa_config c ON c.restaurant_id = u.restaurant_id
    LEFT JOIN wa_plantillas t ON t.restaurant_id = u.restaurant_id AND t.nombre = u.contenido->>'plantilla';
END;
$$;

-- Resultado de un intento de envío. Error: reintenta con espera (1 y 5 min) hasta 3 intentos y entonces queda 'fallido'.
-- p_definitivo: fallar ya (por ejemplo, fuera de la ventana de 24 h y sin plantilla).
CREATE OR REPLACE FUNCTION public.wa_marcar_envio(p_id uuid, p_ok boolean, p_wa_id text DEFAULT NULL, p_error text DEFAULT NULL, p_definitivo boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m wa_mensajes%ROWTYPE; v_int int; v_estado text;
BEGIN
  SELECT * INTO m FROM wa_mensajes WHERE id = p_id AND estado = 'enviando' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_ok THEN
    UPDATE wa_mensajes SET estado = 'enviado', wa_message_id = p_wa_id, enviado_at = now(), error = NULL WHERE id = m.id;
    UPDATE wa_config SET verificado_at = now() WHERE restaurant_id = m.restaurant_id AND verificado_at IS NULL;
    RETURN 'enviado';
  END IF;
  v_int := m.intentos + 1;
  v_estado := CASE WHEN p_definitivo OR v_int >= 3 THEN 'fallido' ELSE 'en_cola' END;
  UPDATE wa_mensajes SET estado = v_estado, intentos = v_int, error = left(COALESCE(p_error, 'Error al enviar'), 500),
         programado_para = CASE WHEN v_estado = 'en_cola' THEN now() + make_interval(mins => CASE WHEN v_int = 1 THEN 1 ELSE 5 END) ELSE programado_para END
   WHERE id = m.id;
  RETURN v_estado;
END;
$$;

-- ─── Permisos ───
REVOKE ALL ON FUNCTION public._wa_cred_borrar_secreto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._wa_guardar_secreto(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_plataforma_guardar(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_plataforma_estado() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_credenciales_guardar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_credenciales_estado(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_credenciales_borrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_plataforma_guardar(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_plataforma_estado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_credenciales_guardar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_credenciales_estado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_credenciales_borrar(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.wa_leer_plataforma() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_leer_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_config_por_numero(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_entrante(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_actualizar_estado(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_baja(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_responder(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_menu_turno(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_dom_de_cliente(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_dom_de_repartidor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dom_cerrar_entrega_bot(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dom_adjuntar_comprobante_bot(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_recordar_repartidores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_reclamar_cola(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_marcar_envio(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_leer_plataforma() TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_leer_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_config_por_numero(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_registrar_entrante(uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_actualizar_estado(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_registrar_baja(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_responder(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_menu_turno(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_dom_de_cliente(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_dom_de_repartidor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dom_cerrar_entrega_bot(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dom_adjuntar_comprobante_bot(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_recordar_repartidores() TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_reclamar_cola(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_marcar_envio(uuid, boolean, text, text, boolean) TO service_role;
