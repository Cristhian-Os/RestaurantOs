-- Prueba del Bloque 5A (facturas con foto). Todo ocurre dentro de un DO que termina en RAISE EXCEPTION,
-- así que nada queda guardado: es seguro correrla incluso en producción. Esperado: "TEST_OUTPUT: FALLAS=0".
-- Usa los usuarios del proyecto de prueba (Prueba A / Prueba B). En producción hay que cambiar los ids.
DO $t$
DECLARE
  ra  uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  rb  uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  adm_a uuid := '44444444-0000-0000-0000-000000000004';
  caj_a uuid := '33333333-0000-0000-0000-000000000003';
  coc_a uuid := '11111111-0000-0000-0000-000000000001';
  caj_b uuid := '55555555-0000-0000-0000-000000000005';
  prov_a uuid; prov_b uuid;
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  fal int := 0; res text := ''; n int; m numeric; r public.facturas_compra;
  foto_a text; foto_b text;
BEGIN
  INSERT INTO proveedores (restaurant_id, nombre) VALUES (ra, 'Prov A') RETURNING id INTO prov_a;
  INSERT INTO proveedores (restaurant_id, nombre) VALUES (rb, 'Prov B') RETURNING id INTO prov_b;
  foto_a := ra || '/2026/10/' || gen_random_uuid() || '.jpg';
  foto_b := rb || '/2026/10/' || gen_random_uuid() || '.jpg';

  -- 1. Cajero A guarda factura con gasto
  PERFORM set_config('request.jwt.claims', json_build_object('sub', caj_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := registrar_factura_compra(f1, current_date, prov_a, 45000, 'prueba', ARRAY[foto_a], true);
  SELECT monto INTO m FROM gastos WHERE id = r.gasto_id;
  IF m IS DISTINCT FROM 45000 THEN fal := fal + 1; res := res || ' [1 gasto no coincide]'; END IF;
  -- 2. Reintento con el mismo id no duplica
  PERFORM registrar_factura_compra(f1, current_date, prov_a, 45000, 'prueba', ARRAY[foto_a], true);
  SELECT count(*) INTO n FROM facturas_compra WHERE id = f1;
  IF n <> 1 THEN fal := fal + 1; res := res || ' [2 duplicó]'; END IF;
  SELECT count(*) INTO n FROM gastos WHERE concepto = 'Factura Prov A' AND restaurant_id = ra;
  IF n <> 1 THEN fal := fal + 1; res := res || ' [2 gasto duplicado]'; END IF;
  -- 3. Cajero A: no edita ni borra
  BEGIN PERFORM editar_factura_compra(f1, current_date, prov_a, 1, null); fal := fal + 1; res := res || ' [3 cajero editó]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  DELETE FROM facturas_compra WHERE id = f1; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN fal := fal + 1; res := res || ' [3 cajero borró]'; END IF;
  -- 4. Sin proveedor y monto 0 se permite; gasto con monto 0 no
  r := registrar_factura_compra(f2, current_date, NULL, 0, NULL, ARRAY[foto_a], false);
  BEGIN PERFORM registrar_factura_compra(gen_random_uuid(), current_date, NULL, 0, NULL, ARRAY[foto_a], true); fal := fal + 1; res := res || ' [4 gasto con monto 0]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  -- 5. Foto de otra carpeta, proveedor de otro restaurante y monto negativo: rechazados
  BEGIN PERFORM registrar_factura_compra(gen_random_uuid(), current_date, NULL, 10, NULL, ARRAY[foto_b], false); fal := fal + 1; res := res || ' [5 foto ajena]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM registrar_factura_compra(gen_random_uuid(), current_date, prov_b, 10, NULL, ARRAY[foto_a], false); fal := fal + 1; res := res || ' [5 proveedor ajeno]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM registrar_factura_compra(gen_random_uuid(), current_date, NULL, -5, NULL, ARRAY[foto_a], false); fal := fal + 1; res := res || ' [5 monto negativo]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  -- 6. Fotos en storage: cajero A sube a su carpeta; a la de B no
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', foto_a, caj_a);
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', foto_b, caj_a); fal := fal + 1; res := res || ' [6 subió a carpeta ajena]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('facturas', foto_b);  -- foto de B, para probar lectura cruzada

  -- 7. Cajero B no ve nada de A (tabla ni fotos)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', caj_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM facturas_compra WHERE restaurant_id = ra;
  IF n <> 0 THEN fal := fal + 1; res := res || ' [7 B ve facturas de A]'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'facturas' AND name = foto_a;
  IF n <> 0 THEN fal := fal + 1; res := res || ' [7 B ve fotos de A]'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'facturas' AND name = foto_b;
  IF n <> 1 THEN fal := fal + 1; res := res || ' [7 B no ve su foto]'; END IF;
  RESET ROLE;

  -- 8. Cocina A no ve ni sube nada
  PERFORM set_config('request.jwt.claims', json_build_object('sub', coc_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM facturas_compra;
  IF n <> 0 THEN fal := fal + 1; res := res || ' [8 cocina ve facturas]'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'facturas';
  IF n <> 0 THEN fal := fal + 1; res := res || ' [8 cocina ve fotos]'; END IF;
  BEGIN PERFORM registrar_factura_compra(gen_random_uuid(), current_date, NULL, 10, NULL, ARRAY[foto_a], false); fal := fal + 1; res := res || ' [8 cocina subió]';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;

  -- 9. Admin A: ve sus 2 facturas, edita (el gasto sigue el monto), borra factura y foto
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM facturas_compra;
  IF n <> 2 THEN fal := fal + 1; res := res || ' [9 admin ve ' || n || ']'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'facturas' AND name = foto_a;
  IF n <> 1 THEN fal := fal + 1; res := res || ' [9 admin no ve foto]'; END IF;
  PERFORM editar_factura_compra(f1, current_date - 1, prov_a, 50000, 'editada');
  SELECT g.monto INTO m FROM gastos g JOIN facturas_compra f ON f.gasto_id = g.id WHERE f.id = f1;
  IF m IS DISTINCT FROM 50000 THEN fal := fal + 1; res := res || ' [9 gasto no siguió la edición]'; END IF;
  DELETE FROM facturas_compra WHERE id = f1; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN fal := fal + 1; res := res || ' [9 admin no borró]'; END IF;
  BEGIN  -- Supabase bloquea el DELETE directo en storage.objects (se borra por la API); aquí solo se avisa.
    DELETE FROM storage.objects WHERE bucket_id = 'facturas' AND name = foto_a; GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN fal := fal + 1; res := res || ' [9 admin no borró foto]'; END IF;
  EXCEPTION WHEN OTHERS THEN res := res || ' [nota: borrado directo de storage bloqueado: ' || SQLERRM || ']'; END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST_OUTPUT: FALLAS=% %', fal, res;
END
$t$;
