-- Domicilios · pulido: al entregar un domicilio, el pedido (ya pagado) pasa a "completed".
--  * Antes el pedido de un domicilio quedaba abierto para siempre: el corte de caja cuenta pedidos solo si están
--    'completed' y pagados hoy (el DINERO sale de order_payments y no depende del estado, por eso no se duplica).
--  * Se hace con un disparador sobre domicilios.estado: así cubre dom_cerrar_entrega, dom_cerrar_entrega_bot,
--    dom_cerrar_sin_codigo y cualquier ruta futura, sin reescribir esas funciones (sus firmas no cambian).
--  * Solo cuando el estado PASA a 'entregado' (una vez). Cancelado/fallido no lo tocan.
--  * No toca pedidos ya completados o cancelados, ni pedidos sin pagar (paid_at nulo): esos siguen su curso en Caja.
--  * No mueve dinero ni stock: el pago ya se registró con _cobrar_base(...,false) (que también descontó el stock).
-- Los repartidores ya los puede leer el cajero (política "repartidores: leen admin y cajero"): no hace falta función nueva.

CREATE OR REPLACE FUNCTION public._dom_completar_orden(p_dom uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE orders o SET status = 'completed'
    FROM domicilios d
   WHERE d.id = p_dom AND d.estado = 'entregado'
     AND o.id = d.order_id AND o.restaurant_id = d.restaurant_id
     AND o.paid_at IS NOT NULL AND o.status NOT IN ('completed', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public._dom_entregado_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public._dom_completar_orden(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS domicilios_entregado_completa ON public.domicilios;
CREATE TRIGGER domicilios_entregado_completa AFTER UPDATE OF estado ON public.domicilios
  FOR EACH ROW WHEN (NEW.estado = 'entregado' AND OLD.estado IS DISTINCT FROM 'entregado')
  EXECUTE FUNCTION public._dom_entregado_trg();

REVOKE ALL ON FUNCTION public._dom_completar_orden(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dom_entregado_trg() FROM PUBLIC, anon, authenticated;
