-- Prueba de 20261015203000_pagos_en_linea_verificados y 20261015204000_costos_recetas_y_reconciliar_produccion.
-- SOLO para un proyecto de PRUEBA. Comprueba: nadie fuera de service_role ejecuta mark_order_paid / procesar_pago_wompi,
-- un monto menor al total no marca el pedido pagado, un APPROVED repetido no extiende la suscripcion, un evento tardio no
-- pisa un APPROVED, monto/moneda distintos se rechazan y quedan anotados, el cobro entra al corte (order_payments),
-- el cron no cobra dos veces y costos_recetas calcula el costo por plato.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); uadm uuid := gen_random_uuid();
  dish uuid := gen_random_uuid(); ing uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid();
  ref1 text := 'ord_t_'||gen_random_uuid(); ref2 text := 'ord_t_'||gen_random_uuid(); refs text := 'sub_t_'||gen_random_uuid(); refs2 text := 'sub_t_'||gen_random_uuid();
  j jsonb; f record; n int; fin1 timestamptz; fin2 timestamptz; CADM text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Pago A','pago-a','pagoa.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (uadm,'authenticated','authenticated','adm@pagoa.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES (uadm,'admin','Adm','adm@pagoa.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role='admin', restaurant_id=EXCLUDED.restaurant_id, active=true;
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}';
  INSERT INTO ingredientes (id, restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ing, ra, 'Queso', 'gramo', 1000, 5);
  INSERT INTO dishes (id, restaurant_id, name, price, available) VALUES (dish, ra, 'Sandwich', 12000, true);
  INSERT INTO recetas (producto_id, ingrediente_id, cantidad_necesaria, restaurant_id) VALUES (dish, ing, 20, ra);
  INSERT INTO orders (id, restaurant_id, items, total, status, tipo_pedido) VALUES
    (oid, ra, '[]'::jsonb, 10000, 'pending','LOCAL'),(oid2, ra, '[]'::jsonb, 10000, 'pending','LOCAL');
  INSERT INTO payments (restaurant_id, kind, order_id, reference, amount_in_cents, currency, status) VALUES
    (ra,'diner',oid,ref1,1000000,'COP','PENDING'),(ra,'diner',oid2,ref2,1000000,'COP','PENDING');
  INSERT INTO subscriptions (restaurant_id, plan, status, amount_in_cents, current_period_end) VALUES (ra,'pro','past_due',9900000, now() - interval '2 days')
    ON CONFLICT (restaurant_id) DO UPDATE SET plan='pro', status='past_due', amount_in_cents=9900000, current_period_end = now() - interval '2 days';
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, currency, status) VALUES (ra,'subscription',refs,9900000,'COP','PENDING');

  -- permisos
  r := concat(r, 'authenticated ejecuta mark_order_paid: ', has_function_privilege('authenticated','public.mark_order_paid(uuid,text,text,integer)','EXECUTE'), ' (esperado false)', E'\n');
  r := concat(r, 'anon ejecuta procesar_pago_wompi: ', has_function_privilege('anon','public.procesar_pago_wompi(text,text,text,integer,text,text,text,jsonb)','EXECUTE'), ' (esperado false)', E'\n');
  r := concat(r, 'service_role ejecuta procesar_pago_wompi: ', has_function_privilege('service_role','public.procesar_pago_wompi(text,text,text,integer,text,text,text,jsonb)','EXECUTE'), ' (esperado true)', E'\n');
  r := concat(r, 'authenticated ejecuta check_rate_limit: ', has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','EXECUTE'), ' (esperado false)', E'\n');

  -- referencia desconocida / estado raro
  j := procesar_pago_wompi('no-existe','tx0','APPROVED',1000000,'COP','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'referencia desconocida: ', (j->>'result'), ' (esperado unknown_reference)', E'\n');

  -- monto distinto al firmado: se rechaza y no se paga el pedido
  j := procesar_pago_wompi(ref2,'tx2','APPROVED',100,'COP','CARD',NULL,'{"x":1}'::jsonb);
  r := concat(r, 'monto distinto: ', (j->>'result'), ' (esperado amount_mismatch)', E'\n');
  SELECT status, raw->>'_ros_nota' AS nota INTO f FROM payments WHERE reference = ref2;
  r := concat(r, '  pago sigue ', f.status, ' con nota ', coalesce(f.nota,'NULL'), ' (esperado PENDING/monto_o_moneda_no_coincide)', E'\n');
  j := procesar_pago_wompi(ref2,'tx2','APPROVED',1000000,'USD','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'moneda distinta: ', (j->>'result'), ' (esperado amount_mismatch)', E'\n');

  -- DECLINED y luego APPROVED con la misma referencia (reintento del cliente): se acepta
  j := procesar_pago_wompi(ref1,'tx1a','DECLINED',1000000,'COP','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'declined: ', (j->>'result'), '/', (j->>'status'), ' (esperado applied/DECLINED)', E'\n');

  -- pedido editado a un total mayor a lo firmado: el pago aprobado NO marca el pedido pagado
  UPDATE orders SET total = 200000 WHERE id = oid;
  j := procesar_pago_wompi(ref1,'tx1','APPROVED',1000000,'COP','CARD','a@b.test','{"ev":1}'::jsonb);
  r := concat(r, 'approved con pedido subido de precio: ', (j->>'result'), ' pedido=', (j->'order'->>'status'), ' (esperado applied/underpaid)', E'\n');
  SELECT (paid_at IS NOT NULL) AS pagado INTO f FROM orders WHERE id = oid;
  r := concat(r, '  pedido marcado pagado: ', f.pagado, ' (esperado false)', E'\n');
  SELECT raw->>'_ros_nota' AS nota INTO f FROM payments WHERE reference = ref1;
  r := concat(r, '  nota para revision manual: ', coalesce(f.nota,'NULL'), ' (esperado pedido_no_marcado_pagado:underpaid)', E'\n');

  -- pedido normal: pago exacto marca pagado y entra al corte
  UPDATE payments SET status='PENDING' WHERE reference = ref2;
  j := procesar_pago_wompi(ref2,'tx2ok','APPROVED',1000000,'COP','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'pago exacto: ', (j->>'result'), ' pedido=', (j->'order'->>'status'), ' (esperado applied/paid)', E'\n');
  SELECT (paid_at IS NOT NULL) AS pagado, payment_method INTO f FROM orders WHERE id = oid2;
  r := concat(r, '  pedido pagado=', f.pagado, ' metodo=', f.payment_method, ' (esperado true/tarjeta)', E'\n');
  SELECT count(*) INTO n FROM order_payments WHERE order_id = oid2 AND payment_method='tarjeta' AND anulado_at IS NULL;
  r := concat(r, '  cobro registrado en order_payments: ', n, ' (esperado 1)', E'\n');
  j := procesar_pago_wompi(ref2,'tx2ok','APPROVED',1000000,'COP','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'APPROVED repetido: ', (j->>'result'), ' (esperado already_approved)', E'\n');
  j := procesar_pago_wompi(ref2,'tx2ok','PENDING',1000000,'COP','CARD',NULL,'{}'::jsonb);
  r := concat(r, 'PENDING tardio: ', (j->>'result'), ' (esperado already_approved)', E'\n');
  SELECT status INTO f FROM payments WHERE reference = ref2;
  r := concat(r, '  estado final: ', f.status, ' (esperado APPROVED)', E'\n');
  SELECT count(*) INTO n FROM order_payments WHERE order_id = oid2 AND anulado_at IS NULL;
  r := concat(r, '  cobros del pedido tras repeticiones: ', n, ' (esperado 1)', E'\n');

  -- suscripcion: aprobar extiende una vez; repetir no
  j := procesar_pago_wompi(refs,'txs1','APPROVED',9900000,'COP','CARD',NULL,'{}'::jsonb);
  SELECT current_period_end, status INTO f FROM subscriptions WHERE restaurant_id = ra;
  fin1 := f.current_period_end;
  r := concat(r, 'suscripcion aprobada: ', (j->>'result'), ' estado=', f.status, ' vence en el futuro=', (fin1 > now() + interval '27 days'), ' (esperado applied/active/true)', E'\n');
  PERFORM pg_sleep(1);
  j := procesar_pago_wompi(refs,'txs1','APPROVED',9900000,'COP','CARD',NULL,'{}'::jsonb);
  SELECT current_period_end INTO fin2 FROM subscriptions WHERE restaurant_id = ra;
  r := concat(r, 'APPROVED repetido: ', (j->>'result'), ' vencimiento sin cambios=', (fin1 = fin2), ' (esperado already_approved/true)', E'\n');

  -- cron: no cobra si ya hay un pago aprobado/pendiente reciente; tope de reintentos
  r := concat(r, 'puede cobrar justo tras un pago aprobado: ', suscripcion_puede_cobrar(ra), ' (esperado false)', E'\n');
  DELETE FROM payments WHERE restaurant_id = ra AND kind='subscription';
  r := concat(r, 'sin pagos recientes: ', suscripcion_puede_cobrar(ra), ' (esperado true)', E'\n');
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, currency, status) VALUES
    (ra,'subscription','d1'||gen_random_uuid(),1,'COP','DECLINED'),(ra,'subscription','d2'||gen_random_uuid(),1,'COP','DECLINED'),(ra,'subscription','d3'||gen_random_uuid(),1,'COP','DECLINED');
  r := concat(r, 'tras 3 rechazos en 7 dias: ', suscripcion_puede_cobrar(ra), ' (esperado false)', E'\n');

  -- costos_recetas
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  SELECT costo INTO f FROM costos_recetas() WHERE dish_id = dish;
  r := concat(r, 'costos_recetas: costo del sandwich=', f.costo, ' (esperado 100 = 20 x 5)', E'\n');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM * FROM costos_recetas(); r := concat(r, 'anon ejecuta costos_recetas (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no ejecuta costos_recetas: ', sqlerrm, E'\n'); END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
