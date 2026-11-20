-- Menús por franjas horarias — 3/3: el cálculo de precio del servidor aprende de los menús por horario.
-- DELICADA: toca el camino del dinero. Con restaurant_config.menus_horario_activo = false (por defecto) el resultado
-- de _precio_plato es IDÉNTICO al anterior (misma firma, mismo JSON, sin llaves nuevas).
--
-- Método: en vez de copiar funciones largas, se parchean las definiciones VIVAS con reemplazos exactos de un solo punto.
-- Si el texto esperado no existe (producción distinta a prueba), la migración se detiene SIN cambiar nada (es transaccional).
-- Es idempotente: si el cambio ya está, no hace nada.
-- Reversa: supabase/rollback/20261117132000_menus_horario_precio_pedidos_down.sql

-- ─── Precio de una línea con el menú con que se pidió (para editar pedidos sin reprecificar) ───
CREATE OR REPLACE FUNCTION public._menu_precio_linea(p_menu_id uuid, p_dish_id uuid, p_size text)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_size IS NOT NULL THEN NULLIF(mp.precios_tamano->>p_size, '')::numeric ELSE mp.precio_especial END
    FROM menu_horario_productos mp WHERE mp.menu_id = p_menu_id AND mp.dish_id = p_dish_id;
$$;
REVOKE ALL ON FUNCTION public._menu_precio_linea(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── _precio_plato: MISMA firma. Valida horario y aplica precio de menú (plato sin tamaños o por tamaño) ───
CREATE OR REPLACE FUNCTION public._precio_plato(p_dish public.dishes, p_size text, p_toppings jsonb, p_sel jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_size text := NULLIF(p_size, ''); v_obj jsonb; v_unit numeric; v_top jsonb := COALESCE(p_toppings, '[]'::jsonb);
  v_tot numeric := 0; v_ok jsonb := '[]'::jsonb;
  v_mp jsonb; v_menu_precio numeric; v_at timestamptz;
BEGIN
  -- Momento del pedido: normalmente ahora; mesa_pedido_aceptar lo fija a la hora en que el cliente pidió por QR.
  v_at := COALESCE(NULLIF(current_setting('app.menu_momento', true), '')::timestamptz, now());
  v_mp := public._menu_plato(p_dish, v_at);
  IF NOT COALESCE((v_mp->>'permitido')::boolean, true) THEN
    RAISE EXCEPTION '"%" no está disponible en este horario', p_dish.name;
  END IF;

  IF p_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(p_dish.sizes) = 'array' THEN
    SELECT s INTO v_obj FROM jsonb_array_elements(p_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
    IF v_obj IS NULL THEN RETURN jsonb_build_object('tamano_invalido', true); END IF;
    v_unit := (v_obj->>'precio')::numeric;
    v_menu_precio := NULLIF(v_mp->'precios_tamano'->>v_size, '')::numeric;
  ELSE
    v_unit := p_dish.price;
    v_size := NULL;
    v_menu_precio := NULLIF(v_mp->>'precio_especial', '')::numeric;
  END IF;
  v_unit := COALESCE(v_menu_precio, v_unit);   -- sin precio de menú → precio general

  IF jsonb_typeof(p_dish.toppings) = 'array' AND jsonb_typeof(v_top) = 'array' THEN
    SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
      INTO v_tot, v_ok
    FROM jsonb_array_elements(p_dish.toppings) t
    WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_top));
  END IF;
  v_unit := v_unit + v_tot + public._opciones_v2(p_dish.id, p_dish.restaurant_id, p_sel);
  RETURN jsonb_build_object('unit', v_unit, 'size', v_size, 'toppings', v_ok)
    || CASE WHEN v_mp->>'menu_nombre' IS NOT NULL
         THEN jsonb_build_object('menu_nombre', v_mp->>'menu_nombre', 'menu_id', v_mp->>'menu_id', 'menu_precio', v_menu_precio IS NOT NULL)
         ELSE '{}'::jsonb END;
END;
$$;

-- ─── Parches de un solo punto sobre las funciones vivas ──────────────────────
CREATE FUNCTION pg_temp._parchear(p_f regprocedure, p_viejo text, p_nuevo text) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_def text := pg_get_functiondef(p_f); v_n integer;
BEGIN
  IF position(p_nuevo IN v_def) > 0 THEN RETURN; END IF;   -- ya aplicado
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  IF v_n <> 1 THEN RAISE EXCEPTION 'Parche no aplicable en %: el texto esperado aparece % veces (debe ser 1)', p_f, v_n; END IF;
  EXECUTE replace(v_def, p_viejo, p_nuevo);
END $p$;

DO $mig$
DECLARE
  v_menu text := ' || CASE WHEN v_pp->>''menu_nombre'' IS NOT NULL THEN jsonb_build_object(''menu'', v_pp->>''menu_nombre'', ''menu_id'', v_pp->>''menu_id'') ELSE ''{}''::jsonb END';
  v_canal text := E'\nBEGIN\n  PERFORM set_config(''app.menu_canal'', ''qr'', true);\n';
BEGIN
  -- Mesero / caja: cada línea guarda el nombre y el id del menú con que se cobró
  PERFORM pg_temp._parchear('public.crear_orden_completa(uuid,jsonb,text,text,integer,text)'::regprocedure,
    $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);$$,
    $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END$$ || v_menu || ');');

  -- QR sin mesa
  PERFORM pg_temp._parchear('public.create_public_order(uuid,integer,text,text,jsonb)'::regprocedure, E'\nBEGIN\n', v_canal);
  PERFORM pg_temp._parchear('public.create_public_order(uuid,integer,text,text,jsonb)'::regprocedure,
    E'    v_sel := NULL;\n\n    IF v_kind = ''dish'' THEN', E'    v_sel := NULL;\n    v_pp := NULL;\n\n    IF v_kind = ''dish'' THEN');
  PERFORM pg_temp._parchear('public.create_public_order(uuid,integer,text,text,jsonb)'::regprocedure,
    E'''sel'', v_sel\n    );', E'''sel'', v_sel\n    )' || v_menu || ';');

  -- QR con mesa: se valida horario con canal público (solo menús marcados "mostrar en QR")
  PERFORM pg_temp._parchear('public.mesa_pedir_publico(uuid,integer,uuid,text,jsonb,text)'::regprocedure, E'\nBEGIN\n', v_canal);

  -- Aceptar el pedido QR: se cobra con el menú y precio del momento en que el cliente pidió, no del momento de aceptar
  PERFORM pg_temp._parchear('public.mesa_pedido_aceptar(uuid)'::regprocedure,
    $$v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);$$,
    $$PERFORM set_config('app.menu_momento', r.created_at::text, true);
  v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);
  PERFORM set_config('app.menu_momento', '', true);$$);

  -- WhatsApp: el cotizador ya usa _precio_plato (horario y precio); solo se agrega canal y nombre del menú
  PERFORM pg_temp._parchear('public.wa_bot_cotizar(uuid,jsonb)'::regprocedure, E'\nBEGIN\n', v_canal);
  PERFORM pg_temp._parchear('public.wa_bot_cotizar(uuid,jsonb)'::regprocedure,
    $$length((it->'sel')::text) <= 4000 THEN it->'sel' END);$$, $$length((it->'sel')::text) <= 4000 THEN it->'sel' END)$$ || v_menu || ';');

  -- Editar pedido: las líneas conservan su menú y su precio de menú (no se reprecian con el precio de otra franja)
  PERFORM pg_temp._parchear('public.editar_items_pedido(uuid,jsonb)'::regprocedure,
    $$      v_top_sel := COALESCE(v_elem->'toppings', '[]'::jsonb);$$,
    $$      v_unit := COALESCE(public._menu_precio_linea(NULLIF(v_orig->>'menu_id', '')::uuid, v_dish.id, v_size), v_unit);
      v_top_sel := COALESCE(v_elem->'toppings', '[]'::jsonb);$$);
  PERFORM pg_temp._parchear('public.editar_items_pedido(uuid,jsonb)'::regprocedure,
    $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);$$,
    $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END
        || CASE WHEN v_orig ? 'menu' THEN jsonb_build_object('menu', v_orig->'menu', 'menu_id', v_orig->'menu_id') ELSE '{}'::jsonb END);$$);
END $mig$;
