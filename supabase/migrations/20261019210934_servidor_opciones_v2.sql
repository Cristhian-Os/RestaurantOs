-- Bloque 4 (Anexo B), paso 3: el servidor calcula y valida el precio de las opciones v2 y descuenta inventario por ítem.
-- Los platos con opciones heredadas (tipo helado/jugo/opcion) NO cambian: _opciones_v2 solo mira grupos con "v": 2.
-- Las funciones de pedido se parchean con reemplazos de una línea (falla en voz alta si la línea no se encuentra).

ALTER TABLE public.detalles_pedidos ADD COLUMN IF NOT EXISTS opciones_consumo jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ítems de una lista del restaurante; si no existe como option_lists, cae a la config heredada (sabores de helado/jugo).
CREATE OR REPLACE FUNCTION public._lista_items(p_rid uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; m jsonb; k_on text; k_off text;
BEGIN
  SELECT items INTO v FROM public.option_lists WHERE restaurant_id = p_rid AND key = p_key;
  IF FOUND THEN RETURN v; END IF;
  IF p_key IN ('sabores_helado', 'sabores_jugo') THEN
    SELECT modules_enabled INTO m FROM public.restaurant_config WHERE restaurant_id = p_rid;
    k_on  := CASE WHEN p_key = 'sabores_helado' THEN 'helado_flavors' ELSE 'jugo_flavors' END;
    k_off := k_on || '_off';
    RETURN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', f, 'activo', NOT (COALESCE(m->k_off, '[]'::jsonb) ? f)))
      FROM jsonb_array_elements_text(COALESCE(m->k_on, '[]'::jsonb)) f), '[]'::jsonb);
  END IF;
  RETURN '[]'::jsonb;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._lista_items(uuid, text) FROM PUBLIC, anon, authenticated;

-- Valida la selección v2 del plato contra sus grupos y devuelve la suma de precio_extra.
-- p_exigir_activo = false al EDITAR un pedido: no se rechaza un ítem que se agotó después de pedirlo.
CREATE OR REPLACE FUNCTION public._opciones_v2(p_dish_id uuid, p_rid uuid, p_sel jsonb, p_exigir_activo boolean DEFAULT true)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opts jsonb; v_name text; g jsonb; v_items jsonb; v_sel jsonb;
  ch text[]; label text; it jsonb; sl text; sit jsonb; sub_ch text[];
  extra numeric := 0; n int; mn int; mx int; sn int; sm int; v_gid text;
BEGIN
  SELECT options, name INTO v_opts, v_name FROM public.dishes WHERE id = p_dish_id AND restaurant_id = p_rid;
  IF v_opts IS NULL OR jsonb_typeof(v_opts) <> 'array' THEN RETURN 0; END IF;
  v_sel := CASE WHEN jsonb_typeof(p_sel->'grupos') = 'object' THEN p_sel->'grupos' ELSE '{}'::jsonb END;

  FOR g IN SELECT * FROM jsonb_array_elements(v_opts) LOOP
    IF COALESCE(g->>'v', '') <> '2' THEN CONTINUE; END IF;
    v_gid := g->>'id';
    v_items := CASE WHEN g->'fuente' ? 'lista' THEN public._lista_items(p_rid, g->'fuente'->>'lista')
                    ELSE COALESCE(g->'fuente'->'items', '[]'::jsonb) END;
    SELECT COALESCE(array_agg(x), '{}') INTO ch
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_sel->v_gid) = 'array' THEN v_sel->v_gid ELSE '[]'::jsonb END) x;
    n := cardinality(ch);
    mn := CASE WHEN COALESCE((g->>'requerido')::boolean, false) THEN greatest(1, COALESCE((g->>'min')::int, 1)) ELSE COALESCE((g->>'min')::int, 0) END;
    mx := CASE WHEN COALESCE(g->>'max', '') ~ '^[0-9]+$' THEN (g->>'max')::int ELSE 1 END;
    IF n < mn OR n > mx THEN
      RAISE EXCEPTION 'En "%" de % elige entre % y % opciones', g->>'nombre', v_name, mn, mx;
    END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(ch) x) <> n THEN
      RAISE EXCEPTION 'Opción repetida en "%" de %', g->>'nombre', v_name;
    END IF;

    FOREACH label IN ARRAY ch LOOP
      SELECT i INTO it FROM jsonb_array_elements(v_items) i WHERE i->>'label' = label LIMIT 1;
      IF it IS NULL THEN RAISE EXCEPTION '"%" no existe en "%" de %', label, g->>'nombre', v_name; END IF;
      IF p_exigir_activo AND COALESCE((it->>'activo')::boolean, true) = false THEN
        RAISE EXCEPTION '"%" ya no está disponible', label;
      END IF;
      extra := extra + COALESCE((it->>'precio_extra')::numeric, 0);

      IF it ? 'sub' THEN
        SELECT COALESCE(array_agg(x), '{}') INTO sub_ch
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_sel->(v_gid || '>' || label)) = 'array' THEN v_sel->(v_gid || '>' || label) ELSE '[]'::jsonb END) x;
        sn := cardinality(sub_ch);
        sm := COALESCE((it->'sub'->>'cantidad')::int, 1);
        IF sn < 1 OR sn > sm THEN
          RAISE EXCEPTION 'Con "%" elige entre 1 y % opciones', label, sm;
        END IF;
        FOREACH sl IN ARRAY sub_ch LOOP
          SELECT i INTO sit FROM public._lista_items(p_rid, it->'sub'->>'lista') AS l(items), jsonb_array_elements(l.items) i WHERE i->>'label' = sl LIMIT 1;
          IF sit IS NULL THEN RAISE EXCEPTION '"%" no existe', sl; END IF;
          IF p_exigir_activo AND COALESCE((sit->>'activo')::boolean, true) = false THEN
            RAISE EXCEPTION '"%" ya no está disponible', sl;
          END IF;
          extra := extra + COALESCE((sit->>'precio_extra')::numeric, 0);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  RETURN extra;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._opciones_v2(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- Consumo de inventario de los ítems elegidos (sin validar): [{ingrediente_id, cantidad}] por unidad del plato.
CREATE OR REPLACE FUNCTION public._consumo_opciones(p_dish_id uuid, p_rid uuid, p_sel jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opts jsonb; g jsonb; v_items jsonb; v_sel jsonb; label text; it jsonb; sl text; sit jsonb;
  v_map jsonb := '{}'::jsonb; v_gid text; v_ing text; v_q numeric;
BEGIN
  SELECT options INTO v_opts FROM public.dishes WHERE id = p_dish_id AND restaurant_id = p_rid;
  IF v_opts IS NULL OR jsonb_typeof(v_opts) <> 'array' THEN RETURN '[]'::jsonb; END IF;
  v_sel := CASE WHEN jsonb_typeof(p_sel->'grupos') = 'object' THEN p_sel->'grupos' ELSE '{}'::jsonb END;

  FOR g IN SELECT * FROM jsonb_array_elements(v_opts) LOOP
    IF COALESCE(g->>'v', '') <> '2' THEN CONTINUE; END IF;
    v_gid := g->>'id';
    v_items := CASE WHEN g->'fuente' ? 'lista' THEN public._lista_items(p_rid, g->'fuente'->>'lista')
                    ELSE COALESCE(g->'fuente'->'items', '[]'::jsonb) END;
    FOR label IN SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_sel->v_gid) = 'array' THEN v_sel->v_gid ELSE '[]'::jsonb END) LOOP
      SELECT i INTO it FROM jsonb_array_elements(v_items) i WHERE i->>'label' = label LIMIT 1;
      IF it IS NULL THEN CONTINUE; END IF;
      v_ing := it->>'ingrediente_id'; v_q := COALESCE((it->>'cantidad_consumo')::numeric, 0);
      IF v_ing IS NOT NULL AND v_q > 0 THEN
        v_map := jsonb_set(v_map, ARRAY[v_ing], to_jsonb(COALESCE((v_map->>v_ing)::numeric, 0) + v_q));
      END IF;
      IF it ? 'sub' THEN
        FOR sl IN SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_sel->(v_gid || '>' || label)) = 'array' THEN v_sel->(v_gid || '>' || label) ELSE '[]'::jsonb END) LOOP
          SELECT i INTO sit FROM public._lista_items(p_rid, it->'sub'->>'lista') AS l(items), jsonb_array_elements(l.items) i WHERE i->>'label' = sl LIMIT 1;
          IF sit IS NULL THEN CONTINUE; END IF;
          v_ing := sit->>'ingrediente_id'; v_q := COALESCE((sit->>'cantidad_consumo')::numeric, 0);
          IF v_ing IS NOT NULL AND v_q > 0 THEN
            v_map := jsonb_set(v_map, ARRAY[v_ing], to_jsonb(COALESCE((v_map->>v_ing)::numeric, 0) + v_q));
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('ingrediente_id', k, 'cantidad', v::numeric)) FROM jsonb_each_text(v_map) AS e(k, v)), '[]'::jsonb);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._consumo_opciones(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- El trigger de stock descuenta también lo de las opciones elegidas
CREATE OR REPLACE FUNCTION public.descontar_ingredientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ingredientes i
  SET stock_actual = GREATEST(stock_actual - (r.cantidad_necesaria * NEW.cantidad), 0)
  FROM public.recetas r
  WHERE r.producto_id = NEW.dish_id
    AND r.ingrediente_id = i.id;
  IF jsonb_typeof(NEW.opciones_consumo) = 'array' AND jsonb_array_length(NEW.opciones_consumo) > 0 THEN
    UPDATE public.ingredientes i
    SET stock_actual = GREATEST(i.stock_actual - (c.cantidad * NEW.cantidad), 0)
    FROM jsonb_to_recordset(NEW.opciones_consumo) AS c(ingrediente_id uuid, cantidad numeric)
    WHERE i.id = c.ingrediente_id AND i.restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END; $function$;

-- registrar_venta_stock (pedidos del menú público, al cobrarse): guarda el consumo de opciones de cada línea
CREATE OR REPLACE FUNCTION public.registrar_venta_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items       jsonb;
  v_restaurant  uuid;
  v_item        jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.detalles_pedidos WHERE order_id = p_order_id) THEN
    RETURN; -- ya se registró (evita descontar dos veces la misma orden)
  END IF;

  SELECT items, restaurant_id INTO v_items, v_restaurant FROM public.orders WHERE id = p_order_id;
  IF v_items IS NULL THEN RETURN; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, restaurant_id, opciones_consumo)
      VALUES (
        p_order_id,
        (v_item->>'id')::uuid,
        GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1),
        COALESCE((v_item->>'price')::numeric, 0),
        v_restaurant,
        public._consumo_opciones((v_item->>'id')::uuid, v_restaurant, v_item->'sel')
      );
    END IF;
  END LOOP;
END;
$function$;

-- Parche de una línea en las tres funciones de pedido
DO $$
DECLARE
  f record; def text; nuevo text; a text; b text;
  parches jsonb := jsonb_build_array(
    -- función, texto a buscar, texto nuevo
    jsonb_build_array('crear_orden_completa', E'v_unit := v_unit + v_toppings_total;',
      E'v_unit := v_unit + v_toppings_total;\n    v_unit := v_unit + public._opciones_v2(v_dish.id, v_rid, v_item->''sel'');'),
    jsonb_build_array('crear_orden_completa', E'INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id)',
      E'INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes, restaurant_id, opciones_consumo)'),
    jsonb_build_array('crear_orden_completa', E'(v_item->>''price'')::NUMERIC, v_item->>''notes'', v_rid);',
      E'(v_item->>''price'')::NUMERIC, v_item->>''notes'', v_rid,\n      public._consumo_opciones((v_item->>''id'')::UUID, v_rid, v_item->''sel''));'),
    jsonb_build_array('create_public_order', E'v_unit := v_unit + v_toppings_total;',
      E'v_unit := v_unit + v_toppings_total;\n      v_unit := v_unit + public._opciones_v2(v_dish.id, p_restaurant_id, CASE WHEN jsonb_typeof(v_item->''sel'') = ''object'' THEN v_item->''sel'' END);'),
    jsonb_build_array('editar_items_pedido', E'v_unit := v_unit + v_top_total;',
      E'v_unit := v_unit + v_top_total;\n      v_unit := v_unit + public._opciones_v2(v_dish.id, v_order.restaurant_id, v_elem->''sel'', false);')
  );
  p jsonb; n int;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(parches) LOOP
    SELECT count(*) INTO n FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace WHERE ns.nspname = 'public' AND pr.proname = p->>0;
    IF n <> 1 THEN RAISE EXCEPTION 'Se esperaba 1 función % y hay %', p->>0, n; END IF;
    SELECT pr.oid INTO f FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace WHERE ns.nspname = 'public' AND pr.proname = p->>0;
    def := pg_get_functiondef(f.oid);
    IF def LIKE '%' || (p->>2) || '%' THEN CONTINUE; END IF;  -- ya parchado
    IF position((p->>1) IN def) = 0 THEN RAISE EXCEPTION 'No encontré la línea a parchar en %: %', p->>0, p->>1; END IF;
    EXECUTE replace(def, p->>1, p->>2);
  END LOOP;
END $$;
