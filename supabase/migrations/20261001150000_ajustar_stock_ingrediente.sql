-- Permite a admin y cajero dejar el inventario de un ingrediente en una cantidad exacta
-- (usado por los comandos de voz). Hoy solo el admin puede modificar `ingredientes` por RLS;
-- el cajero solo podía registrar compras. Misma forma que set_plato_disponible: SECURITY DEFINER,
-- valida rol y restaurante, y solo toca el stock.

CREATE OR REPLACE FUNCTION public.ajustar_stock_ingrediente(p_ingrediente_id uuid, p_stock numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden ajustar el inventario';
  END IF;
  IF p_stock IS NULL OR p_stock < 0 THEN
    RAISE EXCEPTION 'La cantidad no puede ser negativa';
  END IF;
  UPDATE public.ingredientes
  SET stock_actual = p_stock,
      updated_at = now()
  WHERE id = p_ingrediente_id
    AND restaurant_id = public.current_restaurant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente no encontrado'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.ajustar_stock_ingrediente(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_stock_ingrediente(uuid, numeric) TO authenticated;
