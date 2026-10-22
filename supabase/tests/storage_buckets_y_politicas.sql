-- Prueba de 20261015205000_storage_buckets_y_politicas. SOLO para un proyecto de PRUEBA.
-- Comprueba: task-evidence privado, branding con limites, y que restaurant-assets solo acepta subidas en la carpeta del
-- propio restaurante (los avatares cualquier empleado; platos/portadas solo el admin) y que nadie sobreescribe.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); uwai uuid := gen_random_uuid(); CADM text; CWAI text; f record; n int;
BEGIN
  INSERT INTO storage.buckets (id, name, public) VALUES ('restaurant-assets','restaurant-assets',true),('branding','branding',true),('task-evidence','task-evidence',true)
    ON CONFLICT (id) DO UPDATE SET public = true;
  -- el estado "antes" ya fue corrido por la migracion; se vuelve a aplicar sobre el bucket de prueba
  UPDATE storage.buckets SET public = false WHERE id = 'task-evidence';
  SELECT public INTO f FROM storage.buckets WHERE id = 'task-evidence';
  r := concat(r, 'task-evidence publico=', f.public, ' (esperado false)', E'\n');

  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Sto A','sto-a','stoa.test'),(rb,'Sto B','sto-b','stob.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (uadm,'authenticated','authenticated','adm@stoa.test'),(uwai,'authenticated','authenticated','wai@stoa.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES (uadm,'admin','Adm','adm@stoa.test',ra,true),(uwai,'waiter','Mes','wai@stoa.test',ra,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=true;
  CADM := '{"role":"authenticated","sub":"'||uadm||'"}'; CWAI := '{"role":"authenticated","sub":"'||uwai||'"}';

  PERFORM set_config('request.jwt.claims', CADM, true); SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'dishes/'||ra||'/plato-1.png');
  r := concat(r, 'admin sube plato a su carpeta: ok', E'\n');
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'dishes/'||rb||'/plato-1.png'); r := concat(r, 'admin sube a carpeta de otro restaurante (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'carpeta de otro restaurante rechazada: ', sqlerrm, E'\n'); END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'dishes/plato-viejo.png'); r := concat(r, 'ruta sin restaurante (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'ruta sin restaurante rechazada: ', sqlerrm, E'\n'); END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'secretos/'||ra||'/x.png'); r := concat(r, 'carpeta no permitida (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'carpeta no permitida rechazada: ', sqlerrm, E'\n'); END;
  UPDATE storage.objects SET name = 'dishes/'||ra||'/otro.png' WHERE bucket_id='restaurant-assets' AND name = 'dishes/'||ra||'/plato-1.png';
  GET DIAGNOSTICS n = ROW_COUNT; r := concat(r, 'admin sobreescribe/renombra un archivo: filas=', n, ' (esperado 0, no hay UPDATE)', E'\n');

  RESET ROLE; PERFORM set_config('request.jwt.claims', CWAI, true); SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'avatars/'||ra||'/'||uwai||'-1.png');
  r := concat(r, 'mesero sube su avatar a su carpeta: ok', E'\n');
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'dishes/'||ra||'/hack.png'); r := concat(r, 'mesero sube un plato (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'mesero no sube platos: ', sqlerrm, E'\n'); END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('restaurant-assets', 'avatars/'||rb||'/x.png'); r := concat(r, 'mesero sube avatar en otro restaurante (FALLA)', E'\n');
  EXCEPTION WHEN OTHERS THEN r := concat(r, 'avatar en otro restaurante rechazado: ', sqlerrm, E'\n'); END;
  RESET ROLE;
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
