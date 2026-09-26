-- ============================================================
-- INGREDIENTE SUSTITUTO — cambio tipo "adicional" cuando se agota
-- Aplicado a Supabase vía MCP (migración: ingrediente_sustituto)
-- ============================================================
-- El admin elige, por ingrediente, cuál otro ingrediente ofrecer como
-- cambio si éste se agota (stock_actual = 0). Se configura en
-- Inventario → Ingredientes. Al vender un plato cuya receta usa un
-- ingrediente agotado, el mesero ve el mismo selector tipo "adicional"
-- con la opción de cambio (ver OrderFlow → DishOptionsModal).

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS sustituto_id UUID REFERENCES public.ingredientes(id) ON DELETE SET NULL;

ALTER TABLE public.ingredientes
  DROP CONSTRAINT IF EXISTS ingredientes_sustituto_no_self;
ALTER TABLE public.ingredientes
  ADD CONSTRAINT ingredientes_sustituto_no_self CHECK (sustituto_id IS NULL OR sustituto_id <> id);

-- Nada más que exponer: RLS ya existente en `ingredientes` (lectura para
-- cualquier autenticado del mismo restaurant_id, escritura solo admin)
-- cubre esta columna sin cambios.
