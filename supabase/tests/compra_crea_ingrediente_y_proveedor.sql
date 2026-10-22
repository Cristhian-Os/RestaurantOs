-- Prueba de la migracion 20261015073000 (compra a proveedor crea ingrediente y proveedor).
-- SOLO para un proyecto de PRUEBA. Crea 2 restaurantes (A con cajero y mesero, B con admin) y comprueba:
-- creacion de proveedor/ingrediente, coincidencia sin tildes/mayusculas, atomicidad, unidades, aislamiento y roles.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  uc uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  CC text; CW text; CB text;
  fresa uuid; ing_b uuid; j jsonb; n int; n2 int; k int; v numeric;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Compra A','compra-a','compraa.test'),(rb,'Compra B','compra-b','comprab.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Compra A', ra),('Compra B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (uc,'authenticated','authenticated','c@compraa.test'),(uw,'authenticated','authenticated','w@compraa.test'),(ub,'authenticated','authenticated','b@comprab.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (uc,'cashier','Cajero A','c@compraa.test',ra),(uw,'waiter','Mesero A','w@compraa.test',ra),(ub,'admin','Admin B','b@comprab.test',rb)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  CC := '{"role":"authenticated","sub":"'||uc||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ra,'Fresa','kg',5,7000) RETURNING id INTO fresa;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (rb,'Secreto B','kg',1,1) RETURNING id INTO ing_b;

  -- 1) Cajero: proveedor nuevo + ingrediente existente (por id) + ingrediente nuevo
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
    jsonb_build_object('ingrediente_id', fresa, 'nombre_producto','Fresa','cantidad',2,'unidad','kg','precio_unitario',8000),
    jsonb_build_object('nombre_producto','Mango','cantidad',3,'unidad','kilos','precio_unitario',5000)));
  RESET ROLE;
  r := concat(r, '1a) proveedor creado: ', (j->>'proveedor_creado'), ' (esperado true)', E'\n');
  r := concat(r, '1b) ingredientes creados: ', jsonb_array_length(j->'ingredientes_creados'), ' (esperado 1)', E'\n');
  SELECT stock_actual INTO v FROM ingredientes WHERE id = fresa;
  r := concat(r, '1c) Fresa existente suma stock: ', v, ' (esperado 7)', E'\n');
  SELECT count(*) INTO n FROM ingredientes WHERE restaurant_id=ra AND nombre='Mango' AND unidad_medida='kg' AND stock_actual=3 AND costo_unitario=5000 AND proveedor_id=(j->>'proveedor_id')::uuid;
  r := concat(r, '1d) Mango nuevo (kg, stock 3, costo 5000, con proveedor): ', n, ' (esperado 1)', E'\n');
  SELECT count(*) INTO n FROM gastos WHERE id=(j->>'gasto_id')::uuid AND proveedor_id=(j->>'proveedor_id')::uuid AND monto=31000;
  r := concat(r, '1e) gasto enlazado al proveedor, monto 31000: ', n, ' (esperado 1)', E'\n');
  SELECT count(*) INTO n FROM gasto_items WHERE gasto_id=(j->>'gasto_id')::uuid AND ingrediente_id IS NOT NULL;
  r := concat(r, '1f) lineas del gasto con ingrediente: ', n, ' (esperado 2)', E'\n');

  -- 2) Mismo proveedor con otras mayusculas/tildes/espacios, y producto por nombre sin unidad
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := registrar_compra_proveedor('  FRUTAS  don pépe ', jsonb_build_array(
    jsonb_build_object('nombre_producto','MANGO','cantidad',1,'precio_unitario',6000)));
  RESET ROLE;
  SELECT count(*) INTO n FROM proveedores WHERE restaurant_id=ra;
  r := concat(r, '2a) no duplica proveedor: creado=', (j->>'proveedor_creado'), ', total=', n, ' (esperado false y 1)', E'\n');
  SELECT count(*), max(stock_actual) INTO n, v FROM ingredientes WHERE restaurant_id=ra AND _norm_nombre(nombre)='mango';
  r := concat(r, '2b) no duplica ingrediente: ', n, ' fila, stock ', v, ' (esperado 1 y 4)', E'\n');

  -- 3) Producto nuevo sin unidad: se rechaza y NO queda nada a medias
  SELECT count(*) INTO n FROM gastos WHERE restaurant_id=ra; SELECT count(*) INTO n2 FROM proveedores WHERE restaurant_id=ra;
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM registrar_compra_proveedor('Proveedor Fantasma', jsonb_build_array(
      jsonb_build_object('nombre_producto','Papaya','cantidad',1,'precio_unitario',1000)));
    r := concat(r, '3a) producto nuevo sin unidad: FALLA (se acepto)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '3a) sin unidad rechazado: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  SELECT count(*) INTO k FROM gastos WHERE restaurant_id=ra;
  r := concat(r, '3b) gastos antes/despues: ', n, '/', k, ' (esperado igual)', E'\n');
  SELECT count(*) INTO k FROM proveedores WHERE restaurant_id=ra;
  r := concat(r, '3c) proveedores antes/despues: ', n2, '/', k, ' (esperado igual, Fantasma no se crea)', E'\n');
  SELECT count(*) INTO k FROM ingredientes WHERE restaurant_id=ra AND nombre='Papaya';
  r := concat(r, '3d) Papaya creada: ', k, ' (esperado 0)', E'\n');

  -- 4) Unidad distinta a la del ingrediente que ya existe
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
      jsonb_build_object('nombre_producto','Mango','cantidad',500,'unidad','g','precio_unitario',5)));
    r := concat(r, '4a) mango en gramos sobre stock en kg: FALLA (se acepto)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '4a) unidad distinta rechazada: ', sqlerrm, E'\n'); END;
  BEGIN
    PERFORM registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
      jsonb_build_object('nombre_producto','Guayaba','cantidad',2,'unidad','lb','precio_unitario',3000)));
    r := concat(r, '4b) unidad "lb" en producto nuevo: FALLA (se acepto)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '4b) "lb" rechazada en producto nuevo (bien)', E'\n'); END;
  RESET ROLE;
  SELECT stock_actual INTO v FROM ingredientes WHERE restaurant_id=ra AND nombre='Mango';
  r := concat(r, '4c) stock de Mango intacto: ', v, ' (esperado 4)', E'\n');

  -- 5) Ingrediente de otro restaurante
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
      jsonb_build_object('ingrediente_id', ing_b, 'nombre_producto','Secreto B','cantidad',1,'unidad','kg','precio_unitario',1)));
    r := concat(r, '5) ingrediente de B desde A: FALLA (se acepto)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '5) ingrediente ajeno rechazado: ', sqlerrm, E'\n'); END;
  RESET ROLE;

  -- 6) Concepto largo: es texto libre, no crea proveedor
  SELECT count(*) INTO n FROM proveedores WHERE restaurant_id=ra;
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := registrar_compra_proveedor(repeat('x', 150), jsonb_build_array(
    jsonb_build_object('ingrediente_id', fresa, 'nombre_producto','Fresa','cantidad',1,'unidad','kg','precio_unitario',8000)));
  RESET ROLE;
  SELECT count(*) INTO n2 FROM proveedores WHERE restaurant_id=ra;
  r := concat(r, '6) concepto de 150 letras: proveedores ', n, '->', n2, ', proveedor_id=', coalesce(j->>'proveedor_id','null'), ' (esperado igual y null)', E'\n');

  -- 7) Dos lineas con el mismo producto nuevo en una compra: un solo ingrediente
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  j := registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
    jsonb_build_object('nombre_producto','Piña','cantidad',1,'unidad','kg','precio_unitario',4000),
    jsonb_build_object('nombre_producto','pina','cantidad',2,'unidad','kg','precio_unitario',4500)));
  RESET ROLE;
  SELECT count(*), max(stock_actual) INTO n, v FROM ingredientes WHERE restaurant_id=ra AND _norm_nombre(nombre)='pina';
  r := concat(r, '7) Piña duplicada en la compra: ', n, ' fila, stock ', v, ' (esperado 1 y 3)', E'\n');

  -- 8) Las politicas de proveedores/ingredientes NO se aflojaron: el cajero sigue sin poder escribir directo
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO proveedores (nombre) VALUES ('Directo'); r := concat(r, '8a) cajero inserta proveedor directo: FALLA', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '8a) insert directo en proveedores sigue bloqueado', E'\n'); END;
  UPDATE ingredientes SET stock_actual = 999 WHERE id = fresa; GET DIAGNOSTICS n = ROW_COUNT;
  r := concat(r, '8b) cajero edita ingrediente directo: ', n, ' filas (esperado 0)', E'\n');
  RESET ROLE;

  -- 9) Mesero y anonimo
  PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_compra_proveedor('X Y', jsonb_build_array(jsonb_build_object('ingrediente_id', fresa,'nombre_producto','Fresa','cantidad',1,'precio_unitario',1)));
    r := concat(r, '9a) mesero compra: FALLA', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, '9a) mesero rechazado: ', sqlerrm, E'\n'); END;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM registrar_compra_proveedor('X Y', '[]'::jsonb); r := concat(r, '9b) anonimo compra: FALLA', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, '9b) anonimo sin permiso (bien)', E'\n'); END;
  RESET ROLE;

  -- 10) Aislamiento: el admin de B compra "lo mismo" y crea lo suyo sin tocar lo de A
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  j := registrar_compra_proveedor('Frutas Don Pepe', jsonb_build_array(
    jsonb_build_object('nombre_producto','Mango','cantidad',10,'unidad','kg','precio_unitario',1)));
  RESET ROLE;
  SELECT count(*) INTO n FROM proveedores WHERE nombre='Frutas Don Pepe';
  r := concat(r, '10a) cada restaurante con su proveedor: ', n, ' (esperado 2)', E'\n');
  SELECT stock_actual INTO v FROM ingredientes WHERE restaurant_id=ra AND nombre='Mango';
  r := concat(r, '10b) Mango de A no cambio por la compra de B: ', v, ' (esperado 4)', E'\n');
  SELECT stock_actual INTO v FROM ingredientes WHERE restaurant_id=rb AND nombre='Mango';
  r := concat(r, '10c) Mango de B: ', v, ' (esperado 10)', E'\n');

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
