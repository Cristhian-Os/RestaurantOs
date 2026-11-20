-- Contenido por defecto de un ingrediente que se compra en cajas/paquetes (ej. Oreo: 24 bolsas x 4 galletas).
-- Solo agrega dos columnas opcionales; no cambia ni borra datos. Se usa para rellenar la calculadora de compras.
ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS empaque_paquetes  numeric CHECK (empaque_paquetes  IS NULL OR empaque_paquetes  > 0),
  ADD COLUMN IF NOT EXISTS empaque_contenido numeric CHECK (empaque_contenido IS NULL OR empaque_contenido > 0);
COMMENT ON COLUMN public.ingredientes.empaque_paquetes  IS 'Paquetes o tarros que trae cada caja/paquete comprado (por defecto; se puede cambiar en cada compra)';
COMMENT ON COLUMN public.ingredientes.empaque_contenido IS 'Cantidad (en la unidad del ingrediente) que trae cada paquete o tarro (por defecto)';
