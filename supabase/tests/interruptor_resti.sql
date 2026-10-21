-- Prueba del interruptor de Resti (migración 20261021250000). SOLO para un proyecto de PRUEBA (o producción: se revierte sola).
-- Comprueba: solo el dueño con 2 pasos lo mueve; cambia solo resti_agent y conserva el resto del jsonb; queda en el registro;
-- un administrador de restaurante y un dueño sin 2 pasos no pueden. Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; n int; j jsonb; a uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); CS2 text; CS1 text; CA text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (us,'authenticated','authenticated','dueno@resti.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ua,'authenticated','authenticated','admin@resti.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES (a,'Resti R','resti-r','restir.test','pro',true);
  INSERT INTO restaurant_config (restaurant_id, display_name, modules_enabled) VALUES (a,'Resti R','{"theme":"light","categories":[{"value":"x"}]}'::jsonb);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueño','dueno@resti.test',NULL),(ua,'admin','Admin','admin@resti.test',a)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  CS2 := '{"role":"authenticated","sub":"'||us||'","aal":"aal2"}'; CS1 := '{"role":"authenticated","sub":"'||us||'","aal":"aal1"}'; CA := '{"role":"authenticated","sub":"'||ua||'","aal":"aal2"}';

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_activar_resti(a, true); r := r||'(1) admin de restaurante enciende Resti (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(1) admin no puede: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_resti_estado(); r := r||'(1) admin lee el estado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(1) admin no lee el estado'||E'\n'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', CS1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_activar_resti(a, true); r := r||'(2) dueño sin 2 pasos enciende (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) dueño sin 2 pasos no puede: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', CS2, true); SET LOCAL ROLE authenticated;
  r := r||'(3) estado inicial: '||((plataforma_resti_estado()->>a::text))||' (esperado false)'||E'\n';
  j := plataforma_activar_resti(a, true); r := r||'(3) encendido: '||(j->>'resti_agent')||' (esperado true)'||E'\n';
  r := r||'(3) estado ahora: '||((plataforma_resti_estado()->>a::text))||' (esperado true)'||E'\n';
  RESET ROLE;
  SELECT count(*) INTO n FROM restaurant_config WHERE restaurant_id = a AND modules_enabled->>'theme' = 'light' AND jsonb_array_length(modules_enabled->'categories') = 1 AND (modules_enabled->>'resti_agent')::boolean;
  r := r||'(4) conserva theme y categories y quedó resti_agent=true: '||n||' (esperado 1)'||E'\n';
  PERFORM set_config('request.jwt.claims', CS2, true); SET LOCAL ROLE authenticated;
  PERFORM plataforma_activar_resti(a, false);
  RESET ROLE;
  SELECT count(*) INTO n FROM restaurant_config WHERE restaurant_id = a AND (modules_enabled->>'resti_agent')::boolean = false; r := r||'(5) apagado: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM platform_audit_log WHERE restaurant_id = a AND action IN ('activar_resti','desactivar_resti'); r := r||'(6) registros de auditoría: '||n||' (esperado 2)'||E'\n';

  RAISE EXCEPTION E'TEST_OUTPUT:\n%', r;
END $$;
