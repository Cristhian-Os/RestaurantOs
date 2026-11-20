-- Prueba de 20261120190000_sede_activa_por_sesion. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) cambiar de sede en una sesión NO cambia la sede de otra sesión del mismo usuario ni profiles.restaurant_id;
-- (2) lo que se ve (RLS) sigue la sede de cada sesión; (3) cada sesión cambia por su cuenta; (4) sin session_id en el
-- token se rechaza con un aviso; (5) un administrador que no es dueño no puede ir a sedes ajenas; (6) si el usuario deja de
-- ser dueño, la sede guardada se ignora y vuelve a la de casa; (7) la tabla no es accesible desde la app;
-- (8) admin_update_employee compara contra la sede de la sesión.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; j jsonb; n int; t uuid; s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); a2 uuid;
  uo uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  C1 text; C2 text; CB text; CN text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uo,'authenticated','authenticated','dueno@sesion-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','dueno@sesion-b.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ue,'authenticated','authenticated','mesero@sesion-a.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES
    (a1,'Sesion A1','sesion-a1','sesiona1.test','premium',true),(b1,'Sesion B1','sesion-b1','sesionb1.test','premium',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uo,'admin','Dueño','dueno@sesion-a.test',a1),(ub,'admin','Otro','dueno@sesion-b.test',b1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  UPDATE restaurants SET owner_id = ub WHERE id = b1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active'),(b1,'premium','active');
  C1 := '{"role":"authenticated","sub":"'||uo||'","session_id":"'||s1||'"}';
  C2 := '{"role":"authenticated","sub":"'||uo||'","session_id":"'||s2||'"}';
  CB := '{"role":"authenticated","sub":"'||ub||'","session_id":"'||gen_random_uuid()||'"}';
  CN := '{"role":"authenticated","sub":"'||uo||'"}';   -- token sin session_id

  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Sesion A2'); a2 := (j->>'restaurant_id')::uuid;
  RESET ROLE;
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ue,'waiter','Mesero A2','mesero@sesion-a.test',a2)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual) VALUES (a1,'Solo en A1','kg',1),(a2,'Solo en A2','kg',2);

  -- 1: sesión 1 cambia a A2; sesión 2 sigue en A1
  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;
  PERFORM cambiar_sede(a2);
  t := current_restaurant_id(); RESET ROLE;
  IF t <> a2 THEN RAISE EXCEPTION 'T1 sesión 1 debía estar en A2'; END IF;
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;
  t := current_restaurant_id(); RESET ROLE;
  IF t <> a1 THEN RAISE EXCEPTION 'T1 sesión 2 debía seguir en A1'; END IF;
  IF (SELECT restaurant_id FROM profiles WHERE id = uo) <> a1 THEN RAISE EXCEPTION 'T1 profiles.restaurant_id no debía cambiar'; END IF;
  r := r || 'T1 cambiar en un aparato no mueve a los otros: OK' || E'\n';

  -- 2: lo que se ve sigue la sede de cada sesión
  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM ingredientes WHERE nombre = 'Solo en A2'; IF n <> 1 THEN RAISE EXCEPTION 'T2 sesión 1 debía ver el de A2'; END IF;
  SELECT count(*) INTO n FROM ingredientes WHERE nombre = 'Solo en A1'; IF n <> 0 THEN RAISE EXCEPTION 'T2 sesión 1 no debía ver el de A1'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM ingredientes WHERE nombre = 'Solo en A1'; IF n <> 1 THEN RAISE EXCEPTION 'T2 sesión 2 debía ver el de A1'; END IF;
  SELECT count(*) INTO n FROM ingredientes WHERE nombre = 'Solo en A2'; IF n <> 0 THEN RAISE EXCEPTION 'T2 sesión 2 no debía ver el de A2'; END IF;
  RESET ROLE;
  r := r || 'T2 cada aparato ve solo su sede: OK' || E'\n';

  -- 3: cada sesión cambia por su cuenta
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;
  PERFORM cambiar_sede(a2); RESET ROLE;
  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;
  PERFORM cambiar_sede(a1); t := current_restaurant_id(); RESET ROLE;
  IF t <> a1 THEN RAISE EXCEPTION 'T3 sesión 1 debía volver a A1'; END IF;
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;
  t := current_restaurant_id(); RESET ROLE;
  IF t <> a2 THEN RAISE EXCEPTION 'T3 sesión 2 debía quedarse en A2'; END IF;
  r := r || 'T3 cada sesión cambia por su cuenta: OK' || E'\n';

  -- 4: token sin session_id
  PERFORM set_config('request.jwt.claims', CN, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cambiar_sede(a2); RAISE EXCEPTION 'T4 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Vuelve a iniciar sesión%' THEN RAISE EXCEPTION 'T4 error raro: %', SQLERRM; END IF; END;
  t := current_restaurant_id(); RESET ROLE;
  IF t <> a1 THEN RAISE EXCEPTION 'T4 sin session_id debía usar la de casa (A1)'; END IF;
  r := r || 'T4 sin session_id avisa y usa la de casa: OK' || E'\n';

  -- 5: no dueño no va a sedes ajenas
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM cambiar_sede(a2); RAISE EXCEPTION 'T5 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Esa sede no es de tu cuenta%' THEN RAISE EXCEPTION 'T5 error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T5 no se puede ir a una sede ajena: OK' || E'\n';

  -- 8: admin_update_employee compara contra la sede de la sesión (empleado de A2)
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;   -- sesión 2 está en A2
  PERFORM admin_update_employee(ue, NULL, NULL, 'Mesero editado', NULL, NULL);
  RESET ROLE;
  IF (SELECT full_name FROM profiles WHERE id = ue) <> 'Mesero editado' THEN RAISE EXCEPTION 'T8 sesión en A2 debía poder editar'; END IF;
  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;   -- sesión 1 está en A1
  BEGIN PERFORM admin_update_employee(ue, NULL, NULL, 'No debe', NULL, NULL); RAISE EXCEPTION 'T8 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'No autorizado: ese empleado%' THEN RAISE EXCEPTION 'T8 error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T8 editar empleados sigue la sede de la sesión: OK' || E'\n';

  -- 7: la tabla no es accesible desde la app
  PERFORM set_config('request.jwt.claims', C1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM 1 FROM sede_activa_sesion; RAISE EXCEPTION 'T7 debía fallar';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE EXCEPTION 'T7 error raro: %', SQLERRM; END IF; END;
  RESET ROLE;
  r := r || 'T7 la tabla no se toca desde la app: OK' || E'\n';

  -- 6: deja de ser dueño → se ignora la sede guardada
  UPDATE restaurants SET cuenta_id = NULL WHERE id = a2;
  PERFORM set_config('request.jwt.claims', C2, true); SET LOCAL ROLE authenticated;
  t := current_restaurant_id(); RESET ROLE;
  IF t <> a1 THEN RAISE EXCEPTION 'T6 sin ser dueño debía volver a A1 y dio %', t; END IF;
  r := r || 'T6 sede guardada ya no válida se ignora: OK' || E'\n';

  RAISE EXCEPTION E'PRUEBA TERMINADA (todo se revierte)\n%', r;
END $$;
