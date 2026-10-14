-- Prueba del asistente de configuracion (migracion 20261014190000). SOLO para un proyecto de PRUEBA.
-- Crea 2 restaurantes con su admin y un mesero; comprueba cargas en lote, aislamiento, rol e idempotencia.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uw uuid := gen_random_uuid();
  j jsonb; n int; cats jsonb;
  CA text; CB text; CW text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Onb A','onb-a','onba.test'),(rb,'Onb B','onb-b','onbb.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Onb A', ra),('Onb B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@onba.test'),(ub,'authenticated','authenticated','b@onbb.test'),(uw,'authenticated','authenticated','w@onba.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'admin','Admin A','a@onba.test',ra),(ub,'admin','Admin B','b@onbb.test',rb),(uw,'waiter','Mesero A','w@onba.test',ra)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}';

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  n := crear_mesas(6); r := r||'1) crear_mesas(6): '||n||' (esperado 6)'||E'\n';
  n := crear_mesas(8); r := r||'2) crear_mesas(8) sin duplicar: '||n||' (esperado 8)'||E'\n';
  BEGIN PERFORM crear_mesas(500); r := r||'3) crear_mesas(500): FALLA'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'3) 500 mesas rechazado: '||sqlerrm||E'\n'; END;
  j := importar_proveedores('[{"nombre":"Lacteos del Valle","telefono":"3001112222","correo":"v@x.co","producto":"leche"},{"nombre":"Frutas Don Pepe"},{"nombre":""}]'::jsonb);
  r := r||'4) proveedores: '||j::text||' (esperado creados 2)'||E'\n';
  j := importar_proveedores('[{"nombre":"lacteos del valle"}]'::jsonb);
  r := r||'5) reimportar mismo proveedor: '||j::text||' (esperado existentes 1, creados 0)'||E'\n';
  j := importar_ingredientes('[{"nombre":"Leche","unidad":"litros","stock_actual":"10","stock_minimo":"2","costo_unitario":"3500","proveedor":"Lacteos del Valle"},{"nombre":"Fresa","unidad":"kg","costo_unitario":"9000","proveedor":"Nadie"},{"nombre":"Cono","unidad":"cajas"},{"nombre":"Azucar","unidad":"kg","stock_actual":"abc"},{"nombre":"Crema","unidad":"litro","stock_actual":"-5"}]'::jsonb);
  r := r||'6) ingredientes: '||j::text||' (esperado creados 2, 3 errores, 1 proveedor no encontrado)'||E'\n';
  j := importar_ingredientes('[{"nombre":"leche","unidad":"litro"}]'::jsonb);
  r := r||'7) reimportar ingrediente: '||(j->>'creados')||' creados, '||(j->>'existentes')||' existentes (esperado 0/1)'||E'\n';
  j := importar_menu('[{"nombre":"Cholado clasico","categoria":"Heladeria","precio":"12000","descripcion":"Con fruta y leche condensada"},{"nombre":"Malteada","categoria":"bebida","precio":"9000"},{"nombre":"Mal","categoria":"Postre","precio":"x"},{"nombre":"A","precio":"1"},{"nombre":"Gratis","precio":"-1"}]'::jsonb);
  r := r||'8) menu: '||j::text||' (esperado creados 2, 3 errores)'||E'\n';
  SELECT modules_enabled->'categories' INTO cats FROM restaurant_config WHERE restaurant_id=ra;
  r := r||'9) categoria nueva creada y las base conservadas: '||(SELECT count(*) FROM jsonb_array_elements(cats) x WHERE x->>'value' IN ('heladeria','bebida'))||' de 2, total '||jsonb_array_length(cats)||' (esperado 2 y 6)'||E'\n';
  j := importar_menu('[{"nombre":"CHOLADO CLASICO","precio":"1"}]'::jsonb);
  r := r||'10) reimportar plato: creados '||(j->>'creados')||', existentes '||(j->>'existentes')||' (esperado 0/1)'||E'\n';

  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_mesas(3); r := r||'11) mesero crea mesas: FALLA'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'11) mesero rechazado: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM importar_menu('[{"nombre":"Intruso","precio":"1"}]'::jsonb); r := r||'12) mesero importa menu: FALLA'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'12) mesero rechazado en menu'||E'\n'; END;

  RESET ROLE; PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  n := crear_mesas(2);
  r := r||'13) admin B ve solo lo suyo: mesas B='||(SELECT count(*) FROM mesas)||', platos B='||(SELECT count(*) FROM dishes)||', ingredientes B='||(SELECT count(*) FROM ingredientes)||', proveedores B='||(SELECT count(*) FROM proveedores)||' (esperado 2/0/0/0)'||E'\n';
  INSERT INTO restaurant_onboarding (current_step, steps_done) VALUES (3, '{"1":true}');
  r := r||'14) admin B guarda su progreso: '||(SELECT current_step FROM restaurant_onboarding)||' (esperado 3)'||E'\n';

  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  r := r||'15) admin A no ve el progreso de B: filas='||(SELECT count(*) FROM restaurant_onboarding)||' (esperado 0)'||E'\n';

  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM crear_mesas(1); r := r||'16) anonimo crea mesas: FALLA'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'16) anonimo sin permiso (bien)'||E'\n'; END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
