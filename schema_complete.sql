-- ============================================================
-- RESTAURANTOS V5 — SCHEMA COMPLETO
-- Ejecutar en Supabase SQL Editor (en orden)
-- ============================================================

-- ============================================================
-- 1. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. FUNCIÓN set_updated_at (necesaria para triggers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ============================================================
-- 3. FUNCIÓN is_admin y get_user_role
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 4. TABLA PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'waiter'
            CHECK (role IN ('admin','waiter','kitchen','cashier','client')),
  full_name TEXT,
  email     TEXT,
  phone     TEXT,
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-crear perfil al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'waiter')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles visible to authenticated" ON public.profiles;
CREATE POLICY "Profiles visible to authenticated" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin manages profiles" ON public.profiles;
CREATE POLICY "Admin manages profiles" ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;
CREATE POLICY "Own profile update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 5. TABLA MESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mesas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      INTEGER NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 100),
  capacidad   INTEGER NOT NULL DEFAULT 4,
  estado      TEXT NOT NULL DEFAULT 'libre'
              CHECK (estado IN ('libre','ocupada','reservada','cuenta')),
  zona        TEXT DEFAULT 'principal',
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS mesas_set_updated_at ON public.mesas;
CREATE TRIGGER mesas_set_updated_at
  BEFORE UPDATE ON public.mesas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mesas visible to authenticated" ON public.mesas;
CREATE POLICY "Mesas visible to authenticated" ON public.mesas
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin manages mesas" ON public.mesas;
CREATE POLICY "Admin manages mesas" ON public.mesas
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Staff update mesas" ON public.mesas;
CREATE POLICY "Staff update mesas" ON public.mesas
  FOR UPDATE USING (
    public.get_user_role() IN ('waiter','cashier','admin')
  );

-- Insertar mesas por defecto (1–15)
INSERT INTO public.mesas (numero, capacidad, zona)
SELECT
  gs,
  CASE WHEN gs <= 4 THEN 2 WHEN gs <= 10 THEN 4 ELSE 6 END,
  CASE WHEN gs <= 5 THEN 'terraza' ELSE 'principal' END
FROM generate_series(1, 15) gs
ON CONFLICT (numero) DO NOTHING;

-- ============================================================
-- 6. TABLA DISHES (menú)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dishes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description          TEXT CHECK (char_length(description) <= 500),
  price                NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  category             TEXT NOT NULL DEFAULT 'principal'
                       CHECK (category IN ('entrada','principal','postre','bebida','especial')),
  image_url            TEXT,
  available            BOOLEAN NOT NULL DEFAULT TRUE,
  availability_status  TEXT NOT NULL DEFAULT 'available'
                       CHECK (availability_status IN ('available','out_of_stock','discontinued')),
  tags                 TEXT[] DEFAULT '{}',
  sort_order           INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS dishes_set_updated_at ON public.dishes;
CREATE TRIGGER dishes_set_updated_at
  BEFORE UPDATE ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dishes_category  ON public.dishes(category);
CREATE INDEX IF NOT EXISTS idx_dishes_available ON public.dishes(available);

ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dishes visible to authenticated" ON public.dishes;
CREATE POLICY "Dishes visible to authenticated" ON public.dishes
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin manages dishes" ON public.dishes;
CREATE POLICY "Admin manages dishes" ON public.dishes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 7. TABLA ORDERS (rediseñada con items como JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mesa_id     UUID REFERENCES public.mesas(id) ON DELETE SET NULL,
  table_num   INTEGER,
  items       JSONB NOT NULL DEFAULT '[]',  -- [{id, name, price, quantity, notes}]
  total       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','cooking','ready','completed','cancelled')),
  tipo_pedido TEXT NOT NULL DEFAULT 'LOCAL'
              CHECK (tipo_pedido IN ('LOCAL','LLEVAR','DOMICILIO','RAPPI')),
  notes       TEXT CHECK (char_length(notes) <= 500),
  -- Pago
  payment_method TEXT CHECK (payment_method IN ('efectivo','transferencia','tarjeta') OR payment_method IS NULL),
  amount_paid    NUMERIC(10,2),
  change_amount  NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN payment_method = 'efectivo' AND amount_paid IS NOT NULL
    THEN GREATEST(amount_paid - total, 0) ELSE 0 END
  ) STORED,
  paid_at        TIMESTAMPTZ,
  paid_by        UUID REFERENCES auth.users(id),
  -- Auditoría
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: al cobrar, actualizar estado de la mesa
CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Cuando se completa/cancela una orden, liberar mesa si no tiene otras órdenes activas
  IF NEW.status IN ('completed','cancelled') AND OLD.status != NEW.status THEN
    IF NEW.mesa_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE mesa_id = NEW.mesa_id
          AND id != NEW.id
          AND status NOT IN ('completed','cancelled')
      ) THEN
        UPDATE public.mesas SET estado = 'libre' WHERE id = NEW.mesa_id;
      END IF;
    END IF;
  END IF;

  -- Cuando se crea/activa una orden, marcar mesa como ocupada
  IF NEW.status NOT IN ('completed','cancelled') AND NEW.mesa_id IS NOT NULL THEN
    UPDATE public.mesas SET estado = 'ocupada' WHERE id = NEW.mesa_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_status_change ON public.orders;
CREATE TRIGGER orders_status_change
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();

CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id    ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_mesa_id    ON public.orders(mesa_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access orders" ON public.orders;
CREATE POLICY "Admin full access orders" ON public.orders
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Staff view orders" ON public.orders;
CREATE POLICY "Staff view orders" ON public.orders
  FOR SELECT USING (public.get_user_role() IN ('waiter','kitchen','cashier'));
DROP POLICY IF EXISTS "Waiter create orders" ON public.orders;
CREATE POLICY "Waiter create orders" ON public.orders
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('waiter','cashier')
    AND auth.uid() = user_id
  );
DROP POLICY IF EXISTS "Staff update order status" ON public.orders;
CREATE POLICY "Staff update order status" ON public.orders
  FOR UPDATE USING (public.get_user_role() IN ('waiter','kitchen','cashier'));

-- ============================================================
-- 8. INGREDIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ingredientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL UNIQUE CHECK (char_length(nombre) BETWEEN 2 AND 100),
  unidad_medida  TEXT NOT NULL CHECK (unidad_medida IN ('kg','litro','pieza','gramo','ml','paquete')),
  stock_actual   NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo   NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  costo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS ingredientes_set_updated_at ON public.ingredientes;
CREATE TRIGGER ingredientes_set_updated_at
  BEFORE UPDATE ON public.ingredientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ingredientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ingredientes read authenticated" ON public.ingredientes;
CREATE POLICY "Ingredientes read authenticated" ON public.ingredientes
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin manages ingredientes" ON public.ingredientes;
CREATE POLICY "Admin manages ingredientes" ON public.ingredientes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 9. RECETAS (ingredientes por plato)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recetas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id         UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  ingrediente_id      UUID NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  cantidad_necesaria  NUMERIC(10,3) NOT NULL CHECK (cantidad_necesaria > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(producto_id, ingrediente_id)
);

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Recetas read authenticated" ON public.recetas;
CREATE POLICY "Recetas read authenticated" ON public.recetas
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin manages recetas" ON public.recetas;
CREATE POLICY "Admin manages recetas" ON public.recetas
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 10. DETALLES DE PEDIDO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.detalles_pedidos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  dish_id     UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unit NUMERIC(10,2) NOT NULL CHECK (precio_unit >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: descontar ingredientes del stock al confirmar detalle
CREATE OR REPLACE FUNCTION public.descontar_ingredientes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ingredientes i
  SET stock_actual = stock_actual - (r.cantidad_necesaria * NEW.cantidad)
  FROM public.recetas r
  WHERE r.producto_id = NEW.dish_id
    AND r.ingrediente_id = i.id
    AND i.stock_actual >= (r.cantidad_necesaria * NEW.cantidad);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS detalles_descontar_stock ON public.detalles_pedidos;
CREATE TRIGGER detalles_descontar_stock
  AFTER INSERT ON public.detalles_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.descontar_ingredientes();

CREATE INDEX IF NOT EXISTS idx_detalles_order_id ON public.detalles_pedidos(order_id);
CREATE INDEX IF NOT EXISTS idx_detalles_dish_id  ON public.detalles_pedidos(dish_id);

ALTER TABLE public.detalles_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Detalles read authenticated" ON public.detalles_pedidos;
CREATE POLICY "Detalles read authenticated" ON public.detalles_pedidos
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff insert detalles" ON public.detalles_pedidos;
CREATE POLICY "Staff insert detalles" ON public.detalles_pedidos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 11. CORTES DE CAJA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cortes_caja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id        UUID NOT NULL REFERENCES auth.users(id),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  total_efectivo    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_transferencia NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ordenes     INTEGER NOT NULL DEFAULT 0,
  ordenes_ids       UUID[],
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cortes_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin and cashier cortes" ON public.cortes_caja;
CREATE POLICY "Admin and cashier cortes" ON public.cortes_caja
  FOR ALL USING (
    public.is_admin() OR public.get_user_role() = 'cashier'
  );

-- ============================================================
-- 12. PUSH SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  auth       TEXT,
  p256dh     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 13. VISTAS
-- ============================================================

-- Vista lista de compras
CREATE OR REPLACE VIEW public.vista_lista_compras AS
SELECT
  i.id,
  i.nombre,
  i.unidad_medida,
  i.stock_actual,
  i.stock_minimo,
  i.costo_unitario,
  GREATEST(i.stock_minimo * 2 - i.stock_actual, 0) AS cantidad_sugerida,
  GREATEST(i.stock_minimo * 2 - i.stock_actual, 0) * i.costo_unitario AS costo_sugerido,
  CASE
    WHEN i.stock_actual = 0              THEN 'URGENTE'
    WHEN i.stock_actual < i.stock_minimo THEN 'ALTO'
    ELSE 'NORMAL'
  END AS prioridad
FROM public.ingredientes i
WHERE i.stock_actual <= i.stock_minimo * 1.2
ORDER BY
  CASE WHEN i.stock_actual = 0 THEN 0 WHEN i.stock_actual < i.stock_minimo THEN 1 ELSE 2 END,
  i.nombre;

-- Vista productos disponibles con estado de ingredientes
CREATE OR REPLACE VIEW public.vista_productos_disponibles AS
SELECT
  d.id,
  d.name,
  d.description,
  d.price,
  d.category,
  d.image_url,
  d.available,
  d.availability_status,
  d.tags,
  COUNT(r.id) AS ingredientes_totales,
  COUNT(CASE WHEN i.stock_actual < r.cantidad_necesaria THEN 1 END) AS ingredientes_faltantes
FROM public.dishes d
LEFT JOIN public.recetas r ON r.producto_id = d.id
LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
WHERE d.available = TRUE AND d.availability_status = 'available'
GROUP BY d.id;

-- ============================================================
-- 14. RPCs FALTANTES
-- ============================================================

-- RPC: Métricas del admin
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_sales_today',
      COALESCE((SELECT SUM(total) FROM public.orders
        WHERE status = 'completed'
          AND created_at >= CURRENT_DATE), 0),
    'pending_count',
      COALESCE((SELECT COUNT(*) FROM public.orders WHERE status = 'pending'), 0),
    'cooking_count',
      COALESCE((SELECT COUNT(*) FROM public.orders WHERE status = 'cooking'), 0),
    'ready_count',
      COALESCE((SELECT COUNT(*) FROM public.orders WHERE status = 'ready'), 0),
    'completed_today',
      COALESCE((SELECT COUNT(*) FROM public.orders
        WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0),
    'active_tables',
      COALESCE((SELECT COUNT(*) FROM public.mesas WHERE estado = 'ocupada'), 0),
    'cancelled_today',
      COALESCE((SELECT COUNT(*) FROM public.orders
        WHERE status = 'cancelled' AND created_at >= CURRENT_DATE), 0)
  ) INTO v_result;
  RETURN v_result;
END; $$;

-- RPC: Calcular costo de receta
CREATE OR REPLACE FUNCTION public.calcular_costo_receta(p_dish_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_costo NUMERIC;
BEGIN
  SELECT COALESCE(SUM(i.costo_unitario * r.cantidad_necesaria), 0)
  INTO v_costo
  FROM public.recetas r
  JOIN public.ingredientes i ON i.id = r.ingrediente_id
  WHERE r.producto_id = p_dish_id;
  RETURN v_costo;
END; $$;

-- RPC: Crear orden completa con items y descuento de inventario
CREATE OR REPLACE FUNCTION public.crear_orden_completa(
  p_mesa_id      UUID,
  p_items        JSONB,   -- [{id, name, price, quantity, notes}]
  p_tipo_pedido  TEXT,
  p_notes        TEXT DEFAULT NULL,
  p_table_num    INTEGER DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order    public.orders%ROWTYPE;
  v_total    NUMERIC := 0;
  v_item     JSONB;
BEGIN
  -- Calcular total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total := v_total + (v_item->>'price')::NUMERIC * (v_item->>'quantity')::INTEGER;
  END LOOP;

  -- Crear la orden
  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status)
  VALUES (auth.uid(), p_mesa_id, p_table_num, p_items, v_total, p_tipo_pedido, p_notes, 'pending')
  RETURNING * INTO v_order;

  -- Insertar detalles (esto dispara el descuento de ingredientes)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes)
    VALUES (
      v_order.id,
      (v_item->>'id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'price')::NUMERIC,
      v_item->>'notes'
    );
  END LOOP;

  RETURN json_build_object(
    'order_id', v_order.id,
    'total',    v_total,
    'status',   'pending'
  );
END; $$;

-- RPC: Cobrar orden
CREATE OR REPLACE FUNCTION public.cobrar_orden(
  p_order_id       UUID,
  p_payment_method TEXT,
  p_amount_paid    NUMERIC DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_change NUMERIC := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_order.status != 'ready' THEN
    RAISE EXCEPTION 'La orden debe estar en estado "ready" para cobrar (estado actual: %)', v_order.status;
  END IF;

  IF p_payment_method = 'efectivo' AND p_amount_paid IS NOT NULL THEN
    v_change := GREATEST(p_amount_paid - v_order.total, 0);
  END IF;

  UPDATE public.orders SET
    status         = 'completed',
    payment_method = p_payment_method,
    amount_paid    = COALESCE(p_amount_paid, v_order.total),
    paid_at        = NOW(),
    paid_by        = auth.uid()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'order_id', p_order_id,
    'total',    v_order.total,
    'paid',     COALESCE(p_amount_paid, v_order.total),
    'change',   v_change,
    'method',   p_payment_method
  );
END; $$;

-- RPC: Corte de caja diario
CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_total_efectivo NUMERIC;
  v_total_transf   NUMERIC;
  v_total_ordenes  INTEGER;
  v_ordenes_ids    UUID[];
BEGIN
  SELECT
    COALESCE(SUM(total) FILTER (WHERE payment_method = 'efectivo'), 0),
    COALESCE(SUM(total) FILTER (WHERE payment_method = 'transferencia'), 0),
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_total_efectivo, v_total_transf, v_total_ordenes, v_ordenes_ids
  FROM public.orders
  WHERE status = 'completed'
    AND paid_at >= CURRENT_DATE
    AND paid_at < CURRENT_DATE + INTERVAL '1 day';

  INSERT INTO public.cortes_caja
    (cashier_id, total_efectivo, total_transferencia, total_ordenes, ordenes_ids, notas)
  VALUES (auth.uid(), v_total_efectivo, v_total_transf, v_total_ordenes, v_ordenes_ids, p_notas)
  RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id',           v_corte.id,
    'fecha',              v_corte.fecha,
    'total_efectivo',     v_total_efectivo,
    'total_transferencia',v_total_transf,
    'total_general',      v_total_efectivo + v_total_transf,
    'total_ordenes',      v_total_ordenes
  );
END; $$;

-- ============================================================
-- 15. HABILITAR REALTIME
-- ============================================================
-- Ejecutar en Supabase Dashboard → Database → Replication:
-- Tablas: orders, mesas, tasks, task_evidence
-- Eventos: INSERT, UPDATE, DELETE

-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
