-- ============================================================
-- DISHES: opciones por plato + sabores de helado (aplicado vía MCP)
-- ============================================================

-- Grupos de opciones por plato (sabores de helado, queso/helado, etc.)
-- Formato de cada grupo:
--   { "tipo":"helado", "nombre":"Sabores de helado", "cantidad":3 }
--   { "tipo":"opcion", "nombre":"¿Con qué lo quieres?",
--     "opciones":[ {"label":"Con queso"}, {"label":"Con helado","helado":1} ] }
ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Lista de sabores de helado disponibles (se gestiona en el panel admin):
-- restaurant_config.modules_enabled.helado_flavors = ["Vainilla","Chocolate", ...]

-- Las malteadas se dividieron en un producto por sabor (categoría 'malteadas').
-- Los platos con helado tienen options con el nº de bolas a elegir; el Mix usa
-- una opción queso/helado con submenú de sabores cuando se elige helado.
