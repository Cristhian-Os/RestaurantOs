-- Prueba de la migración 20261114140000_central_nucleo (núcleo institucional de Central).
-- Corre en el Postgres local (PGlite), en PRUEBA o en producción (un solo bloque DO que termina con RAISE EXCEPTION: todo se deshace;
-- en producción solo con el "apruebo, aplica" del dueño):
--   node .claude/qa-mock/pg-local/correr.mjs --migracion supabase/migrations/20261114120000_cerrar_escalada_de_rol.sql
--     --migracion supabase/migrations/20261114130000_central_acceso_auditoria.sql
--     --migracion supabase/migrations/20261114140000_central_nucleo.sql --prueba supabase/tests/central_nucleo.sql
-- ESPERADO: solo el super admin con 2 pasos toca Central; las reglas de niveles, aprobaciones, mensajes e integraciones
-- las hace cumplir la base (no la pantalla); todo queda en el registro de auditoría. Termina con RAISE EXCEPTION.
-- (central_acceso.sql cuenta filas del registro desde cero: se corre aparte, sin esta migración.)
DO $$
DECLARE
  r text := '';
  ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  ca text; s1 text; s2 text;
  ok boolean; n int; j jsonb; t text; v text;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; ap uuid; ap2 uuid; conv uuid; doc uuid;
  fila jsonb;
BEGIN
  -- Datos de prueba creados fuera de la app (como lo haría el dueño con SQL)
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Rest A','rest-a','resta.test'), (rb,'Rest B','rest-b','restb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','admin@resta.test'), (us,'authenticated','authenticated','dueno@central.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (ua,'admin','Admin A','admin@resta.test',ra), (us,'super_admin','Dueño','dueno@central.test',NULL)
  ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  INSERT INTO subscriptions (restaurant_id, plan, status, current_period_end) VALUES (ra,'base','active', now() + interval '20 days');
  INSERT INTO orders (restaurant_id, status, total, paid_at) VALUES
    (ra,'completed',10000, now()), (ra,'pending',5000, NULL), (ra,'cancelled',7000, now());
  ca := json_build_object('role','authenticated','sub',ua,'aal','aal2')::text;     -- admin de restaurante, aunque tenga 2 pasos
  s1 := json_build_object('role','authenticated','sub',us,'aal','aal1')::text;
  s2 := json_build_object('role','authenticated','sub',us,'aal','aal2')::text;

  -- ── 1. Sin sesión ──────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  ok := false; BEGIN SELECT count(*) INTO n FROM central_departamentos; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1a sin sesión NO lee los departamentos'||E'\n';
  ok := false; BEGIN PERFORM central_restaurantes(); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1b sin sesión NO ve los restaurantes'||E'\n';
  ok := false; BEGIN INSERT INTO central_tareas (titulo) VALUES ('intruso'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 1c sin sesión NO crea tareas'||E'\n';
  RESET ROLE;

  -- ── 2. Admin de restaurante (con 2 pasos) y super admin sin 2 pasos ────────
  PERFORM set_config('request.jwt.claims', ca, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM central_departamentos;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 2a admin de restaurante NO ve departamentos (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_agentes;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 2b admin de restaurante NO ve agentes (vio: '||n||')'||E'\n';
  ok := false; BEGIN PERFORM central_restaurantes(); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 2c admin de restaurante NO ve la lista de restaurantes'||E'\n';
  ok := false; BEGIN INSERT INTO central_tareas (titulo) VALUES ('intruso'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 2d admin de restaurante NO crea tareas'||E'\n';
  ok := false; BEGIN PERFORM central_decidir_aprobacion(gen_random_uuid(), 'aprobada', NULL); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 2e admin de restaurante NO decide aprobaciones'||E'\n';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', s1, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM central_departamentos;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 2f super admin SIN 2 pasos NO ve nada (vio: '||n||')'||E'\n';
  ok := false; BEGIN PERFORM central_restaurantes(); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 2g super admin SIN 2 pasos NO ve restaurantes'||E'\n';
  RESET ROLE;

  -- ── 3. Super admin con 2 pasos: lo aprobado ya está cargado ────────────────
  PERFORM set_config('request.jwt.claims', s2, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM central_departamentos;
  r := r || CASE WHEN n = 19 THEN 'ok   ' ELSE 'FALLA' END || ' 3a ve los 19 departamentos y servicios (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_departamentos WHERE anillo = 2;
  r := r || CASE WHEN n = 4 THEN 'ok   ' ELSE 'FALLA' END || ' 3b el anillo 2 tiene 4 áreas (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_agentes;
  r := r || CASE WHEN n = 11 THEN 'ok   ' ELSE 'FALLA' END || ' 3c ve los 11 agentes del organigrama (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_agentes WHERE nivel <> 'N0' OR ciclo <> 'disenado' OR proveedor_estado <> 'no_conectado';
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 3d todos nacen N0, diseñados y sin conexión (distintos: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_integraciones WHERE estado <> 'no_conectada';
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 3e ninguna integración nace conectada (conectadas: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_conversaciones WHERE tipo = 'canal_institucional';
  r := r || CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLA' END || ' 3f hay un canal institucional (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_conversaciones WHERE tipo = 'canal_departamento';
  r := r || CASE WHEN n = 11 THEN 'ok   ' ELSE 'FALLA' END || ' 3g hay un canal por dirección y departamento (vio: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_memoria WHERE capa IN ('institucional','permanente');
  r := r || CASE WHEN n = 4 THEN 'ok   ' ELSE 'FALLA' END || ' 3h memoria institucional inicial cargada (vio: '||n||')'||E'\n';

  -- ── 4. Motor de niveles ────────────────────────────────────────────────────
  r := r || CASE WHEN central_permite('N0','N0') = 'ejecutar' AND central_permite('N0','N1') = 'prohibido' AND central_permite('N0','N2', true) = 'prohibido'
                 THEN 'ok   ' ELSE 'FALLA' END || ' 4a un agente N0 solo lee'||E'\n';
  r := r || CASE WHEN central_permite('N1','N1') = 'ejecutar' AND central_permite('N1','N2') = 'requiere_aprobacion' AND central_permite('N1','N2', true) = 'ejecutar'
                 THEN 'ok   ' ELSE 'FALLA' END || ' 4b N1 actúa en lo reversible; N2 pide aprobación'||E'\n';
  r := r || CASE WHEN central_permite('N2','N3', true) = 'prohibido' AND central_permite('N1','N3') = 'prohibido' AND central_permite(NULL,'N1') = 'prohibido'
                 THEN 'ok   ' ELSE 'FALLA' END || ' 4c N3 es solo humano, ni con aprobación; sin nivel no se puede nada'||E'\n';

  -- ── 5. Reglas de agentes ───────────────────────────────────────────────────
  ok := false; BEGIN INSERT INTO central_agentes (id, nombre, departamento_id, rol, nivel) VALUES ('rebelde','Rebelde','soporte','subordinado','N3'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 5a ningún agente puede ser N3'||E'\n';
  ok := false; BEGIN UPDATE central_agentes SET ciclo = 'activo' WHERE id = 'sofia'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 5b no se declara "activo" a un agente sin conexión'||E'\n';
  INSERT INTO central_agentes (id, nombre, departamento_id, rol) VALUES ('nuevo','Nuevo','soporte','subordinado');
  SELECT nivel || '/' || ciclo || '/' || proveedor_estado INTO v FROM central_agentes WHERE id = 'nuevo';
  r := r || CASE WHEN v = 'N0/disenado/no_conectado' THEN 'ok   ' ELSE 'FALLA' END || ' 5c un agente nuevo nace N0 / diseñado / sin conexión ('||v||')'||E'\n';

  -- ── 6. Tareas y aprobaciones ───────────────────────────────────────────────
  INSERT INTO central_tareas (titulo, nivel_requerido, prioridad) VALUES ('Tarea N0 de lectura', 'N0', 'P3') RETURNING id INTO t1;
  ok := false; BEGIN INSERT INTO central_tareas (titulo, nivel_requerido, responsable_agente_id) VALUES ('Borrar algo','N3','sofia'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6a una tarea N3 no puede tener agente responsable'||E'\n';
  ok := false; BEGIN INSERT INTO central_tareas (titulo, nivel_requerido, responsable_agente_id) VALUES ('Editar algo','N1','sofia'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6b un agente N0 no puede ser responsable de una tarea que escribe'||E'\n';
  ok := true; BEGIN INSERT INTO central_tareas (titulo, nivel_requerido, responsable_agente_id) VALUES ('Analizar algo','N0','sofia'); EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6c un agente N0 sí puede analizar (tarea N0)'||E'\n';

  INSERT INTO central_tareas (titulo, nivel_requerido, prioridad) VALUES ('Cambiar precios', 'N2', 'P1') RETURNING id INTO t2;
  ok := false; BEGIN UPDATE central_tareas SET estado = 'aprobada' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6d una tarea N2 NO pasa a aprobada sin aprobación humana'||E'\n';
  ok := false; BEGIN UPDATE central_tareas SET estado = 'en_ejecucion' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6e una tarea N2 NO se ejecuta sin aprobación humana'||E'\n';
  ok := false; BEGIN INSERT INTO central_aprobaciones (tarea_id, accion, nivel, estado, decidido_por, decidido_en) VALUES (t2,'Cambiar precios','N2','aprobada', us, now()); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6f no se puede crear una aprobación ya aprobada'||E'\n';
  INSERT INTO central_aprobaciones (tarea_id, accion, nivel, impacto) VALUES (t2,'Cambiar precios del plan Base','N2','Afecta a todos los restaurantes nuevos') RETURNING id INTO ap;
  ok := false; BEGIN UPDATE central_aprobaciones SET estado = 'aprobada', decidido_por = us, decidido_en = now() WHERE id = ap; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6g una aprobación NO se edita a mano'||E'\n';
  ok := false; BEGIN PERFORM central_decidir_aprobacion(ap, 'quizas', NULL); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6h la decisión solo puede ser aprobada o rechazada'||E'\n';
  SELECT count(*) INTO n FROM central_notificaciones WHERE tipo = 'aprobacion';
  r := r || CASE WHEN n >= 1 THEN 'ok   ' ELSE 'FALLA' END || ' 6i la aprobación pendiente avisó en la campana'||E'\n';
  SELECT count(*) INTO n FROM central_notificaciones WHERE tipo = 'tarea' AND titulo LIKE 'Tarea P1%';
  r := r || CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLA' END || ' 6j la tarea P1 avisó en la campana'||E'\n';
  j := central_decidir_aprobacion(ap, 'aprobada', 'Visto bueno');
  SELECT estado INTO v FROM central_tareas WHERE id = t2;
  r := r || CASE WHEN j->>'estado' = 'aprobada' AND v = 'aprobada' THEN 'ok   ' ELSE 'FALLA' END || ' 6k al aprobar con la función, la tarea pasa a aprobada ('||v||')'||E'\n';
  ok := false; BEGIN PERFORM central_decidir_aprobacion(ap, 'rechazada', NULL); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6l una aprobación ya decidida no se decide otra vez'||E'\n';
  ok := false; BEGIN UPDATE central_tareas SET estado = 'completada' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6m no se completa una tarea sin dejar resultado'||E'\n';
  ok := true; BEGIN UPDATE central_tareas SET estado = 'en_ejecucion' WHERE id = t2; UPDATE central_tareas SET estado = 'completada', resultado = 'Hecho y verificado' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6n con aprobación y resultado la tarea se ejecuta y se completa'||E'\n';
  -- rechazo
  INSERT INTO central_tareas (titulo, nivel_requerido) VALUES ('Enviar mensaje a clientes', 'N2') RETURNING id INTO t3;
  INSERT INTO central_aprobaciones (tarea_id, accion, nivel) VALUES (t3,'Enviar mensaje a clientes','N2') RETURNING id INTO ap2;
  PERFORM central_decidir_aprobacion(ap2, 'rechazada', 'No por ahora');
  SELECT estado INTO v FROM central_tareas WHERE id = t3;
  r := r || CASE WHEN v = 'rechazada' THEN 'ok   ' ELSE 'FALLA' END || ' 6o al rechazar, la tarea queda rechazada ('||v||')'||E'\n';
  ok := false; BEGIN UPDATE central_tareas SET estado = 'aprobada' WHERE id = t3; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6p una tarea rechazada no se aprueba por la puerta de atrás'||E'\n';
  -- N3 humano
  INSERT INTO central_tareas (titulo, nivel_requerido) VALUES ('Publicar a producción', 'N3') RETURNING id INTO t4;
  ok := false; BEGIN UPDATE central_tareas SET estado = 'en_ejecucion' WHERE id = t4; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6q una tarea N3 tampoco se ejecuta sin aprobación humana'||E'\n';
  -- dependencias
  INSERT INTO central_tareas (titulo) VALUES ('Primero esto') RETURNING id INTO t1;
  INSERT INTO central_tareas (titulo, depende_de) VALUES ('Después esto', ARRAY[t1]) RETURNING id INTO t2;
  ok := false; BEGIN UPDATE central_tareas SET estado = 'en_ejecucion' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6r una tarea no empieza si sus tareas previas no están completas'||E'\n';
  UPDATE central_tareas SET estado = 'completada', resultado = 'listo' WHERE id = t1;
  ok := true; BEGIN UPDATE central_tareas SET estado = 'en_ejecucion' WHERE id = t2; EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6s con las previas completas sí empieza'||E'\n';
  -- el dueño decide subir un agente a N1; ahí sí puede ser responsable de lo reversible
  UPDATE central_agentes SET nivel = 'N1' WHERE id = 'sofia';
  ok := true; BEGIN INSERT INTO central_tareas (titulo, nivel_requerido, responsable_agente_id) VALUES ('Ordenar etiquetas','N1','sofia'); EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 6t un agente N1 (decidido por el dueño) puede tener tareas N1'||E'\n';

  -- ── 7. Mensajes ────────────────────────────────────────────────────────────
  SELECT id INTO conv FROM central_conversaciones WHERE tipo = 'canal_institucional';
  ok := true; BEGIN INSERT INTO central_mensajes (conversacion_id, autor_tipo, autor_id, contenido) VALUES (conv,'humano', us::text, 'Hola equipo'); EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7a el dueño escribe a su nombre'||E'\n';
  ok := false; BEGIN INSERT INTO central_mensajes (conversacion_id, autor_tipo, autor_id, contenido) VALUES (conv,'humano', gen_random_uuid()::text, 'Soy otro'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7b no se puede escribir a nombre de otra persona'||E'\n';
  ok := false; BEGIN INSERT INTO central_mensajes (conversacion_id, autor_tipo, autor_id, contenido, modo) VALUES (conv,'agente','sofia','Yo decidí', 'real'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7c un mensaje de agente NO puede pasar por real desde la app'||E'\n';
  ok := true; BEGIN INSERT INTO central_mensajes (conversacion_id, autor_tipo, autor_id, contenido, modo) VALUES (conv,'agente','sofia','(Simulación local) ...', 'simulacion_local'); EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7d un mensaje de agente sí se guarda como simulación local'||E'\n';
  ok := false; BEGIN INSERT INTO central_mensajes (conversacion_id, autor_tipo, autor_id, contenido) VALUES (conv,'sistema','x','aviso'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7e los mensajes del sistema no los escribe la app'||E'\n';
  ok := false; BEGIN UPDATE central_mensajes SET contenido = 'editado'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7f los mensajes no se editan'||E'\n';
  ok := false; BEGIN DELETE FROM central_mensajes; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 7g los mensajes no se borran'||E'\n';

  -- ── 8. Integraciones ───────────────────────────────────────────────────────
  ok := false; BEGIN UPDATE central_integraciones SET estado = 'activa' WHERE id = 'telegram'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 8a una integración no queda "activa" sin adaptador real y autorización'||E'\n';
  ok := false; BEGIN UPDATE central_integraciones SET adaptador = 'real' WHERE id = 'telegram'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 8b la app no instala adaptadores reales'||E'\n';
  ok := true; BEGIN UPDATE central_integraciones SET estado = 'pendiente_autorizacion', notas = 'Pendiente de decidir' WHERE id = 'telegram'; EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 8c sí se puede marcar "pendiente de autorización" y escribir notas'||E'\n';

  -- ── 9. Documentos, memoria y versiones ─────────────────────────────────────
  INSERT INTO central_documentos (titulo, tipo, contenido) VALUES ('Política de precios', 'politica', 'Versión uno') RETURNING id INTO doc;
  UPDATE central_documentos SET contenido = 'Versión dos' WHERE id = doc;
  SELECT version INTO n FROM central_documentos WHERE id = doc;
  r := r || CASE WHEN n = 2 THEN 'ok   ' ELSE 'FALLA' END || ' 9a editar un documento sube su versión (v'||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_versiones WHERE registro_id = doc::text AND version = 1 AND datos ->> 'contenido' = 'Versión uno';
  r := r || CASE WHEN n = 1 THEN 'ok   ' ELSE 'FALLA' END || ' 9b la versión anterior quedó guardada'||E'\n';
  ok := false; BEGIN UPDATE central_versiones SET version = 99; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 9c el historial de versiones no se edita'||E'\n';
  ok := false; BEGIN DELETE FROM central_versiones; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 9d el historial de versiones no se borra'||E'\n';
  ok := false; BEGIN INSERT INTO central_consumo (agente_id, periodo) VALUES ('sofia', date '2026-11-01'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 9e el consumo no se escribe a mano (lo registra el servidor)'||E'\n';
  ok := false; BEGIN INSERT INTO central_memoria (capa, titulo, restaurante_id) VALUES ('operativa', 'Dato de otro', gen_random_uuid()); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 9f la memoria de un restaurante exige que el restaurante exista'||E'\n';

  -- ── 10. Restaurantes y globo ───────────────────────────────────────────────
  ok := false; BEGIN INSERT INTO central_ubicaciones (restaurante_id, ciudad, lat, lng) VALUES (ra,'Lugar imposible', 95, 10); EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok THEN 'ok   ' ELSE 'FALLA' END || ' 10a una latitud imposible se rechaza'||E'\n';
  INSERT INTO central_ubicaciones (restaurante_id, ciudad, lat, lng) VALUES (ra,'Armenia', 4.5339, -75.6811);
  j := central_restaurantes();
  SELECT x INTO fila FROM jsonb_array_elements(j) x WHERE x ->> 'id' = ra::text;
  r := r || CASE WHEN jsonb_array_length(j) >= 2 AND (fila ->> 'pedidos_hoy')::int = 2 AND (fila ->> 'cobrado_hoy')::numeric = 10000 THEN 'ok   ' ELSE 'FALLA' END
         || ' 10b central_restaurantes cuenta 2 pedidos y 10000 cobrados hoy, sin contar el cancelado ('||coalesce(fila::text,'null')||')'||E'\n';
  r := r || CASE WHEN fila ->> 'ciudad' = 'Armenia' AND fila ->> 'suscripcion' = 'active' THEN 'ok   ' ELSE 'FALLA' END || ' 10c trae la ciudad que cargó el dueño y la suscripción'||E'\n';
  SELECT x INTO fila FROM jsonb_array_elements(j) x WHERE x ->> 'id' = rb::text;
  r := r || CASE WHEN fila ->> 'ciudad' IS NULL AND fila ->> 'lat' IS NULL THEN 'ok   ' ELSE 'FALLA' END || ' 10d un restaurante sin ubicación NO trae coordenadas inventadas'||E'\n';
  ok := false; BEGIN UPDATE restaurants SET name = 'hackeado'; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || CASE WHEN ok OR NOT EXISTS (SELECT 1 FROM restaurants WHERE name = 'hackeado') THEN 'ok   ' ELSE 'FALLA' END || ' 10e Central no modifica restaurantes'||E'\n';

  -- ── 11. Auditoría de todo lo anterior ──────────────────────────────────────
  SELECT count(*) INTO n FROM central_auditoria WHERE accion = 'insert_tareas' AND actor_id = us;
  r := r || CASE WHEN n >= 5 THEN 'ok   ' ELSE 'FALLA' END || ' 11a crear tareas quedó anotado con quién fue ('||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria WHERE accion = 'update_aprobaciones' AND aprobador_id = us AND nivel = 'N2' AND resultado = 'ok';
  r := r || CASE WHEN n = 2 THEN 'ok   ' ELSE 'FALLA' END || ' 11b cada decisión quedó con aprobador y nivel ('||n||')'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria WHERE accion = 'insert_mensajes' AND detalle::text LIKE '%Hola equipo%';
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 11c el registro NO copia el texto de los mensajes'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria WHERE accion = 'update_documentos' AND detalle::text LIKE '%Versión dos%';
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 11d el registro NO copia el contenido de los documentos'||E'\n';
  SELECT count(*) INTO n FROM central_auditoria WHERE accion = 'update_agentes' AND recurso = 'central_agentes:sofia';
  r := r || CASE WHEN n >= 1 THEN 'ok   ' ELSE 'FALLA' END || ' 11e subir a Sofía a N1 quedó anotado'||E'\n';
  RESET ROLE;

  -- ── 12. Estructura: todas las tablas con RLS y sin acceso anónimo ──────────
  n := 0;
  FOREACH t IN ARRAY ARRAY['central_departamentos','central_agentes','central_ubicaciones','central_proyectos','central_tareas','central_aprobaciones','central_conversaciones','central_mensajes','central_reuniones','central_notificaciones','central_documentos','central_memoria','central_versiones','central_integraciones','central_consumo','central_config'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t)
       OR has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      n := n + 1; r := r || 'FALLA 12a '||t||' sin RLS, sin política o abierta a anónimos'||E'\n';
    END IF;
  END LOOP;
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 12a las 16 tablas tienen RLS, política y cero acceso anónimo'||E'\n';
  r := r || CASE WHEN NOT has_function_privilege('anon', 'central_decidir_aprobacion(uuid,text,text)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'central_restaurantes()', 'EXECUTE') THEN 'ok   ' ELSE 'FALLA' END || ' 12b los anónimos no pueden llamar las funciones de Central'||E'\n';
  r := r || CASE WHEN NOT has_function_privilege('authenticated', 'central_auditar()', 'EXECUTE') THEN 'ok   ' ELSE 'FALLA' END || ' 12c las funciones internas no se llaman desde la app'||E'\n';

  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
