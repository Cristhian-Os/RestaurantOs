-- Prueba de 20261120160000_traslados_ingredientes. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) traslado a una sede sin ese ingrediente lo crea con stock 0 y suma lo trasladado; (2) si ya existe
-- (otro uso de mayúsculas y espacios en el nombre) se suma al mismo, sin duplicar; (3) mueve exactamente la cantidad y deja historial;
-- (4) no deja el stock negativo; (5) cantidad 0 o negativa se rechaza; (6) sede de otra cuenta, el mismo sede, ingrediente
-- ajeno, admin que no es dueño y sin sesión se rechazan sin cambiar nada; (7) pasar todo el stock deja 0 (no negativo);
-- (8) el historial se ve desde origen y destino y NO desde otra cuenta; (9) el historial no se puede escribir a mano.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; j jsonb; n int; t text; s numeric;
  a1 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); a2 uuid;
  uo uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  CO text; CS text; CB text;
  ileche uuid; iazu uuid; iotro uuid; ib uuid;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uo,'authenticated','authenticated','dueno@traslado-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (us,'authenticated','authenticated','admin2@traslado-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','dueno@traslado-b.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES
    (a1,'Traslado A1','traslado-a1','trasladoa1.test','premium',true),
    (b1,'Traslado B1','traslado-b1','trasladob1.test','premium',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uo,'admin','Dueño A','dueno@traslado-a.test',a1),(ub,'admin','Dueño B','dueno@traslado-b.test',b1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  UPDATE restaurants SET owner_id = ub WHERE id = b1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active'),(b1,'premium','active');
  CO := '{"role":"authenticated","sub":"'||uo||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';

  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Traslado A2'); a2 := (j->>'restaurant_id')::uuid;
  RESET ROLE;
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'admin','Admin A2','admin2@traslado-a.test',a2)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;

  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario) VALUES (a1,'Leche','litro',10,2,3000) RETURNING id INTO ileche;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo) VALUES (a1,'Azúcar','kg',4,1) RETURNING id INTO iazu;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual) VALUES (a2,'Sal','kg',9) RETURNING id INTO iotro;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual) VALUES (b1,'Leche','litro',50) RETURNING id INTO ib;

  -- 1 y 3: traslado a sede sin el ingrediente
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := trasladar_ingrediente(a2, ileche, 3, '  para el fin de semana ');
  RESET ROLE;
  SELECT stock_actual INTO s FROM ingredientes WHERE id = ileche;
  IF s <> 7 THEN RAISE EXCEPTION 'T1 origen debía quedar en 7 y quedó %', s; END IF;
  SELECT stock_actual INTO s FROM ingredientes WHERE restaurant_id = a2 AND nombre = 'Leche';
  IF s IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'T1 destino debía tener 3 y tiene %', s; END IF;
  IF (j->>'creado_en_destino')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T1 debía marcar creado_en_destino'; END IF;
  SELECT count(*) INTO n FROM traslados_ingredientes WHERE origen_id = a1 AND destino_id = a2 AND cantidad = 3 AND nota = 'para el fin de semana';
  IF n <> 1 THEN RAISE EXCEPTION 'T3 historial debía tener 1 fila y tiene %', n; END IF;
  r := r || 'T1 crea en destino y mueve la cantidad: OK' || E'\n';

  -- 2: ya existe con otro uso de mayúsculas/espacios
  UPDATE ingredientes SET nombre = '  LECHE ' WHERE restaurant_id = a2 AND nombre = 'Leche';
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := trasladar_ingrediente(a2, ileche, 2, NULL);
  RESET ROLE;
  SELECT count(*) INTO n FROM ingredientes WHERE restaurant_id = a2 AND lower(btrim(nombre)) = 'leche';
  IF n <> 1 THEN RAISE EXCEPTION 'T2 no debía duplicar: hay % filas', n; END IF;
  SELECT stock_actual INTO s FROM ingredientes WHERE restaurant_id = a2 AND lower(btrim(nombre)) = 'leche';
  IF s <> 5 THEN RAISE EXCEPTION 'T2 destino debía tener 5 y tiene %', s; END IF;
  IF (j->>'creado_en_destino')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'T2 no debía crear'; END IF;
  r := r || 'T2 reutiliza el existente sin duplicar: OK' || E'\n';

  -- 4, 5, 6: rechazos que no cambian nada
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM trasladar_ingrediente(a2, ileche, 5.01, NULL); RAISE EXCEPTION 'T4 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'No hay suficiente stock%' THEN RAISE EXCEPTION 'T4 error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(a2, ileche, 0, NULL); RAISE EXCEPTION 'T5a debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'La cantidad debe ser mayor que 0%' THEN RAISE EXCEPTION 'T5a error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(a2, ileche, -1, NULL); RAISE EXCEPTION 'T5b debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'La cantidad debe ser mayor que 0%' THEN RAISE EXCEPTION 'T5b error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(b1, ileche, 1, NULL); RAISE EXCEPTION 'T6a debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Solo el dueño de la cuenta%' THEN RAISE EXCEPTION 'T6a error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(a1, ileche, 1, NULL); RAISE EXCEPTION 'T6b debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Elige una sede distinta%' THEN RAISE EXCEPTION 'T6b error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(a2, ib, 1, NULL); RAISE EXCEPTION 'T6c debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Ingrediente no encontrado%' THEN RAISE EXCEPTION 'T6c error raro: %', SQLERRM; END IF; END;
  BEGIN PERFORM trasladar_ingrediente(a2, iotro, 1, NULL); RAISE EXCEPTION 'T6d debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Ingrediente no encontrado%' THEN RAISE EXCEPTION 'T6d error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM trasladar_ingrediente(a1, iotro, 1, NULL); RAISE EXCEPTION 'T6e debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Solo el dueño de la cuenta%' THEN RAISE EXCEPTION 'T6e error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM trasladar_ingrediente(a2, ileche, 1, NULL); RAISE EXCEPTION 'T6f debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T6f error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  SELECT stock_actual INTO s FROM ingredientes WHERE id = ileche;
  IF s <> 5 THEN RAISE EXCEPTION 'Los rechazos no debían cambiar el stock de origen: %', s; END IF;
  SELECT count(*) INTO n FROM traslados_ingredientes;
  IF n <> 2 THEN RAISE EXCEPTION 'Los rechazos no debían dejar historial: hay % filas', n; END IF;
  r := r || 'T4-T6 rechazos sin cambios: OK' || E'\n';

  -- 7: pasar todo el stock
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  PERFORM trasladar_ingrediente(a2, ileche, 5, NULL);
  RESET ROLE;
  SELECT stock_actual INTO s FROM ingredientes WHERE id = ileche;
  IF s <> 0 THEN RAISE EXCEPTION 'T7 origen debía quedar en 0 y quedó %', s; END IF;
  r := r || 'T7 pasar todo deja 0: OK' || E'\n';

  -- 8: historial visible desde origen y destino, no desde otra cuenta
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM traslados_ingredientes;
  RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'T8 el dueño en A1 debía ver 3 traslados y ve %', n; END IF;
  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM traslados_ingredientes;
  RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'T8 el admin en A2 debía ver 3 traslados (entraron) y ve %', n; END IF;
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM traslados_ingredientes;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'T8 otra cuenta no debía ver nada y ve %', n; END IF;
  r := r || 'T8 historial visible solo para sus sedes: OK' || E'\n';

  -- 9: no se escribe a mano
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO traslados_ingredientes (cuenta_id, origen_id, destino_id, origen_nombre, destino_nombre, ingrediente_nombre, unidad_medida, cantidad)
    SELECT cuenta_id, a1, a2, 'x', 'y', 'z', 'kg', 1 FROM restaurants WHERE id = a1;
    RAISE EXCEPTION 'T9 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T9 error raro: %', SQLERRM; END IF; END;
  BEGIN UPDATE traslados_ingredientes SET cantidad = 999; RAISE EXCEPTION 'T9b debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T9b error raro: %', SQLERRM; END IF; END;
  BEGIN DELETE FROM traslados_ingredientes; RAISE EXCEPTION 'T9c debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T9c error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T9 historial no se escribe a mano: OK' || E'\n';

  RAISE EXCEPTION E'PRUEBA TERMINADA (todo se revierte)\n%', r;
END $$;
