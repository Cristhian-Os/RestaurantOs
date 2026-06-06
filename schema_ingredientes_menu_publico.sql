-- ============================================================
-- MENÚ QR: vista pública de ingredientes para el plato custom (MCP)
-- ============================================================
-- El constructor "Arma tu propio plato" del menú QR lo usa un cliente
-- ANÓNIMO. No debe ver datos internos (costo real, stock), así que esta
-- vista solo expone:
--   - nombre, unidad de medida
--   - precio_venta_unitario = costo / 0.65  (garantiza 35% de ganancia
--     sobre el precio de venta)
--   - disponible (si hay stock > 0), sin revelar la cantidad
--
-- El cliente suma (cantidad × precio_venta_unitario) y la app redondea
-- el total HACIA ARRIBA al múltiplo de 100, así el margen nunca baja
-- del 35%.

CREATE OR REPLACE VIEW public.ingredientes_menu_publico AS
SELECT
  id,
  nombre,
  unidad_medida,
  round((costo_unitario / 0.65)::numeric, 2) AS precio_venta_unitario,
  (stock_actual > 0) AS disponible
FROM public.ingredientes
WHERE stock_actual > 0
ORDER BY nombre;

GRANT SELECT ON public.ingredientes_menu_publico TO anon, authenticated;
