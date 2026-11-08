-- WhatsApp · el "cerebro" del bot: contexto por restaurante + tomar pedidos nuevos por chat. Diseño: docs/informes/WHATSAPP_PASO_A_PRODUCCION.md (sección 9).
--  * El modelo de IA NUNCA decide dinero ni estado: el estado de la conversación vive en wa_conversaciones.contexto y solo lo cambia código del servidor.
--  * El precio de cada plato sale SIEMPRE de la base (una sola función compartida: _precio_plato, la usan también create_public_order y crear_orden_completa).
--  * El pedido se crea con wa_crear_pedido_bot (solo rol de servicio). Transferencia => en_espera_pago (la cocina no lo ve hasta que Caja confirme el comprobante).
--  * Ninguna función vieja cambia de firma: no quedan sobrecargas duplicadas.

-- ─── 1. Configuración del bot por restaurante ───────────────────────────────
ALTER TABLE public.wa_config
  ADD COLUMN IF NOT EXISTS bot_pedidos        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_nombre         text CHECK (bot_nombre IS NULL OR char_length(bot_nombre) <= 60),
  ADD COLUMN IF NOT EXISTS bot_tono           text CHECK (bot_tono IS NULL OR char_length(bot_tono) <= 200),
  ADD COLUMN IF NOT EXISTS bot_info           text CHECK (bot_info IS NULL OR char_length(bot_info) <= 4000),
  ADD COLUMN IF NOT EXISTS horario            text CHECK (horario IS NULL OR char_length(horario) <= 500),
  ADD COLUMN IF NOT EXISTS tarifa_domicilio   int  NOT NULL DEFAULT 0 CHECK (tarifa_domicilio >= 0),
  ADD COLUMN IF NOT EXISTS cobertura          text CHECK (cobertura IS NULL OR char_length(cobertura) <= 500),
  ADD COLUMN IF NOT EXISTS datos_transferencia text CHECK (datos_transferencia IS NULL OR char_length(datos_transferencia) <= 500),
  ADD COLUMN IF NOT EXISTS bot_bienvenida     text CHECK (bot_bienvenida IS NULL OR char_length(bot_bienvenida) <= 300),
  ADD COLUMN IF NOT EXISTS pedido_minimo      int  NOT NULL DEFAULT 0 CHECK (pedido_minimo >= 0);

-- Conversaciones de prueba (chat "Probar" del administrador): nunca llegan a Meta ni salen en la lista real.
ALTER TABLE public.wa_conversaciones ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "wa_conversaciones: admin y cajero leen" ON public.wa_conversaciones;
CREATE POLICY "wa_conversaciones: admin y cajero leen" ON public.wa_conversaciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier') AND NOT es_prueba);

-- Registro de BAJA / ALTA (quién, cuándo): el consentimiento de promociones NO se vuelve a dar con ALTA.
CREATE TABLE IF NOT EXISTS public.wa_consent_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  telefono      text NOT NULL CHECK (telefono ~ '^[0-9]{8,15}$'),
  evento        text NOT NULL CHECK (evento IN ('baja','alta')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wa_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_consent_log FROM PUBLIC, anon, authenticated;

-- ─── 2. Precio de un plato: UNA sola función para todos los caminos ──────────
-- Tamaño, toppings y opciones v2 salen de la base. Devuelve {unit,size,toppings} o {tamano_invalido:true}.
CREATE OR REPLACE FUNCTION public._precio_plato(p_dish public.dishes, p_size text, p_toppings jsonb, p_sel jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_size text := NULLIF(p_size, ''); v_obj jsonb; v_unit numeric; v_top jsonb := COALESCE(p_toppings, '[]'::jsonb); v_tot numeric := 0; v_ok jsonb := '[]'::jsonb;
BEGIN
  IF p_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(p_dish.sizes) = 'array' THEN
    SELECT s INTO v_obj FROM jsonb_array_elements(p_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
    IF v_obj IS NULL THEN RETURN jsonb_build_object('tamano_invalido', true); END IF;
    v_unit := (v_obj->>'precio')::numeric;
  ELSE
    v_unit := p_dish.price;
    v_size := NULL;
  END IF;
  IF jsonb_typeof(p_dish.toppings) = 'array' AND jsonb_typeof(v_top) = 'array' THEN
    SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
      INTO v_tot, v_ok
    FROM jsonb_array_elements(p_dish.toppings) t
    WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_top));
  END IF;
  v_unit := v_unit + v_tot + public._opciones_v2(p_dish.id, p_dish.restaurant_id, p_sel);
  RETURN jsonb_build_object('unit', v_unit, 'size', v_size, 'toppings', v_ok);
END;
$$;

-- create_public_order: misma firma y mismo comportamiento; el cálculo del plato ahora usa _precio_plato.
CREATE OR REPLACE FUNCTION public.create_public_order(p_restaurant_id uuid, p_table_num integer, p_customer_name text, p_notes text, p_items jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order_id uuid; v_total numeric := 0; v_computed jsonb := '[]'::jsonb; v_item jsonb; v_kind text; v_qty int; v_dish public.dishes%ROWTYPE; v_dish_id uuid;
  v_unit numeric; v_size text; v_line_notes text; v_name text; v_ing jsonb; v_ing_row record; v_qty_ing numeric; v_custom_total numeric;
  v_headers jsonb; v_ip text; v_rl_key text; v_rl_count int; v_rl_window timestamptz; v_cfg record; v_hora_local time;
  v_reservas jsonb := '{}'::jsonb; v_toppings_ok jsonb; v_sel jsonb; v_pp jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN RAISE EXCEPTION 'restaurant_id requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id AND active = true) THEN
    RAISE EXCEPTION 'restaurante no disponible';
  END IF;

  SELECT cerrado_manual, cerrado_mensaje, horario_activo, horario_apertura, horario_cierre
    INTO v_cfg
    FROM public.restaurant_config WHERE restaurant_id = p_restaurant_id;

  IF v_cfg.cerrado_manual THEN
    RAISE EXCEPTION '%', COALESCE(v_cfg.cerrado_mensaje, 'El restaurante está cerrado temporalmente. Intenta más tarde.');
  END IF;

  IF v_cfg.horario_activo AND v_cfg.horario_apertura IS NOT NULL AND v_cfg.horario_cierre IS NOT NULL THEN
    v_hora_local := (now() AT TIME ZONE 'America/Bogota')::time;
    IF NOT (
      CASE WHEN v_cfg.horario_apertura::time <= v_cfg.horario_cierre::time
        THEN v_hora_local BETWEEN v_cfg.horario_apertura::time AND v_cfg.horario_cierre::time
        ELSE v_hora_local >= v_cfg.horario_apertura::time OR v_hora_local <= v_cfg.horario_cierre::time
      END
    ) THEN
      RAISE EXCEPTION 'Cerrado ahora. Atendemos de % a %', v_cfg.horario_apertura, v_cfg.horario_cierre;
    END IF;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL;
  END;
  v_ip := coalesce(
    v_headers->>'cf-connecting-ip',
    nullif(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), ''),
    'sin-ip'
  );
  v_rl_key := p_restaurant_id::text || ':' || v_ip;

  INSERT INTO public.order_rate_limit (identifier, window_start, request_count)
  VALUES (v_rl_key, now(), 1)
  ON CONFLICT (identifier) DO UPDATE SET
    request_count = CASE WHEN public.order_rate_limit.window_start < now() - interval '60 seconds'
                         THEN 1 ELSE public.order_rate_limit.request_count + 1 END,
    window_start  = CASE WHEN public.order_rate_limit.window_start < now() - interval '60 seconds'
                         THEN now() ELSE public.order_rate_limit.window_start END
  RETURNING request_count, window_start INTO v_rl_count, v_rl_window;

  IF v_rl_count > 8 THEN
    RAISE EXCEPTION 'Demasiados pedidos seguidos, espera un momento antes de intentar de nuevo';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'el pedido no tiene items';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'demasiados items en el pedido';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_kind := coalesce(v_item->>'kind', 'dish');
    v_qty  := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
    v_line_notes := NULLIF(left(trim(coalesce(v_item->>'line_notes', '')), 400), '');
    v_toppings_ok := NULL;
    v_sel := NULL;

    IF v_kind = 'dish' THEN
      SELECT * INTO v_dish FROM public.dishes
        WHERE id = (v_item->>'dish_id')::uuid
          AND restaurant_id = p_restaurant_id
          AND available = true
          AND availability_status <> 'discontinued';
      IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible'; END IF;

      v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' THEN v_item->'sel' END);
      IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
      v_unit := (v_pp->>'unit')::numeric;
      v_size := v_pp->>'size';
      v_toppings_ok := v_pp->'toppings';

      v_name := v_dish.name;
      v_dish_id := v_dish.id;
      v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);
      v_sel := CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END;

    ELSIF v_kind = 'custom' THEN
      v_custom_total := 0;
      FOR v_ing IN SELECT * FROM jsonb_array_elements(coalesce(v_item->'ingredients', '[]'::jsonb))
      LOOP
        SELECT * INTO v_ing_row FROM public.ingredientes_menu_publico
          WHERE id = (v_ing->>'id')::uuid AND restaurant_id = p_restaurant_id AND disponible = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'ingrediente no disponible'; END IF;
        v_qty_ing := coalesce((v_ing->>'cantidad')::numeric, 0);
        IF v_qty_ing <= 0 OR v_qty_ing > 1000 THEN RAISE EXCEPTION 'cantidad de ingrediente inválida'; END IF;
        v_custom_total := v_custom_total + v_ing_row.precio_venta_unitario * v_qty_ing;
      END LOOP;
      IF v_custom_total <= 0 THEN RAISE EXCEPTION 'plato personalizado vacío'; END IF;
      v_unit := ceil(v_custom_total / 100) * 100;
      v_name := 'Plato personalizado';
      v_dish_id := NULL;
      v_size := NULL;

    ELSE
      RAISE EXCEPTION 'tipo de item inválido';
    END IF;

    v_total := v_total + v_unit * v_qty;
    v_computed := v_computed || jsonb_build_object(
      'id', v_dish_id, 'name', v_name, 'price', v_unit, 'quantity', v_qty, 'notes', v_line_notes,
      'size', v_size, 'toppings', v_toppings_ok, 'sel', v_sel
    );
  END LOOP;

  IF p_table_num IS NOT NULL AND (p_table_num < 1 OR p_table_num > 100) THEN
    RAISE EXCEPTION 'número de mesa inválido';
  END IF;

  INSERT INTO public.orders (
    restaurant_id, table_num, items, total, tipo_pedido, status, customer_name, notes, user_id
  ) VALUES (
    p_restaurant_id, p_table_num, v_computed, v_total, 'LOCAL', 'pending',
    NULLIF(left(trim(coalesce(p_customer_name,'')), 120), ''),
    NULLIF(left(trim(coalesce(p_notes,'')), 500), ''),
    NULL
  ) RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

-- crear_orden_completa: misma firma y mismo comportamiento; el cálculo del plato ahora usa _precio_plato.
CREATE OR REPLACE FUNCTION public.crear_orden_completa(p_mesa_id uuid, p_items jsonb, p_tipo_pedido text, p_notes text DEFAULT NULL, p_table_num integer DEFAULT NULL, p_customer_name text DEFAULT NULL)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.orders%ROWTYPE; v_total NUMERIC := 0; v_item JSONB; v_qty INTEGER; v_dish public.dishes%ROWTYPE;
  v_rid UUID := public.current_restaurant_id(); v_items_final JSONB := '[]'::JSONB; v_unit numeric; v_reservas jsonb := '{}'::jsonb;
  v_comensal text; v_pp jsonb;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier') THEN
    RAISE EXCEPTION 'No autorizado para crear órdenes';
  END IF;
  IF v_rid IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el restaurante';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'la orden no tiene items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::INTEGER, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_dish FROM public.dishes
      WHERE id = (v_item->>'id')::uuid AND restaurant_id = v_rid
        AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible: %', v_item->>'id'; END IF;

    v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', v_item->'sel');
    IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN
      RAISE EXCEPTION 'tamaño inválido para %: %', v_dish.name, NULLIF(v_item->>'size', '');
    END IF;
    v_unit := (v_pp->>'unit')::numeric;

    v_reservas := public.reservar_stock_receta(v_dish.id, v_qty, v_reservas);

    v_total := v_total + v_unit * v_qty;
    v_comensal := NULLIF(left(btrim(coalesce(v_item->>'comensal', '')), 60), '');
    v_items_final := v_items_final || (jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name, 'price', v_unit,
      'quantity', v_qty, 'notes', v_item->>'notes',
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END
    ) || CASE WHEN v_comensal IS NOT NULL THEN jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);
  END LOOP;

  INSERT INTO public.orders (
    user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id, customer_name,
    payment_method, paid_at, amount_paid, paid_by
  )
  VALUES (
    auth.uid(), p_mesa_id, p_table_num, v_items_final, v_total, p_tipo_pedido, p_notes, 'pending', v_rid,
    NULLIF(left(trim(coalesce(p_customer_name,'')), 120), ''),
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN 'rappi' END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN NOW() END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN v_total END,
    CASE WHEN p_tipo_pedido = 'RAPPI' THEN auth.uid() END
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_final) LOOP
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id, opciones_consumo)
    VALUES (v_order.id, (v_item->>'id')::UUID, (v_item->>'quantity')::INTEGER, (v_item->>'price')::NUMERIC, v_item->>'notes', v_rid,
      public._consumo_opciones((v_item->>'id')::UUID, v_rid, v_item->'sel'));
  END LOOP;

  RETURN json_build_object('order_id', v_order.id, 'total', v_total, 'status', 'pending');
END;
$$;

-- ─── 3. Domicilio: la lógica de dom_crear pasa a una función base que también usa el bot ───
CREATE OR REPLACE FUNCTION public._dom_crear_base(
  p_rid uuid, p_order_id uuid, p_direccion text, p_referencia text, p_lat numeric, p_lng numeric, p_costo_envio numeric, p_cliente_id uuid,
  p_contacto_nombre text, p_contacto_telefono text, p_metodo_pago text, p_conversacion_id uuid, p_origen text, p_creado_por uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_paid timestamptz; v_rec text; v_ent text; v_pago text;
BEGIN
  IF p_metodo_pago IS NOT NULL AND p_metodo_pago NOT IN ('transferencia','contra_entrega') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;
  SELECT paid_at INTO v_paid FROM orders WHERE id = p_order_id AND restaurant_id = p_rid AND tipo_pedido = 'DOMICILIO' AND status <> 'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe o no es de tipo domicilio'; END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND restaurant_id = p_rid) THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  v_rec := _dom_codigo(p_rid, 'codigo_recogida');
  v_ent := _dom_codigo(p_rid, 'codigo_entrega');
  v_pago := CASE WHEN v_paid IS NOT NULL THEN 'confirmado' WHEN p_metodo_pago = 'transferencia' THEN 'pendiente_comprobante'
                 WHEN p_metodo_pago = 'contra_entrega' THEN 'contra_entrega' ELSE 'sin_definir' END;
  INSERT INTO domicilios (restaurant_id, order_id, cliente_id, conversacion_id, contacto_nombre, contacto_telefono, direccion, referencia, lat, lng, costo_envio,
                          metodo_pago, pago_estado, codigo_recogida, codigo_entrega)
  VALUES (p_rid, p_order_id, p_cliente_id, p_conversacion_id, NULLIF(btrim(p_contacto_nombre), ''), _fid_tel(p_contacto_telefono), btrim(p_direccion), NULLIF(btrim(p_referencia), ''), p_lat, p_lng, COALESCE(p_costo_envio, 0),
          p_metodo_pago, v_pago, v_rec, v_ent)
  RETURNING id INTO v_id;
  -- Transferencia sin pagar: el pedido queda retenido y la cocina no lo ve hasta confirmar el pago.
  UPDATE orders SET codigo_recogida = v_rec, en_espera_pago = (v_pago = 'pendiente_comprobante') WHERE id = p_order_id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (p_rid, v_id, 'recibido', p_origen, jsonb_build_object('metodo_pago', p_metodo_pago), p_creado_por);
  RETURN v_id;
END;
$$;

-- dom_crear: misma firma (10 argumentos) y mismo comportamiento.
CREATE OR REPLACE FUNCTION public.dom_crear(
  p_order_id uuid, p_direccion text, p_referencia text DEFAULT NULL, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL,
  p_costo_envio numeric DEFAULT 0, p_cliente_id uuid DEFAULT NULL, p_contacto_nombre text DEFAULT NULL, p_contacto_telefono text DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para crear domicilios'; END IF;
  RETURN _dom_crear_base(v_rid, p_order_id, p_direccion, p_referencia, p_lat, p_lng, p_costo_envio, p_cliente_id, p_contacto_nombre, p_contacto_telefono,
                         p_metodo_pago, NULL, 'manual', auth.uid());
END;
$$;

-- ─── 4. Cotizar: valida y PRECIA un carrito con la base (no crea nada). Las líneas salen en el mismo formato de orders.items ───
-- p_items: [{dish_id, cantidad, tamano, toppings:[nombre], sel:{grupos:{…}}, nota}]
CREATE OR REPLACE FUNCTION public.wa_bot_cotizar(p_rid uuid, p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it jsonb; d dishes%ROWTYPE; v_qty int; v_pp jsonb; v_lineas jsonb := '[]'::jsonb; v_sub numeric := 0; v_res jsonb := '{}'::jsonb; v_tam text; t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_rid AND active) THEN RAISE EXCEPTION 'Restaurante no disponible'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Carrito inválido'; END IF;
  IF jsonb_array_length(p_items) > 30 THEN RAISE EXCEPTION 'Máximo 30 productos por pedido'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE(it->>'cantidad', '') !~ '^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    v_qty := (it->>'cantidad')::int;
    IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'La cantidad debe estar entre 1 y 20'; END IF;
    IF COALESCE(it->>'dish_id', '') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Plato inválido'; END IF;
    SELECT * INTO d FROM dishes WHERE id = (it->>'dish_id')::uuid AND restaurant_id = p_rid AND available AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese plato no está disponible'; END IF;
    v_tam := NULLIF(it->>'tamano', '');
    IF d.has_sizes AND jsonb_typeof(d.sizes) = 'array' AND jsonb_array_length(d.sizes) > 0 AND v_tam IS NULL THEN
      RAISE EXCEPTION 'Falta elegir el tamaño de %', d.name;
    END IF;
    IF NOT d.has_sizes AND v_tam IS NOT NULL THEN RAISE EXCEPTION '% no tiene tamaños', d.name; END IF;
    IF jsonb_typeof(it->'toppings') = 'array' THEN
      FOR t IN SELECT jsonb_array_elements_text(it->'toppings') LOOP
        IF jsonb_typeof(d.toppings) <> 'array' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.toppings) x WHERE x->>'nombre' = t) THEN
          RAISE EXCEPTION '"%" no es un topping de %', t, d.name;
        END IF;
      END LOOP;
    END IF;
    v_pp := _precio_plato(d, v_tam, CASE WHEN jsonb_typeof(it->'toppings') = 'array' THEN it->'toppings' END, CASE WHEN jsonb_typeof(it->'sel') = 'object' THEN it->'sel' END);
    IF COALESCE((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'Tamaño inválido para %', d.name; END IF;
    v_res := reservar_stock_receta(d.id, v_qty, v_res);
    v_lineas := v_lineas || jsonb_build_object(
      'id', d.id, 'name', d.name, 'price', (v_pp->>'unit')::numeric, 'quantity', v_qty, 'notes', NULLIF(left(btrim(COALESCE(it->>'nota', '')), 200), ''),
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(it->'sel') = 'object' AND length((it->'sel')::text) <= 4000 THEN it->'sel' END);
    v_sub := v_sub + (v_pp->>'unit')::numeric * v_qty;
  END LOOP;
  RETURN jsonb_build_object('lineas', v_lineas, 'subtotal', v_sub);
END;
$$;

-- ─── 5. Crear el pedido del bot (solo servicio) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_crear_pedido_bot(
  p_restaurant_id uuid, p_telefono text, p_nombre text, p_items jsonb, p_tipo text, p_direccion text, p_referencia text, p_metodo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); cv wa_conversaciones%ROWTYPE; cfg wa_config%ROWTYPE; rc record;
  v_hash text; v_prev jsonb; v_cot jsonb; v_sub numeric; v_costo numeric := 0; v_max numeric; v_cli uuid; v_order uuid; v_num int; v_dom uuid;
  v_nombre text := btrim(COALESCE(p_nombre, '')); v_dir text := btrim(COALESCE(p_direccion, '')); v_res jsonb; v_hora time; it jsonb; v_rec text; v_ent text;
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
  IF p_tipo NOT IN ('domicilio','recoger') THEN RAISE EXCEPTION 'Tipo de entrega inválido'; END IF;
  IF NOT ((p_tipo = 'domicilio' AND p_metodo IN ('transferencia','contra_entrega')) OR (p_tipo = 'recoger' AND p_metodo = 'efectivo_local')) THEN
    RAISE EXCEPTION 'Ese método de pago no aplica a este tipo de entrega';
  END IF;
  IF char_length(v_nombre) < 2 OR char_length(v_nombre) > 120 THEN RAISE EXCEPTION 'Falta el nombre del cliente'; END IF;
  IF p_tipo = 'domicilio' AND (char_length(v_dir) < 5 OR char_length(v_dir) > 300) THEN RAISE EXCEPTION 'Falta la dirección de entrega'; END IF;

  SELECT * INTO cv FROM wa_conversaciones WHERE restaurant_id = p_restaurant_id AND telefono = v_tel FOR UPDATE;   -- serializa reintentos del mismo cliente
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;

  v_hash := md5(COALESCE(p_items::text, '') || '|' || p_tipo || '|' || p_metodo || '|' || v_dir);
  v_prev := cv.contexto->'ultimo_pedido';
  IF v_prev IS NOT NULL AND v_prev->>'huella' = v_hash AND (v_prev->>'at')::timestamptz > now() - interval '10 minutes' THEN
    RETURN (v_prev->'resultado') || jsonb_build_object('repetido', true);   -- mismo pedido reintentado: no se crea otro
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

  -- Cliente: el que ya existe con ese teléfono, o uno nuevo SIN consentimiento de promociones.
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

-- ─── 6. Lo que el cerebro necesita en cada turno (todo filtrado por p_rid: nunca mezcla restaurantes) ───
CREATE OR REPLACE FUNCTION public.wa_bot_contexto(p_rid uuid, p_conv uuid, p_excluir uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r restaurants%ROWTYPE; cfg wa_config%ROWTYPE; rc restaurant_config%ROWTYPE; cv wa_conversaciones%ROWTYPE; v_menu jsonb; v_hist jsonb; v_abierto boolean; v_hora time; v_cli text;
BEGIN
  SELECT * INTO r FROM restaurants WHERE id = p_rid AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cv FROM wa_conversaciones WHERE id = p_conv AND restaurant_id = p_rid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cfg FROM wa_config WHERE restaurant_id = p_rid;
  SELECT * INTO rc FROM restaurant_config WHERE restaurant_id = p_rid;
  v_hora := (now() AT TIME ZONE 'America/Bogota')::time;
  v_abierto := CASE WHEN rc.cerrado_manual THEN false
    WHEN rc.horario_activo AND rc.horario_apertura IS NOT NULL AND rc.horario_cierre IS NOT NULL THEN
      CASE WHEN rc.horario_apertura::time <= rc.horario_cierre::time THEN v_hora BETWEEN rc.horario_apertura::time AND rc.horario_cierre::time
           ELSE v_hora >= rc.horario_apertura::time OR v_hora <= rc.horario_cierre::time END
    ELSE NULL END;
  SELECT nombre INTO v_cli FROM clientes WHERE id = cv.cliente_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'categoria', (x->>'orden')::int, x->>'nombre', x->>'id'), '[]'::jsonb) INTO v_menu FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'nombre', d.name, 'descripcion', left(COALESCE(d.description, ''), 160), 'precio', d.price, 'categoria', COALESCE(d.category, ''), 'orden', COALESCE(d.sort_order, 0),
      'tamanos', CASE WHEN d.has_sizes AND jsonb_typeof(d.sizes) = 'array' THEN d.sizes ELSE '[]'::jsonb END,
      'toppings', CASE WHEN jsonb_typeof(d.toppings) = 'array' THEN d.toppings ELSE '[]'::jsonb END,
      'opciones', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', g->>'id', 'nombre', g->>'nombre', 'requerido', COALESCE((g->>'requerido')::boolean, false),
                 'min', COALESCE((g->>'min')::int, CASE WHEN COALESCE((g->>'requerido')::boolean, false) THEN 1 ELSE 0 END), 'max', CASE WHEN COALESCE(g->>'max', '') ~ '^[0-9]+$' THEN (g->>'max')::int ELSE 1 END,
                 'items', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object('l', i->>'label', 'p', COALESCE((i->>'precio_extra')::numeric, 0),
                            's', CASE WHEN i ? 'sub' THEN jsonb_build_object('n', COALESCE((i->'sub'->>'cantidad')::int, 1),
                                   'o', COALESCE((SELECT jsonb_agg(si->>'label') FROM jsonb_array_elements(_lista_items(p_rid, i->'sub'->>'lista')) si WHERE COALESCE((si->>'activo')::boolean, true)), '[]'::jsonb)) END))
                   FROM jsonb_array_elements(CASE WHEN g->'fuente' ? 'lista' THEN _lista_items(p_rid, g->'fuente'->>'lista') ELSE COALESCE(g->'fuente'->'items', '[]'::jsonb) END) i
                   WHERE COALESCE((i->>'activo')::boolean, true)), '[]'::jsonb)))
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.options) = 'array' THEN d.options ELSE '[]'::jsonb END) g WHERE COALESCE(g->>'v', '') = '2'), '[]'::jsonb)) AS x
    FROM dishes d WHERE d.restaurant_id = p_rid AND d.available AND d.availability_status <> 'discontinued' LIMIT 400) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('rol', CASE WHEN h.direccion = 'entrante' THEN 'user' ELSE 'assistant' END,
                     'texto', COALESCE(h.contenido->>'texto', h.contenido->>'transcripcion', CASE h.tipo WHEN 'imagen' THEN '[imagen]' WHEN 'audio' THEN '[nota de voz]' ELSE NULL END)) ORDER BY h.created_at), '[]'::jsonb)
    INTO v_hist FROM (
      SELECT * FROM wa_mensajes m WHERE m.conversacion_id = p_conv AND m.restaurant_id = p_rid AND m.estado <> 'fallido' AND (p_excluir IS NULL OR m.id <> p_excluir)
         AND m.tipo IN ('texto','imagen','audio') ORDER BY m.created_at DESC LIMIT 12) h
    WHERE COALESCE(h.contenido->>'texto', h.contenido->>'transcripcion', CASE h.tipo WHEN 'imagen' THEN 'x' WHEN 'audio' THEN 'x' END) IS NOT NULL;

  RETURN jsonb_build_object(
    'restaurante', jsonb_build_object('id', r.id, 'nombre', COALESCE(NULLIF(btrim(rc.display_name), ''), r.name), 'slug', r.slug, 'direccion', rc.direccion, 'ciudad', rc.ciudad),
    'cfg', jsonb_build_object('modo', cfg.modo, 'bot_pedidos', COALESCE(cfg.bot_pedidos, false), 'bot_nombre', cfg.bot_nombre, 'bot_tono', cfg.bot_tono, 'bot_info', cfg.bot_info,
           'horario', cfg.horario, 'tarifa_domicilio', COALESCE(cfg.tarifa_domicilio, 0), 'cobertura', cfg.cobertura, 'datos_transferencia', cfg.datos_transferencia,
           'bot_bienvenida', cfg.bot_bienvenida, 'pedido_minimo', COALESCE(cfg.pedido_minimo, 0)),
    'abierto', jsonb_build_object('ahora', v_abierto, 'hora', to_char(v_hora, 'HH24:MI'), 'apertura', CASE WHEN rc.horario_activo THEN rc.horario_apertura END, 'cierre', CASE WHEN rc.horario_activo THEN rc.horario_cierre END,
           'mensaje', CASE WHEN rc.cerrado_manual THEN rc.cerrado_mensaje END),
    'conv', jsonb_build_object('id', cv.id, 'estado', cv.estado, 'contexto', cv.contexto, 'nombre', COALESCE(v_cli, cv.nombre_perfil), 'es_prueba', cv.es_prueba),
    'menu', v_menu, 'historial', v_hist,
    'tope_total', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_total_max'), 1500000),
    'precios', jsonb_build_object('entrada', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'ai_precio_entrada_usd_millon'), 0.3),
                                  'salida', COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'ai_precio_salida_usd_millon'), 2.5)));
END;
$$;

-- Guarda el estado de la conversación SOLO si nadie lo cambió mientras tanto (revisión optimista). Devuelve false si hubo cambio.
CREATE OR REPLACE FUNCTION public.wa_bot_guardar(p_conv uuid, p_contexto jsonb, p_rev int, p_estado text DEFAULT NULL, p_mensaje_id uuid DEFAULT NULL, p_transcripcion text DEFAULT NULL)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF p_estado IS NOT NULL AND p_estado NOT IN ('abierta','esperando_humano') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  IF length(p_contexto::text) > 60000 THEN RAISE EXCEPTION 'Contexto demasiado grande'; END IF;
  -- 'ultimo_pedido' lo escribe wa_crear_pedido_bot (anti-duplicados): el cerebro no lo toca y aquí se conserva.
  UPDATE wa_conversaciones SET contexto = (p_contexto - 'ultimo_pedido') || jsonb_build_object('rev', p_rev + 1) || CASE WHEN contexto ? 'ultimo_pedido' THEN jsonb_build_object('ultimo_pedido', contexto->'ultimo_pedido') ELSE '{}'::jsonb END, estado = COALESCE(p_estado, estado)
   WHERE id = p_conv AND COALESCE((contexto->>'rev')::int, 0) = p_rev;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 AND p_mensaje_id IS NOT NULL AND p_transcripcion IS NOT NULL THEN
    UPDATE wa_mensajes SET contenido = contenido || jsonb_build_object('transcripcion', left(p_transcripcion, 1000)) WHERE id = p_mensaje_id AND conversacion_id = p_conv;
  END IF;
  RETURN n = 1;
END;
$$;

-- Tope de uso de IA del bot: el global del mes (el mismo de los reportes) y N llamadas por restaurante y día (por defecto 200).
CREATE OR REPLACE FUNCTION public.wa_bot_cupo(p_rid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_gasto numeric; v_tope numeric; v_dia int; v_max int;
  v_mes timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
  v_hoy timestamptz := hoy_local()::timestamp AT TIME ZONE 'America/Bogota';
BEGIN
  SELECT COALESCE(sum(costo_usd), 0) INTO v_gasto FROM ai_usage WHERE created_at >= v_mes;
  SELECT COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'ai_tope_global_usd_mes'), 20) INTO v_tope;
  IF v_gasto >= v_tope THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'tope_global'); END IF;
  SELECT count(*) INTO v_dia FROM ai_usage WHERE restaurant_id = p_rid AND funcion = 'wa_bot' AND created_at >= v_hoy;
  SELECT COALESCE((SELECT valor::text::numeric FROM platform_settings WHERE clave = 'wa_bot_tope_diario'), 200)::int INTO v_max;
  IF v_dia >= v_max THEN RETURN jsonb_build_object('permitido', false, 'motivo', 'tope_diario'); END IF;
  RETURN jsonb_build_object('permitido', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_bot_uso(p_rid uuid, p_funcion text, p_proveedor text, p_modelo text, p_tin int, p_tout int, p_costo numeric) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO ai_usage (restaurant_id, funcion, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd)
  VALUES (p_rid, left(p_funcion, 60), left(p_proveedor, 60), left(p_modelo, 80), GREATEST(p_tin, 0), GREATEST(p_tout, 0), GREATEST(p_costo, 0));
$$;

-- ─── 7. Chat de prueba del administrador (sin Meta) ──────────────────────────
CREATE OR REPLACE FUNCTION public.wa_bot_prueba_conv(p_rid uuid, p_user uuid, p_reiniciar boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := '5700000' || lpad((abs(hashtextextended(p_user::text, 0)) % 100000000)::text, 8, '0'); v_conv uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_rid) THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  INSERT INTO wa_conversaciones (restaurant_id, telefono, tipo_contacto, nombre_perfil, es_prueba, ultimo_entrante_at, ultimo_mensaje_at)
  VALUES (p_rid, v_tel, 'cliente', 'Prueba', true, now(), now())
  ON CONFLICT (restaurant_id, telefono) DO UPDATE SET es_prueba = true
  RETURNING id INTO v_conv;
  IF p_reiniciar THEN
    DELETE FROM wa_mensajes WHERE conversacion_id = v_conv AND restaurant_id = p_rid;
    UPDATE wa_conversaciones SET contexto = '{}'::jsonb, estado = 'abierta' WHERE id = v_conv;
  END IF;
  RETURN jsonb_build_object('conversacion_id', v_conv, 'telefono', v_tel);
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_bot_prueba_msg(p_conv uuid, p_direccion text, p_texto text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cv wa_conversaciones%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO cv FROM wa_conversaciones WHERE id = p_conv AND es_prueba;
  IF NOT FOUND THEN RAISE EXCEPTION 'No es una conversación de prueba'; END IF;
  IF p_direccion NOT IN ('entrante','saliente') THEN RAISE EXCEPTION 'Dirección inválida'; END IF;
  INSERT INTO wa_mensajes (restaurant_id, conversacion_id, direccion, tipo, contenido, origen, estado)
  VALUES (cv.restaurant_id, cv.id, p_direccion, 'texto', jsonb_build_object('texto', left(COALESCE(p_texto, ''), 4000)),
          CASE WHEN p_direccion = 'entrante' THEN 'cliente' ELSE 'bot' END, CASE WHEN p_direccion = 'entrante' THEN 'recibido' ELSE 'enviado' END)   -- 'enviado': la cola nunca lo toma
  RETURNING id INTO v_id;
  UPDATE wa_conversaciones SET ultimo_mensaje_at = now(), ultimo_entrante_at = CASE WHEN p_direccion = 'entrante' THEN now() ELSE ultimo_entrante_at END WHERE id = cv.id;
  RETURN v_id;
END;
$$;

-- ─── 8. BAJA (ahora con registro) y ALTA ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_registrar_baja(p_rid uuid, p_telefono text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g');
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RETURN; END IF;
  INSERT INTO wa_bajas (restaurant_id, telefono) VALUES (p_rid, v_tel) ON CONFLICT DO NOTHING;
  INSERT INTO wa_consent_log (restaurant_id, telefono, evento) VALUES (p_rid, v_tel, 'baja');
  UPDATE clientes SET consentimiento_marketing = false, consentimiento_canal = NULL WHERE restaurant_id = p_rid AND telefono = v_tel AND consentimiento_marketing;
  UPDATE fid_campana_destinatarios d SET estado = 'omitido_sin_consentimiento'
    FROM clientes c WHERE c.id = d.cliente_id AND c.restaurant_id = p_rid AND c.telefono = v_tel AND d.estado = 'pendiente';
  UPDATE wa_mensajes m SET estado = 'fallido', error = 'El cliente pidió no recibir mensajes (BAJA)'
    FROM wa_conversaciones cv
   WHERE cv.id = m.conversacion_id AND cv.restaurant_id = p_rid AND cv.telefono = v_tel AND cv.tipo_contacto = 'cliente'
     AND m.estado = 'en_cola' AND m.direccion = 'saliente' AND m.origen IN ('campana','arm','sistema');
END;
$$;

-- ALTA: vuelve a recibir SOLO los avisos de su pedido (origen 'sistema'). El consentimiento de promociones NO se reactiva: eso solo lo da el cliente en Caja o el menú.
-- Devuelve true si estaba dado de baja.
CREATE OR REPLACE FUNCTION public.wa_registrar_alta(p_rid uuid, p_telefono text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text := regexp_replace(COALESCE(p_telefono, ''), '\D', '', 'g'); n int;
BEGIN
  IF v_tel !~ '^[0-9]{8,15}$' THEN RETURN false; END IF;
  DELETE FROM wa_bajas WHERE restaurant_id = p_rid AND telefono = v_tel;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN INSERT INTO wa_consent_log (restaurant_id, telefono, evento) VALUES (p_rid, v_tel, 'alta'); END IF;
  RETURN n > 0;
END;
$$;

-- ─── 9. Control de conversaciones para la pantalla (administrador y cajero) ──
CREATE OR REPLACE FUNCTION public.wa_conversaciones_lista(p_estado text DEFAULT NULL, p_limite int DEFAULT 50)
 RETURNS TABLE (id uuid, telefono text, nombre text, tipo_contacto text, estado text, ultimo_mensaje_at timestamptz, ultimo_texto text, pedido_en_curso boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero ven las conversaciones'; END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('abierta','esperando_humano','cerrada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  RETURN QUERY
  SELECT c.id, CASE WHEN v_rol = 'admin' THEN c.telefono ELSE '******' || right(c.telefono, 4) END,
         COALESCE(NULLIF(btrim(cl.nombre), ''), c.nombre_perfil), c.tipo_contacto, c.estado, c.ultimo_mensaje_at,
         (SELECT COALESCE(m.contenido->>'texto', m.contenido->>'transcripcion', m.contenido->>'caption', CASE m.tipo WHEN 'imagen' THEN '[imagen]' WHEN 'audio' THEN '[nota de voz]' WHEN 'plantilla' THEN '[aviso automático]' END)
            FROM wa_mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1),
         (COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(c.contexto->'carrito') = 'array' THEN c.contexto->'carrito' END), 0) > 0
          OR EXISTS (SELECT 1 FROM domicilios d WHERE d.conversacion_id = c.id AND d.estado NOT IN ('entregado','cancelado','fallido')))
    FROM wa_conversaciones c LEFT JOIN clientes cl ON cl.id = c.cliente_id
   WHERE c.restaurant_id = v_rid AND NOT c.es_prueba AND (p_estado IS NULL OR c.estado = p_estado)
   ORDER BY (c.estado = 'esperando_humano') DESC, c.ultimo_mensaje_at DESC NULLS LAST
   LIMIT greatest(1, least(COALESCE(p_limite, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_conversacion_mensajes(p_id uuid, p_limite int DEFAULT 100)
 RETURNS TABLE (id uuid, direccion text, tipo text, texto text, origen text, estado text, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero ven las conversaciones'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wa_conversaciones WHERE id = p_id AND restaurant_id = v_rid AND NOT es_prueba) THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
  RETURN QUERY
  SELECT t.id, t.direccion, t.tipo, t.texto, t.origen, t.estado, t.created_at FROM (
    SELECT m.id, m.direccion, m.tipo, COALESCE(m.contenido->>'texto', m.contenido->>'transcripcion', m.contenido->>'caption') AS texto, m.origen, m.estado, m.created_at
      FROM wa_mensajes m WHERE m.conversacion_id = p_id AND m.restaurant_id = v_rid ORDER BY m.created_at DESC LIMIT greatest(1, least(COALESCE(p_limite, 100), 500))) t
  ORDER BY t.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_conversacion_responder(p_id uuid, p_texto text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); cv wa_conversaciones%ROWTYPE; v_txt text := btrim(COALESCE(p_texto, '')); v_msg uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero responden conversaciones'; END IF;
  IF char_length(v_txt) < 1 OR char_length(v_txt) > 1000 THEN RAISE EXCEPTION 'El mensaje debe tener entre 1 y 1000 caracteres'; END IF;
  SELECT * INTO cv FROM wa_conversaciones WHERE id = p_id AND restaurant_id = v_rid AND NOT es_prueba FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
  IF cv.ultimo_entrante_at IS NULL OR cv.ultimo_entrante_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp ya no deja responder con texto libre';
  END IF;
  v_msg := _wa_encolar(v_rid, cv.telefono, cv.tipo_contacto, cv.cliente_id, cv.repartidor_id, 'texto', jsonb_build_object('texto', v_txt), NULL, 'manual');
  IF v_msg IS NULL THEN RAISE EXCEPTION 'WhatsApp no está activado en este restaurante'; END IF;
  UPDATE wa_conversaciones SET estado = 'esperando_humano' WHERE id = cv.id;   -- una persona tomó la conversación: el bot se queda callado
  RETURN v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_conversacion_devolver_bot(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero devuelven conversaciones al bot'; END IF;
  UPDATE wa_conversaciones SET estado = 'abierta', contexto = (contexto - 'handoff_motivo') || jsonb_build_object('fallos', 0)
   WHERE id = p_id AND restaurant_id = v_rid AND NOT es_prueba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_conversacion_cerrar(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero cierran conversaciones'; END IF;
  UPDATE wa_conversaciones SET estado = 'cerrada' WHERE id = p_id AND restaurant_id = v_rid AND NOT es_prueba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
END;
$$;

-- ─── Permisos ───
REVOKE ALL ON FUNCTION public._precio_plato(public.dishes, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dom_crear_base(uuid, uuid, text, text, numeric, numeric, numeric, uuid, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_cotizar(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_crear_pedido_bot(uuid, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_contexto(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_guardar(uuid, jsonb, int, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_cupo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_uso(uuid, text, text, text, int, int, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_prueba_conv(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_bot_prueba_msg(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_baja(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_alta(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_bot_cotizar(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_crear_pedido_bot(uuid, text, text, jsonb, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_contexto(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_guardar(uuid, jsonb, int, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_cupo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_uso(uuid, text, text, text, int, int, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_prueba_conv(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_bot_prueba_msg(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_registrar_baja(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_registrar_alta(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.wa_conversaciones_lista(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_conversacion_mensajes(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_conversacion_responder(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_conversacion_devolver_bot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_conversacion_cerrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_conversaciones_lista(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_conversacion_mensajes(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_conversacion_responder(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_conversacion_devolver_bot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_conversacion_cerrar(uuid) TO authenticated;
