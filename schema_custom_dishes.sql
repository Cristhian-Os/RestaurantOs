-- ============================================================
-- CUSTOM DISHES - Platos personalizados (v1)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLA: CUSTOM_DISHES (platos personalizados)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_dishes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description         TEXT,
  base_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_per_gram      NUMERIC(10,4) NOT NULL DEFAULT 0.5, -- precio por gramo/ml de ingredientes
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
  FOR ALL WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_custom_dish_order ON public.custom_dishes(order_id);
CREATE INDEX IF NOT EXISTS idx_custom_ingredients_dish ON public.custom_dish_ingredients(custom_dish_id);

-- ============================================================
-- 3. FUNCTION: Crear plato custom y descontar stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_plato_custom(
  p_order_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_ingredientes JSONB DEFAULT '{}'::JSONB -- { "ingrediente_id": cantidad, ... }
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_custom_dish_id UUID;
  v_total_precio NUMERIC(10,2) := 0;
  v_ingrediente_id UUID;
  v_cantidad NUMERIC(10,3);
  v_costo_unitario NUMERIC(10,2);
  v_unidad_medida TEXT;
BEGIN
  -- Crear plato custom
  INSERT INTO public.custom_dishes (order_id, name, description, created_by)
  VALUES (p_order_id, p_name, p_description, auth.uid())
  RETURNING id INTO v_custom_dish_id;

  -- Procesar cada ingrediente
  FOR v_ingrediente_id, v_cantidad IN
    SELECT
      (key::UUID),
      (value::NUMERIC)
    FROM jsonb_each(p_ingredientes)
  LOOP
    -- Obtener costo unitario y validar disponibilidad
    SELECT costo_unitario, unidad_medida, stock_actual
    INTO v_costo_unitario, v_unidad_medida, v_cantidad
    FROM public.ingredientes
    WHERE id = v_ingrediente_id;

    IF v_costo_unitario IS NULL THEN
      RAISE EXCEPTION 'Ingrediente no encontrado: %', v_ingrediente_id;
    END IF;

    -- Insertar ingrediente en custom dish
    INSERT INTO public.custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad)
    VALUES (v_custom_dish_id, v_ingrediente_id, v_cantidad);

    -- Descontar del stock
    UPDATE public.ingredientes
    SET stock_actual = stock_actual - v_cantidad
    WHERE id = v_ingrediente_id
      AND stock_actual >= v_cantidad;

    -- Sumar costo
    v_total_precio := v_total_precio + (v_costo_unitario * v_cantidad);
  END LOOP;

  -- Actualizar precio del plato custom
  UPDATE public.custom_dishes
  SET base_price = GREATEST(v_total_precio, 5) -- mínimo $5
  WHERE id = v_custom_dish_id;

  RETURN v_custom_dish_id;
END; $$;

-- ============================================================
-- 4. VIEW: Ingredientes disponibles (con stock actual)
-- ============================================================
DROP VIEW IF EXISTS public.ingredientes_disponibles;
CREATE VIEW public.ingredientes_disponibles AS
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

-- Permisos para ver ingredientes disponibles
ALTER TABLE public.ingredientes_disponibles SET (check_option=local);
-- No se puede hacer UPDATE en vistas, así que solo SELECT
