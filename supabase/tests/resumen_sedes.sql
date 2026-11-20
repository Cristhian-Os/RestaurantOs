-- Prueba de 20261120150000_resumen_sedes. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) cada sede muestra sus números (ventas, propinas, pedidos, gastos, neto, pedidos en curso, stock bajo,
-- último corte) y NO suma lo que la caja no suma: Rappi, pedidos cancelados, pagos anulados, otro mes;
-- (2) el total es la suma de las sedes; (3) otra cuenta solo ve lo suyo; (4) un administrador que no es dueño no puede verlo;
-- (5) sin sesión no se puede llamar; (6) al cambiar de sede se ven las mismas sedes y cambia la marca "actual";
-- (7) los números de la sede coinciden con get_corte_mensual() de esa misma sede.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; n int; j jsonb; e jsonb; t text;
  a1 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); a2 uuid;
  uo uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid(); c1 uuid := gen_random_uuid();
  CO text; CS text; CB text; CC text;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o6 uuid; o7 uuid; ob uuid;
  v_prev timestamptz := ((date_trunc('month', public.hoy_local())::date - 1)::timestamp + interval '12 hours') AT TIME ZONE 'America/Bogota';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uo,'authenticated','authenticated','dueno@resumen-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (us,'authenticated','authenticated','admin2@resumen-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','dueno@resumen-b.test', crypt('ClaveActual1', gen_salt('bf'))),
    (uc,'authenticated','authenticated','dueno@resumen-c.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES
    (a1,'Resumen A1','resumen-a1','resumena1.test','premium',true),
    (b1,'Resumen B1','resumen-b1','resumenb1.test','premium',true),
    (c1,'Resumen C1','resumen-c1','resumenc1.test','pro',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uo,'admin','Dueño A','dueno@resumen-a.test',a1),(ub,'admin','Dueño B','dueno@resumen-b.test',b1),
    (uc,'admin','Dueño C','dueno@resumen-c.test',c1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  UPDATE restaurants SET owner_id = ub WHERE id = b1;
  UPDATE restaurants SET owner_id = uc WHERE id = c1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active'),(b1,'premium','active'),(c1,'pro','active');

  CO := '{"role":"authenticated","sub":"'||uo||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}';
  CB := '{"role":"authenticated","sub":"'||ub||'"}'; CC := '{"role":"authenticated","sub":"'||uc||'"}';

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Resumen A2'); a2 := (j->>'restaurant_id')::uuid;
  RESET ROLE;
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'admin','Admin A2','admin2@resumen-a.test',a2)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;

  -- Sede 1: pedidos y pagos
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (a1,'[]',10000,'completed','LOCAL','efectivo', now()) RETURNING id INTO o1;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, propina, paid_at) VALUES (a1,o1,'efectivo',10000,1000,now());
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at, anulado_at) VALUES (a1,o1,'efectivo',3333,now(),now());   -- anulado: no suma
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (a1,'[]',5000,'completed','LLEVAR','transferencia', now()) RETURNING id INTO o2;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o2,'transferencia',5000,now());
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (a1,'[]',99999,'completed','RAPPI','rappi', now()) RETURNING id INTO o3;                                                          -- Rappi: no suma
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o3,'efectivo',99999,now());
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (a1,'[]',7777,'cancelled','LOCAL','efectivo', now()) RETURNING id INTO o4;                                                         -- cancelado: no suma
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o4,'efectivo',7777,now());
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at, created_at)
    VALUES (a1,'[]',4444,'completed','LOCAL','efectivo', v_prev, v_prev) RETURNING id INTO o6;                                                -- mes pasado: no suma
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o6,'efectivo',4444,v_prev);
  -- en curso en sede 1: 2 pendientes, 1 en cocina, 1 lista
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido) VALUES
    (a1,'[]',1,'pending','LOCAL'),(a1,'[]',1,'pending','LOCAL'),(a1,'[]',1,'cooking','LOCAL'),(a1,'[]',1,'ready','LOCAL');
  INSERT INTO gastos (restaurant_id, concepto, monto) VALUES (a1,'Hielo',2000);
  INSERT INTO gastos (restaurant_id, concepto, monto, created_at) VALUES (a1,'Gasto del mes pasado',500,v_prev);
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo) VALUES
    (a1,'Leche','litro',2,5),(a1,'Azúcar','kg',10,5),(a1,'Sal','kg',5,5);
  INSERT INTO cortes_caja (cashier_id, restaurant_id, fecha, total_efectivo, total_transferencia, total_tarjeta, total_neto, efectivo_esperado, created_at)
    VALUES (uo, a1, public.hoy_local() - 2, 100, 0, 0, 100, 100, now() - interval '2 days');
  INSERT INTO cortes_caja (cashier_id, restaurant_id, fecha, total_efectivo, total_transferencia, total_tarjeta, total_neto, efectivo_esperado, created_at)
    VALUES (uo, a1, public.hoy_local() - 1, 20000, 5000, 0, 23000, 21000, now() - interval '1 hour');

  -- Sede 2
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (a2,'[]',8000,'completed','LOCAL','efectivo', now()) RETURNING id INTO o7;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a2,o7,'efectivo',8000,now());
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido) VALUES (a2,'[]',1,'pending','LOCAL');
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo) VALUES (a2,'Sal','kg',0,0);

  -- Otra cuenta (no debe aparecer)
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at)
    VALUES (b1,'[]',55555,'completed','LOCAL','efectivo', now()) RETURNING id INTO ob;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (b1,ob,'efectivo',55555,now());

  -- (1) el dueño de A ve sus dos sedes
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := resumen_sedes();
  RESET ROLE;
  r := r||'(1) sedes vistas: '||jsonb_array_length(j->'sedes')||' (esperado 2)'||E'\n';
  SELECT x INTO e FROM jsonb_array_elements(j->'sedes') x WHERE x->>'id' = a1::text;
  r := r||'(1) sede 1 ventas hoy/mes: '||(e->>'ventas_hoy')||' / '||(e->>'ventas_mes')||' (esperado 15000 / 15000; sin anulado, Rappi, cancelado ni mes pasado)'||E'\n';
  r := r||'(1) sede 1 propinas hoy: '||(e->>'propinas_hoy')||' (esperado 1000)'||E'\n';
  r := r||'(1) sede 1 pedidos hoy/mes: '||(e->>'pedidos_hoy')||' / '||(e->>'pedidos_mes')||' (esperado 2 / 2)'||E'\n';
  r := r||'(1) sede 1 gastos hoy/mes: '||(e->>'gastos_hoy')||' / '||(e->>'gastos_mes')||' (esperado 2000 / 2000)'||E'\n';
  r := r||'(1) sede 1 neto hoy/mes: '||(e->>'neto_hoy')||' / '||(e->>'neto_mes')||' (esperado 13000 / 13000)'||E'\n';
  r := r||'(1) sede 1 en curso: '||(e->>'pedidos_en_curso')||' (esperado 4)'||E'\n';
  r := r||'(1) sede 1 stock bajo: '||(e->>'ingredientes_bajos')||' (esperado 2: Leche y Sal)'||E'\n';
  r := r||'(1) sede 1 último corte total/neto: '||(e->'ultimo_corte'->>'total')||' / '||(e->'ultimo_corte'->>'neto')||' (esperado 25000 / 23000, el más reciente)'||E'\n';
  SELECT x INTO e FROM jsonb_array_elements(j->'sedes') x WHERE x->>'id' = a2::text;
  r := r||'(1) sede 2 ventas hoy: '||(e->>'ventas_hoy')||' (esperado 8000), en curso '||(e->>'pedidos_en_curso')||' (esperado 1), stock bajo '||(e->>'ingredientes_bajos')||' (esperado 1)'||E'\n';
  r := r||'(1) sede 2 último corte: '||coalesce(e->>'ultimo_corte','null')||' (esperado null)'||E'\n';

  -- (2) total
  r := r||'(2) total ventas hoy: '||(j->'total'->>'ventas_hoy')||' (esperado 23000), pedidos hoy '||(j->'total'->>'pedidos_hoy')||' (esperado 3), en curso '||(j->'total'->>'pedidos_en_curso')||' (esperado 5), stock bajo '||(j->'total'->>'ingredientes_bajos')||' (esperado 3), neto mes '||(j->'total'->>'neto_mes')||' (esperado 21000)'||E'\n';

  -- (3) otra cuenta (con 2 sedes) solo ve lo suyo
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  PERFORM crear_sede('Resumen B2');
  j := resumen_sedes();
  RESET ROLE;
  r := r||'(3) dueño B ve sedes: '||jsonb_array_length(j->'sedes')||' (esperado 2: las suyas) y ventas hoy '||(j->'total'->>'ventas_hoy')||' (esperado 55555, nada de la cuenta A)'||E'\n';
  SELECT count(*) INTO n FROM jsonb_array_elements(j->'sedes') x WHERE x->>'id' IN (a1::text, a2::text);
  r := r||'(3) sedes de A dentro del resumen de B: '||n||' (esperado 0)'||E'\n';

  -- (3b) dueño de un solo restaurante, sin cuenta de varias sedes: no hay panel
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM resumen_sedes(); r := r||'(3b) dueño sin cuenta lo ve (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(3b) dueño de una sola sede no lo ve: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (4) administrador que no es dueño
  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM resumen_sedes(); r := r||'(4) admin no dueño lo ve (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(4) admin no dueño no lo ve: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (5) sin sesión
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM resumen_sedes(); r := r||'(5) anónimo lo ve (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(5) anónimo no lo ve: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (6) cambiar de sede: mismas sedes, cambia "actual"
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  PERFORM cambiar_sede(a2);
  j := resumen_sedes();
  RESET ROLE;
  SELECT x INTO e FROM jsonb_array_elements(j->'sedes') x WHERE x->>'id' = a2::text;
  r := r||'(6) en sede 2: sedes '||jsonb_array_length(j->'sedes')||' (esperado 2), sede 2 es la actual: '||(e->>'actual')||' (esperado true)'||E'\n';

  -- (7) coincide con el corte mensual de la misma sede
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  PERFORM cambiar_sede(a1);
  j := resumen_sedes();
  e := get_corte_mensual()::jsonb;
  RESET ROLE;
  SELECT x INTO j FROM jsonb_array_elements(j->'sedes') x WHERE x->>'id' = a1::text;
  r := r||'(7) ventas del mes: panel '||(j->>'ventas_mes')||' vs corte mensual '||(e->>'total_general')||' (deben ser iguales)'||E'\n';
  r := r||'(7) pedidos del mes: panel '||(j->>'pedidos_mes')||' vs corte mensual '||(e->>'total_ordenes')||' (deben ser iguales)'||E'\n';
  r := r||'(7) gastos del mes: panel '||(j->>'gastos_mes')||' vs corte mensual '||(e->>'total_gastos')||' (deben ser iguales)'||E'\n';
  r := r||'(7) propinas del mes: panel '||(j->>'propinas_mes')||' vs corte mensual '||(e->>'total_propinas')||' (deben ser iguales)'||E'\n';
  r := r||'(7) neto del mes: panel '||(j->>'neto_mes')||' vs corte mensual '||(e->>'total_neto')||' (deben ser iguales)'||E'\n';

  RAISE EXCEPTION E'RESULTADO (se revierte todo):\n%', r;
END $$;
