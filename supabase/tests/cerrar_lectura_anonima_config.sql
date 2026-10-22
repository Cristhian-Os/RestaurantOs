-- Prueba de 20261015206000_cerrar_lectura_anonima_config (fase B). SOLO para un proyecto de PRUEBA.
-- Comprueba: anon ya no lee restaurant_config ni la vista de ingredientes, pero el menu publico sigue funcionando por RPC
-- y create_public_order (que usa la vista dentro de una funcion SECURITY DEFINER) no se rompe; un empleado sigue
-- leyendo la configuracion de SU restaurante y de ningun otro.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid(); uadm uuid := gen_random_uuid(); CADM text; n int; j jsonb;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Cfg A','cfg-a','cfga.test'),(rb,'Cfg B','cfg-b','cfgb.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (uadm,'authenticated','authenticated','adm@cfga.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES (uadm,'admin','Adm','adm@cfga.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role='admin', restaurant_id=EXCLUDED.restaurant_id, active=true;
  INSERT INTO restaurant_config (restaurant_id, display_name, whatsapp_numero) VALUES (ra,'Resto A','3001112222'),(rb,'Resto B','3009998888');
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, costo_unitario) VALUES (ra,'Queso A','gramo',100,6.5),(rb,'Queso B','gramo',100,6.5);
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}';

  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM restaurant_config; r := concat(r, 'anon lee restaurant_config (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no lee restaurant_config: ', sqlerrm, E'\n'); END;
  BEGIN PERFORM 1 FROM ingredientes_menu_publico; r := concat(r, 'anon lee la vista (FALLA)', E'\n'); EXCEPTION WHEN OTHERS THEN r := concat(r, 'anon no lee la vista: ', sqlerrm, E'\n'); END;
  j := config_publica(ra);
  r := concat(r, 'menu publico por RPC: ', j->>'display_name', ' (esperado Resto A)', E'\n');
  SELECT count(*) INTO n FROM ingredientes_publicos(ra);
  r := concat(r, 'ingredientes por RPC: ', n, ' (esperado 1)', E'\n');
  RESET ROLE;
  r := concat(r, 'la funcion que usa la vista sigue compilando: ', (SELECT count(*) FROM pg_proc WHERE proname = 'create_public_order'), ' (esperado 1)', E'\n');

  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM restaurant_config;
  r := concat(r, 'admin A ve configs: ', n, ' (esperado 1: solo la suya)', E'\n');
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
