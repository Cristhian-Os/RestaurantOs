-- Multi-sede fase 2, paso A: copiar la carta completa de otra sede de la misma cuenta a la sede activa.
-- Copia: platos (categoría, orden, tamaños, opciones, toppings, foto), listas de opciones, categorías y sabores
-- de la configuración del menú, proveedores, ingredientes (stock en 0) y recetas, con todas sus conexiones
-- reapuntadas a las filas nuevas. Lo copiado queda independiente: cada sede lo edita o borra sin tocar la otra.
-- No copia: stock, agotados del día, pedidos, ventas, caja, menús por horario (tienen su propia copia).
-- Reglas: solo el dueño de la cuenta, solo entre sedes de su cuenta, solo hacia una sede sin platos ni
-- ingredientes (evita duplicados). Todo o nada.
-- Las fotos se duplican después desde la app (Storage), para que cambiar la foto en una sede no cambie la otra;
-- por eso la función devuelve la lista de fotos a duplicar.
-- Reversa: supabase/rollback/20261120140000_copiar_carta_de_sede_down.sql

CREATE OR REPLACE FUNCTION public.copiar_carta_de_sede(p_origen uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_dest uuid := public.current_restaurant_id();
  v_cuenta uuid;
  v_mods jsonb;
  n_platos int; n_ingr int; n_rec int; n_prov int; n_listas int;
  v_fotos jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede copiar la carta'; END IF;
  IF p_origen IS NULL OR v_dest IS NULL THEN RAISE EXCEPTION 'Sede no encontrada'; END IF;
  IF p_origen = v_dest THEN RAISE EXCEPTION 'Elige una sede distinta a la actual'; END IF;

  -- La sede activa se bloquea: evita dos copias a la vez.
  SELECT cuenta_id INTO v_cuenta FROM restaurants WHERE id = v_dest FOR UPDATE;
  IF v_cuenta IS NULL
     OR NOT EXISTS (SELECT 1 FROM cuentas WHERE id = v_cuenta AND owner_id = v_uid)
     OR NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_origen AND cuenta_id = v_cuenta) THEN
    RAISE EXCEPTION 'Solo el dueño de la cuenta puede copiar entre sus sedes';
  END IF;

  IF EXISTS (SELECT 1 FROM dishes WHERE restaurant_id = v_dest)
     OR EXISTS (SELECT 1 FROM ingredientes WHERE restaurant_id = v_dest) THEN
    RAISE EXCEPTION 'Esta sede ya tiene carta o inventario. Solo se copia a una sede vacía';
  END IF;

  DROP TABLE IF EXISTS pg_temp._cc_prov, pg_temp._cc_ingr, pg_temp._cc_dish;
  CREATE TEMP TABLE _cc_prov (viejo uuid PRIMARY KEY, nuevo uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _cc_ingr (viejo uuid PRIMARY KEY, nuevo uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
  CREATE TEMP TABLE _cc_dish (viejo uuid PRIMARY KEY, nuevo uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;

  -- Proveedores: si la sede ya tiene uno con el mismo nombre, se reutiliza.
  INSERT INTO pg_temp._cc_prov (viejo, nuevo)
  SELECT p.id, coalesce(
           (SELECT d.id FROM proveedores d WHERE d.restaurant_id = v_dest AND lower(btrim(d.nombre)) = lower(btrim(p.nombre))
            ORDER BY d.created_at LIMIT 1),
           gen_random_uuid())
  FROM proveedores p WHERE p.restaurant_id = p_origen;
  INSERT INTO proveedores (id, restaurant_id, nombre, telefono, producto, email, notas)
  SELECT m.nuevo, v_dest, p.nombre, p.telefono, p.producto, p.email, p.notas
  FROM proveedores p JOIN pg_temp._cc_prov m ON m.viejo = p.id
  WHERE NOT EXISTS (SELECT 1 FROM proveedores d WHERE d.id = m.nuevo);
  GET DIAGNOSTICS n_prov = ROW_COUNT;

  -- Ingredientes con stock en 0; el sustituto se conecta en un segundo paso.
  INSERT INTO pg_temp._cc_ingr (viejo) SELECT id FROM ingredientes WHERE restaurant_id = p_origen;
  INSERT INTO ingredientes (id, restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario,
                            cantidad_necesaria_manual, proveedor_id)
  SELECT m.nuevo, v_dest, i.nombre, i.unidad_medida, 0, i.stock_minimo, i.costo_unitario,
         i.cantidad_necesaria_manual, mp.nuevo
  FROM ingredientes i JOIN pg_temp._cc_ingr m ON m.viejo = i.id
  LEFT JOIN pg_temp._cc_prov mp ON mp.viejo = i.proveedor_id;
  GET DIAGNOSTICS n_ingr = ROW_COUNT;
  UPDATE ingredientes n SET sustituto_id = ms.nuevo
  FROM ingredientes i JOIN pg_temp._cc_ingr m ON m.viejo = i.id JOIN pg_temp._cc_ingr ms ON ms.viejo = i.sustituto_id
  WHERE n.id = m.nuevo;

  -- Platos. "Agotado" es del día de cada sede: la copia sale disponible. Lo oculto o descontinuado se respeta.
  INSERT INTO pg_temp._cc_dish (viejo) SELECT id FROM dishes WHERE restaurant_id = p_origen;
  INSERT INTO dishes (id, restaurant_id, name, description, price, category, image_url, available, availability_status,
                      tags, sort_order, has_sizes, sizes, options, toppings, todo_el_dia)
  SELECT m.nuevo, v_dest, d.name, d.description, d.price, d.category, d.image_url, d.available,
         CASE WHEN d.availability_status = 'out_of_stock' THEN 'available' ELSE d.availability_status END,
         d.tags, d.sort_order, d.has_sizes, d.sizes, d.options, d.toppings, d.todo_el_dia
  FROM dishes d JOIN pg_temp._cc_dish m ON m.viejo = d.id;
  GET DIAGNOSTICS n_platos = ROW_COUNT;

  -- Recetas, reapuntadas a los platos e ingredientes nuevos (las líneas manuales sin ingrediente se conservan).
  INSERT INTO recetas (restaurant_id, producto_id, ingrediente_id, cantidad_necesaria, nombre, costo_unitario, unidad)
  SELECT v_dest, md.nuevo, mi.nuevo, r.cantidad_necesaria, r.nombre, r.costo_unitario, r.unidad
  FROM recetas r JOIN pg_temp._cc_dish md ON md.viejo = r.producto_id
  LEFT JOIN pg_temp._cc_ingr mi ON mi.viejo = r.ingrediente_id
  WHERE r.ingrediente_id IS NULL OR mi.nuevo IS NOT NULL;
  GET DIAGNOSTICS n_rec = ROW_COUNT;

  -- Listas de opciones (sabores, salsas...). Si la sede ya tiene una con la misma clave, se deja la suya.
  INSERT INTO option_lists (restaurant_id, key, nombre, items, sort_order)
  SELECT v_dest, o.key, o.nombre, o.items, o.sort_order FROM option_lists o WHERE o.restaurant_id = p_origen
  ON CONFLICT (restaurant_id, key) DO NOTHING;
  GET DIAGNOSTICS n_listas = ROW_COUNT;

  -- Configuración del menú: orden y colores de categorías, sabores y el modo de opciones. Los agotados del día no.
  SELECT coalesce(modules_enabled, '{}'::jsonb) INTO v_mods FROM restaurant_config WHERE restaurant_id = p_origen;
  v_mods := jsonb_strip_nulls(jsonb_build_object(
    'categories', v_mods->'categories', 'helado_flavors', v_mods->'helado_flavors',
    'jugo_flavors', v_mods->'jugo_flavors', 'options_v2', v_mods->'options_v2'));
  INSERT INTO restaurant_config (restaurant_id, display_name, modules_enabled)
  SELECT v_dest, r.name, v_mods FROM restaurants r WHERE r.id = v_dest
  ON CONFLICT (restaurant_id) DO UPDATE
    SET modules_enabled = coalesce(restaurant_config.modules_enabled, '{}'::jsonb) || EXCLUDED.modules_enabled;

  -- Fotos guardadas en el almacenamiento propio, para duplicarlas desde la app.
  SELECT coalesce(jsonb_agg(jsonb_build_object('plato', m.nuevo,
           'origen', substring(d.image_url FROM '/restaurant-assets/([^?]+)'))), '[]'::jsonb)
  INTO v_fotos
  FROM dishes d JOIN pg_temp._cc_dish m ON m.viejo = d.id
  WHERE d.image_url ~ '/storage/v1/object/public/restaurant-assets/';

  INSERT INTO platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (v_uid, 'copiar_carta_de_sede', v_dest, jsonb_build_object('origen', p_origen, 'platos', n_platos,
          'ingredientes', n_ingr, 'recetas', n_rec, 'proveedores', n_prov, 'listas', n_listas));

  RETURN jsonb_build_object('platos', n_platos, 'ingredientes', n_ingr, 'recetas', n_rec,
                            'proveedores', n_prov, 'listas', n_listas, 'fotos', v_fotos);
END;
$function$;

REVOKE ALL ON FUNCTION public.copiar_carta_de_sede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copiar_carta_de_sede(uuid) TO authenticated;
