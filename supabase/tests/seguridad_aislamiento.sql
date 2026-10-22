-- Prueba del Bloque 3 (seguridad), migración 20261016000001. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) anon no lee pedidos ni configuración; (2) un usuario de A no toca datos de B;
-- (3) un mesero no llama funciones de admin; (4) anon no cobra ni cancela; (5) tomar orden y cobrar de A sigue funcionando;
-- además: funciones internas cerradas, contraseña (8 + actual), ingredientes públicos por restaurante y límite por IP.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  uc uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uk uuid := gen_random_uuid();
  CC text; CW text; CB text; CK text;
  da uuid; db uuid; ia uuid; ib uuid; ob uuid; oa uuid; j json; n int; c numeric; i int; ok boolean;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain, active) VALUES (a,'Seg A','seg-a','sega.test',true),(b,'Seg B','seg-b','segb.test',true);
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uc,'authenticated','authenticated','caja@sega.test', crypt('ClaveActual1', gen_salt('bf'))),
    (uw,'authenticated','authenticated','mesero@sega.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','caja@segb.test', crypt('ClaveActual1', gen_salt('bf'))),
    (uk,'authenticated','authenticated','cocina@segb.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uc,'cashier','Caja A','caja@sega.test',a),(uw,'waiter','Mesero A','mesero@sega.test',a),
    (ub,'cashier','Caja B','caja@segb.test',b),(uk,'kitchen','Cocina B','cocina@segb.test',b)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  CC := '{"role":"authenticated","sub":"'||uc||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}';
  CB := '{"role":"authenticated","sub":"'||ub||'"}'; CK := '{"role":"authenticated","sub":"'||uk||'"}';

  INSERT INTO dishes (restaurant_id, name, price) VALUES (a,'Plato A',10000) RETURNING id INTO da;
  INSERT INTO dishes (restaurant_id, name, price) VALUES (b,'Plato B',10000) RETURNING id INTO db;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (a,'Ing A','kg',5,1000) RETURNING id INTO ia;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (b,'Ing B','kg',5,2000) RETURNING id INTO ib;
  INSERT INTO recetas (producto_id, ingrediente_id, cantidad_necesaria, restaurant_id) VALUES (da, ia, 2, a),(db, ib, 3, b);
  INSERT INTO orders (restaurant_id, items, total, status, tipo_pedido) VALUES
    (b, jsonb_build_array(jsonb_build_object('id',db,'name','Plato B','price',10000,'quantity',1)), 10000, 'cooking','LOCAL') RETURNING id INTO ob;

  -- (1) anon no lee pedidos ni configuración
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM orders;            r := r||'(1) anon ve pedidos: '||n||' (esperado 0)'||E'\n';
  SELECT count(*) INTO n FROM restaurants;       r := r||'(1) anon ve restaurantes: '||n||' (esperado 0)'||E'\n';
  SELECT count(*) INTO n FROM restaurant_payment_config; r := r||'(1) anon ve config de pagos: '||n||' (esperado 0)'||E'\n';
  -- (4) anon no cobra ni cancela
  BEGIN PERFORM cobrar_orden(ob,'efectivo',10000,0); r := r||'(4) anon cobra (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(4) anon no cobra: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM cancelar_item_orden(ob,0); r := r||'(4) anon cancela item (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(4) anon no cancela item: '||sqlerrm||E'\n'; END;
  -- funciones internas y de trigger cerradas
  RESET ROLE;
  r := r||'internas ejecutables por authenticated: registrar_venta_stock='||has_function_privilege('authenticated','public.registrar_venta_stock(uuid)','EXECUTE')
       ||', crear_plato_custom='||has_function_privilege('authenticated','public.crear_plato_custom(uuid,text,text,jsonb)','EXECUTE')
       ||', _limite_ip='||has_function_privilege('authenticated','public._limite_ip(text,integer,integer)','EXECUTE')||' (esperado false)'||E'\n';
  r := r||'triggers ejecutables por anon: '||has_function_privilege('anon','public.handle_new_user()','EXECUTE')||'/'||has_function_privilege('anon','public.on_order_status_change()','EXECUTE')||' (esperado false/false)'||E'\n';

  -- (2) un usuario de A no toca datos de B
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cancelar_item_orden(ob,0); r := r||'(2) caja A cancela item de B (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) caja A no cancela item de B: '||sqlerrm||E'\n'; END;
  SELECT count(*) INTO n FROM orders WHERE id = ob; r := r||'(2) caja A ve pedido de B: '||n||' (esperado 0)'||E'\n';
  c := calcular_costo_receta(db); r := r||'(2) costo de receta de B visto por A: '||c||' (esperado 0)'||E'\n';
  c := calcular_costo_receta(da); r := r||'(2) costo de receta propia: '||c||' (esperado 2000)'||E'\n';
  BEGIN PERFORM registrar_venta_stock(ob); r := r||'(2) A ejecuta registrar_venta_stock (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) A no ejecuta registrar_venta_stock: '||sqlerrm||E'\n'; END;

  -- (3) un mesero no llama funciones de admin ni cobra
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM ajustar_stock_ingrediente(ia, 1); r := r||'(3) mesero ajusta stock (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) mesero no ajusta stock: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM admin_update_employee(uc, null, null, 'X'); r := r||'(3) mesero edita empleado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) mesero no edita empleados: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM cobrar_orden(ob,'efectivo',10000,0); r := r||'(3) mesero cobra (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) mesero no cobra: '||sqlerrm||E'\n'; END;

  -- (5) flujo de A: tomar orden y cobrar sigue funcionando (cobrar_orden llama a registrar_venta_stock por dentro)
  RESET ROLE; PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := crear_orden_completa(null, jsonb_build_array(jsonb_build_object('id', da, 'quantity', 1)), 'LOCAL', null, 3, 'Prueba');
  oa := (j->>'order_id')::uuid;
  RESET ROLE; UPDATE orders SET status='ready' WHERE id=oa; PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := cobrar_orden(oa, 'efectivo', 10000, 0);
  RESET ROLE;
  SELECT count(*) INTO n FROM detalles_pedidos WHERE order_id = oa;
  r := r||'(5) A toma orden y cobra: pagada='||(SELECT paid_at IS NOT NULL FROM orders WHERE id=oa)||', detalles de venta='||n||' (esperado true, 1)'||E'\n';

  -- contraseña: mínimo 8 y contraseña actual
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM change_my_password('corta', 'ClaveActual1'); r := r||'clave de 5 aceptada (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'clave corta rechazada: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM change_my_password('NuevaClave123'); r := r||'sin clave actual aceptada (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'sin clave actual rechazada: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM change_my_password('NuevaClave123', 'incorrecta'); r := r||'clave actual mala aceptada (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'clave actual mala rechazada: '||sqlerrm||E'\n'; END;
  PERFORM change_my_password('NuevaClave123', 'ClaveActual1'); r := r||'cambio con clave actual correcta: ok'||E'\n';
  RESET ROLE;
  UPDATE profiles SET must_change_password = true WHERE id = uc;
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  PERFORM change_my_password('OtraClave456'); r := r||'cambio obligatorio del primer ingreso (sin clave actual): ok'||E'\n';
  RESET ROLE;

  -- ingredientes públicos: solo los del restaurante pedido
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM ingredientes_publicos(a); r := r||'ingredientes públicos de A: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM ingredientes_publicos(gen_random_uuid()); r := r||'ingredientes de restaurante inexistente: '||n||' (esperado 0)'||E'\n';

  -- límite por IP en rutas públicas (16 reportes seguidos desde la misma IP)
  PERFORM set_config('request.headers','{"x-forwarded-for":"9.9.9.9"}',true);
  ok := true;
  FOR i IN 1..16 LOOP
    BEGIN PERFORM reportar_comentario_plato(gen_random_uuid());
    EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE '%muy rápido%' THEN ok := false; EXIT; END IF; END;
  END LOOP;
  r := r||'límite por IP corta al pasarse de 15: '||(NOT ok)||' (esperado true)'||E'\n';
  RESET ROLE;

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
