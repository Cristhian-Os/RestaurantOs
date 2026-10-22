-- Prueba de 20261022125000_politicas_rls_y_aal2. SOLO para un proyecto de PRUEBA.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte. Cada linea debe terminar en OK.
-- Hallazgos de la auditoria 2026-10-22 (seccion 3.1): S-05, S-06, S-07, S-08 y politicas por revision de pg_policies.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  us uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  uw uuid := gen_random_uuid(); uk uuid := gen_random_uuid(); uw2 uuid := gen_random_uuid(); uxs uuid := gen_random_uuid();
  S1 text; S2 text; CA text; CB text; CC text; CW text; CK text; CW2 text; CXS text;
  n int; v text; t1 uuid; t2 uuid; t3 uuid; tb uuid; g_hoy uuid; g_viejo uuid; corte uuid; rep_b uuid; rep_a uuid;
  dish_b uuid; dish_a uuid; ord_a uuid; ord_b uuid; ing_a uuid; ing_b uuid; cd uuid; stock_antes numeric; stock_despues numeric;
  fecha_bog date := (now() AT TIME ZONE 'America/Bogota')::date; j json;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Rls A','rls-a','ra.test'),(rb,'Rls B','rls-b','rb.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Rls A', ra),('Rls B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (us,'authenticated','authenticated','dueno@rls.test'),(ua,'authenticated','authenticated','a@ra.test'),(ub,'authenticated','authenticated','b@rb.test'),
    (uc,'authenticated','authenticated','c@ra.test'),(uw,'authenticated','authenticated','w@ra.test'),(uk,'authenticated','authenticated','k@ra.test'),
    (uw2,'authenticated','authenticated','w2@rb.test'),(uxs,'authenticated','authenticated','xs@rls.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (us,'super_admin','Dueno','dueno@rls.test',NULL,true),(uxs,'super_admin','Dueno inactivo','xs@rls.test',NULL,false),
    (ua,'admin','Admin A','a@ra.test',ra,true),(ub,'admin','Admin B','b@rb.test',rb,true),
    (uc,'cashier','Cajero A','c@ra.test',ra,true),(uw,'waiter','Mesero A','w@ra.test',ra,true),
    (uk,'kitchen','Cocina A','k@ra.test',ra,true),(uw2,'waiter','Mesero B','w2@rb.test',rb,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=EXCLUDED.active, full_name=EXCLUDED.full_name;
  S1 := '{"role":"authenticated","sub":"'||us||'","aal":"aal1"}'; S2 := '{"role":"authenticated","sub":"'||us||'","aal":"aal2"}';
  CXS := '{"role":"authenticated","sub":"'||uxs||'","aal":"aal2"}';
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';
  CC := '{"role":"authenticated","sub":"'||uc||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}';
  CK := '{"role":"authenticated","sub":"'||uk||'"}'; CW2 := '{"role":"authenticated","sub":"'||uw2||'"}';

  -- Datos base (como propietario, sin RLS)
  INSERT INTO mesas (numero, restaurant_id) VALUES (91, ra),(91, rb);
  INSERT INTO dishes (name, price, category, restaurant_id) VALUES ('Plato A', 10000, 'x', ra) RETURNING id INTO dish_a;
  INSERT INTO dishes (name, price, category, restaurant_id) VALUES ('Plato B', 10000, 'x', rb) RETURNING id INTO dish_b;
  INSERT INTO ingredientes (nombre, unidad_medida, stock_actual, restaurant_id) VALUES ('Ing B','kg',100,rb) RETURNING id INTO ing_b;
  INSERT INTO ingredientes (nombre, unidad_medida, stock_actual, restaurant_id) VALUES ('Ing A','kg',100,ra) RETURNING id INTO ing_a;
  INSERT INTO recetas (producto_id, ingrediente_id, cantidad_necesaria, restaurant_id) VALUES (dish_b, ing_b, 1, rb);
  INSERT INTO orders (user_id, status, restaurant_id, total) VALUES (uw, 'pending', ra, 10000) RETURNING id INTO ord_a;
  INSERT INTO orders (user_id, status, restaurant_id, total) VALUES (uw2, 'pending', rb, 10000) RETURNING id INTO ord_b;
  INSERT INTO cortes_caja (cashier_id, fecha, restaurant_id) VALUES (uc, fecha_bog, ra) RETURNING id INTO corte;
  INSERT INTO gastos (concepto, monto, restaurant_id, registrado_por, created_at) VALUES ('Gasto de hoy', 1000, ra, uc, now()) RETURNING id INTO g_hoy;
  INSERT INTO gastos (concepto, monto, restaurant_id, registrado_por, created_at) VALUES ('Gasto viejo', 2000, ra, uc, now() - interval '10 days') RETURNING id INTO g_viejo;
  INSERT INTO bases_caja (restaurant_id, fecha, monto, registrado_por) VALUES (ra, fecha_bog - 3, 5000, uc);
  INSERT INTO tasks (title, assigned_to, created_by, restaurant_id, status) VALUES ('Tarea uno', uw, ua, ra, 'pending') RETURNING id INTO t1;
  INSERT INTO tasks (title, assigned_to, created_by, restaurant_id, status) VALUES ('Tarea dos', uw, ua, ra, 'in_progress') RETURNING id INTO t2;
  INSERT INTO tasks (title, assigned_to, created_by, restaurant_id, status) VALUES ('Tarea tres', uw, ua, ra, 'rejected') RETURNING id INTO t3;
  INSERT INTO tasks (title, assigned_to, created_by, restaurant_id, status) VALUES ('Tarea B', uw2, ub, rb, 'in_progress') RETURNING id INTO tb;
  INSERT INTO ai_reports (restaurant_id, tipo, periodo_desde, periodo_hasta, datos, estado) VALUES (rb,'semanal',current_date-7,current_date,'{}','ok') RETURNING id INTO rep_b;
  INSERT INTO ai_reports (restaurant_id, tipo, periodo_desde, periodo_hasta, datos, estado) VALUES (ra,'semanal',current_date-7,current_date,'{}','ok') RETURNING id INTO rep_a;

  -- ===== S-05: is_super_admin exige aal2 =====
  PERFORM set_config('request.jwt.claims', S1, true); SET LOCAL ROLE authenticated;
  r := r||'1) S-05 super_admin con sesion aal1: is_super_admin() = '||is_super_admin()||CASE WHEN NOT is_super_admin() THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM mesas WHERE restaurant_id = ra;
  r := r||'2) S-05 aal1 ya no lee mesas de un restaurante ajeno (politica OR is_super_admin): '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM profiles WHERE id = us;
  r := r||'3) S-05 aal1 sigue leyendo su propio perfil (login): '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  BEGIN UPDATE profiles SET full_name='Dueno Editado' WHERE id = us; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'4) S-05 aal1 edita su propio nombre: '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'4) S-05 aal1 edita su propio nombre: FALLA '||sqlerrm||E'\n'; END;
  BEGIN PERFORM get_platform_overview(); r := r||'5) S-05 panel de plataforma con aal1: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'5) S-05 panel de plataforma con aal1 rechazado (ya lo exigia la funcion): OK'||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', S2, true); SET LOCAL ROLE authenticated;
  r := r||'6) S-05 super_admin con aal2: is_super_admin() = '||is_super_admin()||CASE WHEN is_super_admin() THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM mesas WHERE restaurant_id IN (ra, rb);
  r := r||'7) S-05 aal2 lee las mesas de todos los restaurantes: '||n||CASE WHEN n=2 THEN ': OK' ELSE ': FALLA' END||E'\n';
  PERFORM get_platform_overview(); r := r||'8) S-05 panel de plataforma con aal2: OK'||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CXS, true); SET LOCAL ROLE authenticated;
  r := r||'9) S-05 super_admin inactivo con aal2: '||is_super_admin()||CASE WHEN NOT is_super_admin() THEN ': OK' ELSE ': FALLA' END||E'\n';
  -- Sin JWT (migraciones, service_role, cron): no hay usuario, no es super_admin ni se rompe nada.
  RESET ROLE; PERFORM set_config('request.jwt.claims', '{}', true);
  r := r||'10) S-05 sin JWT: is_super_admin() = '||is_super_admin()||CASE WHEN NOT is_super_admin() THEN ': OK' ELSE ': FALLA' END||E'\n';

  -- ===== S-06: cajero =====
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO gastos (concepto, monto) VALUES ('Gasto nuevo del cajero', 500); r := r||'11) S-06 cajero registra un gasto: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'11) S-06 cajero registra un gasto: FALLA '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO gastos (concepto, monto, restaurant_id) VALUES ('Gasto en otro restaurante', 500, rb); r := r||'12) S-06 cajero registra gasto en otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'12) S-06 cajero registra gasto en otro restaurante rechazado: OK'||E'\n'; END;
  SELECT count(*) INTO n FROM gastos; r := r||'13) S-06 cajero lee los gastos de su restaurante: '||n||CASE WHEN n>=3 THEN ': OK' ELSE ': FALLA' END||E'\n';
  BEGIN INSERT INTO gastos (concepto, monto, created_at) VALUES ('Gasto con fecha vieja', 500, now() - interval '3 hours');
    r := r||'14) S-06 cajero registra gasto retroactivo en un dia con corte: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'14) S-06 cajero registra gasto retroactivo en un dia con corte rechazado: OK'||E'\n'; END;
  BEGIN UPDATE gastos SET monto = 1 WHERE id = g_hoy; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'15) S-06 cajero edita gasto de un dia con corte: filas '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'15) S-06 cajero edita gasto de un dia con corte rechazado: OK'||E'\n'; END;
  BEGIN DELETE FROM gastos WHERE id = g_hoy; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'16) S-06 cajero borra gasto de un dia con corte: FALLA ('||n||')'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'16) S-06 cajero borra gasto de un dia con corte rechazado: OK'||E'\n'; END;
  BEGIN UPDATE gastos SET monto = 2500 WHERE id = g_viejo; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'17) S-06 cajero corrige gasto de un dia sin corte: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'17) S-06 cajero corrige gasto de un dia sin corte: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE gastos SET created_at = now() - interval '20 days', restaurant_id = rb WHERE id = g_viejo;
    r := r||'18) S-06 cajero mueve gasto a otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'18) S-06 cajero mueve gasto a otro restaurante rechazado: OK'||E'\n'; END;
  -- Cortes
  BEGIN UPDATE cortes_caja SET total_efectivo = 1 WHERE id = corte; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'19) S-06 cajero reescribe totales del corte: FALLA ('||n||')'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'19) S-06 cajero reescribe totales del corte rechazado: OK'||E'\n'; END;
  BEGIN UPDATE cortes_caja SET restaurant_id = rb WHERE id = corte;
    r := r||'20) S-06 cajero mueve el corte a otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'20) S-06 cajero mueve el corte a otro restaurante rechazado: OK'||E'\n'; END;
  BEGIN UPDATE cortes_caja SET denominaciones = '[{"valor":1000,"cantidad":2}]'::jsonb WHERE id = corte; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'21) S-06 cajero guarda el conteo (denominaciones) del corte: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'21) S-06 cajero guarda el conteo del corte: FALLA '||sqlerrm||E'\n'; END;
  BEGIN DELETE FROM cortes_caja WHERE id = corte; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'22) S-06 cajero borra el corte: filas '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'22) S-06 cajero borra el corte rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO cortes_caja (cashier_id, fecha, restaurant_id, total_efectivo) VALUES (uc, fecha_bog - 1, ra, 999999);
    r := r||'23) S-06 cajero fabrica un corte por INSERT directo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'23) S-06 cajero fabrica un corte por INSERT directo rechazado: OK'||E'\n'; END;
  SELECT count(*) INTO n FROM cortes_caja; r := r||'24) S-06 cajero lee los cortes: '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  -- Bases
  SELECT count(*) INTO n FROM bases_caja; r := r||'25) S-06 cajero lee las bases de caja: '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  BEGIN UPDATE bases_caja SET monto = 1 WHERE restaurant_id = ra; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'26) S-06 cajero edita una base por UPDATE directo: filas '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'26) S-06 cajero edita una base por UPDATE directo rechazado: OK'||E'\n'; END;
  BEGIN DELETE FROM bases_caja WHERE restaurant_id = ra; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'27) S-06 cajero borra bases: filas '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'27) S-06 cajero borra bases rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO bases_caja (restaurant_id, fecha, monto) VALUES (ra, fecha_bog - 1, 99999999);
    r := r||'28) S-06 cajero inserta una base directa: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'28) S-06 cajero inserta una base directa rechazado: OK'||E'\n'; END;
  -- Su flujo real (RPC) sigue funcionando
  BEGIN j := registrar_base_caja(7000); r := r||'29) S-06 cajero registra la base por RPC: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'29) S-06 cajero registra la base por RPC: FALLA '||sqlerrm||E'\n'; END;
  BEGIN j := hacer_corte_caja(NULL); r := r||'30) S-06 cajero hace el corte por RPC: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'30) S-06 cajero hace el corte por RPC: FALLA '||sqlerrm||E'\n'; END;
  SELECT count(*) INTO n FROM cortes_caja WHERE fecha = fecha_bog;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE cortes_caja SET denominaciones = '[{"valor":2000,"cantidad":1}]'::jsonb WHERE id = (SELECT id FROM cortes_caja WHERE fecha = fecha_bog AND restaurant_id = ra); GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'31) S-06 cajero guarda el conteo del corte recien hecho: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'31) S-06 cajero guarda el conteo del corte recien hecho: FALLA '||sqlerrm||E'\n'; END;
  -- Admin conserva todo
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE gastos SET monto = 1234 WHERE id = g_hoy; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'32) S-06 admin edita gasto de un dia con corte: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'32) S-06 admin edita gasto de un dia con corte: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE cortes_caja SET notas = 'ajuste admin' WHERE id = corte; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'33) S-06 admin ajusta el corte: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'33) S-06 admin ajusta el corte: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE bases_caja SET monto = 6000 WHERE restaurant_id = ra AND fecha = fecha_bog - 3; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'34) S-06 admin edita una base: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'34) S-06 admin edita una base: FALLA '||sqlerrm||E'\n'; END;
  BEGIN DELETE FROM cortes_caja WHERE id = corte; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'35) S-06 admin borra un corte: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'35) S-06 admin borra un corte: FALLA '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO bases_caja (restaurant_id, fecha, monto) VALUES (ra, fecha_bog - 5, 1000);
    r := r||'36) S-06 admin inserta una base: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'36) S-06 admin inserta una base: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE cortes_caja SET notas = 'x' WHERE restaurant_id = ra; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'37) S-06 admin de otro restaurante no toca los cortes de A: filas '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'37) S-06 admin de otro restaurante no toca los cortes de A rechazado: OK'||E'\n'; END;

  -- ===== S-07: tareas =====
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE tasks SET restaurant_id = rb WHERE id = t2; r := r||'38) S-07 empleado mueve su tarea a otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'38) S-07 empleado mueve su tarea a otro restaurante rechazado: OK'||E'\n'; END;
  BEGIN UPDATE tasks SET status = 'completed' WHERE id = t2; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'39) S-07 empleado completa sin evidencia: '||CASE WHEN n=0 THEN 'filas 0: OK' ELSE 'FALLA (filas '||n||')' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'39) S-07 empleado completa sin evidencia rechazado: OK'||E'\n'; END;
  BEGIN UPDATE tasks SET title = 'Cambiada por el empleado', priority = 'low', due_date = now() + interval '30 days' WHERE id = t2;
    r := r||'40) S-07 empleado reescribe titulo/prioridad/fecha de su tarea: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'40) S-07 empleado reescribe titulo/prioridad/fecha rechazado: OK'||E'\n'; END;
  BEGIN UPDATE tasks SET created_by = uw WHERE id = t2; r := r||'41) S-07 empleado cambia created_by: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'41) S-07 empleado cambia created_by rechazado: OK'||E'\n'; END;
  BEGIN UPDATE tasks SET status = 'in_progress' WHERE id = t1 AND status IN ('pending','rejected'); GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'42) S-07 empleado inicia su tarea pendiente: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'42) S-07 empleado inicia su tarea pendiente: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE tasks SET status = 'in_progress' WHERE id = t3 AND status IN ('pending','rejected'); GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'43) S-07 empleado reintenta su tarea rechazada: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'43) S-07 empleado reintenta su tarea rechazada: FALLA '||sqlerrm||E'\n'; END;
  -- complete_task_with_evidence valida ruta y URL
  BEGIN PERFORM complete_task_with_evidence(t2, 'javascript:alert(1)', uw||'/'||t2||'/1.jpg', NULL); r := r||'44) S-07 evidencia con URL javascript: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'44) S-07 evidencia con URL javascript: rechazada: OK'||E'\n'; END;
  BEGIN PERFORM complete_task_with_evidence(t2, 'https://x.test/a.jpg', ub||'/'||tb||'/1.jpg', NULL); r := r||'45) S-07 evidencia con ruta de otro usuario/restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'45) S-07 evidencia con ruta de otro usuario: rechazada: OK'||E'\n'; END;
  BEGIN PERFORM complete_task_with_evidence(t2, uw||'/'||t2||'/../'||ub||'/x.jpg', uw||'/'||t2||'/../'||ub||'/x.jpg', NULL); r := r||'46) S-07 evidencia con ../ : FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'46) S-07 evidencia con ../ : rechazada: OK'||E'\n'; END;
  BEGIN PERFORM complete_task_with_evidence(t2, 'https://evil.test/x.jpg', uw||'/'||t2||'/1.jpg', NULL); r := r||'47) S-07 evidencia con URL ajena al bucket: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'47) S-07 evidencia con URL ajena al bucket: rechazada: OK'||E'\n'; END;
  BEGIN PERFORM complete_task_with_evidence(t2, uw||'/'||t2||'/1.jpg', uw||'/'||t2||'/1.jpg', 'listo');
    SELECT status INTO v FROM tasks WHERE id = t2; r := r||'48) S-07 evidencia valida (frontend nuevo: ruta): estado '||v||CASE WHEN v='completed' THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'48) S-07 evidencia valida (ruta): FALLA '||sqlerrm||E'\n'; END;
  BEGIN PERFORM complete_task_with_evidence(t1, 'https://abc.supabase.co/storage/v1/object/public/task-evidence/'||uw||'/'||t1||'/2.jpg', uw||'/'||t1||'/2.jpg', NULL);
    SELECT status INTO v FROM tasks WHERE id = t1; r := r||'49) S-07 evidencia valida (frontend viejo: URL publica): estado '||v||CASE WHEN v='completed' THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'49) S-07 evidencia valida (URL publica vieja): FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE tasks SET status = 'rejected', title = 'Revisar de nuevo' WHERE id = t1; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'50) S-07 admin rechaza y edita tareas de su restaurante: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'50) S-07 admin edita tareas: FALLA '||sqlerrm||E'\n'; END;

  -- ===== S-08: ai_report_feedback =====
  BEGIN INSERT INTO ai_report_feedback (report_id, hallazgo_idx, util) VALUES (rep_b, 0, true);
    r := r||'51) S-08 admin A opina sobre un reporte de B: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'51) S-08 admin A opina sobre un reporte de B rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO ai_report_feedback (report_id, hallazgo_idx, util) VALUES (rep_a, 0, true);
    r := r||'52) S-08 admin A opina sobre un reporte propio: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'52) S-08 admin A opina sobre un reporte propio: FALLA '||sqlerrm||E'\n'; END;

  -- ===== Otras politicas =====
  -- detalles_pedidos: un empleado inserta un detalle de un plato/pedido de OTRO restaurante y el trigger (definer) le baja el stock.
  RESET ROLE; SELECT stock_actual INTO stock_antes FROM ingredientes WHERE id = ing_b;
  PERFORM set_config('request.jwt.claims', CK, true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO detalles_pedidos (order_id, dish_id, cantidad, precio_unit) VALUES (ord_b, dish_b, 10, 1);
    r := r||'53) detalles_pedidos con pedido/plato de otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'53) detalles_pedidos con pedido/plato de otro restaurante rechazado: OK'||E'\n'; END;
  RESET ROLE; SELECT stock_actual INTO stock_despues FROM ingredientes WHERE id = ing_b;
  r := r||'54) stock del restaurante B intacto: '||stock_antes||' -> '||stock_despues||CASE WHEN stock_antes = stock_despues THEN ': OK' ELSE ': FALLA' END||E'\n';
  PERFORM set_config('request.jwt.claims', CK, true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO detalles_pedidos (order_id, dish_id, cantidad, precio_unit) VALUES (ord_a, dish_a, 1, 1);
    r := r||'55) detalles_pedidos propio (pedido y plato del mismo restaurante): OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'55) detalles_pedidos propio: FALLA '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO custom_dishes (name, created_by, order_id) VALUES ('Plato raro', uk, ord_b);
    r := r||'56) custom_dishes con pedido de otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'56) custom_dishes con pedido de otro restaurante rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO custom_dishes (name, created_by, order_id) VALUES ('Plato propio', uk, ord_a) RETURNING id INTO cd;
    r := r||'57) custom_dishes propio: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'57) custom_dishes propio: FALLA '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad) VALUES (cd, ing_b, 1);
    r := r||'58) custom_dish_ingredients con ingrediente de otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'58) custom_dish_ingredients con ingrediente de otro restaurante rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad) VALUES (cd, ing_a, 1);
    r := r||'59) custom_dish_ingredients propio: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'59) custom_dish_ingredients propio: FALLA '||sqlerrm||E'\n'; END;
  -- push_subscriptions: no se registra una suscripcion bajo otro restaurante
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO push_subscriptions (user_id, endpoint, restaurant_id) VALUES (uw, 'https://push.test/ajeno', rb);
    r := r||'60) push_subscriptions bajo otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'60) push_subscriptions bajo otro restaurante rechazado: OK'||E'\n'; END;
  BEGIN INSERT INTO push_subscriptions (user_id, endpoint) VALUES (uw, 'https://push.test/propio');
    r := r||'61) push_subscriptions propia: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'61) push_subscriptions propia: FALLA '||sqlerrm||E'\n'; END;
  -- Un mesero sigue pudiendo cambiar el estado de una mesa propia y no la de otro restaurante
  BEGIN UPDATE mesas SET estado = 'ocupada' WHERE restaurant_id = ra; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'62) mesero actualiza mesa propia: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'62) mesero actualiza mesa propia: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE mesas SET restaurant_id = rb WHERE restaurant_id = ra; r := r||'63) mesero mueve mesa a otro restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'63) mesero mueve mesa a otro restaurante rechazado: OK'||E'\n'; END;
  RESET ROLE;
  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
