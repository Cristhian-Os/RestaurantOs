-- Fidelización, paso 1: clientes del restaurante, programa de puntos/sellos, niveles, recompensas y libro de movimientos.
-- Diseño en docs/informes/FIDELIZACION_ARQUITECTURA.md.
--
-- Reglas de este archivo:
--  * Todo lleva restaurant_id y RLS. Cocina (kitchen) no ve nada de esto.
--  * Las tablas de movimientos NO se escriben desde el navegador: solo por funciones SECURITY DEFINER que validan rol.
--  * No se toca cobrar_orden ni crear_orden_completa (evita el problema de overloads). Los puntos se acreditan con un
--    trigger sobre orders.paid_at, que solo se llena cuando el pedido queda pagado por completo (_orden_recalcular_pago).
--  * Si algo falla al acreditar, NO se rompe el cobro: se anota en fid_auditoria.
--  * Roles reales en profiles.role: admin, cashier, waiter, kitchen.

-- ─── Clientes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id            uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre                   text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  telefono                 text CHECK (telefono IS NULL OR telefono ~ '^[0-9]{8,15}$'),   -- solo dígitos, con indicativo (57...)
  correo                   text CHECK (correo IS NULL OR char_length(correo) <= 160),
  cumpleanos               date,
  qr_token                 text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  consentimiento_marketing boolean NOT NULL DEFAULT false,
  consentimiento_at        timestamptz,
  consentimiento_canal     text CHECK (consentimiento_canal IS NULL OR consentimiento_canal IN ('whatsapp','correo','ambos')),
  origen                   text NOT NULL DEFAULT 'manual' CHECK (origen IN ('caja','mesa','qr','whatsapp','manual','importado')),
  preferencias             jsonb NOT NULL DEFAULT '{}'::jsonb,
  notas                    text CHECK (notas IS NULL OR char_length(notas) <= 1000),
  activo                   boolean NOT NULL DEFAULT true,       -- no se borran clientes: se desactivan
  creado_por               uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_tel_uq ON public.clientes (restaurant_id, telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS clientes_rest_nombre_idx ON public.clientes (restaurant_id, lower(nombre));
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clientes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.clientes FROM authenticated;
CREATE POLICY "clientes: admin y cajero leen los suyos" ON public.clientes FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));
CREATE TRIGGER clientes_set_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Programa (un registro por restaurante) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fid_programas (
  restaurant_id       uuid PRIMARY KEY DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  activo              boolean NOT NULL DEFAULT false,
  modo                text NOT NULL DEFAULT 'puntos' CHECK (modo IN ('puntos','sellos','ambos')),
  monto_por_punto     numeric NOT NULL DEFAULT 1000 CHECK (monto_por_punto > 0),   -- 1 punto por cada X pesos
  monto_minimo_sello  numeric NOT NULL DEFAULT 0 CHECK (monto_minimo_sello >= 0),  -- compra mínima para ganar 1 sello
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fid_programas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_programas FROM anon;
REVOKE DELETE ON public.fid_programas FROM authenticated;
CREATE POLICY "fid_programas: leen admin, cajero y mesero" ON public.fid_programas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE POLICY "fid_programas: crea el admin" ON public.fid_programas FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_programas: edita el admin" ON public.fid_programas FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER fid_programas_set_updated_at BEFORE UPDATE ON public.fid_programas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Reglas extra (promociones temporales). Solo las que el acreditador ya aplica ─
CREATE TABLE IF NOT EXISTS public.fid_reglas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre        text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 80),
  tipo          text NOT NULL CHECK (tipo IN ('multiplicador','bono_fijo')),
  factor        numeric CHECK (factor IS NULL OR factor BETWEEN 1 AND 10),          -- multiplicador: 2 = doble puntuación
  puntos_extra  int CHECK (puntos_extra IS NULL OR puntos_extra BETWEEN 1 AND 10000), -- bono_fijo: puntos por compra
  vigente_desde timestamptz,
  vigente_hasta timestamptz,
  activa        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'multiplicador' AND factor IS NOT NULL) OR (tipo = 'bono_fijo' AND puntos_extra IS NOT NULL)),
  CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta > vigente_desde)
);
CREATE INDEX IF NOT EXISTS fid_reglas_rest_idx ON public.fid_reglas (restaurant_id, activa);
ALTER TABLE public.fid_reglas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_reglas FROM anon;
REVOKE DELETE ON public.fid_reglas FROM authenticated;
CREATE POLICY "fid_reglas: leen admin, cajero y mesero" ON public.fid_reglas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE POLICY "fid_reglas: crea el admin" ON public.fid_reglas FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_reglas: edita el admin" ON public.fid_reglas FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER fid_reglas_set_updated_at BEFORE UPDATE ON public.fid_reglas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Niveles (Bronce, Plata, Oro... los nombra el restaurante) ──────────────
CREATE TABLE IF NOT EXISTS public.fid_niveles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre         text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 40),
  puntos_minimos int NOT NULL DEFAULT 0 CHECK (puntos_minimos >= 0),   -- puntos ganados en total (históricos) para llegar al nivel
  descuento_pct  numeric NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
  beneficios     text CHECK (beneficios IS NULL OR char_length(beneficios) <= 500),
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, nombre)
);
ALTER TABLE public.fid_niveles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_niveles FROM anon;
REVOKE DELETE ON public.fid_niveles FROM authenticated;
CREATE POLICY "fid_niveles: leen admin, cajero y mesero" ON public.fid_niveles FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE POLICY "fid_niveles: crea el admin" ON public.fid_niveles FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_niveles: edita el admin" ON public.fid_niveles FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER fid_niveles_set_updated_at BEFORE UPDATE ON public.fid_niveles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Recompensas (catálogo; se desactivan, no se borran) ────────────────────
CREATE TABLE IF NOT EXISTS public.fid_recompensas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre            text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 80),
  descripcion       text CHECK (descripcion IS NULL OR char_length(descripcion) <= 400),
  imagen_url        text,
  tipo              text NOT NULL DEFAULT 'producto' CHECK (tipo IN ('producto','descuento_pct','descuento_fijo','beneficio')),
  valor             numeric CHECK (valor IS NULL OR valor >= 0),              -- % o monto según el tipo
  unidad            text NOT NULL DEFAULT 'puntos' CHECK (unidad IN ('puntos','sellos')),
  costo             int NOT NULL CHECK (costo > 0),
  condiciones       text CHECK (condiciones IS NULL OR char_length(condiciones) <= 400),
  vigente_desde     timestamptz,
  vigente_hasta     timestamptz,
  limite_por_cliente int CHECK (limite_por_cliente IS NULL OR limite_por_cliente > 0),
  nivel_minimo_id   uuid REFERENCES public.fid_niveles (id) ON DELETE SET NULL,
  activa            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta > vigente_desde)
);
CREATE INDEX IF NOT EXISTS fid_recompensas_rest_idx ON public.fid_recompensas (restaurant_id, activa);
ALTER TABLE public.fid_recompensas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_recompensas FROM anon;
REVOKE DELETE ON public.fid_recompensas FROM authenticated;
CREATE POLICY "fid_recompensas: leen admin, cajero y mesero" ON public.fid_recompensas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier','waiter'));
CREATE POLICY "fid_recompensas: crea el admin" ON public.fid_recompensas FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_recompensas: edita el admin" ON public.fid_recompensas FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER fid_recompensas_set_updated_at BEFORE UPDATE ON public.fid_recompensas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Cuenta de cada cliente (saldos; se actualiza sola desde el libro de movimientos) ─
CREATE TABLE IF NOT EXISTS public.fid_cuentas (
  cliente_id        uuid PRIMARY KEY REFERENCES public.clientes (id),
  restaurant_id     uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  puntos_saldo      int NOT NULL DEFAULT 0,      -- puede quedar negativo si se revierte una compra ya canjeada
  puntos_historicos int NOT NULL DEFAULT 0,      -- total ganado: decide el nivel
  sellos_saldo      int NOT NULL DEFAULT 0,
  visitas           int NOT NULL DEFAULT 0,
  gasto_total       numeric NOT NULL DEFAULT 0,
  ultima_visita     timestamptz,
  nivel_id          uuid REFERENCES public.fid_niveles (id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fid_cuentas_rest_idx ON public.fid_cuentas (restaurant_id, ultima_visita);
ALTER TABLE public.fid_cuentas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_cuentas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_cuentas FROM authenticated;
CREATE POLICY "fid_cuentas: admin y cajero leen" ON public.fid_cuentas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Una acreditación por pedido pagado (la clave contra duplicados) ────────
CREATE TABLE IF NOT EXISTS public.fid_acreditaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES public.orders (id),
  cliente_id    uuid NOT NULL REFERENCES public.clientes (id),
  total         numeric NOT NULL,
  puntos        int NOT NULL DEFAULT 0,
  sellos        int NOT NULL DEFAULT 0,
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- cómo se calculó (base, factor, bono): no cambia aunque cambien las reglas
  created_at    timestamptz NOT NULL DEFAULT now(),
  reversada_at  timestamptz
);
-- Solo puede haber UNA acreditación activa por pedido. Si el pago se anula y se vuelve a cobrar, se crea otra.
CREATE UNIQUE INDEX IF NOT EXISTS fid_acreditaciones_orden_activa_uq ON public.fid_acreditaciones (order_id) WHERE reversada_at IS NULL;
CREATE INDEX IF NOT EXISTS fid_acreditaciones_cliente_idx ON public.fid_acreditaciones (cliente_id, created_at DESC);
ALTER TABLE public.fid_acreditaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_acreditaciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_acreditaciones FROM authenticated;
CREATE POLICY "fid_acreditaciones: admin y cajero leen" ON public.fid_acreditaciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Libro de movimientos: solo se agrega, nunca se edita ni se borra ───────
CREATE TABLE IF NOT EXISTS public.fid_movimientos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  cliente_id       uuid NOT NULL REFERENCES public.clientes (id),
  tipo             text NOT NULL CHECK (tipo IN ('acredito','reversa_acredito','canje','reversa_canje','ajuste','expiracion')),
  unidad           text NOT NULL DEFAULT 'puntos' CHECK (unidad IN ('puntos','sellos')),
  cantidad         int NOT NULL CHECK (cantidad <> 0),    -- con signo: + suma, − resta
  order_id         uuid REFERENCES public.orders (id),
  acreditacion_id  uuid REFERENCES public.fid_acreditaciones (id),
  motivo           text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  idempotency_key  text NOT NULL CHECK (char_length(idempotency_key) <= 120),
  creado_por       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS fid_movimientos_cliente_idx ON public.fid_movimientos (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fid_movimientos_rest_idx ON public.fid_movimientos (restaurant_id, created_at DESC);
ALTER TABLE public.fid_movimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_movimientos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_movimientos FROM authenticated;
CREATE POLICY "fid_movimientos: admin y cajero leen" ON public.fid_movimientos FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Canjes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fid_redenciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  cliente_id      uuid NOT NULL REFERENCES public.clientes (id),
  recompensa_id   uuid NOT NULL REFERENCES public.fid_recompensas (id),
  unidad          text NOT NULL CHECK (unidad IN ('puntos','sellos')),
  costo           int NOT NULL CHECK (costo > 0),        -- costo congelado al momento del canje
  estado          text NOT NULL DEFAULT 'aplicada' CHECK (estado IN ('aplicada','anulada')),
  order_id        uuid REFERENCES public.orders (id),
  clave           text NOT NULL CHECK (char_length(clave) <= 120),
  creado_por      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  anulada_at      timestamptz,
  anulada_por     uuid,
  motivo_anulacion text CHECK (motivo_anulacion IS NULL OR char_length(motivo_anulacion) <= 300),
  UNIQUE (restaurant_id, clave)
);
CREATE INDEX IF NOT EXISTS fid_redenciones_cliente_idx ON public.fid_redenciones (cliente_id, recompensa_id);
ALTER TABLE public.fid_redenciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_redenciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_redenciones FROM authenticated;
CREATE POLICY "fid_redenciones: admin y cajero leen" ON public.fid_redenciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));

-- ─── Auditoría (solo se agrega) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fid_auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  actor         uuid,
  actor_rol     text,
  accion        text NOT NULL,
  entidad       text,
  entidad_id    uuid,
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fid_auditoria_rest_idx ON public.fid_auditoria (restaurant_id, created_at DESC);
ALTER TABLE public.fid_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_auditoria FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_auditoria FROM authenticated;
CREATE POLICY "fid_auditoria: lee el admin" ON public.fid_auditoria FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

-- Movimientos y auditoría no se editan nunca (el borrado solo lo hace el dueño de la plataforma al eliminar un restaurante).
CREATE OR REPLACE FUNCTION public._fid_no_editar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Este registro no se puede modificar'; END;
$$;
CREATE TRIGGER fid_movimientos_no_update BEFORE UPDATE ON public.fid_movimientos FOR EACH ROW EXECUTE FUNCTION public._fid_no_editar();
CREATE TRIGGER fid_auditoria_no_update BEFORE UPDATE ON public.fid_auditoria FOR EACH ROW EXECUTE FUNCTION public._fid_no_editar();

-- ─── Enlace del pedido con el cliente (columna nueva, opcional) ─────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes (id);
CREATE INDEX IF NOT EXISTS orders_cliente_idx ON public.orders (cliente_id) WHERE cliente_id IS NOT NULL;

-- ═══════════════════════════ FUNCIONES INTERNAS ═══════════════════════════
CREATE OR REPLACE FUNCTION public._fid_audit(p_rid uuid, p_accion text, p_entidad text, p_id uuid, p_detalle jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO fid_auditoria (restaurant_id, actor, actor_rol, accion, entidad, entidad_id, detalle)
  VALUES (p_rid, auth.uid(), get_user_role(), p_accion, p_entidad, p_id, COALESCE(p_detalle, '{}'::jsonb));
$$;

-- Teléfono → solo dígitos, siempre con indicativo de país.
--  * "+52 55 1234 5678" o "0052…": ya trae país, se respeta tal cual (cualquier país).
--  * Sin "+" ni "00": un celular colombiano de 10 dígitos (3xxxxxxxxx) recibe el 57.
CREATE OR REPLACE FUNCTION public._fid_tel(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN btrim(p) ~ '^00' THEN substring(regexp_replace(p, '\D', '', 'g') from 3)
    WHEN btrim(p) ~ '^\+' THEN regexp_replace(p, '\D', '', 'g')
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^3[0-9]{9}$' THEN '57' || regexp_replace(p, '\D', '', 'g')
    ELSE regexp_replace(p, '\D', '', 'g')
  END;
$$;

-- Cada movimiento actualiza el saldo y el nivel del cliente en la misma transacción.
CREATE OR REPLACE FUNCTION public._fid_mov_aplicar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE fid_cuentas a SET
    puntos_saldo      = a.puntos_saldo + CASE WHEN NEW.unidad = 'puntos' THEN NEW.cantidad ELSE 0 END,
    sellos_saldo      = a.sellos_saldo + CASE WHEN NEW.unidad = 'sellos' THEN NEW.cantidad ELSE 0 END,
    puntos_historicos = a.puntos_historicos + CASE WHEN NEW.unidad = 'puntos' AND NEW.tipo IN ('acredito','reversa_acredito') THEN NEW.cantidad ELSE 0 END,
    updated_at        = now()
   WHERE a.cliente_id = NEW.cliente_id;
  UPDATE fid_cuentas a SET nivel_id = (
    SELECT n.id FROM fid_niveles n
     WHERE n.restaurant_id = a.restaurant_id AND n.activo AND n.puntos_minimos <= a.puntos_historicos
     ORDER BY n.puntos_minimos DESC LIMIT 1)
   WHERE a.cliente_id = NEW.cliente_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fid_movimientos_aplicar AFTER INSERT ON public.fid_movimientos FOR EACH ROW EXECUTE FUNCTION public._fid_mov_aplicar();

-- Acredita puntos/sellos de un pedido pagado por completo. Idempotente: una sola acreditación activa por pedido.
CREATE OR REPLACE FUNCTION public._fid_acreditar_orden(p_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o orders%ROWTYPE; prog fid_programas%ROWTYPE; c clientes%ROWTYPE;
  v_base int := 0; v_factor numeric := 1; v_bono int := 0; v_pts int := 0; v_sellos int := 0; v_acr uuid;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR o.cliente_id IS NULL OR o.paid_at IS NULL OR o.status = 'cancelled' OR o.tipo_pedido = 'RAPPI' THEN RETURN; END IF;
  SELECT * INTO c FROM clientes WHERE id = o.cliente_id AND restaurant_id = o.restaurant_id AND activo;   -- nunca cruzar restaurantes
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO prog FROM fid_programas WHERE restaurant_id = o.restaurant_id AND activo;
  IF NOT FOUND THEN RETURN; END IF;

  IF prog.modo IN ('puntos','ambos') THEN
    v_base := floor(o.total / prog.monto_por_punto)::int;
    SELECT COALESCE(max(factor), 1) INTO v_factor FROM fid_reglas
     WHERE restaurant_id = o.restaurant_id AND activa AND tipo = 'multiplicador'
       AND (vigente_desde IS NULL OR vigente_desde <= o.paid_at) AND (vigente_hasta IS NULL OR vigente_hasta >= o.paid_at);
    SELECT COALESCE(sum(puntos_extra), 0) INTO v_bono FROM fid_reglas
     WHERE restaurant_id = o.restaurant_id AND activa AND tipo = 'bono_fijo'
       AND (vigente_desde IS NULL OR vigente_desde <= o.paid_at) AND (vigente_hasta IS NULL OR vigente_hasta >= o.paid_at);
    v_pts := floor(v_base * v_factor)::int + CASE WHEN v_base > 0 THEN v_bono ELSE 0 END;
  END IF;
  IF prog.modo IN ('sellos','ambos') AND o.total >= prog.monto_minimo_sello AND o.total > 0 THEN v_sellos := 1; END IF;

  INSERT INTO fid_cuentas (cliente_id, restaurant_id) VALUES (c.id, c.restaurant_id) ON CONFLICT (cliente_id) DO NOTHING;
  INSERT INTO fid_acreditaciones (restaurant_id, order_id, cliente_id, total, puntos, sellos, detalle)
  VALUES (o.restaurant_id, o.id, c.id, o.total, v_pts, v_sellos,
          jsonb_build_object('base', v_base, 'factor', v_factor, 'bono', v_bono, 'monto_por_punto', prog.monto_por_punto))
  ON CONFLICT DO NOTHING RETURNING id INTO v_acr;
  IF v_acr IS NULL THEN RETURN; END IF;   -- ya estaba acreditado

  IF v_pts > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (o.restaurant_id, c.id, 'acredito', 'puntos', v_pts, o.id, v_acr, 'acr:' || v_acr || ':p', auth.uid(), 'Compra pagada');
  END IF;
  IF v_sellos > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (o.restaurant_id, c.id, 'acredito', 'sellos', v_sellos, o.id, v_acr, 'acr:' || v_acr || ':s', auth.uid(), 'Compra pagada');
  END IF;
  UPDATE fid_cuentas SET visitas = visitas + 1, gasto_total = gasto_total + o.total,
         ultima_visita = GREATEST(COALESCE(ultima_visita, o.paid_at), o.paid_at), updated_at = now()
   WHERE cliente_id = c.id;
END;
$$;

-- Revierte la acreditación activa de un pedido (pago anulado o pedido que deja de estar cubierto).
CREATE OR REPLACE FUNCTION public._fid_revertir_orden(p_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a fid_acreditaciones%ROWTYPE;
BEGIN
  UPDATE fid_acreditaciones SET reversada_at = now() WHERE order_id = p_order_id AND reversada_at IS NULL RETURNING * INTO a;
  IF NOT FOUND THEN RETURN; END IF;
  IF a.puntos > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (a.restaurant_id, a.cliente_id, 'reversa_acredito', 'puntos', -a.puntos, a.order_id, a.id, 'rev:' || a.id || ':p', auth.uid(), 'Pago anulado o corregido');
  END IF;
  IF a.sellos > 0 THEN
    INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, acreditacion_id, idempotency_key, creado_por, motivo)
    VALUES (a.restaurant_id, a.cliente_id, 'reversa_acredito', 'sellos', -a.sellos, a.order_id, a.id, 'rev:' || a.id || ':s', auth.uid(), 'Pago anulado o corregido');
  END IF;
  UPDATE fid_cuentas SET visitas = GREATEST(visitas - 1, 0), gasto_total = GREATEST(gasto_total - a.total, 0),
         ultima_visita = (SELECT max(created_at) FROM fid_acreditaciones WHERE cliente_id = a.cliente_id AND reversada_at IS NULL),
         updated_at = now()
   WHERE cliente_id = a.cliente_id;
END;
$$;

-- Trigger sobre orders: paid_at pasa de NULL a fecha → acredita; de fecha a NULL → revierte.
-- Un fallo aquí NUNCA debe impedir el cobro: se anota en la auditoría y el cobro sigue.
CREATE OR REPLACE FUNCTION public._fid_orders_paid_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
      PERFORM _fid_acreditar_orden(NEW.id);
    ELSIF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
      PERFORM _fid_revertir_orden(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO fid_auditoria (restaurant_id, actor, actor_rol, accion, entidad, entidad_id, detalle)
    VALUES (NEW.restaurant_id, auth.uid(), get_user_role(), 'acreditacion_fallida', 'orden', NEW.id, jsonb_build_object('error', SQLERRM));
  END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_fid_paid AFTER UPDATE OF paid_at ON public.orders
  FOR EACH ROW WHEN (OLD.paid_at IS DISTINCT FROM NEW.paid_at) EXECUTE FUNCTION public._fid_orders_paid_trg();

-- ═══════════════════════════ FUNCIONES PÚBLICAS (RPC) ═══════════════════════════

-- Registrar cliente: administrador o cajero.
CREATE OR REPLACE FUNCTION public.fid_registrar_cliente(
  p_nombre text, p_telefono text DEFAULT NULL, p_correo text DEFAULT NULL, p_cumpleanos date DEFAULT NULL,
  p_consentimiento boolean DEFAULT false, p_canal text DEFAULT NULL, p_origen text DEFAULT 'caja')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_tel text := _fid_tel(p_telefono); v_id uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero registran clientes'; END IF;
  IF p_consentimiento AND p_canal IS NULL THEN RAISE EXCEPTION 'Indica por qué canal acepta recibir mensajes'; END IF;
  IF v_tel IS NOT NULL AND EXISTS (SELECT 1 FROM clientes WHERE restaurant_id = v_rid AND telefono = v_tel) THEN
    RAISE EXCEPTION 'Ya existe un cliente con ese teléfono';
  END IF;
  INSERT INTO clientes (restaurant_id, nombre, telefono, correo, cumpleanos, consentimiento_marketing, consentimiento_at, consentimiento_canal, origen, creado_por)
  VALUES (v_rid, btrim(p_nombre), v_tel, NULLIF(btrim(p_correo), ''), p_cumpleanos, COALESCE(p_consentimiento, false),
          CASE WHEN p_consentimiento THEN now() END, CASE WHEN p_consentimiento THEN p_canal END, COALESCE(p_origen, 'caja'), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO fid_cuentas (cliente_id, restaurant_id) VALUES (v_id, v_rid);
  PERFORM _fid_audit(v_rid, 'cliente_registrado', 'cliente', v_id, jsonb_build_object('origen', p_origen));
  RETURN v_id;
END;
$$;

-- Editar cliente: administrador o cajero. Solo cambia lo que se pasa (NULL = no tocar).
CREATE OR REPLACE FUNCTION public.fid_editar_cliente(
  p_id uuid, p_nombre text DEFAULT NULL, p_telefono text DEFAULT NULL, p_correo text DEFAULT NULL, p_cumpleanos date DEFAULT NULL,
  p_notas text DEFAULT NULL, p_consentimiento boolean DEFAULT NULL, p_canal text DEFAULT NULL, p_activo boolean DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_tel text := _fid_tel(p_telefono);
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero editan clientes'; END IF;
  IF p_activo IS NOT NULL AND v_rol <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador activa o desactiva clientes'; END IF;
  IF v_tel IS NOT NULL AND EXISTS (SELECT 1 FROM clientes WHERE restaurant_id = v_rid AND telefono = v_tel AND id <> p_id) THEN
    RAISE EXCEPTION 'Ya existe otro cliente con ese teléfono';
  END IF;
  UPDATE clientes SET
    nombre = COALESCE(NULLIF(btrim(p_nombre), ''), nombre),
    telefono = COALESCE(v_tel, telefono),
    correo = COALESCE(NULLIF(btrim(p_correo), ''), correo),
    cumpleanos = COALESCE(p_cumpleanos, cumpleanos),
    notas = CASE WHEN p_notas IS NULL THEN notas ELSE NULLIF(btrim(p_notas), '') END,
    consentimiento_marketing = COALESCE(p_consentimiento, consentimiento_marketing),
    consentimiento_at = CASE WHEN p_consentimiento IS NULL THEN consentimiento_at WHEN p_consentimiento THEN now() ELSE consentimiento_at END,
    consentimiento_canal = CASE WHEN p_consentimiento IS NULL THEN consentimiento_canal WHEN p_consentimiento THEN COALESCE(p_canal, consentimiento_canal) ELSE NULL END,
    activo = COALESCE(p_activo, activo)
   WHERE id = p_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  PERFORM _fid_audit(v_rid, 'cliente_editado', 'cliente', p_id, '{}'::jsonb);
END;
$$;

-- Buscar cliente por QR, teléfono (últimos dígitos) o nombre. El mesero ve el teléfono tapado.
CREATE OR REPLACE FUNCTION public.fid_buscar_cliente(p_q text)
 RETURNS TABLE (id uuid, nombre text, telefono text, puntos_saldo int, sellos_saldo int, nivel text, ultima_visita timestamptz, acepta_mensajes boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_q text := btrim(COALESCE(p_q, '')); v_dig text := regexp_replace(COALESCE(p_q, ''), '\D', '', 'g');
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para consultar clientes'; END IF;
  IF char_length(v_q) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.nombre,
           CASE WHEN c.telefono IS NULL THEN NULL WHEN v_rol = 'waiter' THEN '******' || right(c.telefono, 4) ELSE c.telefono END,
           a.puntos_saldo, a.sellos_saldo, n.nombre, a.ultima_visita, c.consentimiento_marketing
      FROM clientes c
      JOIN fid_cuentas a ON a.cliente_id = c.id
      LEFT JOIN fid_niveles n ON n.id = a.nivel_id
     WHERE c.restaurant_id = v_rid AND c.activo
       AND ( c.qr_token = v_q
          OR (char_length(v_dig) >= 4 AND c.telefono LIKE '%' || v_dig)
          OR position(lower(v_q) in lower(c.nombre)) > 0 )
     ORDER BY (c.qr_token = v_q) DESC, a.ultima_visita DESC NULLS LAST
     LIMIT 20;
END;
$$;

-- Asociar un pedido (aún sin pagar) a un cliente. Administrador, cajero o mesero. NULL = quitar.
CREATE OR REPLACE FUNCTION public.fid_asociar_orden(p_order_id uuid, p_cliente_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para asociar clientes a pedidos'; END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid AND activo) THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  UPDATE orders SET cliente_id = p_cliente_id
   WHERE id = p_order_id AND restaurant_id = v_rid AND paid_at IS NULL AND status <> 'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe o ya está pagado'; END IF;
END;
$$;

-- Canjear una recompensa: administrador o cajero. Todo en una transacción; repetir la misma clave no duplica.
CREATE OR REPLACE FUNCTION public.fid_canjear(p_cliente_id uuid, p_recompensa_id uuid, p_order_id uuid DEFAULT NULL, p_clave text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_clave text := COALESCE(NULLIF(btrim(p_clave), ''), gen_random_uuid()::text);
  r fid_recompensas%ROWTYPE; a fid_cuentas%ROWTYPE; v_req int; v_usados int; v_red uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero aplican recompensas'; END IF;
  SELECT id INTO v_red FROM fid_redenciones WHERE restaurant_id = v_rid AND clave = v_clave;
  IF FOUND THEN RETURN v_red; END IF;

  SELECT * INTO r FROM fid_recompensas WHERE id = p_recompensa_id AND restaurant_id = v_rid AND activa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa recompensa no está disponible'; END IF;
  IF (r.vigente_desde IS NOT NULL AND r.vigente_desde > now()) OR (r.vigente_hasta IS NOT NULL AND r.vigente_hasta < now()) THEN
    RAISE EXCEPTION 'Esa recompensa está fuera de vigencia';
  END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = p_cliente_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND activo) THEN RAISE EXCEPTION 'El cliente está desactivado'; END IF;
  IF r.nivel_minimo_id IS NOT NULL THEN
    SELECT puntos_minimos INTO v_req FROM fid_niveles WHERE id = r.nivel_minimo_id;
    IF a.puntos_historicos < COALESCE(v_req, 0) THEN RAISE EXCEPTION 'El cliente aún no alcanza el nivel de esta recompensa'; END IF;
  END IF;
  IF r.limite_por_cliente IS NOT NULL THEN
    SELECT count(*) INTO v_usados FROM fid_redenciones WHERE cliente_id = p_cliente_id AND recompensa_id = r.id AND estado = 'aplicada';
    IF v_usados >= r.limite_por_cliente THEN RAISE EXCEPTION 'El cliente ya usó esta recompensa el máximo de veces'; END IF;
  END IF;
  IF (r.unidad = 'puntos' AND a.puntos_saldo < r.costo) OR (r.unidad = 'sellos' AND a.sellos_saldo < r.costo) THEN
    RAISE EXCEPTION 'El cliente no tiene % suficientes', r.unidad;
  END IF;

  INSERT INTO fid_redenciones (restaurant_id, cliente_id, recompensa_id, unidad, costo, order_id, clave, creado_por)
  VALUES (v_rid, p_cliente_id, r.id, r.unidad, r.costo, p_order_id, v_clave, auth.uid()) RETURNING id INTO v_red;
  INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, motivo, idempotency_key, creado_por)
  VALUES (v_rid, p_cliente_id, 'canje', r.unidad, -r.costo, p_order_id, 'Canje: ' || r.nombre, 'canje:' || v_red, auth.uid());
  PERFORM _fid_audit(v_rid, 'canje_aplicado', 'redencion', v_red, jsonb_build_object('recompensa', r.nombre, 'costo', r.costo, 'unidad', r.unidad));
  RETURN v_red;
END;
$$;

-- Anular un canje: solo el administrador. Devuelve los puntos o sellos.
CREATE OR REPLACE FUNCTION public.fid_anular_canje(p_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); x fid_redenciones%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador anula canjes'; END IF;
  IF char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO x FROM fid_redenciones WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canje no encontrado'; END IF;
  IF x.estado = 'anulada' THEN RAISE EXCEPTION 'El canje ya estaba anulado'; END IF;
  UPDATE fid_redenciones SET estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo) WHERE id = x.id;
  INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, motivo, idempotency_key, creado_por)
  VALUES (v_rid, x.cliente_id, 'reversa_canje', x.unidad, x.costo, 'Canje anulado: ' || btrim(p_motivo), 'revcanje:' || x.id, auth.uid());
  PERFORM _fid_audit(v_rid, 'canje_anulado', 'redencion', x.id, jsonb_build_object('motivo', p_motivo));
END;
$$;

-- Ajuste manual de saldo: solo el administrador, con motivo.
CREATE OR REPLACE FUNCTION public.fid_ajustar_saldo(p_cliente_id uuid, p_cantidad int, p_motivo text, p_unidad text DEFAULT 'puntos')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); a fid_cuentas%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador ajusta saldos'; END IF;
  IF p_unidad NOT IN ('puntos','sellos') THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  IF p_cantidad IS NULL OR p_cantidad = 0 THEN RAISE EXCEPTION 'La cantidad no puede ser cero'; END IF;
  IF char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo del ajuste'; END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = p_cliente_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF p_cantidad < 0 AND ((p_unidad = 'puntos' AND a.puntos_saldo + p_cantidad < 0) OR (p_unidad = 'sellos' AND a.sellos_saldo + p_cantidad < 0)) THEN
    RAISE EXCEPTION 'El cliente no tiene tantos % para restar', p_unidad;
  END IF;
  INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, motivo, idempotency_key, creado_por)
  VALUES (v_rid, p_cliente_id, 'ajuste', p_unidad, p_cantidad, btrim(p_motivo), 'ajuste:' || gen_random_uuid(), auth.uid());
  PERFORM _fid_audit(v_rid, 'saldo_ajustado', 'cliente', p_cliente_id, jsonb_build_object('cantidad', p_cantidad, 'unidad', p_unidad, 'motivo', p_motivo));
END;
$$;

-- Recalcula el nivel de todos los clientes (después de crear o cambiar niveles). Solo el administrador.
CREATE OR REPLACE FUNCTION public.fid_recalcular_niveles()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador recalcula niveles'; END IF;
  UPDATE fid_cuentas a SET nivel_id = (
    SELECT n.id FROM fid_niveles n WHERE n.restaurant_id = a.restaurant_id AND n.activo AND n.puntos_minimos <= a.puntos_historicos
     ORDER BY n.puntos_minimos DESC LIMIT 1)
   WHERE a.restaurant_id = v_rid;
END;
$$;

-- Tarjeta pública: el cliente abre su enlace con el código del QR. Sin sesión. Devuelve SOLO lo necesario:
-- primer nombre, saldos, nivel, progreso y últimos movimientos. Nunca teléfono, correo ni gasto.
CREATE OR REPLACE FUNCTION public.fid_tarjeta_publica(p_token text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c clientes%ROWTYPE; a fid_cuentas%ROWTYPE; n fid_niveles%ROWTYPE; s fid_niveles%ROWTYPE; r restaurants%ROWTYPE; v_movs json;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO c FROM clientes WHERE qr_token = p_token AND activo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM fid_programas WHERE restaurant_id = c.restaurant_id AND activo) THEN RETURN NULL; END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = c.id;
  SELECT * INTO r FROM restaurants WHERE id = c.restaurant_id;
  SELECT * INTO n FROM fid_niveles WHERE id = a.nivel_id;
  SELECT * INTO s FROM fid_niveles WHERE restaurant_id = c.restaurant_id AND activo AND puntos_minimos > COALESCE(a.puntos_historicos, 0)
    ORDER BY puntos_minimos LIMIT 1;
  SELECT COALESCE(json_agg(m), '[]'::json) INTO v_movs FROM (
    SELECT created_at AS fecha, tipo, unidad, cantidad, motivo FROM fid_movimientos WHERE cliente_id = c.id ORDER BY created_at DESC LIMIT 10) m;
  RETURN json_build_object(
    'restaurante', r.name,
    'nombre', split_part(btrim(c.nombre), ' ', 1),
    'puntos', COALESCE(a.puntos_saldo, 0), 'sellos', COALESCE(a.sellos_saldo, 0),
    'nivel', n.nombre, 'nivel_beneficios', n.beneficios,
    'siguiente_nivel', s.nombre,
    'puntos_para_siguiente', CASE WHEN s.id IS NULL THEN NULL ELSE s.puntos_minimos - COALESCE(a.puntos_historicos, 0) END,
    'progreso_pct', CASE WHEN s.id IS NULL THEN 100
                         ELSE round(100.0 * (COALESCE(a.puntos_historicos, 0) - COALESCE(n.puntos_minimos, 0)) / NULLIF(s.puntos_minimos - COALESCE(n.puntos_minimos, 0), 0)) END,
    'movimientos', v_movs);
END;
$$;

-- Permisos de ejecución. Las funciones que empiezan con _ son internas: nadie las llama desde el navegador.
REVOKE ALL ON FUNCTION public._fid_audit(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_acreditar_orden(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_revertir_orden(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_orders_paid_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_mov_aplicar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fid_registrar_cliente(text, text, text, date, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_editar_cliente(uuid, text, text, text, date, text, boolean, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_buscar_cliente(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_asociar_orden(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_canjear(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_anular_canje(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_ajustar_saldo(uuid, int, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_recalcular_niveles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_tarjeta_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fid_registrar_cliente(text, text, text, date, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_editar_cliente(uuid, text, text, text, date, text, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_buscar_cliente(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_asociar_orden(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_canjear(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_anular_canje(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_ajustar_saldo(uuid, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_recalcular_niveles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_tarjeta_publica(text) TO anon, authenticated;
