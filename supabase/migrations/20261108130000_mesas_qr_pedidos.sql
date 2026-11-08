-- Mesas · pedidos por QR con aprobación del mesero.
-- El comensal escanea el QR de la mesa y pide desde el celular. El pedido NO entra a cocina: queda en
-- pedidos_mesa_pendientes hasta que mesero/cajero/admin lo acepta (entonces se crea como cualquier pedido, con crear_orden_completa).
--  * Precios siempre del servidor (_precio_plato). El cliente nunca manda precios.
--  * Cada mesa abierta (ocupada/cuenta) tiene un código de 4 dígitos que rota: se crea al abrirse y se borra al quedar libre.
--    Un celular nuevo en una mesa ya abierta debe escribirlo (5 fallos = mesa bloqueada 5 minutos para códigos).
--  * Nadie (anon/authenticated) lee ni escribe las tablas nuevas directo salvo el personal en SELECT; todo pasa por funciones.
--  * Funciones nuevas, nombres únicos: no se toca ninguna firma existente (cero sobrecargas duplicadas).

-- ─── 1. Código de mesa ─────────────────────────────────────────────────────
ALTER TABLE public.mesas
  ADD COLUMN IF NOT EXISTS codigo_mesa             text CHECK (codigo_mesa IS NULL OR codigo_mesa ~ '^[0-9]{4}$'),
  ADD COLUMN IF NOT EXISTS dispositivos_autorizados uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS codigo_fallos           int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_bloqueo_hasta    timestamptz;

CREATE OR REPLACE FUNCTION public._mesa_codigo_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'libre' THEN
    NEW.codigo_mesa := NULL; NEW.dispositivos_autorizados := '{}'; NEW.codigo_fallos := 0; NEW.codigo_bloqueo_hasta := NULL;
  ELSIF NEW.estado IN ('ocupada','cuenta') AND NEW.codigo_mesa IS NULL THEN
    NEW.codigo_mesa := lpad((floor(random() * 10000))::int::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mesas_codigo ON public.mesas;
CREATE TRIGGER mesas_codigo BEFORE UPDATE OF estado ON public.mesas
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado) EXECUTE FUNCTION public._mesa_codigo_trg();
REVOKE ALL ON FUNCTION public._mesa_codigo_trg() FROM PUBLIC, anon, authenticated;

-- Mesas que ya estén abiertas al migrar
UPDATE public.mesas SET codigo_mesa = lpad((floor(random() * 10000))::int::text, 4, '0')
 WHERE estado IN ('ocupada','cuenta') AND codigo_mesa IS NULL;

-- ─── 2. Tablas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedidos_mesa_pendientes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  mesa_id       uuid NOT NULL REFERENCES public.mesas (id) ON DELETE CASCADE,
  table_num     int  NOT NULL,
  dispositivo   uuid NOT NULL,
  nombre        text CHECK (nombre IS NULL OR char_length(nombre) <= 60),
  items         jsonb NOT NULL,
  total         numeric NOT NULL CHECK (total >= 0),
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptado','rechazado','expirado')),
  motivo        text CHECK (motivo IS NULL OR char_length(motivo) <= 200),
  order_id      uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS pedidos_mesa_pend_rest_idx ON public.pedidos_mesa_pendientes (restaurant_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_mesa_pend_mesa_idx ON public.pedidos_mesa_pendientes (mesa_id, dispositivo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.llamadas_mesa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  mesa_id       uuid NOT NULL REFERENCES public.mesas (id) ON DELETE CASCADE,
  table_num     int  NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('mesero','cuenta')),
  dispositivo   uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  attended_at   timestamptz,
  attended_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
-- Una sola llamada sin atender por mesa y tipo (anti-spam, también bajo concurrencia)
CREATE UNIQUE INDEX IF NOT EXISTS llamadas_mesa_una_abierta ON public.llamadas_mesa (mesa_id, tipo) WHERE attended_at IS NULL;
CREATE INDEX IF NOT EXISTS llamadas_mesa_rest_idx ON public.llamadas_mesa (restaurant_id, created_at DESC);

ALTER TABLE public.pedidos_mesa_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llamadas_mesa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_mesa_pendientes, public.llamadas_mesa FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedidos_mesa_pendientes, public.llamadas_mesa TO authenticated;   -- solo para tiempo real del personal; escribir = solo funciones
DROP POLICY IF EXISTS "pedidos_mesa_pend: personal lee" ON public.pedidos_mesa_pendientes;
CREATE POLICY "pedidos_mesa_pend: personal lee" ON public.pedidos_mesa_pendientes FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','waiter','cashier'));
DROP POLICY IF EXISTS "llamadas_mesa: personal lee" ON public.llamadas_mesa;
CREATE POLICY "llamadas_mesa: personal lee" ON public.llamadas_mesa FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','waiter','cashier'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pedidos_mesa_pendientes') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_mesa_pendientes;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='llamadas_mesa') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.llamadas_mesa;
    END IF;
  END IF;
END $$;

-- ─── 3. Acceso a una mesa abierta (interna) ────────────────────────────────
-- 'ok' | 'codigo_requerido' | 'codigo_incorrecto' | 'bloqueada'. Mesa libre: siempre ok.
-- Si el código es correcto, el celular queda autorizado (hasta que la mesa se libere).
CREATE OR REPLACE FUNCTION public._mesa_acceso(p_mesa_id uuid, p_disp uuid, p_codigo text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.mesas%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'codigo_requerido'; END IF;
  IF m.estado NOT IN ('ocupada','cuenta') THEN RETURN 'ok'; END IF;
  IF p_disp = ANY (m.dispositivos_autorizados) THEN RETURN 'ok'; END IF;
  IF m.codigo_bloqueo_hasta IS NOT NULL AND m.codigo_bloqueo_hasta > now() THEN RETURN 'bloqueada'; END IF;
  IF NULLIF(btrim(coalesce(p_codigo,'')), '') IS NULL THEN RETURN 'codigo_requerido'; END IF;
  IF m.codigo_mesa IS NOT NULL AND btrim(p_codigo) = m.codigo_mesa THEN
    UPDATE public.mesas SET codigo_fallos = 0, codigo_bloqueo_hasta = NULL,
      dispositivos_autorizados = (array_append(dispositivos_autorizados, p_disp))[greatest(1, cardinality(dispositivos_autorizados) - 18):]
     WHERE id = m.id;
    RETURN 'ok';
  END IF;
  UPDATE public.mesas SET
    codigo_fallos = CASE WHEN codigo_fallos + 1 >= 5 THEN 0 ELSE codigo_fallos + 1 END,
    codigo_bloqueo_hasta = CASE WHEN codigo_fallos + 1 >= 5 THEN now() + interval '5 minutes' ELSE codigo_bloqueo_hasta END
   WHERE id = m.id;
  RETURN 'codigo_incorrecto';
END $$;
REVOKE ALL ON FUNCTION public._mesa_acceso(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 4. Funciones públicas (el comensal, sin sesión) ───────────────────────
DROP FUNCTION IF EXISTS public.mesa_publica_estado(uuid, integer, uuid);
CREATE FUNCTION public.mesa_publica_estado(p_restaurant uuid, p_mesa integer, p_dispositivo uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.mesas%ROWTYPE; v_abierta boolean; v_auth boolean; v_sol jsonb; v_lineas jsonb := '[]'::jsonb; v_total numeric := 0; v_call jsonb;
BEGIN
  IF p_restaurant IS NULL OR p_mesa IS NULL OR p_dispositivo IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  SELECT * INTO m FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND active = true) THEN
    RETURN jsonb_build_object('existe', false);
  END IF;
  v_abierta := m.estado IN ('ocupada','cuenta');
  v_auth := (NOT v_abierta) OR p_dispositivo = ANY (m.dispositivos_autorizados);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'estado', CASE WHEN s.estado = 'pendiente' AND s.created_at < now() - interval '30 minutes' THEN 'expirado' ELSE s.estado END,
           'motivo', s.motivo, 'total', s.total, 'created_at', s.created_at,
           'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', i->>'name', 'quantity', i->'quantity', 'price', i->'price', 'notes', i->>'notes')), '[]'::jsonb) FROM jsonb_array_elements(s.items) i)
         ) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sol
    FROM (SELECT * FROM public.pedidos_mesa_pendientes
           WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND created_at > now() - interval '6 hours'
           ORDER BY created_at DESC LIMIT 10) s;

  IF v_auth THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'price', p, 'quantity', q) ORDER BY n), '[]'::jsonb) INTO v_lineas
      FROM (SELECT i->>'name' n, (i->>'price')::numeric p, sum(coalesce((i->>'quantity')::int, 1)) q
              FROM public.orders o, jsonb_array_elements(o.items) i
             WHERE o.restaurant_id = p_restaurant AND o.status <> 'cancelled' AND o.paid_at IS NULL AND o.created_at > now() - interval '24 hours'
               AND (o.mesa_id = m.id OR (o.mesa_id IS NULL AND o.table_num = m.numero AND o.tipo_pedido = 'LOCAL'))
             GROUP BY 1, 2) x;
    SELECT coalesce(sum(o.total), 0) INTO v_total FROM public.orders o
     WHERE o.restaurant_id = p_restaurant AND o.status <> 'cancelled' AND o.paid_at IS NULL AND o.created_at > now() - interval '24 hours'
       AND (o.mesa_id = m.id OR (o.mesa_id IS NULL AND o.table_num = m.numero AND o.tipo_pedido = 'LOCAL'));
  END IF;

  SELECT jsonb_build_object(
      'mesero', EXISTS (SELECT 1 FROM public.llamadas_mesa WHERE mesa_id = m.id AND tipo = 'mesero' AND attended_at IS NULL),
      'cuenta', EXISTS (SELECT 1 FROM public.llamadas_mesa WHERE mesa_id = m.id AND tipo = 'cuenta' AND attended_at IS NULL)) INTO v_call;

  RETURN jsonb_build_object('existe', true, 'mesa', m.numero, 'abierta', v_abierta, 'autorizado', v_auth,
    'bloqueada', (m.codigo_bloqueo_hasta IS NOT NULL AND m.codigo_bloqueo_hasta > now()),
    'solicitudes', v_sol, 'cuenta', CASE WHEN v_auth THEN jsonb_build_object('lineas', v_lineas, 'total', v_total) END,
    'llamadas', v_call);
END $$;

DROP FUNCTION IF EXISTS public.mesa_validar_codigo(uuid, integer, uuid, text);
CREATE FUNCTION public.mesa_validar_codigo(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_codigo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_r text;
BEGIN
  IF p_dispositivo IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  SELECT id INTO v_id FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF v_id IS NULL THEN RAISE EXCEPTION 'mesa no disponible'; END IF;
  v_r := public._mesa_acceso(v_id, p_dispositivo, p_codigo);
  RETURN jsonb_build_object('ok', v_r = 'ok', 'error', CASE WHEN v_r = 'ok' THEN NULL ELSE v_r END);
END $$;

DROP FUNCTION IF EXISTS public.mesa_pedir_publico(uuid, integer, uuid, text, jsonb, text);
CREATE FUNCTION public.mesa_pedir_publico(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_nombre text, p_items jsonb, p_codigo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  m public.mesas%ROWTYPE; v_acc text; v_item jsonb; v_qty int; v_dish public.dishes%ROWTYPE; v_pp jsonb; v_unit numeric;
  v_total numeric := 0; v_lines jsonb := '[]'::jsonb; v_id uuid; v_notes text;
BEGIN
  IF p_restaurant IS NULL OR p_mesa IS NULL OR p_dispositivo IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND active = true) THEN RAISE EXCEPTION 'restaurante no disponible'; END IF;
  IF coalesce((SELECT cerrado_manual FROM public.restaurant_config WHERE restaurant_id = p_restaurant), false) THEN
    RAISE EXCEPTION 'El restaurante está cerrado temporalmente.';
  END IF;
  SELECT * INTO m FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'mesa no disponible'; END IF;

  v_acc := public._mesa_acceso(m.id, p_dispositivo, p_codigo);
  IF v_acc <> 'ok' THEN RETURN jsonb_build_object('ok', false, 'error', v_acc); END IF;

  -- Límites (anti-abuso): por celular, por mesa y por restaurante
  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE restaurant_id = p_restaurant AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 40 THEN
    RAISE EXCEPTION 'Hay muchos pedidos esperando. Llama a un mesero.';
  END IF;
  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 5 THEN
    RAISE EXCEPTION 'Esta mesa ya tiene varios pedidos esperando al mesero. Espera a que los atiendan.';
  END IF;
  IF (SELECT count(*) FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND estado = 'pendiente' AND created_at > now() - interval '30 minutes') >= 2 THEN
    RAISE EXCEPTION 'Ya tienes pedidos esperando al mesero. Espera su respuesta.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos_mesa_pendientes WHERE mesa_id = m.id AND dispositivo = p_dispositivo AND created_at > now() - interval '10 seconds') THEN
    RAISE EXCEPTION 'Espera unos segundos antes de enviar otro pedido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'el pedido no tiene platos'; END IF;
  IF jsonb_array_length(p_items) > 30 THEN RAISE EXCEPTION 'demasiados platos en un solo pedido'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(v_item->>'kind', 'dish') <> 'dish' THEN RAISE EXCEPTION 'Los platos armados a tu gusto aún no se piden por QR. Pídelos al mesero.'; END IF;
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
    SELECT * INTO v_dish FROM public.dishes
     WHERE id = (v_item->>'dish_id')::uuid AND restaurant_id = p_restaurant AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible'; END IF;
    v_pp := public._precio_plato(v_dish, v_item->>'size', v_item->'toppings', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' THEN v_item->'sel' END);
    IF coalesce((v_pp->>'tamano_invalido')::boolean, false) THEN RAISE EXCEPTION 'tamaño inválido'; END IF;
    v_unit := (v_pp->>'unit')::numeric;
    v_total := v_total + v_unit * v_qty;
    v_notes := NULLIF(left(btrim(coalesce(v_item->>'line_notes', '')), 400), '');
    v_lines := v_lines || jsonb_build_object('id', v_dish.id, 'name', v_dish.name, 'price', v_unit, 'quantity', v_qty, 'notes', v_notes,
      'size', v_pp->>'size', 'toppings', v_pp->'toppings',
      'sel', CASE WHEN jsonb_typeof(v_item->'sel') = 'object' AND length((v_item->'sel')::text) <= 4000 THEN v_item->'sel' END);
  END LOOP;

  INSERT INTO public.pedidos_mesa_pendientes (restaurant_id, mesa_id, table_num, dispositivo, nombre, items, total)
  VALUES (p_restaurant, m.id, m.numero, p_dispositivo, NULLIF(left(btrim(coalesce(p_nombre, '')), 60), ''), v_lines, v_total)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'total', v_total);
END $$;

-- Llamar al mesero / pedir la cuenta (interna + dos funciones públicas)
CREATE OR REPLACE FUNCTION public._mesa_llamada(p_restaurant uuid, p_mesa integer, p_disp uuid, p_tipo text, p_codigo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m public.mesas%ROWTYPE; v_acc text; v_n int;
BEGIN
  IF p_restaurant IS NULL OR p_mesa IS NULL OR p_disp IS NULL THEN RAISE EXCEPTION 'datos incompletos'; END IF;
  SELECT * INTO m FROM public.mesas WHERE restaurant_id = p_restaurant AND numero = p_mesa AND activa = true;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND active = true) THEN RAISE EXCEPTION 'mesa no disponible'; END IF;
  v_acc := public._mesa_acceso(m.id, p_disp, p_codigo);
  IF v_acc <> 'ok' THEN RETURN jsonb_build_object('ok', false, 'error', v_acc); END IF;
  IF p_tipo = 'cuenta' AND m.estado NOT IN ('ocupada','cuenta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_consumo');
  END IF;
  -- mismo celular, mismo tipo, en los últimos 30 s: no repite
  IF EXISTS (SELECT 1 FROM public.llamadas_mesa WHERE mesa_id = m.id AND tipo = p_tipo AND dispositivo = p_disp AND created_at > now() - interval '30 seconds') THEN
    RETURN jsonb_build_object('ok', true, 'ya', true);
  END IF;
  INSERT INTO public.llamadas_mesa (restaurant_id, mesa_id, table_num, tipo, dispositivo) VALUES (p_restaurant, m.id, m.numero, p_tipo, p_disp)
  ON CONFLICT (mesa_id, tipo) WHERE attended_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'ya', v_n = 0);
END $$;
REVOKE ALL ON FUNCTION public._mesa_llamada(uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.mesa_llamar_mesero(uuid, integer, uuid, text);
CREATE FUNCTION public.mesa_llamar_mesero(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_codigo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._mesa_llamada(p_restaurant, p_mesa, p_dispositivo, 'mesero', p_codigo);
$$;
DROP FUNCTION IF EXISTS public.mesa_pedir_cuenta(uuid, integer, uuid, text);
CREATE FUNCTION public.mesa_pedir_cuenta(p_restaurant uuid, p_mesa integer, p_dispositivo uuid, p_codigo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._mesa_llamada(p_restaurant, p_mesa, p_dispositivo, 'cuenta', p_codigo);
$$;

-- ─── 5. Funciones del personal (admin, mesero, cajero de ESE restaurante) ───
CREATE OR REPLACE FUNCTION public._mesa_personal() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN v_rid;
END $$;
REVOKE ALL ON FUNCTION public._mesa_personal() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.mesa_pedidos_pendientes();
CREATE FUNCTION public.mesa_pedidos_pendientes() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public._mesa_personal();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'mesa_id', p.mesa_id, 'table_num', p.table_num, 'nombre', p.nombre,
            'items', p.items, 'total', p.total, 'created_at', p.created_at) ORDER BY p.created_at)
     FROM public.pedidos_mesa_pendientes p
    WHERE p.restaurant_id = v_rid AND p.estado = 'pendiente' AND p.created_at > now() - interval '30 minutes'), '[]'::jsonb);
END $$;

DROP FUNCTION IF EXISTS public.mesa_pedido_aceptar(uuid);
CREATE FUNCTION public.mesa_pedido_aceptar(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public._mesa_personal(); r public.pedidos_mesa_pendientes%ROWTYPE; v_res json; v_oid uuid;
BEGIN
  SELECT * INTO r FROM public.pedidos_mesa_pendientes WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud no encontrada'; END IF;
  IF r.estado = 'aceptado' THEN RETURN jsonb_build_object('ok', true, 'ya', true, 'order_id', r.order_id); END IF;
  IF r.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta solicitud ya fue %', r.estado; END IF;
  IF r.created_at < now() - interval '30 minutes' THEN
    UPDATE public.pedidos_mesa_pendientes SET estado = 'expirado', resolved_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expirada');
  END IF;
  -- Mismo camino que un pedido del mesero: precios y disponibilidad se revalidan en el servidor
  v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);
  v_oid := (v_res->>'order_id')::uuid;
  UPDATE public.mesas SET dispositivos_autorizados = (array_append(dispositivos_autorizados, r.dispositivo))[greatest(1, cardinality(dispositivos_autorizados) - 18):]
   WHERE id = r.mesa_id AND NOT (r.dispositivo = ANY (dispositivos_autorizados));
  UPDATE public.pedidos_mesa_pendientes SET estado = 'aceptado', order_id = v_oid, resolved_at = now(), resolved_by = auth.uid() WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'ya', false, 'order_id', v_oid);
END $$;

DROP FUNCTION IF EXISTS public.mesa_pedido_rechazar(uuid, text);
CREATE FUNCTION public.mesa_pedido_rechazar(p_id uuid, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public._mesa_personal(); r public.pedidos_mesa_pendientes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.pedidos_mesa_pendientes WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud no encontrada'; END IF;
  IF r.estado = 'rechazado' THEN RETURN jsonb_build_object('ok', true, 'ya', true); END IF;
  IF r.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta solicitud ya fue %', r.estado; END IF;
  UPDATE public.pedidos_mesa_pendientes SET estado = 'rechazado', motivo = NULLIF(left(btrim(coalesce(p_motivo, '')), 200), ''),
         resolved_at = now(), resolved_by = auth.uid() WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'ya', false);
END $$;

DROP FUNCTION IF EXISTS public.mesa_llamadas_pendientes();
CREATE FUNCTION public.mesa_llamadas_pendientes() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public._mesa_personal();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'mesa_id', l.mesa_id, 'table_num', l.table_num, 'tipo', l.tipo, 'created_at', l.created_at) ORDER BY l.created_at)
     FROM public.llamadas_mesa l WHERE l.restaurant_id = v_rid AND l.attended_at IS NULL), '[]'::jsonb);
END $$;

DROP FUNCTION IF EXISTS public.mesa_llamada_atender(uuid);
CREATE FUNCTION public.mesa_llamada_atender(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public._mesa_personal(); v_n int;
BEGIN
  UPDATE public.llamadas_mesa SET attended_at = now(), attended_by = auth.uid() WHERE id = p_id AND restaurant_id = v_rid AND attended_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'ya', v_n = 0);
END $$;

-- ─── 6. Permisos: anon solo las 5 públicas; personal solo las 5 de personal ──
REVOKE ALL ON FUNCTION public.mesa_publica_estado(uuid, integer, uuid), public.mesa_validar_codigo(uuid, integer, uuid, text),
  public.mesa_pedir_publico(uuid, integer, uuid, text, jsonb, text), public.mesa_llamar_mesero(uuid, integer, uuid, text),
  public.mesa_pedir_cuenta(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesa_publica_estado(uuid, integer, uuid), public.mesa_validar_codigo(uuid, integer, uuid, text),
  public.mesa_pedir_publico(uuid, integer, uuid, text, jsonb, text), public.mesa_llamar_mesero(uuid, integer, uuid, text),
  public.mesa_pedir_cuenta(uuid, integer, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.mesa_pedidos_pendientes(), public.mesa_pedido_aceptar(uuid), public.mesa_pedido_rechazar(uuid, text),
  public.mesa_llamadas_pendientes(), public.mesa_llamada_atender(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesa_pedidos_pendientes(), public.mesa_pedido_aceptar(uuid), public.mesa_pedido_rechazar(uuid, text),
  public.mesa_llamadas_pendientes(), public.mesa_llamada_atender(uuid) TO authenticated;
