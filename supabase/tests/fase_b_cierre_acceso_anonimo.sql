-- Prueba de 20261023100000_fase_b_cierre_acceso_anonimo (FASE B: solo con el frontend nuevo publicado). SOLO para un proyecto de PRUEBA.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte. Cada linea debe terminar en OK u "omitido".
-- Si el esquema storage no esta completo (replica local), las pruebas de Storage se omiten y se dice.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  CA text; CW text; n int; v text; j jsonb; dish_a uuid; dish_x uuid; dish_b uuid; ing_a uuid; ing_b uuid; ord_pub uuid; u text;
  hay_storage boolean := to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL;
  hay_bucket boolean;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain, active) VALUES (ra,'Fb A','fb-a','fa.test',true),(rb,'Fb B','fb-b','fb.test',false);
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Fb A', ra),('Fb B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@fa.test'),(uw,'authenticated','authenticated','w@fa.test'),(ue,'authenticated','authenticated','e@fa.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (ua,'admin','Admin A','a@fa.test',ra,true),(uw,'waiter','Mesero A','w@fa.test',ra,true),(ue,'waiter','Mesero Extra','e@fa.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=EXCLUDED.active, full_name=EXCLUDED.full_name;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}';
  INSERT INTO dishes (name, price, category, restaurant_id) VALUES ('Plato A', 10000, 'x', ra) RETURNING id INTO dish_a;
  INSERT INTO dishes (name, price, category, restaurant_id, available, availability_status) VALUES ('Plato Descontinuado', 10000, 'x', ra, true, 'discontinued') RETURNING id INTO dish_x;
  INSERT INTO dishes (name, price, category, restaurant_id) VALUES ('Plato B (restaurante inactivo)', 10000, 'x', rb) RETURNING id INTO dish_b;
  INSERT INTO ingredientes (nombre, unidad_medida, stock_actual, costo_unitario, restaurant_id) VALUES ('Ing A','kg',100,650,ra) RETURNING id INTO ing_a;
  INSERT INTO ingredientes (nombre, unidad_medida, stock_actual, costo_unitario, restaurant_id) VALUES ('Ing B','kg',100,650,rb) RETURNING id INTO ing_b;
  INSERT INTO mesas (numero, restaurant_id) VALUES (92, ra);

  -- ===== restaurant_config: ya no es legible por anon =====
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN SELECT count(*) INTO n FROM restaurant_config; r := r||'1) anon lee restaurant_config directo: FALLA ('||n||' filas)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'1) anon lee restaurant_config directo rechazado: OK'||E'\n'; END;
  BEGIN SELECT count(*) INTO n FROM restaurant_config WHERE restaurant_id = ra; r := r||'2) anon lee restaurant_config filtrado por restaurante: FALLA'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'2) anon lee restaurant_config filtrado rechazado: OK'||E'\n'; END;
  j := config_publica(ra);
  r := r||'3) anon sigue leyendo config_publica: '||CASE WHEN j->>'display_name'='Fb A' THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM restaurant_config;
  r := r||'4) admin autenticado lee solo su config: '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  RESET ROLE;

  -- ===== ingredientes_menu_publico =====
  SELECT coalesce((SELECT reloptions::text FROM pg_class WHERE oid='public.ingredientes_menu_publico'::regclass),'') INTO v;
  r := r||'5) ingredientes_menu_publico es security_invoker ('||v||'): '||CASE WHEN v LIKE '%security_invoker=true%' THEN 'OK' ELSE 'FALLA' END||E'\n';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN SELECT count(*) INTO n FROM ingredientes_menu_publico; r := r||'6) anon lee la vista de ingredientes: FALLA ('||n||')'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'6) anon lee la vista de ingredientes rechazado: OK'||E'\n'; END;
  SELECT count(*) INTO n FROM ingredientes_publicos(ra); r := r||'7) anon usa la RPC ingredientes_publicos del restaurante activo: '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM ingredientes_publicos(rb); r := r||'8) ingredientes_publicos de un restaurante inactivo: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  BEGIN
    ord_pub := create_public_order(ra, 92, 'Cliente Prueba', NULL, jsonb_build_array(
             jsonb_build_object('kind','custom','ingredients', jsonb_build_array(jsonb_build_object('id', ing_a, 'cantidad', 1))),
             jsonb_build_object('kind','dish','dish_id', dish_a,'quantity',1)));
    r := r||'9) anon crea pedido publico (plato + personalizado, usa la vista como definer): OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'9) anon crea pedido publico: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO n FROM ingredientes_publicos(ra);
    r := r||'10) mesero usa ingredientes_publicos (definer sobre la vista): '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'10) mesero usa ingredientes_publicos: FALLA '||sqlerrm||E'\n'; END;
  BEGIN SELECT count(*) INTO n FROM ingredientes_menu_publico; r := r||'11) authenticated lee la vista de ingredientes: FALLA'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'11) authenticated lee la vista de ingredientes rechazado: OK'||E'\n'; END;
  RESET ROLE;

  -- ===== dishes publicos =====
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM dishes WHERE restaurant_id = ra;
  r := r||'12) anon ve los platos disponibles del restaurante activo (sin el descontinuado): '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM dishes WHERE restaurant_id = rb;
  r := r||'13) anon no ve platos de un restaurante inactivo: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  BEGIN SELECT count(*) INTO n FROM dishes WHERE restaurant_id = ra AND available = true AND availability_status <> 'discontinued';
    r := r||'14) consulta exacta del menu publico (PublicMenu): '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'14) consulta del menu publico: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM dishes;
  r := r||'15) mesero sigue viendo los platos de su restaurante: '||n||CASE WHEN n=2 THEN ': OK' ELSE ': FALLA' END||E'\n';
  RESET ROLE;

  -- ===== profiles: sin active por UPDATE directo, sin DELETE =====
  PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET active = false WHERE id = uw; r := r||'16) mesero se desactiva por UPDATE directo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'16) mesero se desactiva por UPDATE directo rechazado: OK'||E'\n'; END;
  BEGIN UPDATE profiles SET full_name = 'Nombre Nuevo', phone = '3000000000' WHERE id = uw; GET DIAGNOSTICS n = ROW_COUNT;
    r := r||'17) mesero edita nombre y telefono: filas '||n||CASE WHEN n=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'17) mesero edita nombre y telefono: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET active = false WHERE id = ue; r := r||'18) admin desactiva por UPDATE directo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'18) admin desactiva por UPDATE directo rechazado: OK'||E'\n'; END;
  BEGIN DELETE FROM profiles WHERE id = ue; r := r||'19) admin borra un perfil por DELETE directo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'19) admin borra un perfil por DELETE directo rechazado: OK'||E'\n'; END;
  BEGIN j := set_employee_active(ue, false); r := r||'20) admin desactiva por la RPC set_employee_active: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'20) admin desactiva por la RPC set_employee_active: FALLA '||sqlerrm||E'\n'; END;
  BEGIN j := eliminar_empleado(ue); r := r||'21) admin da de baja por la RPC eliminar_empleado: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'21) admin da de baja por la RPC eliminar_empleado: FALLA '||sqlerrm||E'\n'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN SELECT count(*) INTO n FROM profiles; r := r||'22) anon lee profiles: FALLA'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN r := r||'22) anon lee profiles rechazado: OK'||E'\n'; END;
  RESET ROLE;

  -- ===== CHECK de URLs https =====
  BEGIN UPDATE restaurant_config SET instagram_url = 'javascript:alert(1)' WHERE restaurant_id = ra; r := r||'23) instagram_url javascript: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'23) instagram_url javascript: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE restaurant_config SET facebook_url = 'http://facebook.com/x' WHERE restaurant_id = ra; r := r||'24) facebook_url http: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'24) facebook_url http: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE restaurant_config SET logo_url = 'data:text/html;base64,AAAA', portada_url = '//evil.test/x.png' WHERE restaurant_id = ra; r := r||'25) logo/portada no https: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'25) logo/portada no https: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE restaurant_config SET mascota_url = 'ftp://x.test/m.png' WHERE restaurant_id = ra; r := r||'26) mascota_url no https: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'26) mascota_url no https: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE dishes SET image_url = 'javascript:alert(1)' WHERE id = dish_a; r := r||'27) dishes.image_url javascript: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'27) dishes.image_url javascript: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE dishes SET image_url = '//evil.test/x.png' WHERE id = dish_a; r := r||'27b) dishes.image_url //otro-sitio: FALLA'||E'\n';
  EXCEPTION WHEN check_violation THEN r := r||'27b) dishes.image_url //otro-sitio: rechazado: OK'||E'\n'; END;
  BEGIN UPDATE restaurant_config SET instagram_url = 'https://instagram.com/mi_restaurante', facebook_url = 'https://facebook.com/mi.restaurante',
          logo_url = 'https://x.supabase.co/storage/v1/object/public/branding/a/logo.png?t=1', portada_url = 'https://x.test/p.jpg', mascota_url = 'https://x.test/m.png' WHERE restaurant_id = ra;
    UPDATE dishes SET image_url = 'https://x.test/d.jpg?v=1' WHERE id = dish_a;
    r := r||'28) URLs https validas: OK'||E'\n';
    UPDATE dishes SET image_url = '/assets/plato.png' WHERE id = dish_a;
    r := r||'28b) plato con imagen propia del sitio (/assets/...): OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'28) URLs https validas: FALLA '||sqlerrm||E'\n'; END;
  BEGIN UPDATE restaurant_config SET instagram_url = NULL, facebook_url = NULL, logo_url = NULL, portada_url = NULL, mascota_url = NULL WHERE restaurant_id = ra;
    r := r||'29) URLs nulas (sin enlace): OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'29) URLs nulas: FALLA '||sqlerrm||E'\n'; END;

  -- ===== Higiene de privilegios =====
  SELECT count(*) INTO n FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='anon'
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  r := r||'30) anon sin escritura/TRUNCATE/REFERENCES/TRIGGER en public: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='authenticated'
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  r := r||'31) authenticated sin TRUNCATE/REFERENCES/TRIGGER en public: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM information_schema.table_privileges p JOIN information_schema.tables t USING (table_schema, table_name)
   WHERE p.table_schema='public' AND t.table_type='VIEW' AND p.grantee IN ('anon','authenticated') AND p.privilege_type IN ('INSERT','UPDATE','DELETE');
  r := r||'32) vistas sin INSERT/UPDATE/DELETE para anon/authenticated: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM information_schema.column_privileges WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE');
  r := r||'33) anon sin INSERT/UPDATE por columna: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT string_agg(DISTINCT table_name, ',') INTO v FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='anon' AND privilege_type='SELECT';
  r := r||'34) anon solo conserva SELECT sobre ['||coalesce(v,'')||']: '||CASE WHEN v='dishes' THEN 'OK' ELSE 'FALLA' END||E'\n';
  SELECT count(*) INTO n FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated' AND privilege_type='UPDATE' AND column_name='active';
  r := r||'35) authenticated sin UPDATE(active) en profiles: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
  SELECT count(*) INTO n FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated') AND privilege_type='DELETE';
  r := r||'36) anon/authenticated sin DELETE en profiles: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';

  -- ===== Storage =====
  IF NOT hay_storage THEN
    r := r||'37) Storage: esquema storage ausente -> omitido'||E'\n';
  ELSE
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('SELECT','ALL')
       AND (roles && ARRAY['public'::name,'anon'::name]) AND qual ~ 'restaurant-assets';
    r := r||'37) Storage: sin politica SELECT anonima/publica sobre restaurant-assets (listado): '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = ''task-evidence'')' INTO hay_bucket;
    IF hay_bucket THEN
      EXECUTE 'SELECT coalesce(public::text,''null'') FROM storage.buckets WHERE id = ''task-evidence''' INTO v;
      r := r||'38) Storage: task-evidence privado: public='||v||CASE WHEN v='false' THEN ': OK' ELSE ': FALLA' END||E'\n';
    ELSE r := r||'38) Storage: bucket task-evidence ausente en esta base -> omitido'||E'\n'; END IF;
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = ''branding'')' INTO hay_bucket;
    IF hay_bucket THEN
      EXECUTE 'SELECT coalesce(file_size_limit::text,''sin limite'')||'' ''||coalesce(allowed_mime_types::text,''cualquier tipo'') FROM storage.buckets WHERE id = ''branding''' INTO v;
      r := r||'39) Storage: branding limite y MIME ('||v||'): '||CASE WHEN v = '5242880 {image/jpeg,image/png,image/webp}' THEN 'OK' ELSE 'FALLA' END||E'\n';
    ELSE r := r||'39) Storage: bucket branding ausente en esta base -> omitido'||E'\n'; END IF;
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = ''restaurant-assets'')' INTO hay_bucket;
    IF hay_bucket THEN
      EXECUTE 'SELECT public::text FROM storage.buckets WHERE id = ''restaurant-assets''' INTO v;
      r := r||'40) Storage: restaurant-assets sigue publico (URL por ruta exacta): public='||v||CASE WHEN v='true' THEN ': OK' ELSE ': FALLA' END||E'\n';
      INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'dishes/'||dish_a||'.jpg'), ('restaurant-assets', ra||'/portada.jpg');
      PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
      BEGIN SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'restaurant-assets';
        r := r||'42) Storage: anon lista objetos de restaurant-assets: '||n||CASE WHEN n=0 THEN ': OK' ELSE ': FALLA' END||E'\n';
      EXCEPTION WHEN insufficient_privilege THEN r := r||'42) Storage: anon lista objetos de restaurant-assets rechazado: OK'||E'\n'; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
      SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'restaurant-assets';
      r := r||'43) Storage: el admin ve sus rutas (upsert/firmado) y no mas: '||n||CASE WHEN n=2 THEN ': OK' ELSE ': FALLA' END||E'\n';
      RESET ROLE;
      SELECT count(*) INTO n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND with_check ~ '_asset_ok';
      r := r||'44) Storage: politica de escritura de restaurant-assets (_asset_ok) intacta: '||n||CASE WHEN n>=1 THEN ': OK' ELSE ': FALLA' END||E'\n';
    ELSE r := r||'40) Storage: bucket restaurant-assets ausente en esta base -> omitido'||E'\n'; END IF;
  END IF;
  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
