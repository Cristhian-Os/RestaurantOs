-- Auditoría antifraude: toda cancelación de pedido por el personal queda con motivo, quién y cuándo.
--  * orders gana cancelado_motivo, cancelado_por y cancelado_at.
--  * cancelar_orden(p_order_id, p_motivo): el personal (admin, cajero, mesero, cocina) DEBE escribir el motivo
--    (mínimo 3 letras); la base lo exige, no solo la pantalla. El cliente del menú QR sigue cancelando sin escribir
--    nada y queda como "Cancelado por el cliente".
--  * Se borra la versión vieja cancelar_orden(uuid) para no dejar una sobrecarga ambigua (el parámetro nuevo
--    tiene valor por defecto, así que las llamadas con solo p_order_id siguen resolviendo a una única función).
--  * Las reglas de quién puede cancelar qué no cambian (es la misma lógica de 20260928195300).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelado_motivo text,
  ADD COLUMN IF NOT EXISTS cancelado_por    uuid,
  ADD COLUMN IF NOT EXISTS cancelado_at     timestamptz;

DROP FUNCTION IF EXISTS public.cancelar_orden(uuid);

CREATE OR REPLACE FUNCTION public.cancelar_orden(p_order_id uuid, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order  public.orders%ROWTYPE;
  v_role   text;
  v_motivo text := NULLIF(btrim(p_motivo), '');
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;

  SELECT public.get_user_role() INTO v_role;

  IF v_role IN ('admin','cashier','waiter') THEN
    -- Personal: solo pedidos de su restaurante, no completados/cancelados, y con motivo obligatorio.
    IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
      RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    IF v_order.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Este pedido ya no se puede cancelar';
    END IF;
    IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
      RAISE EXCEPTION 'Escribe por qué cancelas el pedido';
    END IF;
  ELSE
    -- Cocina, cliente con cuenta o anónimo: solo pedidos pendientes sin pagar (igual que antes).
    IF v_order.status <> 'pending' OR v_order.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'Tu pedido ya fue pagado o está en preparación. Pide el cambio en caja.';
    END IF;
    IF v_role = 'kitchen' THEN
      IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
        RAISE EXCEPTION 'Escribe por qué cancelas el pedido';
      END IF;
    ELSE
      v_motivo := 'Cancelado por el cliente';
    END IF;
  END IF;

  UPDATE public.orders
     SET status = 'cancelled', updated_at = NOW(),
         cancelado_motivo = left(v_motivo, 300), cancelado_por = auth.uid(), cancelado_at = NOW()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancelar_orden(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
