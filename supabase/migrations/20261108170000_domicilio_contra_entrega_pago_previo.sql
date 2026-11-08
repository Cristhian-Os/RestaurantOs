-- Domicilios · contra entrega: el repartidor PAGA EN CAJA antes de llevarse el pedido (decisión de Cristhian, 2026-11-08).
--  * Un domicilio contra entrega que todavía no pagó el repartidor (pago_estado = 'contra_entrega') no puede pasar a
--    'recogido' ni a 'en_camino' (los dos estados en que el pedido ya salió del restaurante).
--  * Se hace con un disparador sobre domicilios.estado: cubre dom_cambiar_estado y cualquier ruta futura, sin reescribir
--    funciones (las firmas no cambian, no hay sobrecargas). Los cierres (dom_cerrar_entrega, dom_cerrar_entrega_bot,
--    dom_cerrar_sin_codigo) solo aceptan domicilios ya en 'recogido'/'en_camino', así que no pueden saltarse la regla;
--    y NO se bloquean aquí: si un pedido ya salió, la entrega debe poder cerrarse.
--  * Un contra entrega que ya quedó pagado por otra vía (pago_estado = 'confirmado', p. ej. cobrado antes en Caja) sale normal.
--  * Cancelar y fallar no se tocan.

CREATE OR REPLACE FUNCTION public._dom_exigir_pago_previo_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.metodo_pago = 'contra_entrega' AND NEW.pago_estado = 'contra_entrega' THEN
    RAISE EXCEPTION 'El repartidor debe pagar en caja antes de llevarse el pedido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS domicilios_pago_previo ON public.domicilios;
CREATE TRIGGER domicilios_pago_previo BEFORE UPDATE OF estado ON public.domicilios
  FOR EACH ROW WHEN (NEW.estado IN ('recogido', 'en_camino') AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public._dom_exigir_pago_previo_trg();

REVOKE ALL ON FUNCTION public._dom_exigir_pago_previo_trg() FROM PUBLIC, anon, authenticated;
