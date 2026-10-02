-- Marca de "ya se avisó por push" de un pedido. La usa la edge function `notify-order`
-- con un UPDATE condicional (… WHERE push_notified_at IS NULL) para que cada pedido del
-- menú QR notifique a cocina/admin una sola vez, aunque el cliente repita la llamada.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS push_notified_at timestamptz;
