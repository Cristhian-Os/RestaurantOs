-- Prueba de la migración 20261017000002 (servidor: precio, validación e inventario de opciones v2).
-- SOLO proyecto de PRUEBA (o producción: se revierte sola). ESPERADO: precios servidor = navegador; platos heredados sin cambios.
DO $$
DECLARE
  r text := ''; ra uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ing uuid := gen_random_uuid();
  d_v2 uuid := gen_random_uuid(); d_old uuid := gen_random_uuid(); oid uuid; j json; n numeric; CA text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Srv A','srv-a','srva.test');
  INSERT INTO restaurant_config (restaurant_id, display_name, modules_enabled) SELECT ra, 'cfg',
    '{"options_v2":true,"helado_flavors":["Oreo","Fresa"],"helado_flavors_off":["Fresa"]}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM restaurant_config WHERE restaurant_id = ra);
  UPDATE restaurant_config SET modules_enabled = '{"options_v2":true,"helado_flavors":["Oreo","Fresa"],"helado_flavors_off":["Fresa"]}'::jsonb WHERE restaurant_id = ra;
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@srva.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'cashier','Caja','a@srva.test',ra)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  INSERT INTO ingredientes (id, restaurant_id, nombre, unidad_medida, stock_actual) VALUES (ing, ra, 'Leche de avena', 'ml', 1000);
  INSERT INTO option_lists (restaurant_id, key, nombre, items) VALUES (ra, 'leches', 'Leches',
    jsonb_build_array(jsonb_build_object('label','Entera','activo',true),
                      jsonb_build_object('label','Avena','activo',true,'precio_extra',2000,'ingrediente_id',ing,'cantidad_consumo',200),
                      jsonb_build_object('label','Almendra','activo',false,'precio_extra',2500)));
  -- plato v2: leche (lista, obligatoria) + extras (inline, 0..2) ; plato heredado: helado con sabor
  INSERT INTO dishes (id, restaurant_id, name, price, category, options) VALUES (d_v2, ra, 'Latte', 7000, 'cafes',
    '[{"v":2,"id":"g_lec","nombre":"Leche","modo":"single","min":1,"max":1,"requerido":true,"fuente":{"lista":"leches"}},
      {"v":2,"id":"g_ext","nombre":"Extras","modo":"multi","min":0,"max":2,"requerido":false,"fuente":{"items":[{"label":"Shot","precio_extra":1500},{"label":"Jarabe","precio_extra":1000},{"label":"Canela"}]}}]'::jsonb);
  INSERT INTO dishes (id, restaurant_id, name, price, category, options) VALUES (d_old, ra, 'Cono viejo', 5000, 'helados',
    '[{"tipo":"helado","nombre":"Sabor","cantidad":1}]'::jsonb);
  CA := '{"role":"authenticated","sub":"'||ua||'","aal":"aal1"}';
  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;

  -- 1) Precio del servidor = 7000 + avena 2000 + shot 1500 + jarabe 1000 (el cliente manda price falso y se ignora)
  j := crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 2, 'price', 1,
        'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Avena'), 'g_ext', jsonb_build_array('Shot','Jarabe'))))), 'LOCAL');
  oid := (j->>'order_id')::uuid;
  r := r||'Latte avena+shot+jarabe x2: total servidor '||(j->>'total')||' (esperado 23000)'||E'\n';

  -- 2) Validaciones
  BEGIN PERFORM crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 1, 'sel', '{}'::jsonb)), 'LOCAL'); r := r||'sin leche pasa (FALLA)'||E'\n';
    EXCEPTION WHEN OTHERS THEN r := r||'sin leche: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 1, 'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Almendra'))))), 'LOCAL'); r := r||'ítem agotado pasa (FALLA)'||E'\n';
    EXCEPTION WHEN OTHERS THEN r := r||'ítem agotado: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 1, 'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Soya'))))), 'LOCAL'); r := r||'ítem inexistente pasa (FALLA)'||E'\n';
    EXCEPTION WHEN OTHERS THEN r := r||'ítem inexistente: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 1, 'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Entera'), 'g_ext', jsonb_build_array('Shot','Jarabe','Canela'))))), 'LOCAL'); r := r||'más del máximo pasa (FALLA)'||E'\n';
    EXCEPTION WHEN OTHERS THEN r := r||'más del máximo: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_v2, 'quantity', 1, 'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Entera','Avena'))))), 'LOCAL'); r := r||'dos leches pasa (FALLA)'||E'\n';
    EXCEPTION WHEN OTHERS THEN r := r||'dos leches (single): '||sqlerrm||E'\n'; END;

  -- 3) Plato heredado: igual que siempre (precio base, sin validar sabores)
  j := crear_orden_completa(NULL, jsonb_build_array(jsonb_build_object('id', d_old, 'quantity', 3, 'sel', jsonb_build_object('helado', jsonb_build_object('0', jsonb_build_array('Oreo'))))), 'LOCAL');
  r := r||'Cono heredado x3: total '||(j->>'total')||' (esperado 15000)'||E'\n';

  -- 4) Editar el pedido: cambia a Entera sin extras
  j := editar_items_pedido(oid, jsonb_build_array(jsonb_build_object('idx', 0, 'quantity', 1, 'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Entera'))))));
  r := r||'Editar a Entera x1: total '||(j->>'total')||' (esperado 7000)'||E'\n';
  RESET ROLE;

  -- 5) Inventario: el pedido original (2 lattes con avena) descontó 2 x 200 = 400 de 1000
  SELECT stock_actual INTO n FROM ingredientes WHERE id = ing;
  r := r||'Stock de leche de avena tras 2 lattes con avena: '||n||' (esperado 600)'||E'\n';
  SELECT r||'detalle guarda consumo: '||opciones_consumo::text||E'\n' INTO r FROM detalles_pedidos WHERE order_id = oid LIMIT 1;

  -- 6) Pedido del menú público (anónimo): precio y descuento al cobrar
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  oid := create_public_order(ra, 5, 'Cliente', NULL, jsonb_build_array(jsonb_build_object('kind','dish','dish_id', d_v2, 'quantity', 1,
         'sel', jsonb_build_object('grupos', jsonb_build_object('g_lec', jsonb_build_array('Avena'))))));
  RESET ROLE;
  SELECT r||'Público Latte con avena: total '||total||' (esperado 9000)'||E'\n' INTO r FROM orders WHERE id = oid;
  PERFORM registrar_venta_stock(oid);
  SELECT stock_actual INTO n FROM ingredientes WHERE id = ing;
  r := r||'Stock tras el pedido público cobrado: '||n||' (esperado 400)'||E'\n';

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
