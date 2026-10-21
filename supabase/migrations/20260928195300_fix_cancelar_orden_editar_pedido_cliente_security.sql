-- Mitiga 2 huecos de seguridad críticos en funciones SECURITY DEFINER:
-- 1. cancelar_orden: aceptaba cualquier UUID, cancelaba pedidos de otros restaurantes
--    y permitía anónimo cancelar pedidos pagados
-- 2. editar_pedido_cliente: no se usa en frontend (reemplazada por editar_items_pedido),
--    pero si se llamaba tendría el mismo hueco + JOIN roto con platos repetidos

-- Reescribe cancelar_orden con verificación de rol y restaurante (CREATE OR REPLACE mantiene firma)
CREATE OR REPLACE FUNCTION public.cancelar_orden(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT public.get_user_role() INTO v_role;

  -- Regla de autorización:
  -- - Personal (admin/cashier/waiter): solo pedidos de su restaurante, no completados/cancelados
  -- - Anónimo/comensal: solo pedidos pendientes sin pagar (status='pending' AND paid_at IS NULL)
  IF v_role IN ('admin','cashier','waiter') THEN
    IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
      RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    IF v_order.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Este pedido ya no se puede cancelar';
    END IF;
  ELSE
    -- Usuario anónimo o sin rol válido: solo puede cancelar si está pendiente y no ha sido pagado
    IF v_order.status <> 'pending' OR v_order.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'Tu pedido ya fue pagado o está en preparación. Pide el cambio en caja.';
    END IF;
  END IF;

  UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

-- Elimina editar_pedido_cliente (no se usa en frontend desde commit d4976fe; la reemplazó editar_items_pedido)
-- El grepping de frontend confirma: solo editar_items_pedido en src/pages/PublicMenu.tsx y
-- src/components/orders/EditOrderModal.tsx; editar_pedido_cliente no aparece
DROP FUNCTION IF EXISTS public.editar_pedido_cliente(uuid, jsonb);

-- Recargar PostgREST schema
NOTIFY pgrst, 'reload schema';
