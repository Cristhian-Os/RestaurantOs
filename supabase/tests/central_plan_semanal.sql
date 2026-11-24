-- Prueba de 20261124190000_central_plan_semanal. Un solo bloque DO que termina con RAISE EXCEPTION: todo se deshace. ESPERADO: todo "OK".
DO $$
DECLARE
  r text := ''; ok boolean; n int; e text; v jsonb;
  us uuid := gen_random_uuid(); um uuid := gen_random_uuid(); au uuid := gen_random_uuid(); pid uuid; pid2 uuid; it uuid; it2 uuid;
  lunes date := (date_trunc('week', now() + interval '7 days'))::date;
  cs text := '{"role":"service_role"}'; co2 text; co1 text; cm text;
  items jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES (us,'authenticated','authenticated','dueno@plan.test'), (um,'authenticated','authenticated','mesero@plan.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueño','dueno@plan.test',NULL), (um,'waiter','Mesero','mesero@plan.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, restaurant_id = EXCLUDED.restaurant_id;
  co2 := json_build_object('role','authenticated','sub',us,'aal','aal2')::text;
  co1 := json_build_object('role','authenticated','sub',us,'aal','aal1')::text;
  cm  := json_build_object('role','authenticated','sub',um,'aal','aal2')::text;
  INSERT INTO growth_autorizaciones (id, tipo, nombre, alcance, estado, vigente_desde, vigente_hasta) VALUES
    (au, 'campana', 'Prueba plan', jsonb_build_object('objetivo','x','ciudad','Armenia','segmento','x','criterios_exclusion','x','max_prospectos',5,
      'max_contactos_por_prospecto',1,'canales','[]'::jsonb,'horario','x','plantillas','[]'::jsonb,'planes_permitidos','[]'::jsonb,
      'descuentos_permitidos','ninguno','frecuencia_seguimiento','x','criterios_detencion','x'), 'vigente', now() - interval '1 hour', now() + interval '30 days');
  items := jsonb_build_array(
    jsonb_build_object('dia', lunes,     'agente_id','mateo','tipo','investigar_prospectos','descripcion','Buscar negocios en Armenia','autorizacion_id', au),
    jsonb_build_object('dia', lunes + 1, 'agente_id','mateo','tipo','investigar_prospectos','descripcion','Buscar negocios en Armenia','autorizacion_id', au),
    jsonb_build_object('dia', lunes,     'agente_id','nico', 'tipo','redactar_borrador','descripcion','Borrador de contenido','autorizacion_id', au),
    jsonb_build_object('dia', lunes + 2, 'agente_id','chef-mayor','tipo','tarea_humana','descripcion','Verificar los prospectos nuevos'));

  -- 1. El servidor crea el borrador; no se sobrescribe
  PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  pid := central_plan_crear(lunes, 'resumen de prueba', items);
  pid2 := central_plan_crear(lunes, 'otro resumen', items);
  RESET ROLE;
  SELECT count(*) INTO n FROM central_plan_items WHERE plan_id = pid;
  r := r || format(E'\n1 el servidor crea el borrador una sola vez (4 tareas, mismo plan): %s', CASE WHEN pid = pid2 AND n = 4 AND (SELECT estado FROM central_plan_semanal WHERE id = pid) = 'borrador' THEN 'OK' ELSE 'FALLA' END);
  SELECT count(*) INTO n FROM central_notificaciones WHERE origen = 'plan_semanal';
  r := r || format(E'\n1b avisó en la campana una sola vez: %s', CASE WHEN n = 1 THEN 'OK' ELSE 'FALLA ('||n||')' END);
  -- 1c. Un día fuera de lunes a sábado se rechaza
  ok := false; PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  BEGIN PERFORM central_plan_crear(lunes + 7, 'x', jsonb_build_array(jsonb_build_object('dia', lunes + 6,'agente_id','nico','tipo','tarea_humana','descripcion','domingo no'))); EXCEPTION WHEN OTHERS THEN ok := true; END;
  RESET ROLE;
  r := r || format(E'\n1c un domingo no entra en el plan: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  SELECT id INTO it FROM central_plan_items WHERE plan_id = pid AND agente_id = 'nico';
  SELECT id INTO it2 FROM central_plan_items WHERE plan_id = pid AND agente_id = 'mateo' AND dia = lunes + 1;

  -- 2. Solo el dueño con 2 pasos edita o aprueba
  ok := false; PERFORM set_config('request.jwt.claims', cm, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_plan_aprobar(pid); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n2a un mesero no aprueba: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', co1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_plan_item_cambiar(it, true); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n2b el dueño sin 2 pasos no edita: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', cs, true); SET LOCAL ROLE service_role;
  BEGIN PERFORM central_plan_aprobar(pid); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n2c el servidor tampoco puede aprobar su propio plan: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
  BEGIN PERFORM * FROM central_plan_items; EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n2d anónimo no lee el plan: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 3. El dueño quita una tarea, cambia el texto y rechaza un día inválido
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  PERFORM central_plan_item_cambiar(it, true);                                       -- quita el borrador de Nico
  PERFORM central_plan_item_cambiar(it2, NULL, 'Buscar solo pizzerías');
  ok := false; BEGIN PERFORM central_plan_item_cambiar(it2, NULL, NULL, lunes + 6); EXCEPTION WHEN OTHERS THEN ok := true; END;
  RESET ROLE;
  r := r || format(E'\n3a quita y cambia el texto: %s', CASE WHEN (SELECT estado FROM central_plan_items WHERE id = it) = 'quitado' AND (SELECT descripcion FROM central_plan_items WHERE id = it2) = 'Buscar solo pizzerías' THEN 'OK' ELSE 'FALLA' END);
  r := r || format(E'\n3b un día fuera de lunes a sábado se rechaza: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 4. Un trabajo del mismo día ya existente (botón manual) no se duplica al aprobar
  INSERT INTO central_trabajos (tipo, agente_id, autorizacion_id, clave_idempotencia, ejecutar_en, vence_en)
  VALUES ('investigar_prospectos', 'mateo', au, 'inv:' || au || ':' || lunes, now(), now() + interval '2 days');

  -- 5. Aprobar: lo quitado no se encola; lo humano queda para ti; lo existente se reutiliza
  PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  v := central_plan_aprobar(pid); RESET ROLE;
  SELECT count(*) INTO n FROM central_trabajos WHERE clave_idempotencia LIKE '%' || au::text || '%';
  r := r || format(E'\n5a aprobar encola solo lo no quitado sin duplicar (2 trabajos de Mateo, 0 de Nico): %s', CASE WHEN n = 2 AND (v->>'encolados')::int = 2 AND (v->>'para_ti')::int = 1 THEN 'OK' ELSE 'FALLA ('||v::text||' / '||n||')' END);
  r := r || format(E'\n5b el plan quedó aprobado por el dueño: %s', CASE WHEN (SELECT estado FROM central_plan_semanal WHERE id = pid) = 'aprobado' AND (SELECT decidido_por FROM central_plan_semanal WHERE id = pid) = us THEN 'OK' ELSE 'FALLA' END);
  r := r || format(E'\n5c lo quitado sigue quitado y lo humano quedó "para_ti": %s', CASE WHEN (SELECT estado FROM central_plan_items WHERE id = it) = 'quitado' AND (SELECT count(*) FROM central_plan_items WHERE plan_id = pid AND estado = 'para_ti') = 1 THEN 'OK' ELSE 'FALLA' END);

  -- 6. Aprobado no se vuelve a decidir ni a editar
  ok := false; PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_plan_aprobar(pid); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n6a no se aprueba dos veces: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);
  ok := false; PERFORM set_config('request.jwt.claims', co2, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM central_plan_item_cambiar(it2, true); EXCEPTION WHEN OTHERS THEN ok := true; END; RESET ROLE;
  r := r || format(E'\n6b un plan aprobado no se edita: %s', CASE WHEN ok THEN 'OK' ELSE 'FALLA' END);

  -- 7. Auditoría
  SELECT count(*) INTO n FROM central_auditoria WHERE recurso ILIKE '%central_plan%' OR accion ILIKE '%central_plan%';
  r := r || format(E'\n7 los cambios quedaron en la auditoría: %s', CASE WHEN n > 0 THEN 'OK' ELSE 'FALLA' END);

  RAISE EXCEPTION E'RESULTADO (todo se deshace):%', r;
END $$;
