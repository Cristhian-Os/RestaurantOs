-- Prueba de 20261120180000_resumen_sedes_por_mes. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) queda UNA sola versión de la función (sin duplicado); (2) sin parámetro = mes actual, igual que antes;
-- (3) con un mes pasado suma solo los pagos y gastos de ese mes; (4) un mes más viejo (sin límite hacia atrás) también;
-- (5) un mes futuro se rechaza; (6) primer_mes es el primer mes con ventas; (7) "hoy" no se mezcla con meses pasados;
-- (8) sin sesión no se puede llamar. Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; j jsonb; n int; a1 uuid := gen_random_uuid(); a2 uuid; uo uuid := gen_random_uuid(); CO text;
  o1 uuid; o2 uuid; o3 uuid; v_hoy date := public.hoy_local();
  m1 date := (date_trunc('month', public.hoy_local())::date - interval '1 month')::date;   -- mes pasado
  m3 date := (date_trunc('month', public.hoy_local())::date - interval '3 month')::date;   -- hace 3 meses
  t1 timestamptz; t3 timestamptz;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE proname = 'resumen_sedes' AND pronamespace = 'public'::regnamespace;
  IF n <> 1 THEN RAISE EXCEPTION 'T1 debía haber 1 versión y hay %', n; END IF;
  r := r || 'T1 una sola versión: OK' || E'\n';

  t1 := (m1::timestamp + interval '12 hours') AT TIME ZONE 'America/Bogota';
  t3 := (m3::timestamp + interval '12 hours') AT TIME ZONE 'America/Bogota';
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES (uo,'authenticated','authenticated','dueno@mes-a.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES (a1,'Mes A1','mes-a1','mesa1.test','premium',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (uo,'admin','Dueño','dueno@mes-a.test',a1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active');
  CO := '{"role":"authenticated","sub":"'||uo||'"}';
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Mes A2'); a2 := (j->>'restaurant_id')::uuid;
  RESET ROLE;

  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at) VALUES (a1,'[]',1000,'completed','LOCAL','efectivo', now()) RETURNING id INTO o1;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o1,'efectivo',1000,now());
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at, created_at) VALUES (a2,'[]',4000,'completed','LOCAL','efectivo', t1, t1) RETURNING id INTO o2;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, propina, paid_at) VALUES (a2,o2,'efectivo',4000,300,t1);
  INSERT INTO gastos (restaurant_id, concepto, monto, created_at) VALUES (a2,'Gasto mes pasado',500,t1);
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido, payment_method, paid_at, created_at) VALUES (a1,'[]',9000,'completed','LOCAL','efectivo', t3, t3) RETURNING id INTO o3;
  INSERT INTO order_payments (restaurant_id, order_id, payment_method, monto, paid_at) VALUES (a1,o3,'efectivo',9000,t3);

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := resumen_sedes();
  RESET ROLE;
  IF (j->>'mes') <> to_char(v_hoy,'YYYY-MM') OR (j->'total'->>'ventas_mes')::numeric <> 1000 THEN RAISE EXCEPTION 'T2 sin parámetro debía ser el mes actual con 1000: %', j; END IF;
  r := r || 'T2 sin parámetro = mes actual: OK' || E'\n';

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := resumen_sedes(m1 + 10);   -- cualquier día del mes pasado
  RESET ROLE;
  IF (j->>'mes') <> to_char(m1,'YYYY-MM') THEN RAISE EXCEPTION 'T3 mes equivocado: %', j->>'mes'; END IF;
  IF (j->'total'->>'ventas_mes')::numeric <> 4000 OR (j->'total'->>'propinas_mes')::numeric <> 300
     OR (j->'total'->>'gastos_mes')::numeric <> 500 OR (j->'total'->>'neto_mes')::numeric <> 3500
     OR (j->'total'->>'pedidos_mes')::int <> 1 THEN RAISE EXCEPTION 'T3 cifras del mes pasado mal: %', j->'total'; END IF;
  IF (j->'total'->>'ventas_hoy')::numeric <> 0 THEN RAISE EXCEPTION 'T7 "hoy" no debía mezclarse: %', j->'total'; END IF;
  r := r || 'T3 mes pasado suma solo lo de ese mes: OK' || E'\n' || 'T7 hoy no se mezcla: OK' || E'\n';

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := resumen_sedes(m3);
  RESET ROLE;
  IF (j->'total'->>'ventas_mes')::numeric <> 9000 THEN RAISE EXCEPTION 'T4 hace 3 meses debía dar 9000: %', j->'total'; END IF;
  IF (j->>'primer_mes') <> to_char(m3,'YYYY-MM') THEN RAISE EXCEPTION 'T6 primer_mes debía ser % y es %', to_char(m3,'YYYY-MM'), j->>'primer_mes'; END IF;
  r := r || 'T4 mes más viejo: OK' || E'\n' || 'T6 primer_mes: OK' || E'\n';

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM resumen_sedes((date_trunc('month', v_hoy)::date + interval '1 month')::date); RAISE EXCEPTION 'T5 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Ese mes todavía no llega%' THEN RAISE EXCEPTION 'T5 error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T5 mes futuro rechazado: OK' || E'\n';

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM resumen_sedes(); RAISE EXCEPTION 'T8 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T8 error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T8 sin sesión no puede: OK' || E'\n';

  RAISE EXCEPTION E'PRUEBA TERMINADA (todo se revierte)\n%', r;
END $$;
