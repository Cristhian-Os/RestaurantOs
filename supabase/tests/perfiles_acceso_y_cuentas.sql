-- Prueba de 20261022120000_perfiles_acceso_y_cuentas. SOLO para un proyecto de PRUEBA.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte. Cada linea debe terminar en OK.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  uw2 uuid := gen_random_uuid(); un uuid := gen_random_uuid();
  CA text; CB text; CW text; CX text; v text; j jsonb;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Perf A','perf-a','pa.test'),(rb,'Perf B','perf-b','pb.test');
  INSERT INTO restaurant_config (display_name, restaurant_id) VALUES ('Perf A', ra),('Perf B', rb);
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','a@pa.test'),(ub,'authenticated','authenticated','b@pb.test'),
    (uw,'authenticated','authenticated','w@pa.test'),(ux,'authenticated','authenticated','x@pa.test'),(uw2,'authenticated','authenticated','w2@pb.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (ua,'admin','Admin A','a@pa.test',ra,true),(ub,'admin','Admin B','b@pb.test',rb,true),
    (uw,'waiter','Mesero A','w@pa.test',ra,true),(ux,'waiter','Inactivo A','x@pa.test',ra,false),(uw2,'waiter','Mesero B','w2@pb.test',rb,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=EXCLUDED.active, full_name=EXCLUDED.full_name;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CB := '{"role":"authenticated","sub":"'||ub||'"}';
  CW := '{"role":"authenticated","sub":"'||uw||'"}'; CX := '{"role":"authenticated","sub":"'||ux||'"}';

  -- Mesero: no puede ascenderse ni cambiar de restaurante, pero si editar sus datos personales.
  PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id=uw; r := r||'1) mesero -> super_admin: FALLA (lo permitio)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'1) mesero -> super_admin rechazado: OK'||E'\n'; END;
  BEGIN UPDATE profiles SET restaurant_id=rb WHERE id=uw; r := r||'2) mesero cambia de restaurante: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'2) mesero cambia de restaurante rechazado: OK'||E'\n'; END;
  BEGIN UPDATE profiles SET full_name='Nuevo Nombre' WHERE id=uw; r := r||'3) mesero edita su nombre: OK'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'3) mesero edita su nombre: FALLA '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO profiles (id, role, email) VALUES (gen_random_uuid(),'super_admin','z@z.test'); r := r||'4) INSERT directo de perfil: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'4) INSERT directo de perfil rechazado: OK'||E'\n'; END;

  -- Admin A: no cambia roles por UPDATE directo, ni toca a otro restaurante, ni a otro admin.
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='admin' WHERE id=uw; r := r||'5) admin cambia rol por UPDATE directo: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'5) admin cambia rol por UPDATE directo rechazado: OK'||E'\n'; END;
  BEGIN PERFORM set_employee_active(uw2, false); r := r||'6) admin A desactiva empleado de B: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'6) admin A desactiva empleado de B rechazado: OK'||E'\n'; END;
  BEGIN PERFORM admin_update_employee(uw2, NULL, NULL, 'Hack', NULL, NULL); r := r||'7) admin A edita empleado de B: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'7) admin A edita empleado de B rechazado: OK'||E'\n'; END;
  BEGIN PERFORM admin_update_employee(ua, NULL, NULL, NULL, NULL, 'waiter'); r := r||'8) admin se quita su propio rol: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'8) admin se quita su propio rol rechazado: OK'||E'\n'; END;
  BEGIN PERFORM admin_update_employee(uw, NULL, '1234567', NULL, NULL, NULL); r := r||'9) contraseña de 7 caracteres: FALLA'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'9) contraseña de 7 caracteres rechazada: OK'||E'\n'; END;
  j := set_employee_active(uw, false);
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  v := coalesce(get_user_role(),'NULL')||'/'||coalesce(current_restaurant_id()::text,'NULL')||'/'||is_admin();
  r := r||'10) mesero desactivado por RPC: rol/restaurante/is_admin = '||v||CASE WHEN v='NULL/NULL/false' THEN ': OK' ELSE ': FALLA' END||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  j := set_employee_active(uw, true);
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  r := r||'11) reactivado: rol = '||coalesce(get_user_role(),'NULL')||CASE WHEN get_user_role()='waiter' THEN ': OK' ELSE ': FALLA' END||E'\n';

  -- Perfil inactivo: sus helpers no devuelven nada y no ve datos del restaurante.
  RESET ROLE; PERFORM set_config('request.jwt.claims', CX, true); SET LOCAL ROLE authenticated;
  v := coalesce(get_user_role(),'NULL')||'/'||coalesce(current_restaurant_id()::text,'NULL');
  r := r||'12) perfil inactivo desde el inicio: '||v||CASE WHEN v='NULL/NULL' THEN ': OK' ELSE ': FALLA' END||E'\n';

  -- Alta de usuario con metadata maliciosa: queda como cliente inactivo y sin restaurante.
  RESET ROLE;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data) VALUES (un,'authenticated','authenticated','n@x.test',
     jsonb_build_object('role','super_admin','restaurant_id',ra::text,'full_name','Intruso'));
  SELECT role||'/'||coalesce(restaurant_id::text,'NULL')||'/'||active INTO v FROM profiles WHERE id=un;
  r := r||'13) alta con metadata maliciosa: '||v||CASE WHEN v='client/NULL/false' THEN ': OK' ELSE ': FALLA' END||E'\n';

  -- config_publica: anonimo la lee, y solo columnas publicas.
  SET LOCAL ROLE anon;
  j := config_publica(ra);
  r := r||'14) anon lee config_publica: '||CASE WHEN j->>'display_name'='Perf A' THEN 'OK' ELSE 'FALLA' END||E'\n';
  r := r||'15) config_publica sin columnas internas: '||CASE WHEN NOT (j ? 'plantillas_aplicadas' OR j ? 'onboarding_completed_at' OR j ? 'id') THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE;
  UPDATE restaurants SET active=false WHERE id=ra;
  SET LOCAL ROLE anon; j := config_publica(ra);
  r := r||'16) restaurante inactivo no expone config: '||CASE WHEN j IS NULL THEN 'OK' ELSE 'FALLA' END||E'\n';
  RESET ROLE;
  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
