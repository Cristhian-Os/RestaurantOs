-- Prueba de 20261015201000_cerrar_superficie_publica_y_pagos. SOLO para un proyecto de PRUEBA.
-- Comprueba: el menu publico se puede leer via RPC (config_publica / ingredientes_publicos), funciones
-- internas cerradas, el personal no reescribe pedidos ni resucita cancelados, pagos solo para admin y
-- set_module_config atomico y solo admin.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); umes uuid := gen_random_uuid(); ukit uuid := gen_random_uuid();
  oid1 uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid(); CADM text; CMES text; CKIT text; n int; j jsonb; f record;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Sup A','sup-a','supa.test'),(rb,'Sup B','sup-b','supb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (uadm,'authenticated','authenticated','adm@supa.test'),
    (umes,'authenticated','authenticated','mes@supa.test'),(ukit,'authenticated','authenticated','kit@supa.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (uadm,'admin','Adm','adm@supa.test',ra,true),(umes,'waiter','Mes','mes@supa.test',ra,true),(ukit,'kitchen','Kit','kit@supa.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  INSERT INTO restaurant_config (restaurant_id, display_name, whatsapp_numero, modules_enabled) VALUES
    (ra,'Resto A','3001112222','{"categorias":["a"],"agotados":["x"]}'::jsonb),(rb,'Resto B','3009998888','{}'::jsonb);
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ra,'Queso A','gramo',100,6.5),(rb,'Queso B','gramo',100,6.5);
  INSERT INTO orders (id, restaurant_id, items, total, status, tipo_pedido) VALUES
    (oid1, ra, '[]'::jsonb, 10000, 'pending','LOCAL'),(oid2, ra, '[]'::jsonb, 20000, 'cancelled','LOCAL');
  INSERT INTO payments (restaurant_id, kind, order_id, reference, amount_in_cents, currency, status) VALUES (ra,'diner',oid1,'ref-sup-'||gen_random_uuid(),1000000,'COP','PENDING');
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}'; CMES := '{"role":"authenticated","sub":"'||umes||'"}'; CKIT := '{"role":"authenticated","sub":"'||ukit||'"}';

  -- anon
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  j := config_publica(ra);
  r := concat(r, 'config_publica(A): nombre=', (j->>'display_name'), ' tiene_modules=', (j ? 'modules_enabled'), ' (esperado Resto A/true)', E'\n');
  r := concat(r, 'config_publica expone solo columnas publicas: ', (NOT (j ? 'id') AND NOT (j ? 'plantillas_aplicadas')), ' (esperado true)', E'\n');
  r := concat(r, 'config_publica de un id inexistente: ', coalesce(config_publica(gen_random_uuid())::text,'NULL'), ' (esperado NULL)', E'\n');
  SELECT count(*) INTO n FROM ingredientes_publicos(ra);
  r := concat(r, 'ingredientes_publicos(A) devuelve ', n, ' fila(s) (esperado 1) y solo del restaurante A: ', (SELECT bool_and(restaurant_id = ra) FROM ingredientes_publicos(ra)), E'\n');
  BEGIN PERFORM order_total_cents(oid1); r := concat(r, 'anon ejecuta order_total_cents (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no ejecuta order_total_cents: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM purge_restaurant(ra); r := concat(r, 'anon ejecuta purge_restaurant (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no ejecuta purge_restaurant: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM enforce_subscription_lifecycle(); r := concat(r, 'anon ejecuta enforce_subscription_lifecycle (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no ejecuta enforce_subscription_lifecycle: ', sqlerrm, E'\n'); END;

  -- mesero: no reescribe pedidos
  RESET ROLE; PERFORM set_config('request.jwt.claims', CMES, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE orders SET total = 0 WHERE id = oid1; r := concat(r, 'mesero reescribe total (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no reescribe total: ', sqlerrm, E'\n'); END;
  BEGIN UPDATE orders SET paid_at = now() WHERE id = oid1; r := concat(r, 'mesero marca pagado (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no marca pagado: ', sqlerrm, E'\n'); END;
  BEGIN INSERT INTO orders (restaurant_id, items, total, status) VALUES (ra,'[]'::jsonb,1,'pending'); r := concat(r, 'mesero inserta pedido directo (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no inserta pedidos directo: ', sqlerrm, E'\n'); END;
  UPDATE orders SET delivered_at = now() WHERE id = oid1; GET DIAGNOSTICS n = ROW_COUNT;
  r := concat(r, 'mesero marca entregado: ', n, ' fila (esperado 1)', E'\n');
  SELECT count(*) INTO n FROM payments;  r := concat(r, 'mesero ve payments: ', n, ' (esperado 0)', E'\n');
  BEGIN PERFORM set_module_config('theme','"dark"'); r := concat(r, 'mesero cambia config (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no cambia config: ', sqlerrm, E'\n'); END;

  -- cocina: avanza estado, pero no resucita cancelados
  RESET ROLE; PERFORM set_config('request.jwt.claims', CKIT, true); SET LOCAL ROLE authenticated;
  UPDATE orders SET status = 'cooking' WHERE id = oid1; GET DIAGNOSTICS n = ROW_COUNT;
  r := concat(r, 'cocina avanza pending->cooking: ', n, ' fila (esperado 1)', E'\n');
  UPDATE orders SET status = 'pending' WHERE id = oid2; GET DIAGNOSTICS n = ROW_COUNT;
  r := concat(r, 'cocina resucita un pedido cancelado: ', n, ' filas (esperado 0)', E'\n');
  BEGIN UPDATE orders SET status = 'completed' WHERE id = oid1; r := concat(r, 'cocina completa (FALLA: n=', n, ')', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'cocina no puede dejar el pedido en completed: ', sqlerrm, E'\n'); END;

  -- admin: ve pagos y cambia config sin pisar el resto
  RESET ROLE; PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM payments;  r := concat(r, 'admin ve payments: ', n, ' (esperado 1)', E'\n');
  j := set_module_config('theme','"dark"');
  r := concat(r, 'set_module_config conserva lo demas: ', (j ? 'categorias' AND j ? 'agotados'), ' tema=', (j->>'theme'), ' (esperado true/dark)', E'\n');
  BEGIN PERFORM set_module_config('mala clave!','1'); r := concat(r, 'clave invalida aceptada (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'clave invalida rechazada: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  SELECT modules_enabled INTO j FROM restaurant_config WHERE restaurant_id = rb;
  r := concat(r, 'config de otro restaurante intacta: ', (j = '{}'::jsonb), ' (esperado true)', E'\n');

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
