-- Número secuencial de pedido por restaurante y por día (hora de Colombia).
-- Se asigna con un trigger BEFORE INSERT, así cubre TODOS los caminos de
-- creación (crear_orden_completa, menú QR, sincronización offline) sin tocar
-- esas funciones (evita el problema de overloads duplicados).
-- Los pedidos anteriores quedan en NULL: la interfaz cae al id corto.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number_today integer;

CREATE OR REPLACE FUNCTION public.set_order_number_today()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Bogota')::date;
BEGIN
  -- Serializa por restaurante+día para que dos pedidos simultáneos no repitan número.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.restaurant_id::text || v_day::text));
  SELECT COALESCE(MAX(order_number_today), 0) + 1 INTO NEW.order_number_today
    FROM public.orders
   WHERE restaurant_id = NEW.restaurant_id
     AND (created_at AT TIME ZONE 'America/Bogota')::date = v_day;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_set_number_today ON public.orders;
CREATE TRIGGER orders_set_number_today
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number_today();
