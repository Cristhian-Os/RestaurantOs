-- Prueba de la migración 20261114120000_cerrar_escalada_de_rol. Puede correrse en PRUEBA, en el Postgres local o en producción
-- (es un solo bloque DO que termina con RAISE EXCEPTION: todo lo que crea se deshace; solo con el "apruebo, aplica" del dueño)
-- (node .claude/qa-mock/pg-local/correr.mjs --migracion supabase/migrations/20261114120000_cerrar_escalada_de_rol.sql --prueba supabase/tests/seguridad_escalada_rol.sql).
-- ESPERADO con la migración: nadie se sube de rol desde la app y las funciones del servidor siguen funcionando (todas las líneas "ok").
-- SIN la migración, las líneas FALLA muestran el hueco. Termina con RAISE EXCEPTION: todo se revierte.
DO $$
DECLARE
  r text := '';
  ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uo uuid := gen_random_uuid();
  un uuid := gen_random_uuid(); um uuid := gen_random_uuid();
  cw text; ca text; cs text;
  v_role text; v_rid uuid; v_txt text; v_bool boolean; j jsonb; ok boolean;
BEGIN
  -- Datos de prueba, creados sin sesión de la app (como lo haría el dueño con SQL)
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Esc A','esc-a','esca.test'), (rb,'Esc B','esc-b','escb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (ua,'authenticated','authenticated','admin@esca.test'), (uw,'authenticated','authenticated','mesero@esca.test'),
    (ub,'authenticated','authenticated','admin@escb.test'), (uo,'authenticated','authenticated','cajero@esca.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (ua,'admin','Admin A','admin@esca.test',ra), (uw,'waiter','Mesero A','mesero@esca.test',ra),
    (ub,'admin','Admin B','admin@escb.test',rb), (uo,'cashier','Cajero A','cajero@esca.test',ra)
  ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, full_name=EXCLUDED.full_name;
  cw := json_build_object('role','authenticated','sub',uw,'aal','aal1')::text;
  ca := json_build_object('role','authenticated','sub',ua,'aal','aal1')::text;
  cs := json_build_object('role','service_role')::text;

  -- ── A. Un mesero con sesión ────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', cw, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id = uw; EXCEPTION WHEN OTHERS THEN NULL; END;
  v_bool := is_super_admin();
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = uw;
  r := r || CASE WHEN v_role='waiter' AND NOT v_bool THEN 'ok   ' ELSE 'FALLA' END || ' A1 mesero NO puede hacerse super_admin (quedó: '||v_role||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET role='waiter' WHERE id = uw;

  PERFORM set_config('request.jwt.claims', cw, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='admin' WHERE id = uw; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = uw;
  r := r || CASE WHEN v_role='waiter' THEN 'ok   ' ELSE 'FALLA' END || ' A2 mesero NO puede hacerse administrador (quedó: '||v_role||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET role='waiter' WHERE id = uw;

  PERFORM set_config('request.jwt.claims', cw, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET restaurant_id = rb WHERE id = uw; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT restaurant_id INTO v_rid FROM profiles WHERE id = uw;
  r := r || CASE WHEN v_rid = ra THEN 'ok   ' ELSE 'FALLA' END || ' A3 mesero NO puede pasarse a otro restaurante'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET restaurant_id = ra WHERE id = uw;

  PERFORM set_config('request.jwt.claims', cw, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET full_name='Mesero Editado', phone='3000000000' WHERE id = uw; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT full_name INTO v_txt FROM profiles WHERE id = uw;
  r := r || CASE WHEN v_txt='Mesero Editado' THEN 'ok   ' ELSE 'FALLA' END || ' A4 mesero SÍ puede editar su nombre y teléfono'||E'\n';

  -- ── B. Un administrador de restaurante con sesión ──────────────────────────
  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id = ua; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = ua;
  r := r || CASE WHEN v_role='admin' THEN 'ok   ' ELSE 'FALLA' END || ' B1 admin NO puede hacerse super_admin (quedó: '||v_role||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET role='admin' WHERE id = ua;

  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id = uo; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = uo;
  r := r || CASE WHEN v_role='cashier' THEN 'ok   ' ELSE 'FALLA' END || ' B2 admin NO puede hacer super_admin a un empleado (quedó: '||v_role||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET role='cashier' WHERE id = uo;

  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM profiles WHERE id = uo;
    INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (uo,'super_admin','Cajero A','cajero@esca.test',ra);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = uo;
  r := r || CASE WHEN v_role IS DISTINCT FROM 'super_admin' THEN 'ok   ' ELSE 'FALLA' END || ' B3 admin NO puede borrar un perfil y recrearlo como super_admin (quedó: '||coalesce(v_role,'sin perfil')||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (uo,'cashier','Cajero A','cajero@esca.test',ra)
    ON CONFLICT (id) DO UPDATE SET role='cashier', restaurant_id=ra;

  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET active=false, full_name='Cajero Editado' WHERE id = uo; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT full_name INTO v_txt FROM profiles WHERE id = uo;
  r := r || CASE WHEN v_txt='Cajero Editado' THEN 'ok   ' ELSE 'FALLA' END || ' B4 admin SÍ puede desactivar y renombrar a un empleado (pantalla Equipo)'||E'\n';

  SET LOCAL ROLE authenticated; ok := true;
  BEGIN PERFORM admin_update_employee(uo, NULL, NULL, NULL, NULL, 'kitchen'); EXCEPTION WHEN OTHERS THEN ok := false; v_txt := sqlerrm; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = uo;
  r := r || CASE WHEN ok AND v_role='kitchen' THEN 'ok   ' ELSE 'FALLA' END || ' B5 admin SÍ cambia el rol de un empleado con la función del servidor (quedó: '||v_role||CASE WHEN ok THEN '' ELSE ', error: '||v_txt END||')'||E'\n';

  SET LOCAL ROLE authenticated; ok := true; j := NULL;
  BEGIN j := create_employee_profile('nuevo@esca.test','Nuevo Empleado','cashier','Clave1234'); EXCEPTION WHEN OTHERS THEN ok := false; v_txt := sqlerrm; END;
  RESET ROLE; v_role := NULL; v_rid := NULL;
  SELECT role, restaurant_id INTO v_role, v_rid FROM profiles WHERE email = 'nuevo@esca.test';
  r := r || CASE WHEN ok AND v_role='cashier' AND v_rid = ra THEN 'ok   ' ELSE 'FALLA' END || ' B6 admin SÍ crea un empleado nuevo con su rol y su restaurante (rol: '||coalesce(v_role,'-')||CASE WHEN ok THEN '' ELSE ', error: '||v_txt END||')'||E'\n';

  SET LOCAL ROLE authenticated; ok := false;
  BEGIN PERFORM create_employee_profile('trampa@esca.test','Trampa','super_admin','Clave1234'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' B7 la función de crear empleados rechaza el rol super_admin'||E'\n';
  ok := false;
  BEGIN PERFORM admin_update_employee(uo, NULL, NULL, NULL, NULL, 'super_admin'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' B8 la función de editar empleados rechaza el rol super_admin'||E'\n';

  BEGIN UPDATE profiles SET full_name='Tocado por A' WHERE id = ub; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT full_name INTO v_txt FROM profiles WHERE id = ub;
  r := r || CASE WHEN v_txt='Admin B' THEN 'ok   ' ELSE 'FALLA' END || ' B9 admin de un restaurante NO toca perfiles de otro restaurante'||E'\n';

  -- ── C. Registro público: alguien se registra por su cuenta y manda el rol que quiere ──
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN EXECUTE 'SET LOCAL ROLE supabase_auth_admin'; EXCEPTION WHEN OTHERS THEN NULL; END;   -- así entra el servicio de Auth
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data) VALUES
    (un,'authenticated','authenticated','intruso@fuera.test', '{"role":"super_admin","full_name":"Intruso"}'::jsonb),
    (um,'authenticated','authenticated','intruso2@fuera.test', jsonb_build_object('role','admin','restaurant_id',ra));
  RESET ROLE;
  SELECT role, restaurant_id INTO v_role, v_rid FROM profiles WHERE id = un;
  r := r || CASE WHEN v_role='waiter' AND v_rid IS NULL THEN 'ok   ' ELSE 'FALLA' END || ' C1 quien se registra pidiendo super_admin NO lo recibe (nació como: '||coalesce(v_role,'sin perfil')||')'||E'\n';
  SELECT role, restaurant_id INTO v_role, v_rid FROM profiles WHERE id = um;
  r := r || CASE WHEN v_role='waiter' AND v_rid IS NULL THEN 'ok   ' ELSE 'FALLA' END || ' C2 quien se registra pidiendo ser admin de un restaurante ajeno NO lo recibe (nació como: '||coalesce(v_role,'sin perfil')||CASE WHEN v_rid IS NULL THEN ', sin restaurante' ELSE ', DENTRO del restaurante A' END||')'||E'\n';

  -- ── D. Llave de servicio (funciones del servidor) y dueño con SQL ──────────
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id = ua; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE; SELECT role INTO v_role FROM profiles WHERE id = ua;
  r := r || CASE WHEN v_role='admin' THEN 'ok   ' ELSE 'FALLA' END || ' D1 ni con la llave de servicio se asigna super_admin desde la app (quedó: '||v_role||')'||E'\n';
  PERFORM set_config('request.jwt.claims', '', true); UPDATE profiles SET role='admin' WHERE id = ua;

  ok := true;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id = ub; EXCEPTION WHEN OTHERS THEN ok := false; END;
  SELECT role INTO v_role FROM profiles WHERE id = ub;
  r := r || CASE WHEN ok AND v_role='super_admin' THEN 'ok   ' ELSE 'FALLA' END || ' D2 el dueño SÍ puede nombrar un super_admin con SQL directo en Supabase'||E'\n';

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
