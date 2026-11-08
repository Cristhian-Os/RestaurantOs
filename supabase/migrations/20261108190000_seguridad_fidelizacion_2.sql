-- ============================================================================
-- Seguridad Fidelización / WhatsApp — ronda 2 (hallazgos medios M1, M2, M6, M7, M8)
-- Informe: docs/informes/SEGURIDAD_FIDELIZACION_WHATSAPP.md
--
-- Idempotente. No edita migraciones anteriores. Las funciones se redefinen con la
-- MISMA firma (CREATE OR REPLACE, sin crear sobrecargas duplicadas).
--
--  M1  El cajero ya no lee la tabla wa_conversaciones directo (traía el teléfono
--      completo). La pantalla Conversaciones usa wa_conversaciones_lista, que ya
--      enmascara (******1234 para el cajero, completo para el admin).
--  M2  Una transferencia solo se confirma si hay comprobante (comprobante_path).
--      Se exige en dom_confirmar_pago y, como red de seguridad, en un trigger.
--  M6  El bot limita pedidos abiertos por teléfono (2) y por restaurante por hora
--      (30). Mensaje 'LIMITE_PEDIDOS: ...' (el cerebro del bot pasa a un humano).
--      Se pueden cambiar en platform_settings: wa_bot_pedidos_abiertos_max,
--      wa_bot_pedidos_hora_max.
--  M7  Anular un pago después de canjear ya no deja saldo negativo: se revierte
--      solo hasta el saldo disponible (mínimo 0), el resto queda en la auditoría
--      y en el motivo del movimiento. Más un CHECK de saldo >= 0.
--  M8  Ley 1581: cada activación/desactivación de consentimiento y cada BAJA/ALTA
--      queda en wa_consent_log con quién/cuándo/fuente. Nadie puede reactivar el
--      consentimiento de un teléfono que pidió BAJA (solo el cliente con ALTA).
--      wa_enviar_manual respeta wa_bajas y el consentimiento como las campañas.
-- ============================================================================

-- ---------------------------------------------------------------- M1
DROP POLICY IF EXISTS "wa_conversaciones: admin y cajero leen" ON public.wa_conversaciones;
DROP POLICY IF EXISTS "wa_conversaciones: admin lee" ON public.wa_conversaciones;
CREATE POLICY "wa_conversaciones: admin lee" ON public.wa_conversaciones
  FOR SELECT TO authenticated
  USING (
    restaurant_id = (SELECT current_restaurant_id())
    AND (SELECT get_user_role()) = 'admin'
    AND NOT es_prueba
  );

-- ---------------------------------------------------------------- M2
CREATE OR REPLACE FUNCTION public.dom_confirmar_pago(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; v_total numeric;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero confirman pagos'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.metodo_pago IS DISTINCT FROM 'transferencia' OR d.pago_estado NOT IN ('pendiente_comprobante','comprobante_enviado') THEN
    RAISE EXCEPTION 'Este domicilio no tiene una transferencia por confirmar';
  END IF;
  IF d.comprobante_path IS NULL THEN
    RAISE EXCEPTION 'Falta el comprobante: el cliente debe enviarlo antes de confirmar la transferencia';
  END IF;
  IF d.estado IN ('cancelado','fallido','entregado') THEN RAISE EXCEPTION 'El domicilio ya está cerrado'; END IF;
  SELECT total INTO v_total FROM orders WHERE id = d.order_id AND restaurant_id = v_rid;
  PERFORM _cobrar_base(d.order_id, 'transferencia', v_total, 0, false);
  UPDATE orders SET en_espera_pago = false WHERE id = d.order_id;
  UPDATE domicilios SET pago_estado = 'confirmado', pago_confirmado_por = auth.uid(), pago_confirmado_at = now(), pago_rechazo = NULL,
                        estado = CASE WHEN estado = 'recibido' THEN 'confirmado' ELSE estado END
   WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, CASE WHEN d.estado = 'recibido' THEN 'confirmado' ELSE d.estado END, 'manual', jsonb_build_object('pago', 'confirmado'), auth.uid());
  PERFORM _dom_avisar_cliente(d.id);
END;
$$;

-- Red de seguridad: ningún camino puede dejar una transferencia "confirmada" sin comprobante.
CREATE OR REPLACE FUNCTION public._dom_exigir_comprobante() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pago_estado = 'confirmado' AND NEW.metodo_pago = 'transferencia' AND NEW.comprobante_path IS NULL
     AND OLD.pago_estado IS DISTINCT FROM 'confirmado' THEN
    RAISE EXCEPTION 'No se puede confirmar una transferencia sin comprobante';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS domicilios_exigir_comprobante ON public.domicilios;
CREATE TRIGGER domicilios_exigir_comprobante BEFORE UPDATE OF pago_estado ON public.domicilios
  FOR EACH ROW EXECUTE FUNCTION public._dom_exigir_comprobante();

-- ---------------------------------------------------------------- M6
CREATE OR REPLACE FUNCTION public.wa_crear_pedido_bot(p_restaurant_id uuid, p_telefono text, p_nombre text, p_items jsonb, p_tipo text, p_direccion text, p_referencia text, p_metodo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); cv wa_conversaciones%ROWTYPE; cfg wa_config%ROWTYPE; rc record;
  v_hash text; v_prev jsonb; v_cot jsonb; v_sub numeric; v_costo numeric := 0; v_max numeric; v_cli uuid; v_order uuid; v_num int; v_dom uuid;
  v_nombre text := btrim(COALESCE(p_nombre, '')); v_dir text := btrim(COALESCE(p_direccion, '')); v_res jsonb; v_hora time; it jsonb; v_rec text; v_ent text;
  v_max_tel int; v_max_hora int; v_abiertos int; v_hora_n int;
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
  IF p_tipo NOT IN ('domicilio','recoger') THEN RAISE EXCEPTION 'Tipo de entrega inválido'; END IF;
  IF NOT ((p_tipo = 'domicilio' AND p_metodo IN ('transferencia','contra_entrega')) OR (p_tipo = 'recoger' AND p_metodo = 'efectivo_local')) THEN
    RAISE EXCEPTION 'Ese método de pago no aplica a este tipo de entrega';
  END IF;
  IF char_length(v_nombre) < 2 OR char_length(v_nombre) > 120 THEN RAISE EXCEPTION 'Falta el nombre del cliente'; END IF;
  IF p_tipo = 'domicilio' AND (char_length(v_dir) < 5 OR char_length(v_dir) > 300) THEN RAISE EXCEPTION 'Falta la dirección de entrega'; END IF;

  SELECT * INTO cv FROM wa_conversaciones WHERE restaurant_id = p_restaurant_id AND telefono = v_tel FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;

  v_hash := md5(COALESCE(p_items::text, '') || '|' || p_tipo || '|' || p_metodo || '|' || v_dir);
  v_prev := cv.contexto->'ultimo_pedido';
  IF v_prev IS NOT NULL AND v_prev->>'huella' = v_hash AND (v_prev->>'at')::timestamptz > now() - interval '10 minutes' THEN
    RETURN (v_prev->'resultado') || jsonb_build_object('repetido', true);
  END IF;

  -- Tope de pedidos del bot (la conversación ya está bloqueada: un teléfono a la vez).
  SELECT COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_pedidos_abiertos_max'), 2)::int INTO v_max_tel;
  SELECT COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_pedidos_hora_max'), 30)::int INTO v_max_hora;
  SELECT count(*) INTO v_abiertos FROM orders o
   WHERE o.restaurant_id = p_restaurant_id AND o.notes LIKE 'Pedido por WhatsApp%'
     AND o.status NOT IN ('completed','cancelled') AND o.paid_at IS NULL AND o.created_at > now() - interval '24 hours'
     AND o.cliente_id IN (SELECT id FROM clientes WHERE restaurant_id = p_restaurant_id AND telefono = v_tel);
  IF v_abiertos >= v_max_tel THEN
    RAISE EXCEPTION 'LIMITE_PEDIDOS: ya hay % pedidos abiertos de este número sin pagar ni entregar. Un asesor continúa la conversación.', v_abiertos;
  END IF;
  SELECT count(*) INTO v_hora_n FROM orders o
   WHERE o.restaurant_id = p_restaurant_id AND o.notes LIKE 'Pedido por WhatsApp%' AND o.created_at > now() - interval '1 hour';
  IF v_hora_n >= v_max_hora THEN
    RAISE EXCEPTION 'LIMITE_PEDIDOS: se alcanzó el máximo de pedidos por WhatsApp en esta hora. Un asesor continúa la conversación.';
  END IF;

  SELECT * INTO cfg FROM wa_config WHERE restaurant_id = p_restaurant_id;
  SELECT cerrado_manual, cerrado_mensaje, horario_activo, horario_apertura, horario_cierre INTO rc FROM restaurant_config WHERE restaurant_id = p_restaurant_id;
  IF rc.cerrado_manual THEN RAISE EXCEPTION '%', COALESCE(rc.cerrado_mensaje, 'El restaurante está cerrado temporalmente.'); END IF;
  IF rc.horario_activo AND rc.horario_apertura IS NOT NULL AND rc.horario_cierre IS NOT NULL THEN
    v_hora := (now() AT TIME ZONE 'America/Bogota')::time;
    IF NOT (CASE WHEN rc.horario_apertura::time <= rc.horario_cierre::time THEN v_hora BETWEEN rc.horario_apertura::time AND rc.horario_cierre::time
                 ELSE v_hora >= rc.horario_apertura::time OR v_hora <= rc.horario_cierre::time END) THEN
      RAISE EXCEPTION 'Cerrado ahora. Atendemos de % a %', rc.horario_apertura, rc.horario_cierre;
    END IF;
  END IF;

  v_cot := wa_bot_cotizar(p_restaurant_id, p_items);
  v_sub := (v_cot->>'subtotal')::numeric;
  IF jsonb_array_length(v_cot->'lineas') = 0 OR v_sub <= 0 THEN RAISE EXCEPTION 'El pedido está vacío'; END IF;
  IF COALESCE(cfg.pedido_minimo, 0) > 0 AND v_sub < cfg.pedido_minimo THEN RAISE EXCEPTION 'El pedido mínimo es $%', cfg.pedido_minimo; END IF;
  SELECT COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_total_max'), 1500000) INTO v_max;
  IF v_sub > v_max THEN RAISE EXCEPTION 'El pedido supera el máximo permitido por chat'; END IF;
  IF p_tipo = 'domicilio' THEN v_costo := COALESCE(cfg.tarifa_domicilio, 0); END IF;

  SELECT id INTO v_cli FROM clientes WHERE restaurant_id = p_restaurant_id AND telefono = v_tel ORDER BY activo DESC, created_at LIMIT 1;
  IF v_cli IS NULL THEN
    INSERT INTO clientes (restaurant_id, nombre, telefono, origen, consentimiento_marketing) VALUES (p_restaurant_id, v_nombre, v_tel, 'whatsapp', false)
    RETURNING id INTO v_cli;
  END IF;

  INSERT INTO orders (user_id, items, total, tipo_pedido, notes, status, restaurant_id, customer_name, cliente_id)
  VALUES (NULL, v_cot->'lineas', v_sub, CASE WHEN p_tipo = 'domicilio' THEN 'DOMICILIO' ELSE 'LLEVAR' END,
          left('Pedido por WhatsApp' || CASE WHEN p_tipo = 'recoger' THEN ' (recoge en el local)' ELSE '' END, 500), 'pending', p_restaurant_id, left(v_nombre, 120), v_cli)
  RETURNING id, order_number_today INTO v_order, v_num;

  FOR it IN SELECT * FROM jsonb_array_elements(v_cot->'lineas') LOOP
    INSERT INTO detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id, opciones_consumo)
    VALUES (v_order, (it->>'id')::uuid, (it->>'quantity')::int, (it->>'price')::numeric, it->>'notes', p_restaurant_id,
            _consumo_opciones((it->>'id')::uuid, p_restaurant_id, it->'sel'));
  END LOOP;

  IF p_tipo = 'domicilio' THEN
    v_dom := _dom_crear_base(p_restaurant_id, v_order, v_dir, p_referencia, NULL, NULL, v_costo, v_cli, v_nombre, v_tel, p_metodo, cv.id, 'bot', NULL);
    SELECT codigo_recogida, codigo_entrega INTO v_rec, v_ent FROM domicilios WHERE id = v_dom;
  END IF;

  v_res := jsonb_build_object('order_id', v_order, 'numero', v_num, 'total', v_sub, 'domicilio', v_costo, 'domicilio_id', v_dom,
                              'codigo_recogida', v_rec, 'codigo_entrega', v_ent, 'repetido', false);
  UPDATE wa_conversaciones SET flujo = 'pedido', cliente_id = COALESCE(cliente_id, v_cli),
         contexto = contexto || jsonb_build_object('ultimo_pedido', jsonb_build_object('huella', v_hash, 'at', now(), 'resultado', v_res))
   WHERE id = cv.id;
  RETURN v_res;
END;
$$;

-- ---------------------------------------------------------------- M7
CREATE OR REPLACE FUNCTION public._fid_revertir_orden(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a fid_acreditaciones%ROWTYPE; c fid_cuentas%ROWTYPE; v_p int; v_s int;
BEGIN
  UPDATE fid_acreditaciones SET reversada_at = now() WHERE order_id = p_order_id AND reversada_at IS NULL RETURNING * INTO a;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM fid_cuentas WHERE cliente_id = a.cliente_id FOR UPDATE;
  -- Solo se puede quitar lo que el cliente todavía tiene (si ya lo canjeó, el saldo se queda en 0, nunca negativo).
  v_p := LEAST(a.puntos, GREATEST(COALESCE(c.puntos_saldo, 0), 0));
  v_s := LEAST(a.sellos, GREATEST(COALESCE(c.sellos_saldo, 0), 0));
  IF v_p > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (a.restaurant_id, a.cliente_id, 'reversa_acredito', 'puntos', -v_p, a.order_id, a.id, 'rev:' || a.id || ':p', auth.uid(),
            CASE WHEN v_p < a.puntos THEN 'Pago anulado; ya se habían canjeado ' || (a.puntos - v_p) || ' puntos' ELSE 'Pago anulado o corregido' END);
  END IF;
  IF v_s > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (a.restaurant_id, a.cliente_id, 'reversa_acredito', 'sellos', -v_s, a.order_id, a.id, 'rev:' || a.id || ':s', auth.uid(),
            CASE WHEN v_s < a.sellos THEN 'Pago anulado; ya se habían canjeado ' || (a.sellos - v_s) || ' sellos' ELSE 'Pago anulado o corregido' END);
  END IF;
  IF v_p < a.puntos OR v_s < a.sellos THEN
    PERFORM _fid_audit(a.restaurant_id, 'reversa_limitada', 'cliente', a.cliente_id,
      jsonb_build_object('order_id', a.order_id, 'puntos_no_revertidos', a.puntos - v_p, 'sellos_no_revertidos', a.sellos - v_s));
  END IF;
  UPDATE fid_cuentas SET visitas = GREATEST(visitas - 1, 0), gasto_total = GREATEST(gasto_total - a.total, 0),
         ultima_visita = (SELECT max(created_at) FROM fid_acreditaciones WHERE cliente_id = a.cliente_id AND reversada_at IS NULL),
         updated_at = now()
   WHERE cliente_id = a.cliente_id;
END;
$$;

-- Los saldos nunca pueden quedar negativos (NOT VALID: no falla por datos viejos; se valida si están limpios).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fid_cuentas_saldos_no_negativos' AND conrelid = 'public.fid_cuentas'::regclass) THEN
    ALTER TABLE public.fid_cuentas ADD CONSTRAINT fid_cuentas_saldos_no_negativos CHECK (puntos_saldo >= 0 AND sellos_saldo >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fid_cuentas WHERE puntos_saldo < 0 OR sellos_saldo < 0) THEN
    ALTER TABLE public.fid_cuentas VALIDATE CONSTRAINT fid_cuentas_saldos_no_negativos;
  END IF;
END $$;

-- ---------------------------------------------------------------- M8
ALTER TABLE public.wa_consent_log
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS actor uuid,
  ADD COLUMN IF NOT EXISTS actor_rol text,
  ADD COLUMN IF NOT EXISTS fuente text,
  ADD COLUMN IF NOT EXISTS detalle jsonb;
ALTER TABLE public.wa_consent_log DROP CONSTRAINT IF EXISTS wa_consent_log_evento_check;
ALTER TABLE public.wa_consent_log ADD CONSTRAINT wa_consent_log_evento_check
  CHECK (evento = ANY (ARRAY['baja','alta','consentimiento_on','consentimiento_off']));

-- Cada cambio del consentimiento de un cliente (por cualquier camino) deja huella; y un teléfono
-- en BAJA no se puede volver a activar (solo el cliente, escribiendo ALTA, quita la BAJA).
CREATE OR REPLACE FUNCTION public._clientes_consent_auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_rol text; v_old boolean; v_new boolean := COALESCE(NEW.consentimiento_marketing, false); v_fuente text;
BEGIN
  v_old := CASE WHEN TG_OP = 'INSERT' THEN false ELSE COALESCE(OLD.consentimiento_marketing, false) END;
  IF v_new = v_old THEN RETURN NEW; END IF;
  v_rol := CASE WHEN v_uid IS NULL THEN NULL ELSE get_user_role() END;
  v_fuente := COALESCE(NULLIF(current_setting('app.consent_fuente', true), ''),
                       CASE WHEN v_uid IS NULL THEN 'sistema' ELSE 'app_' || COALESCE(v_rol, 'desconocido') END);
  IF v_new AND NEW.telefono IS NOT NULL AND EXISTS (SELECT 1 FROM wa_bajas WHERE restaurant_id = NEW.restaurant_id AND telefono = NEW.telefono) THEN
    RAISE EXCEPTION 'Este cliente pidió no recibir mensajes (BAJA). Solo puede reactivarse cuando el cliente escriba ALTA por WhatsApp';
  END IF;
  -- (un cliente sin teléfono válido no puede recibir WhatsApp: no hay a quién registrarle la huella)
  IF NEW.telefono ~ '^[0-9]{8,15}$' THEN
    INSERT INTO wa_consent_log (restaurant_id, telefono, evento, cliente_id, actor, actor_rol, fuente, detalle)
    VALUES (NEW.restaurant_id, NEW.telefono, CASE WHEN v_new THEN 'consentimiento_on' ELSE 'consentimiento_off' END, NEW.id, v_uid, v_rol, v_fuente,
            jsonb_build_object('canal', NEW.consentimiento_canal));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clientes_consent_auditar ON public.clientes;
CREATE TRIGGER clientes_consent_auditar BEFORE INSERT OR UPDATE OF consentimiento_marketing ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public._clientes_consent_auditar();

CREATE OR REPLACE FUNCTION public.wa_registrar_baja(p_rid uuid, p_telefono text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g');
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RETURN; END IF;
  PERFORM set_config('app.consent_fuente', 'whatsapp_baja', true);
  INSERT INTO wa_bajas (restaurant_id, telefono) VALUES (p_rid, v_tel) ON CONFLICT DO NOTHING;
  INSERT INTO wa_consent_log (restaurant_id, telefono, evento, actor, fuente) VALUES (p_rid, v_tel, 'baja', auth.uid(), 'whatsapp');
  UPDATE clientes SET consentimiento_marketing = false, consentimiento_canal = NULL WHERE restaurant_id = p_rid AND telefono = v_tel AND consentimiento_marketing;
  UPDATE fid_campana_destinatarios d SET estado = 'omitido_sin_consentimiento'
    FROM clientes c WHERE c.id = d.cliente_id AND c.restaurant_id = p_rid AND c.telefono = v_tel AND d.estado = 'pendiente';
  UPDATE wa_mensajes m SET estado = 'fallido', error = 'El cliente pidió no recibir mensajes (BAJA)'
    FROM wa_conversaciones cv
   WHERE cv.id = m.conversacion_id AND cv.restaurant_id = p_rid AND cv.telefono = v_tel AND cv.tipo_contacto = 'cliente'
     AND m.estado = 'en_cola' AND m.direccion = 'saliente' AND m.origen IN ('campana','arm','sistema');
  PERFORM set_config('app.consent_fuente', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_registrar_alta(p_rid uuid, p_telefono text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); n int;
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RETURN false; END IF;
  DELETE FROM wa_bajas WHERE restaurant_id = p_rid AND telefono = v_tel;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN INSERT INTO wa_consent_log (restaurant_id, telefono, evento, actor, fuente) VALUES (p_rid, v_tel, 'alta', auth.uid(), 'whatsapp'); END IF;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_enviar_manual(p_cliente_id uuid, p_texto text DEFAULT NULL::text, p_plantilla text DEFAULT NULL::text, p_vars jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c clientes%ROWTYPE; t wa_plantillas%ROWTYPE; v_ult timestamptz; v_msg uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero envían mensajes'; END IF;
  IF NOT _wa_activo(v_rid) THEN RAISE EXCEPTION 'WhatsApp no está activado en este restaurante'; END IF;
  SELECT * INTO c FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid AND activo;
  IF NOT FOUND OR c.telefono IS NULL THEN RAISE EXCEPTION 'El cliente no existe o no tiene teléfono'; END IF;
  IF EXISTS (SELECT 1 FROM wa_bajas WHERE restaurant_id = v_rid AND telefono = regexp_replace(c.telefono, '\D', '', 'g')) THEN
    RAISE EXCEPTION 'El cliente pidió no recibir mensajes (BAJA)';
  END IF;
  IF p_plantilla IS NOT NULL THEN
    SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = v_rid AND nombre = p_plantilla AND activa AND estado_meta = 'aprobada';
    IF NOT FOUND THEN RAISE EXCEPTION 'La plantilla no existe o aún no está aprobada por WhatsApp'; END IF;
    IF t.categoria = 'marketing' AND (NOT c.consentimiento_marketing OR COALESCE(c.consentimiento_canal, '') NOT IN ('whatsapp','ambos')) THEN
      RAISE EXCEPTION 'El cliente no aceptó recibir promociones por WhatsApp';
    END IF;
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

-- Los permisos de las funciones redefinidas se conservan (CREATE OR REPLACE no los toca).
-- La función del trigger no necesita ser llamable por nadie.
REVOKE ALL ON FUNCTION public._clientes_consent_auditar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dom_exigir_comprobante() FROM PUBLIC, anon, authenticated;
