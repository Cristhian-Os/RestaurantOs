-- Prueba de 20261124180000_central_propuestas. Un solo bloque DO que termina con RAISE EXCEPTION: todo se deshace. ESPERADO: todo "OK".
DO $$
DECLARE
  r text := ''; ok boolean; n int; e text;
  us uuid := gen_random_uuid(); um uuid := gen_random_uuid(); pid uuid;
  cs text := '{"role":"service_role"}';
  co2 text; co1 text; cm text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES (us,'authenticated','authenticated','dueno@prop.test'), (um,'authenticated','authenticated','mesero@prop.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueño','dueno@prop.test',NULL), (um,'waiter','Mesero','mesero@prop.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, restaurant_id = EXCLUDED.restaurant_id;
  co2 := json_build_object('role','authenticated','sub',us,'aal','aal2')::text;
  co1 := json_build_object('role','authenticated','sub',us,'aal','aal1')::text;
  cm  := json_build_object('role','authenticated','sub',um,'aal','aal2')::text;

  SELECT count(*) INTO n FROM central_propuestas;
  r := r || format(E'\n1 hay 6 propuestas iniciales, todas en "propuesta": %s', CASE WHEN n = 6 AND NOT EXISTS (SELECT 1 FROM central_propuestas WHERE estado <> 'propuesta') THEN 'OK' ELSE 'FALLA ('||n||')' END);
  SELECT count(*) INTO n FROM central_notificaciones WHERE origen = 'propuestas';
  r := r || format(E'\n2 cada una avisó en la campana: %s', CASE WHEN n = 6 THEN 'OK' ELSE 'FALLA ('||n||')' END);
  SELECT id INTO pid FROM central_propuestas ORDER BY created_at LIMIT 1;

  -- 3. Un cambio directo a "aprobada" se rechaza (aunque sea el servidor o el administrador de la base)
  ok := false; BEGIN UPDATE central_propuestas SET estado = 'aprobada' WHERE id = pid; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || format(E'\n3 nadie aprueba con un UPDATE directo: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 4. Mesero y dueño sin 2 pasos no deciden; anónimo no lee
  ok := false; PERFORM set_config('request.jwt.claims', cm, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_decidir_propuesta(pid, 'aprobar'); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n4a un mesero no decide: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', co1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_decidir_propuesta(pid, 'aprobar'); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n4b el dueño sin 2 pasos no decide: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM * FROM central_propuestas; EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n4c anónimo no lee las propuestas: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 5. El servidor no puede saltarse la aprobación del dueño
  ok := false; PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  BEGIN PERFORM central_avanzar_propuesta(pid, 'en_desarrollo'); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n5 el servidor no avanza una propuesta que el dueño no aprobó: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 6. El dueño con 2 pasos aprueba; no se puede decidir dos veces
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  e := central_decidir_propuesta(pid, 'aprobar', 'adelante'); RESET ROLE;
  r := r || format(E'\n6a el dueño con 2 pasos aprueba: %s', CASE WHEN e = 'aprobada' AND (SELECT decidido_por FROM central_propuestas WHERE id = pid) = us THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_decidir_propuesta(pid, 'rechazar'); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n6b no se puede decidir otra vez: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 7. Ahora el servidor sí avanza, paso a paso, y no puede publicar ni aprobar por su cuenta
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  PERFORM central_avanzar_propuesta(pid, 'en_desarrollo', 'rama/tomi-correo');
  ok := false; BEGIN PERFORM central_avanzar_propuesta(pid, 'publicada'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  RESET ROLE;
  r := r || format(E'\n7a el servidor no puede marcar "publicada": %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  PERFORM central_avanzar_propuesta(pid, 'para_revisar'); RESET ROLE;
  r := r || format(E'\n7b avanza hasta "para revisar" con su enlace: %s', CASE WHEN (SELECT estado FROM central_propuestas WHERE id = pid) = 'para_revisar' AND (SELECT enlace FROM central_propuestas WHERE id = pid) = 'rama/tomi-correo' THEN 'OK' ELSE 'FALLA' END);

  -- 8. Lo aprobado no se edita
  ok := false; BEGIN UPDATE central_propuestas SET costo = 'gratis' WHERE id = pid; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || format(E'\n8 lo que se aprobó no se edita: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 9. Rechazar funciona y deja nota; todo queda auditado
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  e := central_decidir_propuesta((SELECT id FROM central_propuestas WHERE estado = 'propuesta' ORDER BY created_at LIMIT 1), 'rechazar', 'no por ahora'); RESET ROLE;
  r := r || format(E'\n9a el dueño rechaza con nota: %s', CASE WHEN e = 'rechazada' THEN 'OK' ELSE 'FALLA' END);
  SELECT count(*) INTO n FROM central_auditoria WHERE recurso ILIKE '%central_propuestas%' OR accion ILIKE '%central_propuestas%';
  r := r || format(E'\n9b los cambios quedaron en la auditoría: %s', CASE WHEN n > 0 THEN 'OK' ELSE 'FALLA ('||n||')' END);

  RAISE EXCEPTION E'RESULTADO (todo se deshace):%', r;
END $$;
