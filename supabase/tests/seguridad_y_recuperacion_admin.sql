-- Prueba del endurecimiento y la recuperacion del admin (migracion 20261014183020). SOLO para un proyecto de PRUEBA.
-- Comprueba: anon sin acceso a funciones de personal, menu publico intacto, solo el super admin restablece
-- contrasenas de admin, la temporal obliga a cambiarla, queda auditoria, y la contrasena minima de 8.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  h1 text; h2 text; f text; j jsonb;
  CA text; CW text; CS text;
BEGIN
  -- 1) permisos de anon
  FOREACH f IN ARRAY ARRAY['registrar_venta_stock(uuid)','calcular_costo_receta(uuid)','change_my_password(text)','crear_orden_completa(uuid,jsonb,text,text,integer,text,text)',
    'hacer_corte_caja(text)','cobrar_orden(uuid,text,numeric,numeric)','cobrar_orden_inicial(uuid,text,numeric,numeric)','get_admin_metrics()','guardar_receta_manual(uuid,jsonb)',
    'delete_dish(uuid)','cancelar_item_orden(uuid,integer)','check_rate_limit(text,integer,integer)','plataforma_restablecer_admin(text,text)'] LOOP
    r := concat(r, 'anon ejecuta ', f, ': ', has_function_privilege('anon', 'public.'||f, 'EXECUTE'), ' (esperado false)', E'\n');
  END LOOP;
  FOREACH f IN ARRAY ARRAY['create_public_order(uuid,integer,text,text,jsonb)','cancelar_orden(uuid)','editar_items_pedido(uuid,jsonb)','obtener_comentarios_plato(uuid,text)',
    'is_admin()','get_user_role()','current_restaurant_id()','tv_cocina_datos(text)'] LOOP
    BEGIN
      r := concat(r, 'anon ejecuta ', f, ': ', has_function_privilege('anon', 'public.'||f, 'EXECUTE'), ' (esperado true)', E'\n');
    EXCEPTION WHEN undefined_function THEN r := concat(r, '(la funcion ', f, ' no existe en este proyecto)', E'\n'); END;
  END LOOP;
  r := concat(r, 'authenticated ejecuta cobrar_orden: ', has_function_privilege('authenticated', 'public.cobrar_orden(uuid,text,numeric,numeric)', 'EXECUTE'), ' (esperado true)', E'\n');

  -- 2) recuperacion del admin
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Seg A','seg-a','sega.test');
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES (ua,'authenticated','authenticated','admin@sega.test', crypt('ClaveVieja123', gen_salt('bf'))),(uw,'authenticated','authenticated','mesero@sega.test','x'),(us,'authenticated','authenticated','dueno@plataforma.test','x');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'admin','Admin Seg','admin@sega.test',ra),(uw,'waiter','Mesero Seg','mesero@sega.test',ra),(us,'super_admin','Dueño','dueno@plataforma.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CW := '{"role":"authenticated","sub":"'||uw||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}';
  SELECT encrypted_password INTO h1 FROM auth.users WHERE id = ua;

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_restablecer_admin('admin@sega.test','TemporalSegura1'); r := concat(r, 'admin restablece (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'un admin no puede restablecer: ', sqlerrm, E'\n'); END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CW, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_restablecer_admin('admin@sega.test','TemporalSegura1'); r := concat(r, 'mesero restablece (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'un mesero no puede restablecer: ', sqlerrm, E'\n'); END;

  RESET ROLE; PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_restablecer_admin('admin@sega.test','corta'); r := concat(r, 'temporal corta aceptada (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'temporal corta rechazada: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM plataforma_restablecer_admin('mesero@sega.test','TemporalSegura1'); r := concat(r, 'restablecer a un mesero (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'a un mesero no: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM plataforma_restablecer_admin('nadie@x.test','TemporalSegura1'); r := concat(r, 'correo inexistente aceptado (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'correo inexistente: ', sqlerrm, E'\n'); END;
  j := plataforma_restablecer_admin('ADMIN@sega.test','TemporalSegura1');
  r := concat(r, 'super admin restablece: ', j::text, E'\n');
  RESET ROLE;
  SELECT encrypted_password INTO h2 FROM auth.users WHERE id = ua;
  r := concat(r, 'contrasena cambio: ', (h1 <> h2), ', coincide con la temporal: ', (h2 = crypt('TemporalSegura1', h2)), ', obliga a cambiarla: ', (SELECT must_change_password FROM profiles WHERE id = ua), ' (esperado true/true/true)', E'\n');
  r := concat(r, 'auditoria registrada: ', (SELECT count(*) FROM platform_audit_log WHERE target_user_id = ua AND actor_id = us), ' (esperado 1)', E'\n');

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  r := concat(r, 'un admin no ve la auditoria: filas=', (SELECT count(*) FROM platform_audit_log), ' (esperado 0)', E'\n');
  RESET ROLE; PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  r := concat(r, 'el super admin ve la auditoria: filas=', (SELECT count(*) FROM platform_audit_log), ' (esperado 1 o mas)', E'\n');
  RESET ROLE;

  -- 3) contrasena minima al crear restaurante
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM crear_restaurante('Seg B','nuevo@segb.test','1234567','Dueño'); r := concat(r, 'contrasena de 7 aceptada (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'contrasena de 7 rechazada: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
