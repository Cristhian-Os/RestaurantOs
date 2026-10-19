-- Pruebas del Bloque 7 (panel de plataforma, Fase 1). Cada bloque DO termina en RAISE EXCEPTION: no queda nada guardado.
-- Esperado en cada uno: "TEST_OUTPUT: FALLAS=0". Corren en el proyecto de prueba (ids de Prueba A/B); en producción cambiar los ids.
-- Se ejecutan por separado (uno por llamada).

-- 1) Tablas: nadie con sesión ni sin sesión lee/escribe; el registro de cambios es inmutable; ficha automática por restaurante.
DO $t$
DECLARE fal int := 0; res text := ''; n int; t text; r text;
BEGIN
  SELECT count(*) INTO n FROM restaurant_crm; IF n <> (SELECT count(*) FROM restaurants) THEN fal := fal+1; res := res || ' [fichas]'; END IF;
  INSERT INTO restaurants (name, slug, email_domain) VALUES ('Prueba trigger','prueba-trigger','pt.com');
  IF NOT EXISTS (SELECT 1 FROM restaurant_crm c JOIN restaurants x ON x.id=c.restaurant_id WHERE x.slug='prueba-trigger') THEN fal := fal+1; res := res || ' [trigger]'; END IF;
  PERFORM public._auditar('prueba','restaurant_crm',NULL,NULL,NULL,'t');
  BEGIN UPDATE auditoria_plataforma SET accion='x'; fal := fal+1; res := res || ' [audit editable]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM auditoria_plataforma; fal := fal+1; res := res || ' [audit borrable]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN INSERT INTO vendedores (tipo,nombre,codigo,activo) VALUES ('vendedor','Ana','ANA-24',true); fal := fal+1; res := res || ' [vendedor activo sin contrato]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', r);
    FOREACH t IN ARRAY ARRAY['vendedores','restaurant_crm','restaurant_contactos','auditoria_plataforma'] LOOP
      BEGIN EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n; fal := fal+1; res := res || ' ['||r||' lee '||t||']'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN EXECUTE format('INSERT INTO public.%I DEFAULT VALUES', t); fal := fal+1; res := res || ' ['||r||' escribe '||t||']'; EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN fal := fal+1; res := res || ' ['||r||' intentó escribir '||t||']'; END;
    END LOOP;
    BEGIN PERFORM public._auditar('x','x',NULL,NULL,NULL,NULL); fal := fal+1; res := res || ' ['||r||' ejecuta _auditar]'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
  RAISE EXCEPTION 'TEST_OUTPUT: FALLAS=% %', fal, res;
END $t$;

-- 2) crear_restaurante con origen y código de vendedor.
DO $t$
DECLARE
  sa uuid := gen_random_uuid(); adm uuid := '44444444-0000-0000-0000-000000000004';
  fal int := 0; res text := ''; j jsonb; c record; vid uuid; n int;
BEGIN
  INSERT INTO auth.users (id, instance_id, email, role, aud, created_at, updated_at) VALUES (sa,'00000000-0000-0000-0000-000000000000','dueno@test.com','authenticated','authenticated',now(),now());
  INSERT INTO profiles (id, email, full_name, role, active) VALUES (sa,'dueno@test.com','Dueño','super_admin',true);
  INSERT INTO vendedores (tipo,nombre,codigo,correo,activo,contrato_ruta) VALUES ('vendedor','Ana','ANA-24','ana@test.com',true,'c.pdf') RETURNING id INTO vid;
  INSERT INTO vendedores (tipo,nombre,codigo,activo) VALUES ('vendedor','Inactivo','OFF-1',false);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal1')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_restaurante('R0','r0@test.com','clave12345','X','google'); fal:=fal+1; res:=res||' [sin aal2 pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_restaurante('R1','r1@test.com','clave12345','X'); fal:=fal+1; res:=res||' [1 sin origen pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  j := crear_restaurante('R2','r2@test.com','clave12345','X','redes','instagram');
  RESET ROLE; SELECT * INTO c FROM restaurant_crm WHERE restaurant_id=(j->>'restaurant_id')::uuid;
  IF c.origen<>'redes' OR c.origen_detalle<>'instagram' OR c.vendedor_id IS NOT NULL THEN fal:=fal+1; res:=res||' [2]'; END IF;
  SET LOCAL ROLE authenticated;
  j := crear_restaurante('R3','r3@test.com','clave12345','X','google',NULL,' ana-24 ');
  RESET ROLE; SELECT * INTO c FROM restaurant_crm WHERE restaurant_id=(j->>'restaurant_id')::uuid;
  IF c.origen<>'vendedor' OR c.vendedor_id IS DISTINCT FROM vid OR c.codigo_estado<>'valido' THEN fal:=fal+1; res:=res||' [3 el código debe ganar]'; END IF;
  SET LOCAL ROLE authenticated;
  j := crear_restaurante('R4','r4@test.com','clave12345','X','google',NULL,'ZZZ');
  RESET ROLE; SELECT * INTO c FROM restaurant_crm WHERE restaurant_id=(j->>'restaurant_id')::uuid;
  IF c.origen<>'google' OR c.vendedor_id IS NOT NULL OR c.codigo_estado<>'invalido' THEN fal:=fal+1; res:=res||' [4 inválido no bloquea]'; END IF;
  SET LOCAL ROLE authenticated;
  j := crear_restaurante('R5','r5@test.com','clave12345','X','evento',NULL,'OFF-1');
  RESET ROLE; SELECT * INTO c FROM restaurant_crm WHERE restaurant_id=(j->>'restaurant_id')::uuid;
  IF c.vendedor_id IS NOT NULL OR c.codigo_estado<>'inactivo' THEN fal:=fal+1; res:=res||' [5]'; END IF;
  SET LOCAL ROLE authenticated;
  j := crear_restaurante('R7','ana@test.com','clave12345','X','otro',NULL,'ANA-24');
  RESET ROLE; SELECT * INTO c FROM restaurant_crm WHERE restaurant_id=(j->>'restaurant_id')::uuid;
  IF c.vendedor_id IS NOT NULL THEN fal:=fal+1; res:=res||' [7 autoreferido]'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_restaurante('R9','r9@test.com','clave12345','X','google'); fal:=fal+1; res:=res||' [admin pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SET LOCAL ROLE anon;
  BEGIN PERFORM crear_restaurante('R10','r10@test.com','clave12345','X','google'); fal:=fal+1; res:=res||' [anon pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM pg_proc WHERE proname='crear_restaurante' AND pronamespace='public'::regnamespace; IF n<>1 THEN fal:=fal+1; res:=res||' [sobrecargas '||n||']'; END IF;
  RAISE EXCEPTION 'TEST_OUTPUT: FALLAS=% %', fal, res;
END $t$;

-- 3) Ficha, contactos, activar/desactivar, semáforo, atención y permisos de las funciones plataforma_*.
DO $t$
DECLARE
  sa uuid := gen_random_uuid(); adm uuid := '44444444-0000-0000-0000-000000000004'; caj uuid := '33333333-0000-0000-0000-000000000003';
  ra uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; rb uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  fal int := 0; res text := ''; n int; j jsonb; vid uuid; fn text;
BEGIN
  INSERT INTO auth.users (id, instance_id, email, role, aud, created_at, updated_at) VALUES (sa,'00000000-0000-0000-0000-000000000000','dueno@test.com','authenticated','authenticated',now(),now());
  INSERT INTO profiles (id, email, full_name, role, active) VALUES (sa,'dueno@test.com','Dueño','super_admin',true);
  INSERT INTO vendedores (tipo,nombre,codigo,activo,contrato_ruta) VALUES ('vendedor','Ana','ANA-24',true,'c.pdf') RETURNING id INTO vid;
  INSERT INTO restaurant_crm (restaurant_id) VALUES (ra), (rb) ON CONFLICT DO NOTHING;
  INSERT INTO orders (restaurant_id, status, total, created_at) VALUES (ra, 'completed', 1000, now() - interval '1 day');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM plataforma_restaurantes(); IF n < 2 THEN fal:=fal+1; res:=res||' [lista '||n||']'; END IF;
  SELECT semaforo INTO fn FROM plataforma_salud_restaurantes() WHERE restaurant_id = ra; IF fn <> 'verde' THEN fal:=fal+1; res:=res||' [semaforo A='||coalesce(fn,'null')||']'; END IF;
  SELECT semaforo INTO fn FROM plataforma_salud_restaurantes() WHERE restaurant_id = rb; IF fn NOT IN ('rojo','amarillo') THEN fal:=fal+1; res:=res||' [semaforo B='||coalesce(fn,'null')||']'; END IF;
  PERFORM plataforma_actualizar_ficha(ra, '{"estado_comercial":"activo","notas":"hola","proxima_accion":"llamar","proxima_accion_fecha":"2020-01-01"}'::jsonb);
  j := plataforma_restaurante_ficha(ra);
  IF j->'crm'->>'estado_comercial' <> 'activo' OR j->'crm'->>'notas' <> 'hola' THEN fal:=fal+1; res:=res||' [ficha no refleja]'; END IF;
  BEGIN PERFORM plataforma_actualizar_ficha(ra, '{"estado_comercial":"inventado"}'::jsonb); fal:=fal+1; res:=res||' [estado inválido pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_actualizar_ficha(ra, '{"restaurant_id":"x"}'::jsonb); fal:=fal+1; res:=res||' [campo no editable pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_actualizar_ficha(ra, jsonb_build_object('vendedor_id', vid)); fal:=fal+1; res:=res||' [vendedor sin motivo pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_actualizar_ficha(ra, jsonb_build_object('vendedor_id', vid), 'lo trajo Ana');
  IF (plataforma_restaurante_ficha(ra)->'crm'->>'vendedor_id') <> vid::text THEN fal:=fal+1; res:=res||' [vendedor no quedó]'; END IF;
  BEGIN PERFORM plataforma_actualizar_ficha(ra, '{"prueba_hasta":"2030-01-01"}'::jsonb); fal:=fal+1; res:=res||' [prueba sin motivo pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_actualizar_ficha(ra, '{"prueba_hasta":"2030-01-01"}'::jsonb, 'extensión por piloto');
  PERFORM plataforma_agregar_contacto(ra, 'whatsapp', 'Hablamos del menú');
  BEGIN PERFORM plataforma_agregar_contacto(ra, 'paloma', 'x'); fal:=fal+1; res:=res||' [canal inválido pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  j := plataforma_restaurante_ficha(ra);
  IF jsonb_array_length(j->'contactos') <> 1 OR (j->'crm'->>'ultimo_contacto_at') IS NULL THEN fal:=fal+1; res:=res||' [contacto]'; END IF;
  IF jsonb_array_length(j->'cambios') < 4 THEN fal:=fal+1; res:=res||' [cambios '||jsonb_array_length(j->'cambios')||']'; END IF;
  BEGIN PERFORM plataforma_activar_restaurante(rb, false, ''); fal:=fal+1; res:=res||' [desactivar sin motivo]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_activar_restaurante(rb, false, 'prueba');
  SELECT semaforo INTO fn FROM plataforma_salud_restaurantes() WHERE restaurant_id = rb; IF fn <> 'gris' THEN fal:=fal+1; res:=res||' [gris '||fn||']'; END IF;
  j := plataforma_atencion();
  IF jsonb_array_length(j->'acciones_de_hoy') < 1 THEN fal:=fal+1; res:=res||' [atención: acción vencida no aparece]'; END IF;
  IF (j->'semaforo'->>'verde')::int < 1 THEN fal:=fal+1; res:=res||' [atención: semáforo]'; END IF;
  SELECT count(*) INTO n FROM plataforma_auditoria(NULL, 50); IF n < 5 THEN fal:=fal+1; res:=res||' [auditoría '||n||']'; END IF;
  RESET ROLE;

  FOREACH fn IN ARRAY ARRAY['plataforma_restaurantes()','plataforma_salud_restaurantes()','plataforma_atencion()','plataforma_auditoria()'] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated','aal','aal2')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [admin ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [dueño sin 2FA ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
    SET LOCAL ROLE anon;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [anon ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', caj, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_actualizar_ficha(ra, '{"notas":"hack"}'::jsonb); fal:=fal+1; res:=res||' [cajero editó ficha]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_activar_restaurante(ra, false, 'hack'); fal:=fal+1; res:=res||' [cajero desactivó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_agregar_contacto(ra, 'otro', 'hack'); fal:=fal+1; res:=res||' [cajero agregó contacto]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_restaurante_ficha(ra); fal:=fal+1; res:=res||' [cajero leyó ficha]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: FALLAS=% %', fal, res;
END $t$;
