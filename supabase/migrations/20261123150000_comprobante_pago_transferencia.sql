-- Foto del comprobante para transferencias cobradas en Caja (mesa o para llevar).
--  * order_payments gana comprobante_path (ruta en el bucket privado 'comprobantes', carpeta del restaurante).
--  * adjuntar_comprobante_pago(pago, ruta): solo admin o cajero, solo pagos por transferencia vigentes de su restaurante.
--  * No cambia montos ni el corte: es solo evidencia. Se permite aunque el día ya tenga corte (agregar la foto no altera el dinero).
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS comprobante_path text;

CREATE OR REPLACE FUNCTION public.adjuntar_comprobante_pago(p_pago_id uuid, p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden adjuntar comprobantes';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE v_rid::text || '/%' THEN
    RAISE EXCEPTION 'Ruta de comprobante inválida';
  END IF;
  UPDATE public.order_payments SET comprobante_path = p_path
   WHERE id = p_pago_id AND restaurant_id = v_rid AND payment_method = 'transferencia' AND anulado_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no existe, no es una transferencia o está anulado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.adjuntar_comprobante_pago(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjuntar_comprobante_pago(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
