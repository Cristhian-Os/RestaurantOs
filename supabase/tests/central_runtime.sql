-- Prueba de 20261124120000_central_runtime_trabajos. Se corre en el proyecto de PRUEBA (SQL Editor) o en el Postgres local.
-- Es un solo bloque DO que termina con RAISE EXCEPTION: todo lo que crea se deshace. El mensaje final lista cada comprobación (OK / FALLA).
-- ESPERADO: todas "OK". Requiere la migración aplicada y los 11 agentes de Central.
DO $$
DECLARE
  r text := ''; ok boolean;
  us uuid := gen_random_uuid(); um uuid := gen_random_uuid(); ag text; au uuid := gen_random_uuid();
  j1 uuid; j2 uuid; j3 uuid; ja uuid; jb uuid; jc uuid; jd uuid; je uuid;
  n int; e text; f timestamptz; v jsonb; cs text; co1 text; co2 text; cm text;
BEGIN
  SELECT id INTO ag FROM central_agentes ORDER BY orden LIMIT 1;
  INSERT INTO auth.users (id, aud, role, email) VALUES (us,'authenticated','authenticated','dueno@runtime.test'), (um,'authenticated','authenticated','mesero@runtime.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueño','dueno@runtime.test',NULL), (um,'waiter','Mesero','mesero@runtime.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, restaurant_id = EXCLUDED.restaurant_id;
  cs  := '{"role":"service_role"}';
  co1 := json_build_object('role','authenticated','sub',us,'aal','aal1')::text;
  co2 := json_build_object('role','authenticated','sub',us,'aal','aal2')::text;
  cm  := json_build_object('role','authenticated','sub',um,'aal','aal2')::text;
  -- Campaña vigente (insertada como administrador de la base) y IA con tope 5 USD
  INSERT INTO growth_autorizaciones (id, tipo, nombre, alcance, estado, vigente_desde, vigente_hasta) VALUES
    (au, 'campana', 'Prueba runtime', jsonb_build_object('objetivo','x','ciudad','Armenia','segmento','x','criterios_exclusion','x','max_prospectos',5,
      'max_contactos_por_prospecto',1,'canales','[]'::jsonb,'horario','x','plantillas','[]'::jsonb,'planes_permitidos','[]'::jsonb,
      'descuentos_permitidos','ninguno','frecuencia_seguimiento','x','criterios_detencion','x'), 'vigente', now() - interval '1 hour', now() + interval '1 day');
  UPDATE central_config SET valor = 'true'::jsonb WHERE clave = 'ia_encendida';
  UPDATE central_config SET valor = '5'::jsonb WHERE clave = 'ia_tope_mensual_usd';
  UPDATE central_config SET valor = 'false'::jsonb WHERE clave = 'agentes_activos';
  UPDATE central_config SET valor = '[]'::jsonb WHERE clave IN ('pausa_agentes','pausa_tipos');

  -- 1. Idempotencia: la misma clave no duplica
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  j1 := central_trabajo_encolar('prueba', ag, 'rt-idem-0001');
  j2 := central_trabajo_encolar('prueba', ag, 'rt-idem-0001');
  RESET ROLE;
  SELECT count(*) INTO n FROM central_trabajos WHERE clave_idempotencia = 'rt-idem-0001';
  r := r || format(E'\n1 idempotencia: %s', CASE WHEN j1 = j2 AND n = 1 THEN 'OK' ELSE 'FALLA' END);

  -- 2. Tomar y fallar → reintento con espera futura; ejecutar_en > ahora
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM central_trabajo_tomar('prueba-1', 5);
  RESET ROLE;
  SELECT estado, intentos INTO e, n FROM central_trabajos WHERE id = j1;
  r := r || format(E'\n2a tomar deja "running" con 1 intento: %s', CASE WHEN e = 'running' AND n = 1 THEN 'OK' ELSE 'FALLA ('||e||')' END);
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  e := central_trabajo_terminar(j1, false, NULL, 'error de prueba', 0);
  RESET ROLE;
  SELECT ejecutar_en INTO f FROM central_trabajos WHERE id = j1;
  r := r || format(E'\n2b falla → retrying con espera: %s', CASE WHEN e = 'retrying' AND f > now() THEN 'OK' ELSE 'FALLA ('||e||')' END);

  -- 3. Interruptor global apagado: un trabajo normal queda en pausa y no se entrega
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  ja := central_trabajo_encolar('informe_diario', ag, 'rt-informe-0001');
  SELECT count(*) INTO n FROM central_trabajo_tomar('w', 5) WHERE id = ja;
  RESET ROLE;
  SELECT estado INTO e FROM central_trabajos WHERE id = ja;
  r := r || format(E'\n3 interruptor apagado: no se entrega y queda pausado: %s', CASE WHEN n = 0 AND e = 'paused' THEN 'OK' ELSE 'FALLA ('||e||')' END);

  -- 4. Solo el dueño con 2 pasos mueve el interruptor
  ok := false; PERFORM set_config('request.jwt.claims', cm, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_interruptor('agentes_activos', 'true'::jsonb); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n4a mesero no puede mover el interruptor: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', co1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_interruptor('agentes_activos', 'true'::jsonb); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n4b dueño SIN 2 pasos no puede: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  PERFORM central_interruptor('agentes_activos', 'true'::jsonb); RESET ROLE;
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM central_trabajo_tomar('w', 5) WHERE id = ja;
  RESET ROLE;
  r := r || format(E'\n4c dueño con 2 pasos lo enciende y el trabajo pausado se entrega: %s', CASE WHEN n = 1 THEN 'OK' ELSE 'FALLA' END);

  -- 5. Apagar el interruptor frena también lo que ya corre
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  PERFORM central_interruptor('agentes_activos', 'false'::jsonb); RESET ROLE;
  SELECT estado INTO e FROM central_trabajos WHERE id = ja;
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  v := central_trabajo_puede(ja); RESET ROLE;
  r := r || format(E'\n5 apagar frena lo que corre y "puede" dice no: %s', CASE WHEN e = 'paused' AND (v->>'puede')::boolean = false THEN 'OK' ELSE 'FALLA ('||e||')' END);
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  PERFORM central_interruptor('agentes_activos', 'true'::jsonb); RESET ROLE;

  -- 6. Quien no es el servidor no toma ni cierra trabajos
  ok := false; PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM * FROM central_trabajo_tomar('x', 1); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n6a el dueño desde la app no puede tomar trabajos: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM * FROM central_trabajos; EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n6b anónimo no lee la cola: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 7. Tope de gasto: con 5 USD gastados, un trabajo con IA no se entrega
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  jb := central_trabajo_encolar('investigar_prospectos', ag, 'rt-invest-0001', au);
  SELECT count(*) INTO n FROM central_trabajo_tomar('w', 5) WHERE id = jb;
  e := central_trabajo_terminar(jb, true, '{"ok":true}'::jsonb, NULL, 5);
  jc := central_trabajo_encolar('investigar_prospectos', ag, 'rt-invest-0002', au);
  SELECT count(*) INTO n FROM central_trabajo_tomar('w', 5) WHERE id = jc;
  RESET ROLE;
  SELECT estado INTO e FROM central_trabajos WHERE id = jc;
  r := r || format(E'\n7 tope mensual alcanzado: el trabajo con IA queda pausado: %s', CASE WHEN n = 0 AND e = 'paused' THEN 'OK' ELSE 'FALLA ('||e||')' END);

  -- 8. Revocar la autorización cancela sus trabajos
  UPDATE growth_autorizaciones SET estado = 'revocada', revocada_en = now(), revocada_motivo = 'prueba' WHERE id = au;
  SELECT estado INTO e FROM central_trabajos WHERE id = jc;
  r := r || format(E'\n8 revocar cancela los trabajos de esa campaña: %s', CASE WHEN e = 'cancelled' THEN 'OK' ELSE 'FALLA ('||e||')' END);

  -- 9. Recuperación: un trabajo "running" con bloqueo vencido vuelve a la cola sin perderse
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  jd := central_trabajo_encolar('informe_diario', ag, 'rt-recup-0001');
  PERFORM * FROM central_trabajo_tomar('w', 5);
  RESET ROLE;
  UPDATE central_trabajos SET bloqueo_hasta = now() - interval '1 minute' WHERE id = jd;
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM central_trabajo_tomar('w2', 5) WHERE id = jd;
  RESET ROLE;
  SELECT estado, intentos INTO e, n FROM central_trabajos WHERE id = jd;
  r := r || format(E'\n9 trabajo perdido se recupera y se entrega de nuevo (intento 2): %s', CASE WHEN e = 'running' AND n = 2 THEN 'OK' ELSE 'FALLA ('||e||'/'||n||')' END);

  -- 10. Un trabajo cerrado no se reabre
  ok := false;
  BEGIN UPDATE central_trabajos SET estado = 'pending' WHERE id = jb; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || format(E'\n10 un trabajo cerrado no se reabre: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 11. El registro de cambios no se edita ni se borra
  ok := false; BEGIN DELETE FROM central_trabajos_log; EXCEPTION WHEN OTHERS THEN ok := true; END;
  r := r || format(E'\n11 el registro de transiciones no se borra: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 12. Cola de muertos + corte automático: 3 fallos definitivos pausan el tipo y avisan
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  FOR n IN 1..3 LOOP
    je := central_trabajo_encolar('prueba', ag, 'rt-muerto-000' || n);
    UPDATE central_trabajos SET max_intentos = 1 WHERE id = je;
    PERFORM * FROM central_trabajo_tomar('w', 20);
    e := central_trabajo_terminar(je, false, NULL, 'falla de prueba', 0);
  END LOOP;
  RESET ROLE;
  SELECT count(*) INTO n FROM central_notificaciones WHERE origen = 'runtime' AND severidad = 'critica' AND created_at > now() - interval '1 minute';
  SELECT valor INTO v FROM central_config WHERE clave = 'pausa_tipos';
  r := r || format(E'\n12 3 fallos definitivos → "failed", aviso crítico y tipo en pausa: %s', CASE WHEN e = 'failed' AND n >= 1 AND v ? 'prueba' THEN 'OK' ELSE 'FALLA ('||e||')' END);

  RAISE EXCEPTION E'RESULTADO (todo se deshace):%', r;
END $$;
