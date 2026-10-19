-- Prueba del Bloque 8 (vendedores, comisiones y liquidaciones). Termina en RAISE EXCEPTION: no queda nada guardado.
-- Esperado: "TEST_OUTPUT: FALLAS=0". Corre en el proyecto de prueba (ids de Prueba A/B).
-- NO correr la parte de pago en producción: la secuencia de números LIQ-AAAA-NNNN no se revierte y se saltaría un número.
-- Casos: 3 pagos simulados (bono 1, bono 2 y recurrente), aliado sin bono, monto cero y pagos rechazados no generan, repetir no duplica,
-- condiciones congeladas por contrato, devolución con ajuste negativo, liquidación con retención, aprobar exige cuenta de cobro,
-- no se paga dos veces, contrato obligatorio, código inmutable, incumplimiento congela, primer registro gana, y permisos.
DO $t$
DECLARE
  sa uuid := gen_random_uuid(); adm uuid := '44444444-0000-0000-0000-000000000004';
  ra uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; rb uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  vid uuid; aid uuid; v2 uuid; p1 uuid; p2 uuid; p3 uuid; q1 uuid; q2 uuid; q3 uuid; p4 uuid;
  fal int := 0; res text := ''; n int; m numeric; j jsonb; liq uuid; liqa uuid; num text; fn text;
BEGIN
  INSERT INTO auth.users (id, instance_id, email, role, aud, created_at, updated_at) VALUES (sa,'00000000-0000-0000-0000-000000000000','dueno@test.com','authenticated','authenticated',now(),now());
  INSERT INTO profiles (id, email, full_name, role, active) VALUES (sa,'dueno@test.com','Dueño','super_admin',true);
  INSERT INTO vendedores (tipo,nombre,codigo,correo,activo,contrato_ruta,contrato_version,firmado_at) VALUES ('vendedor','Ana','ANA-24','ana@test.com',true,'c.pdf','v1',current_date) RETURNING id INTO vid;
  INSERT INTO vendedores (tipo,nombre,codigo,activo,contrato_ruta,contrato_version,firmado_at) VALUES ('aliado','Contador Luis','LUIS-1',true,'c2.pdf','v1',current_date) RETURNING id INTO aid;
  INSERT INTO restaurant_crm (restaurant_id) VALUES (ra), (rb) ON CONFLICT DO NOTHING;
  UPDATE restaurant_crm SET vendedor_id = vid WHERE restaurant_id = ra;
  UPDATE restaurant_crm SET vendedor_id = aid WHERE restaurant_id = rb;
  -- pagos de 119.000 con IVA => base 100.000
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()-interval '3 days') RETURNING id INTO p1;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()-interval '2 days') RETURNING id INTO p2;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()-interval '1 day') RETURNING id INTO p3;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (rb,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()-interval '3 days') RETURNING id INTO q1;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (rb,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()-interval '2 days') RETURNING id INTO q2;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (rb,'subscription',gen_random_uuid()::text,0,'APPROVED', now()-interval '1 day') RETURNING id INTO q3;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'DECLINED', now());

  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  j := calcular_comisiones(NULL);
  RESET ROLE;
  SELECT coalesce(sum(monto_cop),0) INTO m FROM comisiones WHERE vendedor_id = vid; IF m <> 130000 THEN fal:=fal+1; res:=res||' [vendedor total '||m||']'; END IF;
  SELECT coalesce(sum(monto_cop),0) INTO m FROM comisiones WHERE vendedor_id = vid AND tipo='bono_1'; IF m <> 50000 THEN fal:=fal+1; res:=res||' [bono_1 '||m||']'; END IF;
  SELECT coalesce(sum(monto_cop),0) INTO m FROM comisiones WHERE vendedor_id = vid AND tipo='bono_2'; IF m <> 50000 THEN fal:=fal+1; res:=res||' [bono_2 '||m||']'; END IF;
  SELECT coalesce(sum(monto_cop),0) INTO m FROM comisiones WHERE vendedor_id = vid AND tipo='recurrente'; IF m <> 30000 THEN fal:=fal+1; res:=res||' [recurrente '||m||']'; END IF;
  SELECT coalesce(sum(monto_cop),0) INTO m FROM comisiones WHERE vendedor_id = aid; IF m <> 20000 THEN fal:=fal+1; res:=res||' [aliado '||m||']'; END IF;
  SELECT count(*) INTO n FROM comisiones WHERE vendedor_id = aid AND tipo LIKE 'bono%'; IF n <> 0 THEN fal:=fal+1; res:=res||' [aliado con bono]'; END IF;
  SELECT count(*) INTO n FROM comisiones; IF n <> 7 THEN fal:=fal+1; res:=res||' [filas '||n||']'; END IF;
  SET LOCAL ROLE authenticated; j := calcular_comisiones(NULL); RESET ROLE;
  SELECT count(*) INTO n FROM comisiones; IF n <> 7 THEN fal:=fal+1; res:=res||' [duplicó al repetir '||n||']'; END IF;
  UPDATE platform_settings SET valor = 20 WHERE clave = 'recurrente_pct';
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()) RETURNING id INTO p4;
  SET LOCAL ROLE authenticated; j := calcular_comisiones(NULL); RESET ROLE;
  SELECT monto_cop INTO m FROM comisiones WHERE payment_id = p4 AND tipo='recurrente'; IF m <> 10000 THEN fal:=fal+1; res:=res||' [terminos cambiaron '||coalesce(m,-1)||']'; END IF;
  UPDATE platform_settings SET valor = 10 WHERE clave = 'recurrente_pct';

  SET LOCAL ROLE authenticated;
  n := ajustar_por_devolucion(p3); IF n <> 1 THEN fal:=fal+1; res:=res||' [ajuste '||n||']'; END IF;
  n := ajustar_por_devolucion(p3); IF n <> 0 THEN fal:=fal+1; res:=res||' [ajuste repetido '||n||']'; END IF;
  RESET ROLE;
  SELECT monto_cop INTO m FROM comisiones WHERE payment_id = p3 AND tipo='ajuste'; IF m <> -10000 THEN fal:=fal+1; res:=res||' [monto ajuste '||coalesce(m,0)||']'; END IF;
  UPDATE payments SET created_at = now() - interval '40 days' WHERE id = p1;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM ajustar_por_devolucion(p1); fal:=fal+1; res:=res||' [ajuste fuera de ventana pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  UPDATE payments SET created_at = now() - interval '3 days' WHERE id = p1;

  j := crear_liquidaciones(current_date);
  RESET ROLE;
  SELECT id, total_pagar_cop INTO liq, m FROM liquidaciones_vendedor WHERE vendedor_id = vid; IF m <> 130000 THEN fal:=fal+1; res:=res||' [liq vendedor '||coalesce(m,-1)||']'; END IF;
  SELECT id, total_pagar_cop INTO liqa, m FROM liquidaciones_vendedor WHERE vendedor_id = aid; IF m <> 20000 THEN fal:=fal+1; res:=res||' [liq aliado '||coalesce(m,-1)||']'; END IF;
  SET LOCAL ROLE authenticated;
  j := crear_liquidaciones(current_date); IF (j->>'creadas')::int <> 0 THEN fal:=fal+1; res:=res||' [liquidación duplicada]'; END IF;
  BEGIN PERFORM aprobar_liquidacion(liq); fal:=fal+1; res:=res||' [aprobó sin cuenta de cobro]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_liquidacion_editar(liq, 999999999, 'CC-1', 'v/cc.pdf'); fal:=fal+1; res:=res||' [retención mayor al total pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_liquidacion_editar(liq, 5000, 'CC-001', 'ruta/cuenta.pdf');
  RESET ROLE; SELECT total_pagar_cop INTO m FROM liquidaciones_vendedor WHERE id = liq; IF m <> 125000 THEN fal:=fal+1; res:=res||' [total con retención '||m||']'; END IF;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM registrar_pago_liquidacion(liq, 'nequi', 'REF1', NULL); fal:=fal+1; res:=res||' [pagó sin aprobar]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM aprobar_liquidacion(liq);
  BEGIN PERFORM plataforma_liquidacion_editar(liq, 1, 'X', NULL); fal:=fal+1; res:=res||' [editó aprobada]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM anular_comision((SELECT id FROM comisiones WHERE liquidacion_id = liq LIMIT 1), 'x'); fal:=fal+1; res:=res||' [anuló en aprobada]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM registrar_pago_liquidacion(liq, 'nequi', '', NULL); fal:=fal+1; res:=res||' [pagó sin referencia]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  num := registrar_pago_liquidacion(liq, 'nequi', 'REF-123', 'ruta/comprobante.jpg');
  IF num !~ '^LIQ-[0-9]{4}-[0-9]{4}$' THEN fal:=fal+1; res:=res||' [número '||num||']'; END IF;
  BEGIN PERFORM registrar_pago_liquidacion(liq, 'nequi', 'REF-123', NULL); fal:=fal+1; res:=res||' [pagó dos veces]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_liquidacion_guardar_recibo(liq, 'ruta/recibo.pdf');
  BEGIN PERFORM plataforma_liquidacion_guardar_recibo(liq, 'otra.pdf'); fal:=fal+1; res:=res||' [recibo reescrito]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM comisiones WHERE liquidacion_id = liq AND estado <> 'pagada'; IF n <> 0 THEN fal:=fal+1; res:=res||' [comisiones sin pagar '||n||']'; END IF;
  SET LOCAL ROLE authenticated; j := calcular_comisiones(NULL); RESET ROLE;
  SELECT count(*) INTO n FROM comisiones; IF n <> 9 THEN fal:=fal+1; res:=res||' [filas tras pagar '||n||']'; END IF;

  SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_vendedor_guardar(NULL, '{"tipo":"vendedor","nombre":"Sin contrato","codigo":"SIN-1"}'::jsonb); fal:=fal+1; res:=res||' [creó sin contrato]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  v2 := plataforma_vendedor_guardar(NULL, '{"tipo":"vendedor","nombre":"Beto","codigo":"beto-9","contrato_ruta":"c3.pdf","contrato_version":"v1","firmado_at":"2026-10-01","terminos":{"recurrente_pct":15}}'::jsonb);
  RESET ROLE; SELECT codigo INTO fn FROM vendedores WHERE id = v2; IF fn <> 'BETO-9' THEN fal:=fal+1; res:=res||' [código no queda en mayúsculas '||fn||']'; END IF;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_vendedor_guardar(vid, '{"codigo":"ANA-99"}'::jsonb); fal:=fal+1; res:=res||' [cambió código en uso]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_vendedor_guardar(vid, '{"contrato_version":"v2"}'::jsonb); fal:=fal+1; res:=res||' [cambió contrato sin motivo]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_vendedor_guardar(vid, '{"contrato_version":"v2","contrato_ruta":"c1v2.pdf"}'::jsonb, 'renovación');
  PERFORM plataforma_vendedor_guardar(vid, '{"datos_pago":"Nequi 3000000000"}'::jsonb);
  RESET ROLE; SELECT count(*) INTO n FROM auditoria_plataforma WHERE (antes::text || despues::text) ILIKE '%3000000000%'; IF n <> 0 THEN fal:=fal+1; res:=res||' [datos de pago en auditoría]'; END IF;
  INSERT INTO payments (restaurant_id, kind, reference, amount_in_cents, status, created_at) VALUES (ra,'subscription',gen_random_uuid()::text,11900000,'APPROVED', now()+interval '1 minute');
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_vendedor_estado(vid, false, 'termino_normal', ''); fal:=fal+1; res:=res||' [desactivó sin motivo]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM plataforma_vendedor_estado(vid, false, 'incumplimiento', 'no cumplió');
  j := calcular_comisiones(NULL); IF (j->>'omitidas_por_incumplimiento')::int < 1 THEN fal:=fal+1; res:=res||' [no omitió por incumplimiento]'; END IF;
  PERFORM plataforma_vendedor_estado(vid, true, NULL, 'resuelto');
  PERFORM plataforma_prospecto_agregar(vid, 'Heladería La Nube', 'Armenia');
  BEGIN PERFORM plataforma_prospecto_agregar(v2, ' heladería la nube ', 'armenia'); fal:=fal+1; res:=res||' [prospecto duplicado pasó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;

  FOREACH fn IN ARRAY ARRAY['calcular_comisiones()','crear_liquidaciones(current_date)','plataforma_liquidaciones_listar()','plataforma_deuda_vendedores()','plataforma_vendedores_listar()','plataforma_settings_listar()','plataforma_prospectos_listar()'] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated','aal','aal2')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [admin ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [dueño sin 2FA ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
    SET LOCAL ROLE anon;
    BEGIN EXECUTE 'SELECT * FROM public.'||fn; fal:=fal+1; res:=res||' [anon ejecutó '||fn||']'; EXCEPTION WHEN OTHERS THEN NULL; END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated','aal','aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM aprobar_liquidacion(liqa); fal:=fal+1; res:=res||' [admin aprobó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM registrar_pago_liquidacion(liqa, 'nequi', 'x', NULL); fal:=fal+1; res:=res||' [admin pagó]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM plataforma_vendedor_guardar(NULL, '{"tipo":"vendedor","nombre":"Hack","codigo":"HACK-1","contrato_ruta":"x","contrato_version":"v","firmado_at":"2026-01-01"}'::jsonb); fal:=fal+1; res:=res||' [admin creó vendedor]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'SELECT count(*) FROM public.comisiones'; fal:=fal+1; res:=res||' [admin leyó comisiones]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'SELECT count(*) FROM public.vendedores'; fal:=fal+1; res:=res||' [admin leyó vendedores]'; EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: FALLAS=% %', fal, res;
END $t$;
