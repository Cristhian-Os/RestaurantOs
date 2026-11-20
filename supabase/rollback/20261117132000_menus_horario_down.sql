-- REVERSA de "Menús por horario" (migraciones 20261117120000 … 20261117133000).
--
-- PASO 1 (alcanza por sí solo): apagar el interruptor. Con él apagado el sistema ya se comporta como antes, al instante.
-- PASO 2 (opcional): devolver las funciones de pedidos a su texto anterior.
-- PASO 3 (opcional, NO recomendado si ya hay pedidos con 'menu' en sus líneas): quitar tablas y columnas nuevas.
--   Los pedidos guardados no dependen de esas tablas: conservan su precio y el nombre del menú en orders.items.

-- ─── PASO 1 ──────────────────────────────────────────────────────────────────
UPDATE public.restaurant_config SET menus_horario_activo = false WHERE menus_horario_activo;

-- ─── PASO 2 ──────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp._revertir(p_f regprocedure, p_nuevos text[], p_viejos text[]) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_def text := pg_get_functiondef(p_f); v_n integer; i integer;
BEGIN
  FOR i IN 1 .. array_length(p_nuevos, 1) LOOP
    v_n := (length(v_def) - length(replace(v_def, p_nuevos[i], ''))) / length(p_nuevos[i]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'Reversa no aplicable en %: el texto aparece % veces (debe ser 1)', p_f, v_n; END IF;
  END LOOP;
  FOR i IN 1 .. array_length(p_nuevos, 1) LOOP v_def := replace(v_def, p_nuevos[i], p_viejos[i]); END LOOP;
  EXECUTE v_def;
END $p$;

DO $mig$
DECLARE
  v_menu  text := ' || CASE WHEN v_pp->>''menu_nombre'' IS NOT NULL THEN jsonb_build_object(''menu'', v_pp->>''menu_nombre'', ''menu_id'', v_pp->>''menu_id'') ELSE ''{}''::jsonb END';
  v_canal text := E'\nBEGIN\n  PERFORM set_config(''app.menu_canal'', ''qr'', true);\n';
BEGIN
  PERFORM pg_temp._revertir('public.crear_orden_completa(uuid,jsonb,text,text,integer,text)'::regprocedure,
    ARRAY[$$ELSE '{}'::jsonb END$$ || v_menu || ');'],
    ARRAY[$$ELSE '{}'::jsonb END);$$]);

  PERFORM pg_temp._revertir('public.create_public_order(uuid,integer,text,text,jsonb)'::regprocedure,
    ARRAY[v_canal,
          E'    v_sel := NULL;\n    v_pp := NULL;\n\n    IF v_kind = ''dish'' THEN',
          'v_computed := v_computed || (jsonb_build_object(',
          E'''sel'', v_sel\n    )' || v_menu || ');'],
    ARRAY[E'\nBEGIN\n',
          E'    v_sel := NULL;\n\n    IF v_kind = ''dish'' THEN',
          'v_computed := v_computed || jsonb_build_object(',
          E'''sel'', v_sel\n    );']);

  PERFORM pg_temp._revertir('public.mesa_pedir_publico(uuid,integer,uuid,text,jsonb,text)'::regprocedure,
    ARRAY[v_canal], ARRAY[E'\nBEGIN\n']);

  PERFORM pg_temp._revertir('public.mesa_pedido_aceptar(uuid)'::regprocedure,
    ARRAY[$$PERFORM set_config('app.menu_momento', r.created_at::text, true);
  v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);
  PERFORM set_config('app.menu_momento', '', true);$$],
    ARRAY[$$v_res := public.crear_orden_completa(r.mesa_id, r.items, 'LOCAL', 'Pedido por QR', r.table_num, r.nombre);$$]);

  PERFORM pg_temp._revertir('public.wa_bot_cotizar(uuid,jsonb)'::regprocedure,
    ARRAY[v_canal,
          'v_lineas := v_lineas || (jsonb_build_object(',
          $$length((it->'sel')::text) <= 4000 THEN it->'sel' END)$$ || v_menu || ');'],
    ARRAY[E'\nBEGIN\n',
          'v_lineas := v_lineas || jsonb_build_object(',
          $$length((it->'sel')::text) <= 4000 THEN it->'sel' END);$$]);

  PERFORM pg_temp._revertir('public.editar_items_pedido(uuid,jsonb)'::regprocedure,
    ARRAY[$$      v_unit := COALESCE(public._menu_precio_linea(NULLIF(v_orig->>'menu_id', '')::uuid, v_dish.id, v_size), v_unit);
$$,
          $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END
        || CASE WHEN v_orig ? 'menu' THEN jsonb_build_object('menu', v_orig->'menu', 'menu_id', v_orig->'menu_id') ELSE '{}'::jsonb END);$$],
    ARRAY['',
          $$jsonb_build_object('comensal', v_comensal) ELSE '{}'::jsonb END);$$]);
END $mig$;

-- _precio_plato vuelve a su texto anterior (misma firma)
CREATE OR REPLACE FUNCTION public._precio_plato(p_dish public.dishes, p_size text, p_toppings jsonb, p_sel jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_size text := NULLIF(p_size, ''); v_obj jsonb; v_unit numeric; v_top jsonb := COALESCE(p_toppings, '[]'::jsonb); v_tot numeric := 0; v_ok jsonb := '[]'::jsonb;
BEGIN
  IF p_dish.has_sizes AND v_size IS NOT NULL AND jsonb_typeof(p_dish.sizes) = 'array' THEN
    SELECT s INTO v_obj FROM jsonb_array_elements(p_dish.sizes) s WHERE s->>'nombre' = v_size LIMIT 1;
    IF v_obj IS NULL THEN RETURN jsonb_build_object('tamano_invalido', true); END IF;
    v_unit := (v_obj->>'precio')::numeric;
  ELSE
    v_unit := p_dish.price;
    v_size := NULL;
  END IF;
  IF jsonb_typeof(p_dish.toppings) = 'array' AND jsonb_typeof(v_top) = 'array' THEN
    SELECT COALESCE(SUM((t->>'precio')::numeric), 0), COALESCE(jsonb_agg(t->'nombre'), '[]'::jsonb)
      INTO v_tot, v_ok
    FROM jsonb_array_elements(p_dish.toppings) t
    WHERE t->>'nombre' IN (SELECT jsonb_array_elements_text(v_top));
  END IF;
  v_unit := v_unit + v_tot + public._opciones_v2(p_dish.id, p_dish.restaurant_id, p_sel);
  RETURN jsonb_build_object('unit', v_unit, 'size', v_size, 'toppings', v_ok);
END;
$$;

-- ─── PASO 3 (opcional) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public._menu_precio_linea(uuid, uuid, text), public._menu_plato(public.dishes, timestamptz),
--   public._menus_vigentes(uuid, timestamptz), public.menu_horario_estado(uuid, text), public.menu_horario_guardar(jsonb),
--   public.menu_horario_duplicar(uuid), public.menu_horario_excepcion(text, uuid, timestamptz, text),
--   public.menu_horario_volver_automatico(), public.menu_horario_interruptor(boolean, boolean),
--   public.menu_horario_copiar_a_sede(uuid, uuid), public._zona_horaria_valida(text);
-- DROP TABLE IF EXISTS public.menu_horario_auditoria, public.menu_horario_excepciones, public.menu_horario_productos,
--   public.menu_horario_franjas, public.menu_horario_dias_especiales, public.menus_horario CASCADE;
-- DROP TRIGGER IF EXISTS restaurant_config_zona ON public.restaurant_config;
-- DROP TRIGGER IF EXISTS restaurant_config_menus_audit ON public.restaurant_config;
-- DROP TRIGGER IF EXISTS dishes_todo_el_dia_audit ON public.dishes;
-- DROP FUNCTION IF EXISTS public._restaurant_config_zona_trg(), public._menu_horario_auditar_trg(), public._menu_horario_coherencia_trg();
-- ALTER TABLE public.restaurant_config DROP COLUMN IF EXISTS menus_horario_activo, DROP COLUMN IF EXISTS zona_horaria,
--   DROP COLUMN IF EXISTS menus_gracia_min, DROP COLUMN IF EXISTS menus_staff_fuera_horario;
-- ALTER TABLE public.dishes DROP COLUMN IF EXISTS todo_el_dia;
