-- Prueba de la migración 20261016000003 (2 pasos en el panel de plataforma). SOLO para un proyecto de PRUEBA.
-- ESPERADO: sin aal2 las 3 acciones se rechazan; con aal2 funcionan. Termina con RAISE EXCEPTION: todo se revierte.
DO $$
DECLARE r text := ''; us uuid := gen_random_uuid(); ra uuid := gen_random_uuid(); j jsonb; rid uuid; S1 text; S2 text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Mfa A','mfa-a','mfaa.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (us,'authenticated','authenticated','dueno@mfa.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueno','dueno@mfa.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  S1 := '{"role":"authenticated","sub":"'||us||'","aal":"aal1"}'; S2 := '{"role":"authenticated","sub":"'||us||'","aal":"aal2"}';
  PERFORM set_config('request.jwt.claims', S1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM get_platform_overview(); r := r||'sin 2 pasos ve panel (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'sin 2 pasos, panel: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_restaurante('X','x@x.test','Clave12345','X'); r := r||'sin 2 pasos crea (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'sin 2 pasos, crear: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_activar_plan(ra,'pro'); r := r||'sin 2 pasos activa plan (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'sin 2 pasos, plan: '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', S2, true); SET LOCAL ROLE authenticated;
  PERFORM get_platform_overview(); r := r||'con 2 pasos ve panel: ok'||E'\n';
  j := crear_restaurante('Con Mfa','dueno@conmfa.test','Clave12345','Dueña'); rid := (j->>'restaurant_id')::uuid; r := r||'con 2 pasos crea restaurante: ok'||E'\n';
  PERFORM plataforma_activar_plan(rid,'pro'); r := r||'con 2 pasos activa plan: ok'||E'\n';
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
