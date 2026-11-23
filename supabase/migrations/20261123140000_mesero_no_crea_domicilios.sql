-- El mesero no puede crear pedidos de tipo DOMICILIO (decisión del dueño). La pantalla ya no le muestra la opción;
-- este candado en la base lo impide también si usa una app abierta/vieja o llama a la función directamente.
-- Aplica a INSERT y a cambiar tipo_pedido en un pedido existente. Admin, cajero, el bot de WhatsApp y el menú QR no se afectan.
CREATE OR REPLACE FUNCTION public._orders_mesero_sin_domicilio()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tipo_pedido = 'DOMICILIO'
     AND (TG_OP = 'INSERT' OR OLD.tipo_pedido IS DISTINCT FROM NEW.tipo_pedido)
     AND public.get_user_role() = 'waiter' THEN
    RAISE EXCEPTION 'Los domicilios los crea el cajero o el administrador, no el mesero.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_mesero_sin_domicilio ON public.orders;
CREATE TRIGGER trg_orders_mesero_sin_domicilio
  BEFORE INSERT OR UPDATE OF tipo_pedido ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._orders_mesero_sin_domicilio();
