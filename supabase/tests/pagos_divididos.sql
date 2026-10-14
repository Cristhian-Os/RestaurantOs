-- Pruebas de pagos divididos y corte de caja (Bloque 1, Anexo A Parte B).
-- SOLO para un proyecto de PRUEBA (nunca producción): crea restaurantes y usuarios ficticios.
-- Requisitos: esquema de produccion restaurado + migracion 20261014160000 aplicada.
-- Uso: ejecutar el bloque "DATOS DE PRUEBA" una vez y luego cada bloque DO. Cada DO termina con
-- RAISE EXCEPTION 'TEST_OUTPUT: ...' a proposito: asi todo se revierte y el resultado sale en el mensaje.
--
-- Resultados esperados (ver comentarios "ESPERADO" en cada bloque).

-- ============================== DATOS DE PRUEBA ==============================
-- Restaurantes A y B, un cajero y un admin en A, un cajero en B.
INSERT INTO restaurants (id, name, slug, email_domain) VALUES
 ('aaaaaaaa-0000-0000-0000-00000000000a','Prueba A','prueba-a','a.prueba.test'),
 ('bbbbbbbb-0000-0000-0000-00000000000b','Prueba B','prueba-b','b.prueba.test');
INSERT INTO restaurant_config (restaurant_id, display_name) VALUES
 ('aaaaaaaa-0000-0000-0000-00000000000a','Prueba A'),('bbbbbbbb-0000-0000-0000-00000000000b','Prueba B');
INSERT INTO auth.users (id, aud, role, email) VALUES
 ('33333333-0000-0000-0000-000000000003','authenticated','authenticated','caja-a@prueba.test'),
 ('44444444-0000-0000-0000-000000000004','authenticated','authenticated','admin-a@prueba.test'),
 ('55555555-0000-0000-0000-000000000005','authenticated','authenticated','caja-b@prueba.test');
INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
 ('33333333-0000-0000-0000-000000000003','cashier','Caja A','caja-a@prueba.test','aaaaaaaa-0000-0000-0000-00000000000a'),
 ('44444444-0000-0000-0000-000000000004','admin','Admin A','admin-a@prueba.test','aaaaaaaa-0000-0000-0000-00000000000a'),
 ('55555555-0000-0000-0000-000000000005','cashier','Caja B','caja-b@prueba.test','bbbbbbbb-0000-0000-0000-00000000000b')
 ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, restaurant_id = EXCLUDED.restaurant_id;

-- ============== PRUEBA 1: la mesa de 5 personas (3 efectivo, 2 transferencia) ==============
-- ESPERADO: efectivo=60000, transferencia=27000, total=87000, propinas en efectivo=1800,
--   efectivo esperado=71800 (aporte 30000 + 60000 + 1800 - 20000 de gasto de caja; el gasto de Angela NO resta),
--   doble toque de la persona 3 => duplicado=true y 5 filas de pago, pedido en 'mixto' con propina 1800.
DO $$
DECLARE r text := ''; oid_ uuid; j json; rec record; n int;
  A constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
BEGIN
  INSERT INTO orders (restaurant_id, status, tipo_pedido, customer_name, total, items, table_num)
  VALUES (A, 'ready', 'LOCAL', 'Mesa 5 personas', 87000,
   '[{"name":"Plato P1","quantity":1,"price":18000,"comensal":"Persona 1"},{"name":"Plato P2","quantity":1,"price":15000,"comensal":"Persona 2"},{"name":"Plato P3","quantity":1,"price":22000,"comensal":"Persona 3"},{"name":"Plato P4","quantity":1,"price":12000,"comensal":"Persona 4"},{"name":"Plato P5","quantity":1,"price":20000,"comensal":"Persona 5"}]'::jsonb, 3)
  RETURNING id INTO oid_;
  PERFORM set_config('request.jwt.claims','{"role":"authenticated","sub":"33333333-0000-0000-0000-000000000003"}', true);
  SET LOCAL ROLE authenticated;
  j := registrar_pago(oid_, 'Persona 1', 'efectivo', 18000, 1800, 20000, null, 'k1'); r := r||'P1 cambio='||(j->>'cambio')||E'\n';
  j := registrar_pago(oid_, 'Persona 2', 'transferencia', 15000, 0, null, 'T123', 'k2');
  j := registrar_pago(oid_, 'Persona 3', 'efectivo', 22000, 0, 22000, null, 'k3');
  j := registrar_pago(oid_, 'Persona 3', 'efectivo', 22000, 0, 22000, null, 'k3'); r := r||'doble toque duplicado='||(j->>'duplicado')||E'\n';
  j := registrar_pago(oid_, 'Persona 4', 'transferencia', 12000, 0, null, 'T456', 'k4');
  j := registrar_pago(oid_, 'Persona 5', 'efectivo', 20000, 0, 20000, null, 'k5'); r := r||'completo='||(j->>'completo')||E'\n';
  RESET ROLE;
  SELECT payment_method, propina INTO rec FROM orders WHERE id=oid_; r := r||'pedido metodo='||rec.payment_method||' propina='||rec.propina||E'\n';
  SELECT count(*) INTO n FROM order_payments WHERE order_id=oid_; r := r||'filas de pago='||n||E'\n';
  SET LOCAL ROLE authenticated;
  j := cobrar_orden(oid_, 'mixto', null, 0);
  RESET ROLE;
  INSERT INTO gastos (restaurant_id, concepto, monto, fuente, pagado_por_nombre) VALUES (A,'Gas',50000,'propio','Angela');
  INSERT INTO gastos (restaurant_id, concepto, monto, fuente) VALUES (A,'Hielo',20000,'caja');
  SET LOCAL ROLE authenticated;
  j := registrar_aporte_caja(30000, 'Angela');
  j := hacer_corte_caja('prueba');
  r := r||'CORTE ef='||(j->>'total_efectivo')||' tr='||(j->>'total_transferencia')||' total='||(j->>'total_general')||' prop_ef='||(j->>'total_propinas_efectivo')||' esperado='||(j->>'efectivo_esperado_cajon')||E'\n';
  FOR rec IN SELECT * FROM get_corte_productos() LOOP r := r||'  prod '||rec.producto||' -> '||rec.metodo_pago||' $'||rec.subtotal||E'\n'; END LOOP;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', r;
END $$;

-- ============== PRUEBA 2: casos limite ==============
-- ESPERADO: parcial deja falta=20000 y sin paid_at; sobrepago, efectivo insuficiente, cajero de otro restaurante,
--   cajero anulando, pago a Rappi y correccion tras el corte => TODOS rechazados; admin anula => el pedido vuelve a
--   caja; cobrar_orden_inicial + cobrar_orden crean UN pago; Rappi se entrega sin crear pagos; cortesia (total 0) sin pago.
DO $$
DECLARE r text := ''; o2 uuid; o3 uuid; o4 uuid; o5 uuid; j json; rec record; n int; p2 uuid;
  A constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  CAJA_A constant text := '{"role":"authenticated","sub":"33333333-0000-0000-0000-000000000003"}';
  ADMIN_A constant text := '{"role":"authenticated","sub":"44444444-0000-0000-0000-000000000004"}';
  CAJA_B constant text := '{"role":"authenticated","sub":"55555555-0000-0000-0000-000000000005"}';
BEGIN
  INSERT INTO orders (restaurant_id, status, tipo_pedido, customer_name, total, items) VALUES (A,'ready','LOCAL','parcial',50000,'[]') RETURNING id INTO o2;
  INSERT INTO orders (restaurant_id, status, tipo_pedido, customer_name, total, items) VALUES (A,'pending','LLEVAR','cobro-inicial',10000,'[]') RETURNING id INTO o3;
  INSERT INTO orders (restaurant_id, status, tipo_pedido, customer_name, total, items, payment_method, amount_paid, paid_at) VALUES (A,'ready','RAPPI','rappi',40000,'[]','rappi',40000,now()) RETURNING id INTO o4;
  INSERT INTO orders (restaurant_id, status, tipo_pedido, customer_name, total, items) VALUES (A,'pending','LOCAL','cortesia',0,'[]') RETURNING id INTO o5;
  PERFORM set_config('request.jwt.claims', CAJA_A, true); SET LOCAL ROLE authenticated;
  j := registrar_pago(o2,'P1','efectivo',30000,0,30000,null,null); r := r||'1 parcial falta='||(j->>'falta')||' completo='||(j->>'completo')||E'\n';
  BEGIN PERFORM registrar_pago(o2,'P2','efectivo',25000,0,25000,null,null); r := r||'2 FALLA: sobrepago aceptado'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'2 ok: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM registrar_pago(o2,'P2','efectivo',20000,0,15000,null,null); r := r||'3 FALLA: efectivo insuficiente aceptado'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'3 ok: '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CAJA_B, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_pago(o2,'X','efectivo',1000,0,1000,null,null); r := r||'4 FALLA: cajero B pago pedido de A'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'4 ok: '||sqlerrm||E'\n'; END;
  SELECT count(*) INTO n FROM order_payments WHERE restaurant_id=A; r := r||'5 cajero B ve pagos de A: '||n||' (esperado 0)'||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CAJA_A, true); SET LOCAL ROLE authenticated;
  j := registrar_pago(o2,'P2','transferencia',20000,0,null,'T999',null);
  SELECT id INTO p2 FROM order_payments WHERE order_id=o2 AND payment_method='transferencia';
  PERFORM corregir_pago(p2,'efectivo','dijo transferencia pero pago efectivo');
  BEGIN PERFORM anular_pago(p2,'prueba'); r := r||'8 FALLA: cajero anulo'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'8 ok: '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', ADMIN_A, true); SET LOCAL ROLE authenticated;
  PERFORM anular_pago(p2,'se cobro dos veces');
  RESET ROLE; SELECT paid_at IS NULL AS sin_pago, status INTO rec FROM orders WHERE id=o2; r := r||'9 admin anula => sin paid_at='||rec.sin_pago||' status='||rec.status||E'\n';
  PERFORM set_config('request.jwt.claims', CAJA_A, true); SET LOCAL ROLE authenticated;
  j := cobrar_orden_inicial(o3,'efectivo',20000,1000);
  RESET ROLE; UPDATE orders SET status='ready' WHERE id=o3; SET LOCAL ROLE authenticated;
  j := cobrar_orden(o3,'efectivo',20000,0); r := r||'11 entregar ya pagado pagos='||(SELECT count(*) FROM order_payments WHERE order_id=o3)||' (esperado 1)'||E'\n';
  j := cobrar_orden(o4,'efectivo',40000,0); r := r||'13 Rappi pagos='||(SELECT count(*) FROM order_payments WHERE order_id=o4)||' (esperado 0)'||E'\n';
  BEGIN PERFORM registrar_pago(o4,'x','efectivo',1000,0,1000,null,null); r := r||'14 FALLA: pago a Rappi aceptado'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'14 ok: '||sqlerrm||E'\n'; END;
  j := cobrar_orden_inicial(o5,'efectivo',null,0); r := r||'15 cortesia pagos='||(SELECT count(*) FROM order_payments WHERE order_id=o5)||' (esperado 0)'||E'\n';
  j := hacer_corte_caja(null);
  RESET ROLE; PERFORM set_config('request.jwt.claims', ADMIN_A, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM corregir_pago((SELECT id FROM order_payments WHERE order_id=o3), 'transferencia', 'tarde'); r := r||'16 FALLA: corrigio tras el corte'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'16 ok: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', r;
END $$;
