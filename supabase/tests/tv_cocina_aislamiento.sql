-- Prueba de la TV de cocina por restaurante (migracion 20261014182846). SOLO para un proyecto de PRUEBA.
-- Crea 2 restaurantes, 1 pedido en cada uno y comprueba como anonimo que cada clave ve solo lo suyo.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
-- ESPERADO: TV A ve 1 pedido (Cliente A), TV B ve 1 (Cliente B), claves malas rechazadas,
--   no se puede mover/cancelar pedidos de otro restaurante, no se puede saltar pasos ni completar,
--   anon no lee kitchen_tv_tokens ni orders y no puede pedir mi_clave_tv.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid(); ta text; tb text;
  oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid(); j jsonb; n int;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'TV Test A','tv-test-a','a.test'),(rb,'TV Test B','tv-test-b','b.test');
  SELECT token INTO ta FROM kitchen_tv_tokens WHERE restaurant_id=ra;
  SELECT token INTO tb FROM kitchen_tv_tokens WHERE restaurant_id=rb;
  r := concat(r, '1) restaurantes nuevos nacen con clave: ', (ta IS NOT NULL AND tb IS NOT NULL AND ta<>tb), ' (largo ', length(ta), ')', E'\n');
  INSERT INTO orders (id, restaurant_id, status, tipo_pedido, items, total, customer_name) VALUES
    (oa, ra, 'pending','LLEVAR','[{"name":"A1","quantity":1}]'::jsonb, 1000, 'Cliente A'),
    (ob, rb, 'pending','LLEVAR','[{"name":"B1","quantity":1}]'::jsonb, 2000, 'Cliente B');
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  j := tv_cocina_datos(ta);
  r := concat(r, '2) TV A ve ', jsonb_array_length(j->'orders'), ' pedido(s): ', (j->'orders'->0->>'customer_name'), ' (esperado 1, Cliente A)', E'\n');
  j := tv_cocina_datos(tb);
  r := concat(r, '3) TV B ve ', jsonb_array_length(j->'orders'), ' pedido(s): ', (j->'orders'->0->>'customer_name'), ' (esperado 1, Cliente B)', E'\n');
  BEGIN PERFORM tv_cocina_datos('x'); r := concat(r, '4) clave corta: FALLA, la acepto', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '4) clave corta rechazada: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM tv_cocina_datos(repeat('a',64)); r := concat(r, '5) clave inventada: FALLA, la acepto', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '5) clave inventada rechazada: ', sqlerrm, E'\n'); END;
  j := tv_cocina_avanzar(ta, ob, 'cooking');
  r := concat(r, '6) TV A intenta mover pedido de B: ', (j->>'status'), ' (esperado sin_cambio)', E'\n');
  j := tv_cocina_avanzar(ta, oa, 'ready');
  r := concat(r, '7) saltar pending->ready: ', (j->>'status'), ' (esperado sin_cambio)', E'\n');
  BEGIN PERFORM tv_cocina_avanzar(ta, oa, 'completed'); r := concat(r, '8) completed: FALLA', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '8) completed rechazado: ', sqlerrm, E'\n'); END;
  j := tv_cocina_avanzar(ta, oa, 'cooking'); r := concat(r, '9) pending->cooking propio: ', (j->>'status'), E'\n');
  j := tv_cocina_avanzar(ta, oa, 'ready');   r := concat(r, '10) cooking->ready propio: ', (j->>'status'), E'\n');
  j := tv_cocina_cancelar(ta, ob);           r := concat(r, '11) TV A cancela pedido de B: ', (j->>'status'), ' (esperado sin_cambio)', E'\n');
  j := tv_cocina_cancelar(ta, oa);           r := concat(r, '12) TV A cancela el suyo: ', (j->>'status'), E'\n');
  BEGIN SELECT count(*) INTO n FROM kitchen_tv_tokens; r := concat(r, '13) anon lee tabla de claves: filas=', n, ' (esperado 0)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '13) anon sin permiso a la tabla de claves (bien)', E'\n'); END;
  BEGIN SELECT count(*) INTO n FROM orders; r := concat(r, '14) anon lee orders: filas=', n, ' (esperado 0)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '14) anon sin permiso a orders (bien)', E'\n'); END;
  BEGIN PERFORM mi_clave_tv(); r := concat(r, '15) anon pide mi_clave_tv: FALLA', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '15) anon no puede mi_clave_tv: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
