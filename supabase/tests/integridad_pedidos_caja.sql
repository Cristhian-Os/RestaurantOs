-- Prueba de 20261015202000_integridad_pedidos_caja. SOLO para un proyecto de PRUEBA.
-- Comprueba: idempotencia de crear_orden_completa (sin pedido ni descuento de stock duplicado), mesa de otro restaurante,
-- RAPPI solo admin/cajero, cancelar repone stock y se bloquea con pagos, cancelar item resta precio*cantidad,
-- efectivo corto rechazado, un solo corte por dia (el segundo actualiza), editar pedido con pagos bloqueado y
-- cajero sin borrar gastos de un dia con corte.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); uwai uuid := gen_random_uuid(); ucas uuid := gen_random_uuid();
  dish uuid := gen_random_uuid(); ing uuid := gen_random_uuid(); mesaA uuid := gen_random_uuid(); mesaB uuid := gen_random_uuid();
  CADM text; CWAI text; CCAS text; j json; j2 json; oid uuid; oid2 uuid; n int; stock numeric; f record; k text := 'clave-'||gen_random_uuid();
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Int A','int-a','inta.test'),(rb,'Int B','int-b','intb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (uadm,'authenticated','authenticated','adm@inta.test'),
    (uwai,'authenticated','authenticated','wai@inta.test'),(ucas,'authenticated','authenticated','cas@inta.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (uadm,'admin','Adm','adm@inta.test',ra,true),(uwai,'waiter','Mesero','wai@inta.test',ra,true),(ucas,'cashier','Cajero','cas@inta.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  INSERT INTO mesas (id, numero, restaurant_id) VALUES (mesaA, 1, ra),(mesaB, 1, rb);
  INSERT INTO ingredientes (id, restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ing, ra, 'Harina', 'gramo', 1000, 1);
  INSERT INTO dishes (id, restaurant_id, name, price, available) VALUES (dish, ra, 'Pizza', 10000, true);
  INSERT INTO recetas (producto_id, ingrediente_id, cantidad_necesaria, restaurant_id) VALUES (dish, ing, 100, ra);
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}'; CWAI := '{"role":"authenticated","sub":"'||uwai||'"}'; CCAS := '{"role":"authenticated","sub":"'||ucas||'"}';

  -- mesero crea pedido 2 x pizza (descuenta 200 de harina) con clave de idempotencia
  PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  j := crear_orden_completa(mesaA, ('[{"id":"'||dish||'","quantity":2}]')::jsonb, 'LOCAL', NULL, 1, 'Ana', k);
  oid := (j->>'order_id')::uuid;
  r := concat(r, 'pedido creado: total=', (j->>'total'), ' duplicado=', (j->>'duplicado'), ' (esperado 20000/false)', E'\n');
  j2 := crear_orden_completa(mesaA, ('[{"id":"'||dish||'","quantity":2}]')::jsonb, 'LOCAL', NULL, 1, 'Ana', k);
  r := concat(r, 'mismo intento devuelve el mismo pedido: ', ((j2->>'order_id')::uuid = oid), ' duplicado=', (j2->>'duplicado'), ' (esperado true/true)', E'\n');
  RESET ROLE;
  SELECT count(*) INTO n FROM orders WHERE restaurant_id = ra AND idempotency_key = k;
  SELECT stock_actual INTO stock FROM ingredientes WHERE id = ing;
  r := concat(r, 'pedidos con esa clave: ', n, ' (esperado 1); stock tras 2 llamadas: ', stock, ' (esperado 800)', E'\n');

  PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_orden_completa(mesaB, ('[{"id":"'||dish||'","quantity":1}]')::jsonb, 'LOCAL', NULL, 1, 'X', NULL); r := concat(r, 'mesa de otro restaurante aceptada (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesa de otro restaurante rechazada: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM crear_orden_completa(NULL, ('[{"id":"'||dish||'","quantity":1}]')::jsonb, 'RAPPI', NULL, NULL, 'X', NULL); r := concat(r, 'mesero crea RAPPI (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no crea RAPPI: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM crear_orden_con_custom(('[{"id":"'||dish||'","quantity":1}]')::jsonb, '[]'::jsonb, 'LOCAL', 1, mesaB, NULL); r := concat(r, 'custom con mesa ajena (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'custom con mesa ajena rechazado: ', sqlerrm, E'\n'); END;

  -- cancelar sin pagos repone stock
  j := crear_orden_completa(NULL, ('[{"id":"'||dish||'","quantity":3}]')::jsonb, 'LLEVAR', NULL, NULL, 'Luis', NULL);
  oid2 := (j->>'order_id')::uuid;
  RESET ROLE; SELECT stock_actual INTO stock FROM ingredientes WHERE id = ing;
  r := concat(r, 'stock tras segundo pedido (3 pizzas): ', stock, ' (esperado 500)', E'\n');
  PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  PERFORM cancelar_orden(oid2);
  RESET ROLE; SELECT stock_actual INTO stock FROM ingredientes WHERE id = ing;
  r := concat(r, 'stock tras cancelar: ', stock, ' (esperado 800)', E'\n');
  PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cancelar_orden(oid2); r := concat(r, 'cancelar dos veces (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'no se cancela dos veces: ', sqlerrm, E'\n'); END;

  -- cajero: cobro en efectivo corto / vacio rechazado; luego cobro valido
  RESET ROLE; UPDATE orders SET status = 'ready' WHERE id = oid;
  PERFORM set_config('request.jwt.claims', CCAS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cobrar_orden_inicial(oid, 'efectivo', NULL, 0); r := concat(r, 'efectivo sin monto recibido (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'efectivo vacio rechazado: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM cobrar_orden_inicial(oid, 'efectivo', 15000, 0); r := concat(r, 'efectivo corto (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'efectivo corto rechazado: ', sqlerrm, E'\n'); END;
  j := cobrar_orden_inicial(oid, 'efectivo', 25000, 0);
  r := concat(r, 'cobro valido: cambio=', (j->>'change'), ' (esperado 5000)', E'\n');

  -- con pagos: no se cancela, no se edita, no se cancela item
  RESET ROLE; PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cancelar_orden(oid); r := concat(r, 'cancelar pedido pagado (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'pedido pagado no se cancela: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM editar_items_pedido(oid, '[{"idx":0,"quantity":1}]'::jsonb); r := concat(r, 'editar pedido pagado (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'pedido pagado no se edita: ', sqlerrm, E'\n'); END;

  -- cancelar item: precio * cantidad y repone stock (pedido nuevo en cooking sin pagos)
  j := crear_orden_completa(NULL, ('[{"id":"'||dish||'","quantity":3}]')::jsonb, 'LLEVAR', NULL, NULL, 'Eva', NULL);
  oid2 := (j->>'order_id')::uuid;
  RESET ROLE; UPDATE orders SET status = 'cooking' WHERE id = oid2;
  SELECT stock_actual INTO stock FROM ingredientes WHERE id = ing;
  r := concat(r, 'stock antes de cancelar item (800-300): ', stock, ' (esperado 500)', E'\n');
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  j := cancelar_item_orden(oid2, 0);
  r := concat(r, 'cancelar item 3 x 10000: nuevo total=', (j->>'new_total'), ' (esperado 0)', E'\n');
  BEGIN PERFORM cancelar_item_orden(oid2, 0); r := concat(r, 'item cancelado dos veces (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'item no se cancela dos veces: ', sqlerrm, E'\n'); END;
  RESET ROLE; SELECT stock_actual INTO stock FROM ingredientes WHERE id = ing;
  r := concat(r, 'stock tras cancelar el item: ', stock, ' (esperado 800)', E'\n');

  -- corte: un solo por dia
  PERFORM set_config('request.jwt.claims', CCAS, true); SET LOCAL ROLE authenticated;
  j := hacer_corte_caja('primero');  r := concat(r, 'primer corte: actualizado=', (j->>'actualizado'), ' (esperado false)', E'\n');
  j2 := hacer_corte_caja('segundo'); r := concat(r, 'segundo corte: actualizado=', (j2->>'actualizado'), ' mismo id=', ((j->>'corte_id')=(j2->>'corte_id')), ' (esperado true/true)', E'\n');
  RESET ROLE; SELECT count(*) INTO n FROM cortes_caja WHERE restaurant_id = ra;
  r := concat(r, 'cortes del dia: ', n, ' (esperado 1)', E'\n');

  -- gasto de un dia con corte: el cajero no lo borra, el admin si
  INSERT INTO gastos (restaurant_id, concepto, monto) VALUES (ra, 'Hielo', 5000);
  PERFORM set_config('request.jwt.claims', CCAS, true); SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM gastos WHERE restaurant_id = ra AND concepto = 'Hielo';
    r := concat(r, 'cajero borra gasto del dia con corte (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'cajero no borra gasto de un dia con corte: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  DELETE FROM gastos WHERE restaurant_id = ra AND concepto = 'Hielo'; GET DIAGNOSTICS n = ROW_COUNT;
  r := concat(r, 'admin borra ese gasto: filas=', n, ' (esperado 1)', E'\n');
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
