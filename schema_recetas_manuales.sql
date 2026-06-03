-- ============================================================
-- RECETAS MANUALES — migración (aplicada vía MCP)
-- Cambia el flujo de recetas de selección de ingredientes
-- preestablecidos a ingreso 100% manual (nombre/precio/cantidad).
-- ============================================================

-- 1. Columnas manuales en recetas; ingrediente_id pasa a opcional
ALTER TABLE public.recetas
  ALTER COLUMN ingrediente_id DROP NOT NULL;

ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS nombre         TEXT,
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad         TEXT;

-- 2. Costo de receta usa el costo manual de la línea (fallback al catálogo)
CREATE OR REPLACE FUNCTION public.calcular_costo_receta(p_dish_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(SUM(
    COALESCE(NULLIF(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria
  ), 0)
  FROM public.recetas r
  LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
  WHERE r.producto_id = p_dish_id;
$$;

-- 3. Guardado ATÓMICO de la receta (borrar+insertar en una transacción).
--    Si el insert falla, el delete se revierte: no se pierde la receta.
CREATE OR REPLACE FUNCTION public.guardar_receta_manual(
  p_producto_id uuid,
  p_lineas jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo los administradores pueden editar recetas';
  END IF;

  DELETE FROM public.recetas WHERE producto_id = p_producto_id;

  INSERT INTO public.recetas (producto_id, ingrediente_id, nombre, costo_unitario, unidad, cantidad_necesaria)
  SELECT
    p_producto_id,
    NULL,
    trim(l->>'nombre'),
    COALESCE(NULLIF(l->>'costo_unitario','')::numeric, 0),
    NULLIF(trim(l->>'unidad'), ''),
    (l->>'cantidad_necesaria')::numeric
  FROM jsonb_array_elements(p_lineas) AS l
  WHERE trim(COALESCE(l->>'nombre','')) <> ''
    AND COALESCE(NULLIF(l->>'cantidad_necesaria','')::numeric, 0) > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
