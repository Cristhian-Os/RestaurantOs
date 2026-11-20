-- Multi-sede fase 2, paso C: pasar ingredientes de una sede a otra de la misma cuenta, con historial.
-- Sale de la sede activa y entra a la sede destino. Reglas:
--  * Solo el dueño de la cuenta (cuentas.owner_id) y solo entre sedes de su cuenta.
--  * La cantidad debe ser mayor que 0 y no puede dejar el stock de la sede de origen en negativo.
--  * En la sede destino el ingrediente se busca por nombre (sin importar mayúsculas ni espacios) y unidad.
--    Si no existe, se crea con stock 0, mínimo 0 y el mismo costo; luego se le suma lo trasladado.
--  * Todo o nada: resta, suma y apunte en el historial ocurren en la misma transacción.
--  * El historial no se edita ni se borra desde la app; se escribe solo con la función.
-- Reversa: supabase/rollback/20261120160000_traslados_ingredientes_down.sql

CREATE TABLE IF NOT EXISTS public.traslados_ingredientes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id             uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  origen_id             uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  destino_id            uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  origen_nombre         text NOT NULL,
  destino_nombre        text NOT NULL,
  ingrediente_origen_id uuid,
  ingrediente_destino_id uuid,
  ingrediente_nombre    text NOT NULL,
  unidad_medida         text NOT NULL,
  cantidad              numeric NOT NULL CHECK (cantidad > 0),
  nota                  text,
  creado_por            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (origen_id <> destino_id)
);

CREATE INDEX IF NOT EXISTS traslados_ingredientes_origen_idx  ON public.traslados_ingredientes (origen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS traslados_ingredientes_destino_idx ON public.traslados_ingredientes (destino_id, created_at DESC);

ALTER TABLE public.traslados_ingredientes ENABLE ROW LEVEL SECURITY;

-- Ver: el administrador de la sede activa ve los traslados donde esa sede salió o entró.
DROP POLICY IF EXISTS traslados_ingredientes_select ON public.traslados_ingredientes;
CREATE POLICY traslados_ingredientes_select ON public.traslados_ingredientes
  FOR SELECT TO authenticated
  USING (public.is_admin() AND (origen_id = public.current_restaurant_id() OR destino_id = public.current_restaurant_id()));

REVOKE ALL ON public.traslados_ingredientes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.traslados_ingredientes TO authenticated;

CREATE OR REPLACE FUNCTION public.trasladar_ingrediente(
  p_destino uuid, p_ingrediente uuid, p_cantidad numeric, p_nota text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_origen  uuid := public.current_restaurant_id();
  v_cuenta  uuid;
  v_ing     ingredientes%ROWTYPE;
  v_dest_id uuid;
  v_n_orig  text; v_n_dest text;
  v_creado  boolean := false;
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede trasladar ingredientes'; END IF;
  IF p_destino IS NULL OR p_ingrediente IS NULL OR v_origen IS NULL THEN RAISE EXCEPTION 'Faltan datos del traslado'; END IF;
  IF p_destino = v_origen THEN RAISE EXCEPTION 'Elige una sede distinta a la actual'; END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que 0'; END IF;

  SELECT cuenta_id, name INTO v_cuenta, v_n_orig FROM restaurants WHERE id = v_origen;
  IF v_cuenta IS NULL
     OR NOT EXISTS (SELECT 1 FROM cuentas WHERE id = v_cuenta AND owner_id = v_uid)
     OR NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_destino AND cuenta_id = v_cuenta) THEN
    RAISE EXCEPTION 'Solo el dueño de la cuenta puede trasladar entre sus sedes';
  END IF;
  SELECT name INTO v_n_dest FROM restaurants WHERE id = p_destino;

  -- Ingrediente de la sede de origen, bloqueado para que dos traslados a la vez no gasten el mismo stock.
  SELECT * INTO v_ing FROM ingredientes WHERE id = p_ingrediente AND restaurant_id = v_origen FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente no encontrado en esta sede'; END IF;
  IF v_ing.stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'No hay suficiente stock: tienes % y quieres pasar %', v_ing.stock_actual, p_cantidad;
  END IF;

  -- Ingrediente de la sede destino: mismo nombre y misma unidad.
  SELECT id INTO v_dest_id FROM ingredientes
   WHERE restaurant_id = p_destino AND lower(btrim(nombre)) = lower(btrim(v_ing.nombre))
     AND lower(btrim(unidad_medida)) = lower(btrim(v_ing.unidad_medida))
   ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_dest_id IS NULL THEN
    INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario)
    VALUES (p_destino, v_ing.nombre, v_ing.unidad_medida, 0, 0, v_ing.costo_unitario)
    RETURNING id INTO v_dest_id;
    v_creado := true;
  END IF;

  UPDATE ingredientes SET stock_actual = stock_actual - p_cantidad, updated_at = now() WHERE id = v_ing.id;
  UPDATE ingredientes SET stock_actual = stock_actual + p_cantidad, updated_at = now() WHERE id = v_dest_id;

  INSERT INTO traslados_ingredientes (cuenta_id, origen_id, destino_id, origen_nombre, destino_nombre,
         ingrediente_origen_id, ingrediente_destino_id, ingrediente_nombre, unidad_medida, cantidad, nota, creado_por)
  VALUES (v_cuenta, v_origen, p_destino, v_n_orig, v_n_dest, v_ing.id, v_dest_id, v_ing.nombre, v_ing.unidad_medida,
          p_cantidad, v_nota, v_uid);

  INSERT INTO platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (v_uid, 'trasladar_ingrediente', v_origen, jsonb_build_object('destino', p_destino, 'ingrediente', v_ing.nombre,
          'unidad', v_ing.unidad_medida, 'cantidad', p_cantidad));

  RETURN jsonb_build_object('ingrediente', v_ing.nombre, 'unidad', v_ing.unidad_medida, 'cantidad', p_cantidad,
                            'destino', v_n_dest, 'creado_en_destino', v_creado,
                            'stock_origen', v_ing.stock_actual - p_cantidad);
END;
$function$;

REVOKE ALL ON FUNCTION public.trasladar_ingrediente(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasladar_ingrediente(uuid, uuid, numeric, text) TO authenticated;
