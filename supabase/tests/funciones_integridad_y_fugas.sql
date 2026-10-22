-- Prueba de 20261022124000_funciones_integridad_y_fugas. SOLO para un proyecto de PRUEBA.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte. Cada linea debe terminar en OK.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); uw uuid := gen_random_uuid();
  us uuid := gen_random_uuid(); un uuid := gen_random_uuid();
  CA text; CB text; CC text; CW text; CS text; CN text;
  ia uuid := gen_random_uuid(); ib uuid := gen_random_uuid(); da uuid := gen_random_uuid(); db uuid := gen_random_uuid();
  oa uuid := gen_random_uuid(); oc uuid := gen_random_uuid(); op uuid := gen_random_uuid();
  j json; jb jsonb; v text; n numeric; n2 numeric; msg text; vid uuid; k int; sub subscriptions%ROWTYPE;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Fuga A','fuga-a','fa.test'),(rb,'Fuga B','fuga-b','fb.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Fuga A', ra),('Fuga B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@fa.test'),(ub,'authenticated','authenticated','b@fb.test'),
    (uc,'authenticated','authenticated','c@fa.test'),(uw,'authenticated','authenticated','w@fa.test'),(us,'authenticated','authenticated','s@plat.test'),
    (un,'authenticated','authenticated','n@sin-perfil.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (ua,'admin','Admin A','a@fa.test',ra,true),(ub,'admin','Admin B','b@fb.test',rb,true),
    (uc,'cashier','Cajero A','c@fa.test',ra,true),(uw,'waiter','Mesero A','w@fa.test',ra,true),(us,'super_admin','Dueño','s@plat.test',NULL,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=EXCLUDED.active, full_name=EXCLUDED.full_name;
  DELETE FROM profiles WHERE id = un;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';
  CC := '{"role":"authenticated","sub":"'||uc||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}';
  CS := '{"role":"authenticated","aal":"aal2","sub":"'||us||'"}'; CN := '{"role":"authenticated","sub":"'||un||'"}';

  INSERT INTO planes (id, nombre, precio_mensual_cop, max_mesas, disponible, orden) VALUES ('emprende','Esencial',160000,15,true,1),('pro','Pro',260000,NULL,true,2)
    ON CONFLICT (id) DO UPDATE SET precio_mensual_cop=EXCLUDED.precio_mensual_cop, max_mesas=EXCLUDED.max_mesas, disponible=true;
  INSERT INTO platform_settings (clave, valor) VALUES ('anual_meses',10.5),('iva_pct',19),('recurrente_pct',10) ON CONFLICT (clave) DO NOTHING;
  INSERT INTO subscriptions (restaurant_id, plan, status, ciclo, is_promo, amount_in_cents) VALUES (ra,'emprende','trialing','mensual',false,16000000),(rb,'emprende','trialing','mensual',false,16000000)
    ON CONFLICT (restaurant_id) DO UPDATE SET plan='emprende', status='trialing', ciclo='mensual', is_promo=false, amount_in_cents=16000000;
  UPDATE restaurants SET is_founder=false WHERE id IN (ra, rb);
  INSERT INTO ingredientes (id, restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ia, ra, 'Queso A','kg',100,650),(ib, rb, 'SecretoB','kg',100,650);
  INSERT INTO dishes (id, restaurant_id, name, price) VALUES (da, ra, 'Plato A', 10000),(db, rb, 'Plato B', 10000);
  INSERT INTO orders (id, restaurant_id, status, total, items, customer_name, tipo_pedido) VALUES
    (oa, ra, 'completed', 10000, jsonb_build_array(jsonb_build_object('id', da::text,'name','Plato A','price',10000,'quantity',2)), 'Cliente Uno', 'LOCAL'),
    (oc, ra, 'cancelled', 10000, jsonb_build_array(jsonb_build_object('id', da::text,'name','Plato A','price',10000,'quantity',1)), 'Cliente Dos', 'LOCAL'),
    (op, ra, 'pending', 0, '[]'::jsonb, 'Cliente Tres', 'LOCAL');
  INSERT INTO detalles_pedidos (order_id, dish_id, cantidad, precio_unit, restaurant_id) VALUES (oa, da, 7, 10000, ra);

  ---------------------------------------------------------------- F-03 platos personalizados
  PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Hack','quantity',1,'ingredients',jsonb_build_object(ib::text, 1000))));
    r := r||'1) ingrediente de OTRO restaurante: FALLA (lo permitio)'||E'\n';
  EXCEPTION WHEN OTHERS THEN
    r := r||'1) ingrediente de otro restaurante rechazado sin revelar su nombre ('||sqlerrm||'): '||CASE WHEN sqlerrm NOT ILIKE '%SecretoB%' THEN 'OK' ELSE 'FALLA' END||E'\n';
  END;
  BEGIN
    PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Hack','quantity',1,'ingredients',jsonb_build_object(ib::text, 5))));
    r := r||'2) descontar stock ajeno: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'2) descontar stock ajeno rechazado: '||CASE WHEN true THEN 'OK' END||E'\n'; END;
  RESET ROLE;
  SELECT stock_actual INTO n FROM ingredientes WHERE id = ib;
  r := r||'3) stock del otro restaurante intacto ('||n||'): '||CASE WHEN n = 100 THEN 'OK' ELSE 'FALLA' END||E'\n';

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Neg','quantity',1,'ingredients',jsonb_build_object(ia::text, -5))));
    r := r||'4) cantidad de ingrediente negativa: FALLA (lo permitio)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'4) cantidad de ingrediente negativa rechazada: OK'||E'\n'; END;
  RESET ROLE; SELECT stock_actual INTO n FROM ingredientes WHERE id = ia;
  r := r||'5) stock propio no sube con cantidad negativa ('||n||'): '||CASE WHEN n = 100 THEN 'OK' ELSE 'FALLA' END||E'\n';

  SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Q0','quantity',0,'ingredients',jsonb_build_object(ia::text, 1))));
    r := r||'6) quantity 0 en plato custom: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'6) quantity 0 en plato custom rechazada: OK'||E'\n'; END;
  BEGIN PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Q51','quantity',51,'ingredients',jsonb_build_object(ia::text, 1))));
    r := r||'7) quantity 51 en plato custom: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'7) quantity 51 en plato custom rechazada: OK'||E'\n'; END;
  BEGIN PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Vacio','quantity',1,'ingredients','{}'::jsonb)));
    r := r||'8) plato custom sin ingredientes (gratis): FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'8) plato custom sin ingredientes rechazado: OK'||E'\n'; END;

  j := crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Triple','quantity',3,'ingredients',jsonb_build_object(ia::text, 2))));
  RESET ROLE; SELECT stock_actual INTO n FROM ingredientes WHERE id = ia;
  r := r||'9) quantity 3 x 2 de ingrediente descuenta 6 (stock '||n||'): '||CASE WHEN n = 94 THEN 'OK' ELSE 'FALLA' END||E'\n';
  SELECT total INTO n FROM orders WHERE id = (j->>'order_id')::uuid;
  r := r||'10) total = precio unitario x 3 ('||n||'): '||CASE WHEN n = 3 * (ceil(round(650/0.65,2)*2/100)*100) THEN 'OK' ELSE 'FALLA' END||E'\n';
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_orden_con_custom('[]'::jsonb, jsonb_build_array(jsonb_build_object('name','Mucho','quantity',50,'ingredients',jsonb_build_object(ia::text, 5))));
    r := r||'11) stock insuficiente para quantity 50 x 5: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'11) stock insuficiente considera la cantidad pedida: OK'||E'\n'; END;
  RESET ROLE;

  ---------------------------------------------------------------- F-12
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  SELECT total_vendido INTO k FROM obtener_interacciones_platos(ra) WHERE dish_id = da;
  r := r||'12) anon no ve total_vendido ('||coalesce(k::text,'NULL')||'): '||CASE WHEN k = 0 THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  SELECT total_vendido INTO k FROM obtener_interacciones_platos(ra) WHERE dish_id = da;
  r := r||'13) admin de OTRO restaurante no ve total_vendido ('||coalesce(k::text,'NULL')||'): '||CASE WHEN k = 0 THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  SELECT total_vendido INTO k FROM obtener_interacciones_platos(ra) WHERE dish_id = da;
  r := r||'14) admin propio si ve total_vendido ('||coalesce(k::text,'NULL')||'): '||CASE WHEN k = 7 THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE;
  UPDATE restaurants SET active=false WHERE id=ra;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon; SELECT count(*) INTO k FROM obtener_interacciones_platos(ra);
  r := r||'15) restaurante inactivo no se consulta desde fuera ('||k||' filas): '||CASE WHEN k = 0 THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE; UPDATE restaurants SET active=true WHERE id=ra;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM verificar_cliente_pidio_plato(da, 'Cliente Uno'); r := r||'16) oraculo verificar_cliente_pidio_plato desde anon: FALLA (ejecuto)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'16) anon no puede usar el oraculo verificar_cliente_pidio_plato: OK'||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM verificar_cliente_pidio_plato(da, 'Cliente Uno'); r := r||'17) oraculo desde otro restaurante autenticado: FALLA'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'17) authenticated no puede usar el oraculo: OK'||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN v := reaccionar_plato(da, 'Cliente Uno', 'like'); r := r||'18) reaccionar_plato anon con pedido real sigue funcionando ('||coalesce(v,'NULL')||'): '||CASE WHEN v='like' THEN 'OK' ELSE 'FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'18) reaccionar_plato anon con pedido real: FALLA '||sqlerrm||E'\n'; END;
  BEGIN PERFORM reaccionar_plato(da, 'Cliente Dos', 'like'); r := r||'19) reaccion con pedido CANCELADO: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'19) pedido cancelado no habilita reaccionar: OK'||E'\n'; END;
  BEGIN PERFORM reaccionar_plato(db, 'Cliente Uno', 'like'); r := r||'20) reaccion a plato de otro restaurante con nombre ajeno: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'20) nombre no sirve para platos de otro restaurante: OK'||E'\n'; END;
  BEGIN PERFORM obtener_items_pedido_cliente(oa); EXCEPTION WHEN OTHERS THEN msg := sqlerrm; END;
  BEGIN PERFORM obtener_items_pedido_cliente(gen_random_uuid()); EXCEPTION WHEN OTHERS THEN v := sqlerrm; END;
  r := r||'21) pedido ajeno no editable y pedido inexistente dan el mismo mensaje: '||CASE WHEN msg IS NOT NULL AND msg = v THEN 'OK' ELSE 'FALLA ('||coalesce(msg,'NULL')||' / '||coalesce(v,'NULL')||')' END||E'\n';
  BEGIN PERFORM reservar_stock_receta(da, 1, '{}'::jsonb); r := r||'22) anon ejecuta reservar_stock_receta: FALLA'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'22) anon no ejecuta reservar_stock_receta: OK'||E'\n'; END;
  RESET ROLE;

  ---------------------------------------------------------------- F-13 elegir_plan
  PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM elegir_plan('pro','mensual'); r := r||'23) mesero elige plan: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'23) mesero no puede elegir plan: OK'||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  jb := elegir_plan('pro','mensual');
  RESET ROLE; SELECT * INTO sub FROM subscriptions WHERE restaurant_id = ra;
  r := r||'24) elegir plan no cambia el plan vigente sin pago (plan='||sub.plan||'): '||CASE WHEN sub.plan = 'emprende' THEN 'OK' ELSE 'FALLA' END||E'\n';
  r := r||'25) el monto si queda calculado ('||sub.amount_in_cents||'): '||CASE WHEN sub.amount_in_cents = 26000000 THEN 'OK' ELSE 'FALLA' END||E'\n';
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO mesas (restaurant_id, numero) SELECT ra, g FROM generate_series(1, 16) g;
    r := r||'26) elegir plan sin pagar quita el tope de mesas: FALLA (16 mesas)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'26) sin pago el tope de mesas sigue (15): OK'||E'\n'; END;
  RESET ROLE;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status) VALUES (ra, 'subscription', 'ref-pend-'||ra, sub.amount_in_cents, 'PENDING');
  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM elegir_plan('emprende','mensual'); r := r||'27) cambiar monto con pago PENDIENTE: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'27) con pago pendiente no se cambia el monto: OK'||E'\n'; END;
  BEGIN PERFORM elegir_plan('pro','mensual'); r := r||'28) repetir la misma eleccion con pago pendiente es inocuo: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'28) repetir la misma eleccion con pago pendiente: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE;
  PERFORM procesar_pago_wompi('ref-pend-'||ra, 'tx-1', 'APPROVED', sub.amount_in_cents, 'COP', 'CARD', 'a@fa.test', '{}'::jsonb);
  SELECT * INTO sub FROM subscriptions WHERE restaurant_id = ra;
  r := r||'29) pago aprobado aplica el plan elegido (plan='||sub.plan||', status='||sub.status||'): '||CASE WHEN sub.plan='pro' AND sub.plan_pendiente IS NULL AND sub.status='active' THEN 'OK' ELSE 'FALLA' END||E'\n';
  BEGIN INSERT INTO mesas (restaurant_id, numero) SELECT ra, g FROM generate_series(1, 16) g;
    r := r||'30) con el plan pagado ya no hay tope de 15: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'30) con el plan pagado ya no hay tope de 15: FALLA '||sqlerrm||E'\n'; END;

  ---------------------------------------------------------------- F-13 compras y caja
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad',-5,'precio_unitario',1000)));
    r := r||'31) compra con cantidad negativa: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'31) compra con cantidad negativa rechazada: OK'||E'\n'; END;
  BEGIN PERFORM registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad',5,'precio_unitario',-1000)));
    r := r||'32) compra con precio negativo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'32) compra con precio negativo rechazada: OK'||E'\n'; END;
  BEGIN PERFORM registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad','NaN','precio_unitario',1000)));
    r := r||'33) compra con cantidad NaN: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'33) compra con cantidad NaN rechazada: OK'||E'\n'; END;
  BEGIN PERFORM registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad',5,'precio_unitario',1000)), 'otra');
    r := r||'34) fuente de gasto invalida: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'34) fuente de gasto invalida rechazada: OK'||E'\n'; END;
  jb := registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad',5,'precio_unitario',1000)));
  RESET ROLE; SELECT fuente INTO v FROM gastos WHERE id = (jb->>'gasto_id')::uuid;
  r := r||'35) compra valida con la llamada de siempre (2 argumentos) sale de caja ('||v||'): '||CASE WHEN v='caja' AND (jb->>'total')::numeric = 5000 THEN 'OK' ELSE 'FALLA' END||E'\n';
  SET LOCAL ROLE authenticated;
  BEGIN
    jb := registrar_compra_proveedor('Prov X', jsonb_build_array(jsonb_build_object('nombre_producto','Sal','unidad','kg','cantidad',1,'precio_unitario',700)), 'propio');
    RESET ROLE; SELECT fuente||'/'||pagado_por_nombre INTO v FROM gastos WHERE id = (jb->>'gasto_id')::uuid;
    r := r||'36) compra pagada con dinero propio ('||v||'): '||CASE WHEN v='propio/Cajero A' THEN 'OK' ELSE 'FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; r := r||'36) compra pagada con dinero propio: FALLA '||sqlerrm||E'\n'; END;

  INSERT INTO cortes_caja (restaurant_id, cashier_id, fecha) VALUES (ra, ua, hoy_local());
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_base_caja(999999); r := r||'37) cajero cambia la base despues del corte: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'37) cajero no cambia la base despues del corte: OK'||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_base_caja(50000); r := r||'38) administrador si puede corregir la base tras el corte: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'38) administrador corrige la base tras el corte: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; DELETE FROM cortes_caja WHERE restaurant_id = ra;
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_base_caja(80000); r := r||'39) cajero fija la base antes del corte (flujo normal): OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'39) cajero fija la base antes del corte: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE;

  ---------------------------------------------------------------- F-14
  PERFORM set_config('request.jwt.claims', CN, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM registrar_factura_compra(gen_random_uuid(), current_date, NULL, 1000, 'x', ARRAY['zzz/foto.jpg'], false);
    r := r||'40) factura sin rol: FALLA (lo permitio)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'40) factura con rol NULL rechazada por permiso ('||sqlerrm||'): '||CASE WHEN sqlerrm = 'Sin permiso para subir facturas' THEN 'OK' ELSE 'FALLA' END||E'\n'; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM plataforma_vendedor_guardar(NULL, jsonb_build_object('tipo','vendedor','nombre','Vende Uno','codigo','VU-100','contrato_ruta','c/uno.pdf','contrato_version','v1','firmado_at','2026-01-01',
      'terminos', jsonb_build_object('recurrente_pct',150)), 'prueba');
    r := r||'41) recurrente_pct 150: FALLA (lo permitio)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'41) recurrente_pct 150 rechazado ('||sqlerrm||'): '||CASE WHEN sqlerrm ILIKE '%porcentaje%' THEN 'OK' ELSE 'FALLA' END||E'\n'; END;
  BEGIN
    vid := plataforma_vendedor_guardar(NULL, jsonb_build_object('tipo','vendedor','nombre','Vende Dos','codigo','VU-200','contrato_ruta','c/dos.pdf','contrato_version','v1','firmado_at','2026-01-01',
      'terminos', jsonb_build_object('recurrente_pct',12,'recurrente_meses',12,'bono_meses',1)), 'prueba');
    r := r||'42) terminos validos se guardan: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'42) terminos validos se guardan: FALLA '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_guardar_plan('pro', '{"precio_mensual_cop": 5}'::jsonb, 'prueba'); r := r||'43) plan con precio de 5 pesos: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'43) plan con precio de 5 pesos rechazado: OK'||E'\n'; END;
  BEGIN PERFORM plataforma_guardar_plan('pro', '{"max_mesas": -3}'::jsonb, 'prueba'); r := r||'44) plan con tope de mesas negativo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'44) plan con tope de mesas negativo rechazado: OK'||E'\n'; END;
  BEGIN PERFORM plataforma_guardar_plan('pro', '{"precio_mensual_cop": 270000, "max_mesas": 40}'::jsonb, 'prueba'); r := r||'45) plan con valores razonables se guarda: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'45) plan con valores razonables: FALLA '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_settings_guardar('anual_meses', 50, 'prueba'); r := r||'46) anual_meses = 50: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'46) anual_meses = 50 rechazado: OK'||E'\n'; END;
  BEGIN PERFORM plataforma_settings_guardar('recurrente_pct', 10, 'prueba'); r := r||'47) condicion valida se guarda: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'47) condicion valida: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE;

  ---------------------------------------------------------------- registrar_lead
  SET LOCAL ROLE service_role;
  jb := registrar_lead('Dueña Real', '3001234567', NULL, NULL, NULL, NULL, 'otro', 'Quiere probar el sistema', NULL, NULL);
  jb := registrar_lead('Intruso', '3001234567', 'Resto Falso', 'Bogota', NULL, 12, 'pro', 'Texto del intruso', NULL, NULL);
  RESET ROLE;
  SELECT nombre||'|'||coalesce(resumen,'')||'|'||coalesce(restaurante,'')||'|'||coalesce(ciudad,'')||'|'||coalesce(interes,'') INTO v FROM leads WHERE whatsapp = '573001234567';
  r := r||'48) lead existente no se pisa, solo se completa ('||v||'): '||CASE WHEN v = 'Dueña Real|Quiere probar el sistema|Resto Falso|Bogota|pro' THEN 'OK' ELSE 'FALLA' END||E'\n';
  SET LOCAL ROLE service_role;
  jb := registrar_lead('Otro', '3001234567', 'Otro Resto', 'Cali', NULL, 3, 'multisede', 'Otro texto', NULL, NULL);
  RESET ROLE;
  SELECT nombre||'|'||coalesce(restaurante,'')||'|'||coalesce(ciudad,'')||'|'||interes INTO v FROM leads WHERE whatsapp = '573001234567';
  r := r||'49) segundo intento tampoco pisa lo ya completado ('||v||'): '||CASE WHEN v = 'Dueña Real|Resto Falso|Bogota|pro' THEN 'OK' ELSE 'FALLA' END||E'\n';

  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
