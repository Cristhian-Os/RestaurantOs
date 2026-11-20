-- Corrige la migración 3/3 en create_public_order y wa_bot_cotizar.
-- Error: `lista || objeto || CASE ... END` agrega el CASE como un ELEMENTO NUEVO de la lista de platos
-- (incluso un `{}` vacío para sedes sin menús). Debe ser `lista || (objeto || CASE ... END)`: el nombre del menú
-- va DENTRO de cada plato. Hallado en las pruebas de pedidos en restaurantos-prueba.
-- Los dos cambios (abrir y cerrar paréntesis) se aplican juntos en una sola operación por función.
-- Transaccional: si el texto esperado no está exactamente una vez, no cambia nada.
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
DECLARE
  v_cola_vieja text := $$'menu_id', v_pp->>'menu_id') ELSE '{}'::jsonb END;$$;
  v_cola_nueva text := $$'menu_id', v_pp->>'menu_id') ELSE '{}'::jsonb END);$$;
BEGIN
  PERFORM pg_temp._parchear('public.create_public_order(uuid,integer,text,text,jsonb)'::regprocedure,
    ARRAY['v_computed := v_computed || jsonb_build_object(', v_cola_vieja],
    ARRAY['v_computed := v_computed || (jsonb_build_object(', v_cola_nueva]);
  PERFORM pg_temp._parchear('public.wa_bot_cotizar(uuid,jsonb)'::regprocedure,
    ARRAY['v_lineas := v_lineas || jsonb_build_object(', v_cola_vieja],
    ARRAY['v_lineas := v_lineas || (jsonb_build_object(', v_cola_nueva]);
END $mig$;
