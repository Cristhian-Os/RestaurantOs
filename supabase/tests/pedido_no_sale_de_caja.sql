-- Prueba del punto 1.1 del plan (Bloque 1): un pedido nunca sale del panel de caja hasta quedar pagado.
-- Flujos: mesa (LOCAL), llevar, domicilio y Rappi. SOLO para un proyecto de PRUEBA.
-- Requisitos: esquema de produccion restaurado, datos de prueba de supabase/tests/pagos_divididos.sql
-- (restaurante A y cajero A) cargados. Termina con RAISE EXCEPTION a proposito: todo se revierte.
--
-- "Visible en caja" = lo mismo que consulta el panel: pending sin pagar, cooking o ready.
-- ESPERADO: en cada etapa visible=true (Rappi nace pagado: no aparece en la cola de cobro, pero si en
--   cocina y listo); cocina NO puede completar un pedido sin cobrar (la base lo rechaza por RLS);
--   solo tras cobrar_orden el pedido pasa a completed y sale de caja.
DO $$
DECLARE r text := ''; d1 uuid; oid_ uuid; j json; tipo text; n int; visible boolean; st text;
  A constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  CAJA constant text := '{"role":"authenticated","sub":"33333333-0000-0000-0000-000000000003"}';
  COCINA constant text := '{"role":"authenticated","sub":"66666666-0000-0000-0000-000000000006"}';
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('66666666-0000-0000-0000-000000000006','authenticated','authenticated','cocina-a2@prueba.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES ('66666666-0000-0000-0000-000000000006','kitchen','Cocina A2','cocina-a2@prueba.test',A)
    ON CONFLICT (id) DO UPDATE SET role='kitchen', restaurant_id=A, active=true;
  INSERT INTO dishes (restaurant_id, name, price) VALUES (A,'Plato de prueba',10000) RETURNING id INTO d1;

  FOREACH tipo IN ARRAY ARRAY['LOCAL','LLEVAR','DOMICILIO','RAPPI'] LOOP
    -- 1) se crea el pedido (mesero/cajero)
    PERFORM set_config('request.jwt.claims', CAJA, true); SET LOCAL ROLE authenticated;
    j := crear_orden_completa(null, jsonb_build_array(jsonb_build_object('id', d1, 'quantity', 1)), tipo, null, CASE WHEN tipo='LOCAL' THEN 7 END, 'Prueba '||tipo);
    oid_ := (j->>'order_id')::uuid;
    SELECT (status IN ('cooking','ready') OR (status='pending' AND paid_at IS NULL)) INTO visible FROM orders WHERE id=oid_;
    r := concat(r, tipo, ' recien creado: visible en caja=', visible, CASE WHEN tipo='RAPPI' THEN ' (Rappi nace pagado: va directo a cocina)' ELSE '' END, E'\n');
    -- 2) cocina lo toma y lo marca listo
    RESET ROLE; PERFORM set_config('request.jwt.claims', COCINA, true); SET LOCAL ROLE authenticated;
    UPDATE orders SET status='cooking' WHERE id=oid_;
    SELECT (status IN ('cooking','ready') OR (status='pending' AND paid_at IS NULL)) INTO visible FROM orders WHERE id=oid_;
    r := concat(r, '  en cocina: visible en caja=', visible, E'\n');
    UPDATE orders SET status='ready' WHERE id=oid_;
    SELECT (status IN ('cooking','ready') OR (status='pending' AND paid_at IS NULL)) INTO visible FROM orders WHERE id=oid_;
    r := concat(r, '  listo: visible en caja=', visible, E'\n');
    -- 3) cocina NO puede darlo por completado sin cobrar
    IF tipo <> 'RAPPI' THEN
      BEGIN
        UPDATE orders SET status='completed' WHERE id=oid_;
        GET DIAGNOSTICS n = ROW_COUNT;
        SELECT status INTO st FROM orders WHERE id=oid_;
        r := concat(r, '  cocina intenta completarlo sin cobrar: filas=', n, ' status=', st, CASE WHEN st='completed' THEN '  <== FALLA: salio de caja sin pagar' ELSE ' (bien)' END, E'\n');
      EXCEPTION WHEN OTHERS THEN r := concat(r, '  cocina intenta completarlo sin cobrar: rechazado (', sqlerrm, ') (bien)', E'\n'); END;
    END IF;
    -- 4) se cobra / se entrega y recien ahi sale de caja
    RESET ROLE; PERFORM set_config('request.jwt.claims', CAJA, true); SET LOCAL ROLE authenticated;
    IF tipo = 'RAPPI' THEN j := cobrar_orden(oid_, 'efectivo', null, 0); ELSE j := cobrar_orden(oid_, 'efectivo', 10000, 0); END IF;
    SELECT status, (status IN ('cooking','ready') OR (status='pending' AND paid_at IS NULL)) INTO st, visible FROM orders WHERE id=oid_;
    r := concat(r, '  tras cobrar: status=', st, ' visible en caja=', visible, CASE WHEN st='completed' AND NOT visible THEN ' (bien: sale solo al cobrar)' ELSE '  <== FALLA' END, E'\n');
    RESET ROLE;
  END LOOP;
  RAISE EXCEPTION 'TEST_OUTPUT: %', r;
END $$;
