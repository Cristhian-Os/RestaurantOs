-- Domicilios tomados desde caja / mesero: teléfono y dirección de entrega.
--
-- Se guardan como columnas propias de orders (no dentro de notes) para que
-- caja los vea y, más adelante, se pueda armar la lista de clientes para
-- promociones.
--
-- Diseño 100 % aditivo: crear_orden_completa NO se toca. Es el camino de todos
-- los pedidos internos y ya dio un problema de overloads (ver
-- 20260927215945_drop_crear_orden_completa_5arg_overload). La función nueva
-- crear_orden_domicilio la llama tal cual y completa los datos de entrega en la
-- misma transacción, así que el pedido nunca queda creado sin ellos.
--
-- Revertir: DROP FUNCTION public.crear_orden_domicilio(jsonb, text, text, text, text);
--           y quitar las dos columnas. Los pedidos normales no se afectan.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone   text
    CHECK (customer_phone IS NULL OR char_length(customer_phone) BETWEEN 7 AND 15),
  ADD COLUMN IF NOT EXISTS delivery_address text
    CHECK (delivery_address IS NULL OR char_length(delivery_address) BETWEEN 5 AND 300);

COMMENT ON COLUMN public.orders.customer_phone   IS 'Teléfono del cliente (solo dígitos). Solo pedidos DOMICILIO.';
COMMENT ON COLUMN public.orders.delivery_address IS 'Dirección de entrega. Solo pedidos DOMICILIO.';

CREATE OR REPLACE FUNCTION public.crear_orden_domicilio(
  p_items            jsonb,
  p_customer_name    text,
  p_customer_phone   text,
  p_delivery_address text,
  p_notes            text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name  text := NULLIF(left(trim(coalesce(p_customer_name, '')), 120), '');
  v_phone text := NULLIF(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '');
  v_addr  text := NULLIF(left(trim(coalesce(p_delivery_address, '')), 300), '');
  v_notes text := NULLIF(left(trim(coalesce(p_notes, '')), 500), '');
  v_res   json;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Escribe el nombre del cliente';
  END IF;
  IF v_phone IS NULL OR char_length(v_phone) NOT BETWEEN 7 AND 15 THEN
    RAISE EXCEPTION 'El teléfono debe tener entre 7 y 15 dígitos';
  END IF;
  IF v_addr IS NULL OR char_length(v_addr) < 5 THEN
    RAISE EXCEPTION 'Escribe la dirección de entrega';
  END IF;

  -- crear_orden_completa valida el rol (admin / waiter / cashier) y el
  -- restaurante, recalcula los precios en el servidor y reserva el stock.
  v_res := public.crear_orden_completa(NULL, p_items, 'DOMICILIO', v_notes, NULL, v_name);

  UPDATE public.orders
     SET customer_phone   = v_phone,
         delivery_address = v_addr
   WHERE id = (v_res->>'order_id')::uuid;

  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_orden_domicilio(jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_orden_domicilio(jsonb, text, text, text, text) TO authenticated;
