-- Prueba de la migración 20261114130000_central_acceso_auditoria. Puede correrse en PRUEBA, en el Postgres local o en producción
-- (es un solo bloque DO que termina con RAISE EXCEPTION: todo lo que crea se deshace; solo con el "apruebo, aplica" del dueño)
-- (node .claude/qa-mock/pg-local/correr.mjs --migracion supabase/migrations/20261114120000_cerrar_escalada_de_rol.sql
--   --migracion supabase/migrations/20261114130000_central_acceso_auditoria.sql --prueba supabase/tests/central_acceso.sql).
-- ESPERADO: a Central solo entra el super admin con código de 2 pasos; el servidor lo decide y lo deja registrado;
-- el registro no se puede editar ni borrar. Termina con RAISE EXCEPTION: todo se revierte.
DO $$
DECLARE
  r text := '';
  ra uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  ca text; cw text; s1 text; s2 text;
  j jsonb; n int; ok boolean;
BEGIN
  -- Datos de prueba, creados sin sesión de la app (como lo haría el dueño con SQL)
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Central A','central-a','centrala.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (ua,'authenticated','authenticated','admin@centrala.test'), (uw,'authenticated','authenticated','mesero@centrala.test'),
    (us,'authenticated','authenticated','dueno@central.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (ua,'admin','Admin A','admin@centrala.test',ra), (uw,'waiter','Mesero A','mesero@centrala.test',ra),
    (us,'super_admin','Dueño','dueno@central.test',NULL)
  ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  ca := json_build_object('role','authenticated','sub',ua,'aal','aal1')::text;
  cw := json_build_object('role','authenticated','sub',uw,'aal','aal2')::text;   -- un mesero con 2 pasos tampoco entra
  s1 := json_build_object('role','authenticated','sub',us,'aal','aal1')::text;
  s2 := json_build_object('role','authenticated','sub',us,'aal','aal2')::text;

  -- ── 1. Sin sesión ──────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  ok := false; BEGIN PERFORM central_verificar_acceso(); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1a sin sesión NO puede ejecutar la verificación de acceso'||E'\n';
  ok := false; BEGIN SELECT count(*) INTO n FROM central_auditoria; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1b sin sesión NO puede leer el registro de Central'||E'\n';
  ok := false; BEGIN PERFORM central_autorizado(); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1c sin sesión NO puede ejecutar la regla de acceso'||E'\n';
  RESET ROLE;

  -- ── 2. Administrador de un restaurante ─────────────────────────────────────
  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  j := central_verificar_acceso();
  r := r || CASE WHEN (j->>'permitido')::boolean IS FALSE AND j->>'motivo' = 'sin_permiso' THEN 'ok   ' ELSE 'FALLA' END || ' 2a admin de restaurante: el servidor responde NO ('||j::text||')'||E'\n';
  PERFORM central_verificar_acceso(); PERFORM central_verificar_acceso();   -- insiste dos veces más
  SELECT count(*) INTO n FROM central_auditoria;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 2b admin de restaurante NO ve ninguna fila del registro (vio: '||n||')'||E'\n';
  r := r || CASE WHEN NOT central_autorizado() THEN 'ok   ' ELSE 'FALLA' END || ' 2c la regla de acceso es falsa para un admin de restaurante'||E'\n';
  ok := false; BEGIN INSERT INTO central_auditoria (actor_tipo, accion, resultado) VALUES ('humano','falso','ok'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 2d admin de restaurante NO puede escribir en el registro'||E'\n';
  RESET ROLE;
  SELECT count(*) INTO n FROM central_auditoria WHERE actor_id = ua AND accion = 'acceso_denegado';
  r := r || CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLA' END || ' 2e sus 3 intentos quedaron anotados UNA sola vez (filas: '||n||')'||E'\n';

  -- ── 3. Mesero, aunque tenga código de 2 pasos ──────────────────────────────
  PERFORM set_config('request.jwt.claims', cw, true); SET LOCAL ROLE authenticated;
  j := central_verificar_acceso();
  SELECT count(*) INTO n FROM central_auditoria;
  r := r || CASE WHEN (j->>'permitido')::boolean IS FALSE AND n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 3a mesero con 2 pasos: NO entra y NO ve el registro ('||j::text||')'||E'\n';
  RESET ROLE;

  -- ── 4. Super admin SIN código de 2 pasos ───────────────────────────────────
  PERFORM set_config('request.jwt.claims', s1, true); SET LOCAL ROLE authenticated;
  j := central_verificar_acceso();
  r := r || CASE WHEN (j->>'permitido')::boolean IS FALSE AND j->>'motivo' = 'requiere_mfa' THEN 'ok   ' ELSE 'FALLA' END || ' 4a super admin sin 2 pasos: el servidor responde NO y pide el código ('||j::text||')'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 4b super admin sin 2 pasos NO ve el registro (vio: '||n||')'||E'\n';
  RESET ROLE;

  -- ── 5. Super admin CON código de 2 pasos ───────────────────────────────────
  PERFORM set_config('request.jwt.claims', s2, true); SET LOCAL ROLE authenticated;
  j := central_verificar_acceso();
  r := r || CASE WHEN (j->>'permitido')::boolean IS TRUE THEN 'ok   ' ELSE 'FALLA' END || ' 5a super admin con 2 pasos: el servidor responde SÍ ('||j::text||')'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria;
  r := r || CASE WHEN n = 4 THEN 'ok   ' ELSE 'FALLA' END || ' 5b ve el registro completo: 3 intentos denegados + su acceso (filas: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria WHERE actor_id = us AND accion = 'acceso_concedido' AND resultado = 'ok' AND nivel = 'N0';
  r := r || CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLA' END || ' 5c su acceso quedó registrado con quién, qué, cuándo, nivel y resultado'||E'\n';
  ok := false; BEGIN UPDATE central_auditoria SET accion = 'alterado'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 5d ni el super admin puede EDITAR el registro'||E'\n';
  ok := false; BEGIN DELETE FROM central_auditoria; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 5e ni el super admin puede BORRAR el registro'||E'\n';
  ok := false; BEGIN INSERT INTO central_auditoria (actor_tipo, accion, resultado) VALUES ('humano','falso','ok'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 5f ni el super admin escribe a mano en el registro (solo las funciones del servidor)'||E'\n';
  RESET ROLE;

  -- ── 6. Llave de servicio (lo que usarán los agentes) y dueño de la base ────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true); SET LOCAL ROLE service_role;
  ok := false; BEGIN UPDATE central_auditoria SET accion = 'alterado'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6a la llave de servicio NO puede editar el registro'||E'\n';
  ok := false; BEGIN DELETE FROM central_auditoria; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6b la llave de servicio NO puede borrar el registro'||E'\n';
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ok := false; BEGIN TRUNCATE central_auditoria; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6c ni con SQL directo se vacía el registro'||E'\n';

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
