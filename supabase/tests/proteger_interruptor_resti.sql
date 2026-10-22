-- Prueba de 20261022126000_proteger_interruptor_resti. SOLO para un proyecto de PRUEBA. Termina con RAISE EXCEPTION (todo se revierte).
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); us uuid := gen_random_uuid(); v text;
  CA text; CS text;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Resti A','resti-a','ra.test');
  INSERT INTO restaurant_config (display_name, restaurant_id, modules_enabled) VALUES ('Resti A', ra, '{"tema":"light"}');
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@ra.test'),(us,'authenticated','authenticated','s@ra.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES (ua,'admin','Admin','a@ra.test',ra,true),(us,'super_admin','Dueño','s@ra.test',NULL,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CS := '{"role":"authenticated","aal":"aal2","sub":"'||us||'"}';

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  UPDATE restaurant_config SET modules_enabled = modules_enabled || '{"resti_agent":true}' WHERE restaurant_id = ra;
  SELECT coalesce(modules_enabled->>'resti_agent','NULL') INTO v FROM restaurant_config WHERE restaurant_id = ra;
  r := r||'1) el admin no se activa Resti (resti_agent='||v||'): '||CASE WHEN v='NULL' THEN 'OK' ELSE 'FALLA' END||E'\n';
  UPDATE restaurant_config SET modules_enabled = modules_enabled || '{"tema":"dark"}' WHERE restaurant_id = ra;
  SELECT modules_enabled->>'tema' INTO v FROM restaurant_config WHERE restaurant_id = ra;
  r := r||'2) el admin si cambia lo demas (tema='||v||'): '||CASE WHEN v='dark' THEN 'OK' ELSE 'FALLA' END||E'\n';

  RESET ROLE; PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  PERFORM plataforma_activar_resti(ra, true);
  SELECT modules_enabled->>'resti_agent' INTO v FROM restaurant_config WHERE restaurant_id = ra;
  r := r||'3) el dueño de la plataforma activa Resti (resti_agent='||coalesce(v,'NULL')||'): '||CASE WHEN v='true' THEN 'OK' ELSE 'FALLA' END||E'\n';

  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  UPDATE restaurant_config SET modules_enabled = '{"tema":"light","resti_agent":false}' WHERE restaurant_id = ra;
  SELECT modules_enabled->>'resti_agent' INTO v FROM restaurant_config WHERE restaurant_id = ra;
  r := r||'4) un guardado con datos viejos no apaga lo activado (resti_agent='||coalesce(v,'NULL')||'): '||CASE WHEN v='true' THEN 'OK' ELSE 'FALLA' END||E'\n';
  UPDATE restaurant_config SET modules_enabled = '{"tema":"light"}' WHERE restaurant_id = ra;
  SELECT coalesce(modules_enabled->>'resti_agent','NULL') INTO v FROM restaurant_config WHERE restaurant_id = ra;
  r := r||'5) ni borrar la clave la quita (resti_agent='||v||'): '||CASE WHEN v='true' THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE;
  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
