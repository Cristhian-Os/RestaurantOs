-- Prueba de 20261015200000_endurecer_perfiles_y_cuentas_inactivas. SOLO para un proyecto de PRUEBA.
-- Comprueba: nadie se sube el rol ni cambia de restaurante por la API, un admin no puede promover a super_admin,
-- el signup directo no hereda rol/restaurante de la metadata, un empleado inactivo pierde todo acceso y
-- set_employee_active / eliminar_empleado respetan el aislamiento entre restaurantes.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); umes uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); unew uuid := gen_random_uuid();
  CADM text; CMES text; n int; f record;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Per A','per-a','pera.test'),(rb,'Per B','per-b','perb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (uadm,'authenticated','authenticated','adm@pera.test'),(umes,'authenticated','authenticated','mes@pera.test'),
    (ub,'authenticated','authenticated','adm@perb.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (uadm,'admin','Adm A','adm@pera.test',ra,true),(umes,'waiter','Mesero A','mes@pera.test',ra,true),(ub,'admin','Adm B','adm@perb.test',rb,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}'; CMES := '{"role":"authenticated","sub":"'||umes||'"}';

  -- C1: el mesero intenta subirse el rol / cambiar de restaurante / reactivarse
  PERFORM set_config('request.jwt.claims', CMES, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id=umes; r := concat(r, 'mesero -> super_admin (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no puede cambiar su rol: ', sqlerrm, E'\n'); END;
  BEGIN UPDATE profiles SET role='admin' WHERE id=umes; r := concat(r, 'mesero -> admin (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no puede hacerse admin: ', sqlerrm, E'\n'); END;
  BEGIN UPDATE profiles SET restaurant_id=rb WHERE id=umes; r := concat(r, 'mesero cambia de restaurante (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no cambia de restaurante: ', sqlerrm, E'\n'); END;
  BEGIN UPDATE profiles SET active=true, email='x@x.test' WHERE id=umes; r := concat(r, 'mesero edita active/email (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no edita active/email: ', sqlerrm, E'\n'); END;
  UPDATE profiles SET full_name='Mesero Editado', phone='3000000000' WHERE id=umes;
  GET DIAGNOSTICS n = ROW_COUNT; r := concat(r, 'mesero edita su nombre/telefono: ', n, ' fila (esperado 1)', E'\n');
  BEGIN INSERT INTO profiles (id, role, restaurant_id) VALUES (gen_random_uuid(),'admin',ra); r := concat(r, 'insert directo en profiles (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'insert directo rechazado: ', sqlerrm, E'\n'); END;

  -- el admin tampoco puede promover a nadie a super_admin ni mover gente de restaurante
  RESET ROLE; PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  BEGIN UPDATE profiles SET role='super_admin' WHERE id=umes; r := concat(r, 'admin promueve a super_admin (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'admin no promueve a super_admin: ', sqlerrm, E'\n'); END;
  BEGIN UPDATE profiles SET restaurant_id=rb WHERE id=umes; r := concat(r, 'admin mueve empleado de restaurante (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'admin no mueve empleados: ', sqlerrm, E'\n'); END;

  -- aislamiento de set_employee_active
  BEGIN PERFORM set_employee_active(ub, false); r := concat(r, 'admin A desactiva admin B (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'admin A no toca a B: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM set_employee_active(uadm, false); r := concat(r, 'admin se desactiva a si mismo (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'admin no se desactiva: ', sqlerrm, E'\n'); END;
  PERFORM set_employee_active(umes, false);
  RESET ROLE;
  SELECT p.active, (u.banned_until IS NOT NULL) AS baneado INTO f FROM profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=umes;
  r := concat(r, 'mesero desactivado: active=', f.active, ' baneado=', f.baneado, ' (esperado false/true)', E'\n');

  -- C3: el mesero inactivo ya no tiene rol ni restaurante ni puede llamar RPC de personal
  PERFORM set_config('request.jwt.claims', CMES, true); SET LOCAL ROLE authenticated;
  r := concat(r, 'rol del inactivo: ', coalesce(get_user_role(),'NULL'), ' (esperado NULL)', E'\n');
  r := concat(r, 'restaurante del inactivo: ', coalesce(current_restaurant_id()::text,'NULL'), ' (esperado NULL)', E'\n');
  BEGIN UPDATE profiles SET active=true WHERE id=umes; r := concat(r, 'inactivo se reactiva (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'inactivo no se reactiva: ', sqlerrm, E'\n'); END;
  RESET ROLE;

  -- reactivar y eliminar
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  PERFORM set_employee_active(umes, true);
  PERFORM eliminar_empleado(umes);
  RESET ROLE;
  SELECT p.active, p.full_name, (u.banned_until IS NOT NULL) AS baneado INTO f FROM profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=umes;
  r := concat(r, 'eliminado: active=', f.active, ' nombre=', f.full_name, ' baneado=', f.baneado, ' (esperado false/Empleado eliminado/true)', E'\n');

  -- C2: signup directo con metadata maliciosa
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (unew,'authenticated','authenticated','atacante@x.test', jsonb_build_object('role','super_admin','restaurant_id',ra,'full_name','Atacante'));
  SELECT role, restaurant_id, active INTO f FROM profiles WHERE id=unew;
  r := concat(r, 'signup con metadata maliciosa -> role=', f.role, ' restaurante=', coalesce(f.restaurant_id::text,'NULL'), ' active=', f.active, ' (esperado client/NULL/false)', E'\n');

  -- crear_restaurante / create_employee_profile siguen funcionando (completan el perfil con ON CONFLICT)
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  PERFORM create_employee_profile('nuevo@pera.test','Nuevo Cajero','cashier','ClaveSegura1');
  RESET ROLE;
  SELECT role, restaurant_id, active, must_change_password INTO f FROM profiles WHERE email='nuevo@pera.test';
  r := concat(r, 'create_employee_profile -> role=', f.role, ' mismo restaurante=', (f.restaurant_id=ra), ' active=', f.active, ' cambiar clave=', f.must_change_password, ' (esperado cashier/true/true/true)', E'\n');
  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM create_employee_profile('corto@pera.test','Corto','waiter','1234567'); r := concat(r, 'clave de 7 aceptada (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'clave de 7 rechazada: ', sqlerrm, E'\n'); END;
  RESET ROLE;

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
