-- Registro de QR impresos: permite ofrecer solo las mesas nuevas al generar el PDF.
ALTER TABLE public.mesas ADD COLUMN IF NOT EXISTS qr_generado_at timestamptz;
ALTER TABLE public.restaurant_config ADD COLUMN IF NOT EXISTS qr_general_generado_at timestamptz;
