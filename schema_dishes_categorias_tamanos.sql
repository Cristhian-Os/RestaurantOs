-- ============================================================
-- DISHES: categorías libres + tamaños con precio (aplicado vía MCP)
-- ============================================================

-- 1. Quitar la restricción que limitaba la categoría a 5 valores.
--    Las categorías se gestionan en la app (restaurant_config.modules_enabled.categories),
--    por eso el CHECK en la BD bloqueaba las categorías personalizadas.
ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_category_check;

-- 2. Tamaños con precio propio. Cada tamaño: { "nombre": "...", "precio": 0 }
--    Vacío = el plato usa su precio único (columna price).
--    Cuando has_sizes = true, price guarda el precio del tamaño más barato
--    (para mostrar "desde $X" en el menú).
ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb;
