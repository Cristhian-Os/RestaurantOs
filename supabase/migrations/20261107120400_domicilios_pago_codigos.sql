-- Domicilios · pago, comprobante y códigos (decisiones de Cristhian, 2026-11-07)
--  * TRANSFERENCIA: el pedido NO pasa a cocina hasta que el cajero confirma el comprobante (orders.en_espera_pago).
--  * CONTRA ENTREGA: pasa a cocina de una vez; el repartidor paga en caja el total del pedido al recogerlo
--    y al cliente le cobra pedido + domicilio.
--  * Código de recogida (lo ve la cocina junto al primer nombre) y código de entrega (el cliente se lo dice al repartidor).
--  * Si nadie da el código, el cajero cierra la entrega "sin código" y queda anotado.
-- Todo el dinero pasa por _cobrar_base(..., false) (la misma base de cobro de Caja: solo registra el pago); aquí no se toca el corte.

-- ─── Columnas ───────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS en_espera_pago  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codigo_recogida text;

ALTER TABLE public.domicilios
  ADD COLUMN IF NOT EXISTS metodo_pago          text CHECK (metodo_pago IS NULL OR metodo_pago IN ('transferencia','contra_entrega')),
  ADD COLUMN IF NOT EXISTS pago_estado          text NOT NULL DEFAULT 'sin_definir'
      CHECK (pago_estado IN ('sin_definir','pendiente_comprobante','comprobante_enviado','confirmado','contra_entrega','pagado_por_repartidor')),
  ADD COLUMN IF NOT EXISTS comprobante_path     text CHECK (comprobante_path IS NULL OR char_length(comprobante_path) <= 300),
  ADD COLUMN IF NOT EXISTS comprobante_at       timestamptz,
  ADD COLUMN IF NOT EXISTS pago_rechazo         text CHECK (pago_rechazo IS NULL OR char_length(pago_rechazo) <= 300),
  ADD COLUMN IF NOT EXISTS pago_confirmado_por  uuid,
  ADD COLUMN IF NOT EXISTS pago_confirmado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS codigo_recogida      text CHECK (codigo_recogida IS NULL OR codigo_recogida ~ '^[0-9]{4}$'),
  ADD COLUMN IF NOT EXISTS codigo_entrega       text CHECK (codigo_entrega IS NULL OR codigo_entrega ~ '^[0-9]{4}$'),
  ADD COLUMN IF NOT EXISTS intentos_codigo      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_sin_codigo   boolean NOT NULL DEFAULT false;

-- Un código no se repite entre los domicilios que siguen abiertos del mismo restaurante.
CREATE UNIQUE INDEX IF NOT EXISTS domicilios_cod_recogida_uq ON public.domicilios (restaurant_id, codigo_recogida)
  WHERE codigo_recogida IS NOT NULL AND estado NOT IN ('entregado','cancelado','fallido');
CREATE UNIQUE INDEX IF NOT EXISTS domicilios_cod_entrega_uq ON public.domicilios (restaurant_id, codigo_entrega)
  WHERE codigo_entrega IS NOT NULL AND estado NOT IN ('entregado','cancelado','fallido');

-- Cuántos minutos esperar antes de pedirle al repartidor que confirme la entrega (lo usará el bot).
ALTER TABLE public.wa_config
  ADD COLUMN IF NOT EXISTS minutos_confirmar_entrega int NOT NULL DEFAULT 20 CHECK (minutos_confirmar_entrega BETWEEN 5 AND 180);

-- ─── Comprobantes: bucket privado, una carpeta por restaurante ──────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comprobantes: leen admin y cajero" ON storage.objects;
CREATE POLICY "comprobantes: leen admin y cajero" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = (SELECT public.current_restaurant_id())::text
         AND (SELECT public.get_user_role()) IN ('admin','cashier'));
DROP POLICY IF EXISTS "comprobantes: suben admin y cajero" ON storage.objects;
CREATE POLICY "comprobantes: suben admin y cajero" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = (SELECT public.current_restaurant_id())::text
              AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Código de 4 dígitos que no esté en uso entre los domicilios abiertos ───
CREATE OR REPLACE FUNCTION public._dom_codigo(p_rid uuid, p_columna text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text; i int := 0; v_uso boolean;
BEGIN
  IF p_columna NOT IN ('codigo_recogida','codigo_entrega') THEN RAISE EXCEPTION 'columna inválida'; END IF;
  LOOP
    v := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 10000)::text, 4, '0');
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM domicilios WHERE restaurant_id = $1 AND %I = $2 AND estado NOT IN (''entregado'',''cancelado'',''fallido''))', p_columna)
      INTO v_uso USING p_rid, v;
    IF NOT v_uso THEN RETURN v; END IF;
    i := i + 1;
    IF i > 60 THEN RAISE EXCEPTION 'No se pudo generar un código libre'; END IF;
  END LOOP;
END;
$$;

-- ─── dom_crear: ahora con método de pago y códigos (se borra la versión vieja: no deja sobrecarga) ───
DROP FUNCTION IF EXISTS public.dom_crear(uuid, text, text, numeric, numeric, numeric, uuid, text, text);
CREATE OR REPLACE FUNCTION public.dom_crear(
  p_order_id uuid, p_direccion text, p_referencia text DEFAULT NULL, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_costo_envio numeric DEFAULT 0, p_cliente_id uuid DEFAULT NULL, p_contacto_nombre text DEFAULT NULL, p_contacto_telefono text DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_id uuid; v_paid timestamptz; v_rec text; v_ent text; v_pago text;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para crear domicilios'; END IF;
  IF p_metodo_pago IS NOT NULL AND p_metodo_pago NOT IN ('transferencia','contra_entrega') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;
  SELECT paid_at INTO v_paid FROM orders WHERE id = p_order_id AND restaurant_id = v_rid AND tipo_pedido = 'DOMICILIO' AND status <> 'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe o no es de tipo domicilio'; END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid) THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  v_rec := _dom_codigo(v_rid, 'codigo_recogida');
  v_ent := _dom_codigo(v_rid, 'codigo_entrega');
  v_pago := CASE WHEN v_paid IS NOT NULL THEN 'confirmado' WHEN p_metodo_pago = 'transferencia' THEN 'pendiente_comprobante'
                 WHEN p_metodo_pago = 'contra_entrega' THEN 'contra_entrega' ELSE 'sin_definir' END;
  INSERT INTO domicilios (restaurant_id, order_id, cliente_id, contacto_nombre, contacto_telefono, direccion, referencia, lat, lng, costo_envio,
                          metodo_pago, pago_estado, codigo_recogida, codigo_entrega)
  VALUES (v_rid, p_order_id, p_cliente_id, NULLIF(btrim(p_contacto_nombre), ''), _fid_tel(p_contacto_telefono), btrim(p_direccion), NULLIF(btrim(p_referencia), ''), p_lat, p_lng, COALESCE(p_costo_envio, 0),
          p_metodo_pago, v_pago, v_rec, v_ent)
  RETURNING id INTO v_id;
  -- Transferencia sin pagar: el pedido queda retenido y la cocina no lo ve hasta confirmar el pago.
  UPDATE orders SET codigo_recogida = v_rec, en_espera_pago = (v_pago = 'pendiente_comprobante') WHERE id = p_order_id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, v_id, 'recibido', 'manual', jsonb_build_object('metodo_pago', p_metodo_pago), auth.uid());
  RETURN v_id;
END;
$$;

-- ─── Comprobante enviado por el cliente (queda en el bucket; aquí solo se anota la ruta) ───
CREATE OR REPLACE FUNCTION public.dom_adjuntar_comprobante(p_id uuid, p_path text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero adjuntan comprobantes'; END IF;
  IF p_path IS NULL OR p_path NOT LIKE v_rid::text || '/%' THEN RAISE EXCEPTION 'Ruta de comprobante inválida'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.metodo_pago IS DISTINCT FROM 'transferencia' OR d.pago_estado NOT IN ('pendiente_comprobante','comprobante_enviado') THEN
    RAISE EXCEPTION 'Este domicilio no está esperando un comprobante';
  END IF;
  UPDATE domicilios SET comprobante_path = p_path, comprobante_at = now(), pago_estado = 'comprobante_enviado', pago_rechazo = NULL WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, d.estado, 'manual', jsonb_build_object('pago', 'comprobante_enviado'), auth.uid());
END;
$$;

-- ─── El cajero confirma la transferencia: se cobra el pedido y pasa a cocina ───
CREATE OR REPLACE FUNCTION public.dom_confirmar_pago(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; v_total numeric;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero confirman pagos'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.metodo_pago IS DISTINCT FROM 'transferencia' OR d.pago_estado NOT IN ('pendiente_comprobante','comprobante_enviado') THEN
    RAISE EXCEPTION 'Este domicilio no tiene una transferencia por confirmar';
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

-- ─── El cajero rechaza el comprobante (borroso, valor distinto…): el cliente debe mandarlo otra vez ───
CREATE OR REPLACE FUNCTION public.dom_rechazar_pago(p_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero rechazan comprobantes'; END IF;
  IF char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.metodo_pago IS DISTINCT FROM 'transferencia' OR d.pago_estado <> 'comprobante_enviado' THEN RAISE EXCEPTION 'No hay un comprobante por revisar'; END IF;
  UPDATE domicilios SET pago_estado = 'pendiente_comprobante', pago_rechazo = btrim(p_motivo), comprobante_path = NULL, comprobante_at = NULL WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, d.estado, 'manual', jsonb_build_object('pago', 'rechazado', 'motivo', btrim(p_motivo)), auth.uid());
END;
$$;

-- ─── Contra entrega: cuánto paga el repartidor en caja y cuánto cobra al cliente ───
CREATE OR REPLACE FUNCTION public.dom_cobro_repartidor(p_id uuid)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; v_total numeric;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  SELECT total INTO v_total FROM orders WHERE id = d.order_id;
  RETURN json_build_object('metodo_pago', d.metodo_pago, 'pago_estado', d.pago_estado,
    'pagar_restaurante', v_total, 'domicilio', d.costo_envio, 'cobrar_cliente', v_total + d.costo_envio);
END;
$$;

-- El repartidor llega, paga en caja el total del pedido y el cajero lo registra (cobro en efectivo normal).
CREATE OR REPLACE FUNCTION public.dom_cobrar_repartidor(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; v_total numeric;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero registran el pago del repartidor'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.metodo_pago IS DISTINCT FROM 'contra_entrega' OR d.pago_estado <> 'contra_entrega' THEN RAISE EXCEPTION 'Este domicilio no está pendiente de pago contra entrega'; END IF;
  IF d.estado NOT IN ('listo','buscando_repartidor','asignado') THEN RAISE EXCEPTION 'El pedido aún no está listo para que el repartidor lo recoja'; END IF;
  SELECT total INTO v_total FROM orders WHERE id = d.order_id AND restaurant_id = v_rid;
  PERFORM _cobrar_base(d.order_id, 'efectivo', v_total, 0, false);
  UPDATE domicilios SET pago_estado = 'pagado_por_repartidor', pago_confirmado_por = auth.uid(), pago_confirmado_at = now() WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, d.estado, 'manual', jsonb_build_object('pago', 'pagado_por_repartidor', 'monto', v_total), auth.uid());
END;
$$;

-- ─── Cierre de la entrega con el código del cliente (máximo 5 intentos) ───
-- Devuelve false si el código no coincide (el intento se cuenta: por eso no se lanza error, que lo desharía).
CREATE OR REPLACE FUNCTION public.dom_cerrar_entrega(p_id uuid, p_codigo text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero cierran entregas'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.estado NOT IN ('recogido','en_camino') THEN RAISE EXCEPTION 'El pedido todavía no va en camino'; END IF;
  IF d.intentos_codigo >= 5 THEN RAISE EXCEPTION 'Demasiados intentos con el código: confirma la entrega sin código'; END IF;
  IF btrim(COALESCE(p_codigo, '')) <> d.codigo_entrega THEN
    UPDATE domicilios SET intentos_codigo = intentos_codigo + 1 WHERE id = d.id;
    RETURN false;
  END IF;
  UPDATE domicilios SET estado = 'entregado', entregado_at = now() WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, 'entregado', 'manual', jsonb_build_object('con_codigo', true), auth.uid());
  PERFORM _dom_avisar_cliente(d.id);
  RETURN true;
END;
$$;

-- Si el cliente no dice el código, el cajero cierra la entrega igual (anotado y con motivo).
CREATE OR REPLACE FUNCTION public.dom_cerrar_sin_codigo(p_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero cierran entregas'; END IF;
  IF char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.estado NOT IN ('recogido','en_camino') THEN RAISE EXCEPTION 'El pedido todavía no va en camino'; END IF;
  UPDATE domicilios SET estado = 'entregado', entregado_at = now(), entrega_sin_codigo = true, motivo = btrim(p_motivo) WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, 'entregado', 'manual', jsonb_build_object('con_codigo', false, 'motivo', btrim(p_motivo)), auth.uid());
  PERFORM _dom_avisar_cliente(d.id);
END;
$$;

-- ─── dom_cambiar_estado (misma firma: reemplaza). Nuevas reglas: transferencia sin confirmar no avanza; "entregado" solo por código ───
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
  IF p_estado = 'entregado' THEN RAISE EXCEPTION 'Para cerrar la entrega usa el código del cliente, o confirma sin código'; END IF;
  IF NOT (p_estado = ANY (v_ok)) THEN RAISE EXCEPTION 'No se puede pasar de "%" a "%"', d.estado, p_estado; END IF;
  IF p_estado <> 'cancelado' AND d.metodo_pago = 'transferencia' AND d.pago_estado <> 'confirmado' THEN
    RAISE EXCEPTION 'Primero confirma el pago por transferencia';
  END IF;
  IF p_estado IN ('cancelado','fallido') AND char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  -- Domicilio de transferencia retenido y cancelado: el pedido sin pagar también se cancela para que no quede colgado.
  IF p_estado = 'cancelado' THEN
    UPDATE orders SET status = 'cancelled', en_espera_pago = false WHERE id = d.order_id AND paid_at IS NULL AND status <> 'cancelled';
  END IF;
  UPDATE domicilios SET estado = p_estado, eta_min = COALESCE(p_eta_min, eta_min), motivo = COALESCE(NULLIF(btrim(p_motivo), ''), motivo) WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, p_estado, 'manual', jsonb_build_object('motivo', p_motivo, 'eta_min', p_eta_min), auth.uid());
  PERFORM _dom_avisar_cliente(d.id);
END;
$$;

-- ─── Seguimiento público: ahora también le muestra al cliente su código de entrega y el estado del pago ───
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
    'metodo_pago', d.metodo_pago, 'pago_estado', d.pago_estado,
    'codigo_entrega', CASE WHEN d.estado IN ('listo','buscando_repartidor','asignado','recogido','en_camino') THEN d.codigo_entrega END,
    'eventos', v_ev);
END;
$$;

-- ─── Permisos ───
REVOKE ALL ON FUNCTION public._dom_codigo(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dom_crear(uuid, text, text, numeric, numeric, numeric, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_adjuntar_comprobante(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_confirmar_pago(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_rechazar_pago(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cobro_repartidor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cobrar_repartidor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cerrar_entrega(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cerrar_sin_codigo(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_cambiar_estado(uuid, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dom_seguimiento_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dom_crear(uuid, text, text, numeric, numeric, numeric, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_adjuntar_comprobante(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_confirmar_pago(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_rechazar_pago(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cobro_repartidor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cobrar_repartidor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cerrar_entrega(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cerrar_sin_codigo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_cambiar_estado(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dom_seguimiento_publico(text) TO anon, authenticated;
