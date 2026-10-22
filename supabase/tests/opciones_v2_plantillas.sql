-- Prueba de la migración 20261017000001 (listas de opciones y plantillas). SOLO para un proyecto de PRUEBA (o producción: se revierte sola).
-- ESPERADO: listas/plantillas aisladas por restaurante; aplicar plantilla es idempotente y combinable; anónimo solo ve lo público.
DO $$
DECLARE
  r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  j jsonb; n int; pub jsonb; CA text; CB text; CC text; CS1 text; CS2 text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Opc A','opc-a','opca.test'), (rb,'Opc B','opc-b','opcb.test');
  INSERT INTO restaurant_config (restaurant_id, display_name) SELECT x, 'cfg' FROM unnest(ARRAY[ra, rb]) x WHERE NOT EXISTS (SELECT 1 FROM restaurant_config WHERE restaurant_id = x);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@opca.test'),(ub,'authenticated','authenticated','b@opcb.test'),
    (uc,'authenticated','authenticated','c@opca.test'),(us,'authenticated','authenticated','s@opc.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (ua,'admin','Admin A','a@opca.test',ra),(ub,'admin','Admin B','b@opcb.test',rb),(uc,'cashier','Caja A','c@opca.test',ra),(us,'super_admin','Dueno','s@opc.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  -- dos plantillas activas y una inactiva
  INSERT INTO restaurant_templates (key, nombre, payload, activo) VALUES
   ('t_helados','Heladería de prueba', '{"categorias":[{"value":"helados","label":"Helados","emoji":"🍦"}],
      "listas":[{"key":"sabores","nombre":"Sabores","items":[{"label":"Vainilla","certeza":"Seguro"},{"label":"Mora","precio_extra":500}]}],
      "grupos_tipicos":[{"id":"g_sab","nombre":"Sabores","modo":"multi","min":1,"max":2,"requerido":true,"fuente":{"lista":"sabores"}}],
      "platos_ejemplo":[{"nombre":"Cono","categoria":"helados","precio":0,"grupos":["g_sab"]}]}', true),
   ('t_cafe','Cafetería de prueba', '{"categorias":[{"value":"cafes","label":"Cafés"}],
      "listas":[{"key":"leches","nombre":"Leches","items":[{"label":"Entera"},{"label":"Avena","precio_extra":2000}]}],
      "grupos_tipicos":[{"id":"g_lec","nombre":"Leche","modo":"single","min":1,"max":1,"requerido":true,"fuente":{"lista":"leches"}}],
      "platos_ejemplo":[{"nombre":"Latte","categoria":"cafes","precio":0,"grupos":["g_lec"]}]}', true),
   ('t_off','Inactiva','{}', false);
  CA := '{"role":"authenticated","sub":"'||ua||'","aal":"aal1"}'; CB := '{"role":"authenticated","sub":"'||ub||'","aal":"aal1"}';
  CC := '{"role":"authenticated","sub":"'||uc||'","aal":"aal1"}';
  CS1 := '{"role":"authenticated","sub":"'||us||'","aal":"aal1"}'; CS2 := '{"role":"authenticated","sub":"'||us||'","aal":"aal2"}';

  -- Admin A aplica la plantilla de helados
  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  j := aplicar_plantilla('t_helados');
  r := r||'A aplica t_helados: listas '||(j->'listas_creadas')::text||' platos '||(j->'platos_creados')::text||E'\n';
  j := aplicar_plantilla('t_helados');
  r := r||'A repite (idempotente): listas creadas '||jsonb_array_length(j->'listas_creadas')||', omitidas '||jsonb_array_length(j->'listas_omitidas')||', platos creados '||jsonb_array_length(j->'platos_creados')||E'\n';
  j := aplicar_plantilla('t_cafe');
  r := r||'A suma t_cafe (negocio mixto): '||(j->'listas_creadas')::text||E'\n';
  BEGIN PERFORM aplicar_plantilla('t_off'); r := r||'plantilla inactiva se aplica (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'plantilla inactiva: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  SELECT r||'config A: tipo '||business_type||', plantillas '||plantillas_aplicadas::text||', options_v2='||(modules_enabled->>'options_v2')||E'\n' INTO r FROM restaurant_config WHERE restaurant_id = ra;
  SELECT r||'plato Cono: disponible='||available||', precio='||price||', grupos='||jsonb_array_length(options)||E'\n' INTO r FROM dishes WHERE restaurant_id = ra AND name = 'Cono';

  -- Aislamiento: B no ve nada de A
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM option_lists; r := r||'B ve listas: '||n||' (esperado 0)'||E'\n';
  BEGIN INSERT INTO option_lists (restaurant_id, key, nombre) VALUES (ra,'robada','X'); r := r||'B escribe en A (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'B escribe en A: bloqueado'||E'\n'; END;
  BEGIN PERFORM option_lista_set_activo('sabores','Vainilla',false); r := r||'B agota ítem de A (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'B agota ítem de A: '||sqlerrm||E'\n'; END;
  BEGIN UPDATE restaurant_templates SET nombre='hack' WHERE key='t_helados'; GET DIAGNOSTICS n = ROW_COUNT; r := r||'B edita plantilla: filas '||n||' (esperado 0)'||E'\n'; END;
  SELECT count(*) INTO n FROM restaurant_templates; r := r||'B ve plantillas (solo activas): '||n||' (esperado 2 de las de prueba + las reales activas)'||E'\n';
  RESET ROLE;

  -- Cajero A: agota un ítem (sí) y escribe lista directo (no)
  PERFORM set_config('request.jwt.claims', CC, true); SET LOCAL ROLE authenticated;
  PERFORM option_lista_set_activo('sabores','Vainilla',false); r := r||'Cajero A agota Vainilla: ok'||E'\n';
  BEGIN UPDATE option_lists SET nombre='x' WHERE restaurant_id = ra; GET DIAGNOSTICS n = ROW_COUNT; r := r||'Cajero edita lista directo: filas '||n||' (esperado 0)'||E'\n'; END;
  BEGIN PERFORM aplicar_plantilla('t_cafe'); r := r||'Cajero aplica plantilla (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'Cajero aplica plantilla: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- Anónimo: solo la función pública, sin ids de inventario
  UPDATE option_lists SET items = jsonb_set(items, '{0,ingrediente_id}', to_jsonb(gen_random_uuid()::text)) WHERE restaurant_id = ra AND key = 'sabores';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  pub := listas_opciones_publicas(ra);
  r := r||'Anónimo ve listas públicas de A: '||jsonb_array_length(pub)||', Vainilla activo='||(pub->0->'items'->0->>'activo')||', trae ingrediente_id='||(pub::text LIKE '%ingrediente_id%')||E'\n';
  BEGIN SELECT count(*) INTO n FROM option_lists; r := r||'Anónimo lee tabla (FALLA): '||n||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'Anónimo lee tabla: denegado'||E'\n'; END;
  BEGIN PERFORM aplicar_plantilla('t_cafe'); r := r||'Anónimo aplica (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'Anónimo aplica: denegado'||E'\n'; END;
  RESET ROLE;

  -- Restaurante con plato heredado con opciones: no se mezcla
  INSERT INTO dishes (restaurant_id, name, price, category, options) VALUES (rb, 'Cholao viejo', 5000, 'principal', '[{"tipo":"helado","nombre":"Sabor","cantidad":1}]'::jsonb);
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM aplicar_plantilla('t_cafe'); r := r||'B con platos heredados aplica (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'B con platos heredados: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- Super admin: exige 2 pasos
  PERFORM set_config('request.jwt.claims', CS1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_aplicar_plantilla(ra,'t_cafe'); r := r||'Super admin sin código aplica (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'Super admin sin código: '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CS2, true); SET LOCAL ROLE authenticated;
  j := plataforma_aplicar_plantilla(ra,'t_cafe'); r := r||'Super admin con código aplica: listas omitidas '||jsonb_array_length(j->'listas_omitidas')||E'\n';
  RESET ROLE;
  SELECT r||'registro de plataforma: '||count(*)||' línea(s)'||E'\n' INTO r FROM platform_audit_log WHERE restaurant_id = ra AND action = 'aplicar_plantilla';

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
