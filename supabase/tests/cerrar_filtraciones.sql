-- Prueba del cierre de filtraciones (migraciones 20261014182937 y 20261014183330). SOLO para un proyecto de PRUEBA.
-- Dos restaurantes con pedidos y evidencias; comprueba lo que ve un visitante sin sesion y entre restaurantes.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); oa uuid := gen_random_uuid();
  n int; j record; CA text; CB text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Fuga A','fuga-a','fugaa.test'),(rb,'Fuga B','fuga-b','fugab.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Fuga A', ra),('Fuga B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@fugaa.test'),(ub,'authenticated','authenticated','b@fugab.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'admin','Admin A','a@fugaa.test',ra),(ub,'admin','Admin B','b@fugab.test',rb)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  INSERT INTO orders (id, restaurant_id, status, tipo_pedido, items, total, customer_name, table_num) VALUES (oa, ra, 'pending','LOCAL','[]'::jsonb, 1000, 'Cliente A', 3);
  INSERT INTO orders (restaurant_id, status, tipo_pedido, items, total, customer_name) VALUES (rb, 'pending','LLEVAR','[]'::jsonb, 2000, 'Cliente B');
  INSERT INTO storage.buckets (id, name, public) VALUES ('task-evidence','task-evidence',true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('task-evidence', ua||'/t1/1.jpg'), ('task-evidence', ub||'/t2/1.jpg');
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';

  -- visitante sin sesion
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM pedido_estado_publico LIMIT 1; r := concat(r, '1) anon lista pedido_estado_publico: FALLA', E'\n'); EXCEPTION WHEN insufficient_privilege THEN r := concat(r, '1) anon sin acceso a la lista de pedidos (bien)', E'\n'); END;
  BEGIN PERFORM 1 FROM restaurants_public LIMIT 1; r := concat(r, '2) anon lista restaurants_public: FALLA', E'\n'); EXCEPTION WHEN insufficient_privilege THEN r := concat(r, '2) anon sin acceso a la lista de restaurantes (bien)', E'\n'); END;
  SELECT * INTO j FROM estado_pedido_publico(oa);
  r := concat(r, '3) anon consulta SU pedido por id: status=', coalesce(j.status,'nada'), ', pagado=', coalesce(j.pagado::text,'-'), ' (esperado pending/false)', E'\n');
  SELECT count(*) INTO n FROM estado_pedido_publico(gen_random_uuid());
  r := concat(r, '4) anon con id inventado: filas=', n, ' (esperado 0)', E'\n');
  SELECT * INTO j FROM restaurante_publico('FUGA-A', NULL);
  r := concat(r, '5) anon busca restaurante por slug: ', coalesce(j.name,'nada'), ' (esperado Fuga A)', E'\n');
  SELECT count(*) INTO n FROM restaurante_publico(NULL, NULL);
  r := concat(r, '6) anon sin slug ni id: filas=', n, ' (esperado 0, no se puede listar)', E'\n');
  SELECT count(*) INTO n FROM orders; r := concat(r, '7) anon lee orders: ', n, ' (esperado 0)', E'\n');
  BEGIN SELECT count(*) INTO n FROM restaurant_fiscal; r := concat(r, '8) anon lee datos fiscales: ', n, ' (esperado 0)', E'\n'); EXCEPTION WHEN insufficient_privilege THEN r := concat(r, '8) anon sin acceso a datos fiscales (bien)', E'\n'); END;
  BEGIN SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='task-evidence'; r := concat(r, '9) anon lista evidencias: ', n, ' (esperado 0)', E'\n'); EXCEPTION WHEN insufficient_privilege THEN r := concat(r, '9) anon sin acceso a evidencias (bien)', E'\n'); END;

  -- datos fiscales privados
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  INSERT INTO restaurant_fiscal (razon_social, nit) VALUES ('Fuga A SAS','900123456-7');
  r := concat(r, '10) admin A guarda y ve sus datos fiscales: ', (SELECT count(*) FROM restaurant_fiscal), ' (esperado 1)', E'\n');
  -- evidencias entre restaurantes
  r := concat(r, '11) admin A ve evidencias de su restaurante: ', (SELECT count(*) FROM storage.objects WHERE bucket_id='task-evidence'), ' (esperado 1, no las de B)', E'\n');
  RESET ROLE; PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  r := concat(r, '13) admin B no ve datos fiscales de A: ', (SELECT count(*) FROM restaurant_fiscal), ' (esperado 0)', E'\n');
  r := concat(r, '14) admin B ve solo sus evidencias: ', (SELECT count(*) FROM storage.objects WHERE bucket_id='task-evidence'), ' (esperado 1)', E'\n');
  RESET ROLE;
  -- Supabase no permite DELETE directo en storage.objects: la politica de borrado se verifica leyendo su definicion
  r := concat(r, '15) politica de borrado de evidencias: ', (SELECT qual FROM pg_policies WHERE schemaname='storage' AND policyname='Evidencia: el admin borra solo la de su restaurante'), E'\n');
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
