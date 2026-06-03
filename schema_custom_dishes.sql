-- ============================================================
-- CUSTOM DISHES - Platos personalizados (v1)
-- Aplicado a Supabase vía MCP (migración: custom_dishes)
-- Ejecutar en Supabase SQL Editor si se reconstruye la BD
-- ============================================================

-- ============================================================
-- 1. TABLA: CUSTOM_DISHES (platos personalizados)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_dishes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description         TEXT,
  base_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS custom_dishes_set_updated_at ON public.custom_dishes;
CREATE TRIGGER custom_dishes_set_updated_at
  BEFORE UPDATE ON public.custom_dishes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_dishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Custom dishes read authenticated" ON public.custom_dishes;
CREATE POLICY "Custom dishes read authenticated" ON public.custom_dishes
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff insert custom dishes" ON public.custom_dishes;
CREATE POLICY "Staff insert custom dishes" ON public.custom_dishes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 2. TABLA: CUSTOM_DISH_INGREDIENTS (ingredientes seleccionados)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_dish_ingredients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_dish_id    UUID NOT NULL REFERENCES public.custom_dishes(id) ON DELETE CASCADE,
  ingrediente_id    UUID NOT NULL REFERENCES public.ingredientes(id) ON DELETE RESTRICT,
  cantidad          NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.custom_dish_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Custom ingredients read authenticated" ON public.custom_dish_ingredients;
CREATE POLICY "Custom ingredients read authenticated" ON public.custom_dish_ingredients
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff manage custom ingredients" ON public.custom_dish_ingredients;
CREATE POLICY "Staff manage custom ingredients" ON public.custom_dish_ingredients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_custom_dish_order ON public.custom_dishes(order_id);
CREATE INDEX IF NOT EXISTS idx_custom_ingredients_dish ON public.custom_dish_ingredients(custom_dish_id);

-- ============================================================
-- 3. FUNCTION: Crear plato custom y descontar stock (atómico)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_plato_custom(
  p_order_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_ingredientes JSONB DEFAULT '{}'::JSONB -- { "ingrediente_id": cantidad, ... }
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_custom_dish_id  UUID;
  v_total_precio    NUMERIC(10,2) := 0;
  v_ingrediente_id  UUID;
  v_cantidad_pedida NUMERIC(10,3);
  v_costo_unitario  NUMERIC(10,2);
  v_stock_actual    NUMERIC(10,3);
  v_nombre          TEXT;
BEGIN
  -- Crear plato custom
  INSERT INTO public.custom_dishes (order_id, name, description, created_by)
  VALUES (p_order_id, p_name, p_description, auth.uid())
  RETURNING id INTO v_custom_dish_id;

  -- Procesar cada ingrediente { "ingrediente_id": cantidad }
  FOR v_ingrediente_id, v_cantidad_pedida IN
    SELECT key::UUID, value::NUMERIC
    FROM jsonb_each_text(p_ingredientes)
  LOOP
    -- Obtener datos del ingrediente
    SELECT costo_unitario, stock_actual, nombre
    INTO v_costo_unitario, v_stock_actual, v_nombre
    FROM public.ingredientes
    WHERE id = v_ingrediente_id;

    IF v_costo_unitario IS NULL THEN
      RAISE EXCEPTION 'Ingrediente no encontrado: %', v_ingrediente_id;
    END IF;

    -- Validar stock suficiente
    IF v_stock_actual < v_cantidad_pedida THEN
      RAISE EXCEPTION 'Stock insuficiente de %: disponible %, solicitado %',
        v_nombre, v_stock_actual, v_cantidad_pedida;
    END IF;

    -- Registrar ingrediente del plato custom
    INSERT INTO public.custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad)
    VALUES (v_custom_dish_id, v_ingrediente_id, v_cantidad_pedida);

    -- Descontar del stock
    UPDATE public.ingredientes
    SET stock_actual = stock_actual - v_cantidad_pedida
    WHERE id = v_ingrediente_id;

    -- Acumular costo
    v_total_precio := v_total_precio + (v_costo_unitario * v_cantidad_pedida);
  END LOOP;

  -- Actualizar precio del plato custom (mínimo $5)
  UPDATE public.custom_dishes
  SET base_price = GREATEST(v_total_precio, 5)
  WHERE id = v_custom_dish_id;

  RETURN v_custom_dish_id;
END; $$;

-- ============================================================
-- 4. VIEW: Ingredientes disponibles (respeta RLS via security_invoker)
-- ============================================================
DROP VIEW IF EXISTS public.ingredientes_disponibles;
CREATE VIEW public.ingredientes_disponibles
WITH (security_invoker = true) AS
SELECT
  id,
  nombre,
  unidad_medida,
  stock_actual,
  stock_minimo,
  costo_unitario,
  CASE
    WHEN stock_actual <= 0 THEN 'agotado'
    WHEN stock_actual < stock_minimo THEN 'bajo'
    ELSE 'disponible'
  END AS disponibilidad
FROM public.ingredientes
WHERE stock_actual > 0
ORDER BY nombre;

-- Exponer la vista a PostgREST
GRANT SELECT ON public.ingredientes_disponibles TO anon, authenticated;

-- ============================================================
-- 5. RPC: Crear orden completa con items normales + platos custom (atómico)
--    Esta es la función que llama el frontend (ClientMenuSection).
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_orden_con_custom(
  p_items_normales JSONB DEFAULT '[]'::JSONB,  -- [{id,name,price,quantity,notes}]
  p_platos_custom  JSONB DEFAULT '[]'::JSONB,  -- [{name,description,quantity,ingredients:{ing_id:cant}}]
  p_tipo_pedido    TEXT DEFAULT 'LOCAL',
  p_table_num      INTEGER DEFAULT NULL,
  p_mesa_id        UUID DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_order_id      UUID;
  v_total         NUMERIC := 0;
  v_item          JSONB;
  v_custom        JSONB;
  v_custom_id     UUID;
  v_custom_price  NUMERIC;
  v_qty           INTEGER;
  v_items_final   JSONB := '[]'::JSONB;
BEGIN
  -- 1. Crear la orden (vacía por ahora; se rellena items y total al final)
  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status)
  VALUES (auth.uid(), p_mesa_id, p_table_num, '[]'::jsonb, 0, p_tipo_pedido, p_notes, 'pending')
  RETURNING id INTO v_order_id;

  -- 2. Items normales: detalles_pedidos (dispara descuento por receta) + acumular
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_normales) LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    v_total := v_total + (v_item->>'price')::NUMERIC * v_qty;

    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes)
    VALUES (
      v_order_id,
      (v_item->>'id')::UUID,
      v_qty,
      (v_item->>'price')::NUMERIC,
      v_item->>'notes'
    );

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_item->>'id', 'name', v_item->>'name',
      'price', (v_item->>'price')::NUMERIC, 'quantity', v_qty
    );
  END LOOP;

  -- 3. Platos custom: crear cada uno (descuenta ingredientes) y acumular
  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_platos_custom) LOOP
    v_qty := COALESCE((v_custom->>'quantity')::INTEGER, 1);

    v_custom_id := public.crear_plato_custom(
      v_order_id,
      v_custom->>'name',
      v_custom->>'description',
      COALESCE(v_custom->'ingredients', '{}'::jsonb)
    );

    SELECT base_price INTO v_custom_price FROM public.custom_dishes WHERE id = v_custom_id;
    v_total := v_total + v_custom_price * v_qty;

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_custom_id, 'name', v_custom->>'name',
      'price', v_custom_price, 'quantity', v_qty, 'is_custom', true
    );
  END LOOP;

  -- 4. Actualizar orden con items finales y total
  UPDATE public.orders
  SET items = v_items_final, total = v_total
  WHERE id = v_order_id;

  RETURN json_build_object(
    'order_id', v_order_id,
    'total',    v_total,
    'status',   'pending'
  );
END; $$;
