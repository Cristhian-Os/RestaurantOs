-- Proveedores: más formas de contacto. Ambas columnas son opcionales (no rompen filas existentes).
--   email: correo del proveedor.
--   notas: otras formas de contacto o datos útiles (WhatsApp, persona de contacto, dirección, horarios).
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS notas text;
