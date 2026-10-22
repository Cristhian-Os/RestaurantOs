-- Reversa de 20261015203000_pagos_en_linea_verificados.sql
-- ATENCION: vuelve a mark_order_paid sin verificacion de monto. Redesplegar tambien la version anterior de wompi-webhook.
DROP FUNCTION IF EXISTS public.procesar_pago_wompi(text, text, text, integer, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.suscripcion_puede_cobrar(uuid);
DROP FUNCTION IF EXISTS public.mark_order_paid(uuid, text, text, integer);
DROP INDEX IF EXISTS public.payments_wompi_tx_uniq;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_method text DEFAULT 'ONLINE'::text, p_tx_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.orders
     set payment_method = 'tarjeta',   -- pago con tarjeta/en línea (encaja con el CHECK existente)
         paid_at = now()
   where id = p_order_id;
end;
$function$;
REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO service_role;
