-- Seguridad · auditoría de Fidelización / WhatsApp / Domicilios / Mesas QR (2026-11-08)
-- Informe: docs/informes/SEGURIDAD_FIDELIZACION_WHATSAPP.md
--
-- 🔴 mark_order_paid(uuid, text, text) era ejecutable por CUALQUIERA en internet (anon y PUBLIC) y no revisa quién llama:
--    quien conozca el id de un pedido (p. ej. el comensal con el suyo) lo marcaba como PAGADO sin pagar, y además
--    el disparador de fidelización le regalaba los puntos. Solo la usa la Edge Function wompi-webhook con la llave de servicio.
-- Esta migración es aditiva e idempotente: solo quita permisos; no cambia la función ni los datos.

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO service_role;
