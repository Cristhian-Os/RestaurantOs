-- Menús por horario — carta del bot de WhatsApp.
-- Problema: wa_bot_contexto lista los platos con el precio GENERAL, pero el pedido se cobra con el precio del menú
-- vigente (wa_bot_cotizar → _precio_plato). El bot podría decirle $14.000 al cliente y el pedido salir a $12.000.
-- Solución: la carta del bot sale del mismo cálculo: solo platos del menú vigente (o "todo el día") y con precio de menú.
-- Con el interruptor apagado (_menu_plato devuelve permitido=true sin precio de menú) la carta queda IDÉNTICA a la anterior.
-- Parches de un solo punto sobre la función viva; si el texto esperado no está exactamente una vez, no cambia nada.
-- Reversa: ver supabase/rollback/20261117132000_menus_horario_down.sql (sección wa_bot_contexto).
CREATE FUNCTION pg_temp._parchear(p_f regprocedure, p_viejos text[], p_nuevos text[]) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_def text := pg_get_functiondef(p_f); v_n integer; i integer;
BEGIN
  IF (SELECT bool_and(position(n IN v_def) > 0) FROM unnest(p_nuevos) n) THEN RETURN; END IF;
  FOR i IN 1 .. array_length(p_viejos, 1) LOOP
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'Parche no aplicable en %: el texto esperado aparece % veces (debe ser 1)', p_f, v_n; END IF;
  END LOOP;
  FOR i IN 1 .. array_length(p_viejos, 1) LOOP v_def := replace(v_def, p_viejos[i], p_nuevos[i]); END LOOP;
  EXECUTE v_def;
END $p$;

DO $mig$
BEGIN
  PERFORM pg_temp._parchear('public.wa_bot_contexto(uuid,uuid,uuid)'::regprocedure,
    ARRAY[
      E'\nBEGIN\n',
      $$'precio', d.price,$$,
      $$'tamanos', CASE WHEN d.has_sizes AND jsonb_typeof(d.sizes) = 'array' THEN d.sizes ELSE '[]'::jsonb END,$$,
      $$    FROM dishes d WHERE d.restaurant_id = p_rid AND d.available AND d.availability_status <> 'discontinued' LIMIT 400) q;$$
    ],
    ARRAY[
      E'\nBEGIN\n  PERFORM set_config(''app.menu_canal'', ''qr'', true);\n',
      $$'precio', CASE WHEN d.has_sizes THEN d.price ELSE COALESCE((m.mp->>'precio_especial')::numeric, d.price) END,$$,
      $$'tamanos', CASE WHEN d.has_sizes AND jsonb_typeof(d.sizes) = 'array' THEN COALESCE((SELECT jsonb_agg(CASE WHEN NULLIF(m.mp->'precios_tamano'->>(sz->>'nombre'), '') IS NOT NULL THEN jsonb_set(sz, '{precio}', to_jsonb((m.mp->'precios_tamano'->>(sz->>'nombre'))::numeric)) ELSE sz END ORDER BY ord) FROM jsonb_array_elements(d.sizes) WITH ORDINALITY AS tz(sz, ord)), d.sizes) ELSE '[]'::jsonb END,$$,
      $$    FROM dishes d CROSS JOIN LATERAL (SELECT public._menu_plato(d, COALESCE(NULLIF(current_setting('app.menu_momento', true), '')::timestamptz, now())) AS mp) m WHERE d.restaurant_id = p_rid AND d.available AND d.availability_status <> 'discontinued' AND COALESCE((m.mp->>'permitido')::boolean, true) LIMIT 400) q;$$
    ]);
END $mig$;
