-- Prueba del cierre del registro publico (migracion 20261014190500). SOLO para un proyecto de PRUEBA.
-- Comprueba: anon y admins no pueden crear restaurantes; el super admin si, con plan activo, contrasena temporal
-- obligatoria, clave de TV y auditoria; activar plan solo para el super admin y con planes validos.
-- Termina con RAISE EXCEPTION a proposito: todo se revierte.
DO $$
DECLARE r text := ''; ra uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  j jsonb; rid uuid; CA text; CS text; f record;
BEGIN
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES (ra,'Reg A','reg-a','rega.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES (ua,'authenticated','authenticated','admin@rega.test'),(us,'authenticated','authenticated','dueno@plat.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'admin','Admin A','admin@rega.test',ra),(us,'super_admin','Dueno','dueno@plat.test',NULL)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}';

  r := r||'anon ejecuta crear_restaurante: '||has_function_privilege('anon','public.crear_restaurante(text,text,text,text)','EXECUTE')||' (esperado false)'||E'\n';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  BEGIN PERFORM crear_restaurante('Intruso','i@x.test','Clave12345','I'); r := r||'anon crea (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'anon rechazado: '||sqlerrm||E'\n'; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_restaurante('Intruso 2','i2@x.test','Clave12345','I'); r := r||'admin crea (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'un admin rechazado: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_activar_plan(ra,'premium'); r := r||'admin activa plan (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'un admin no activa planes: '||sqlerrm||E'\n'; END;

  RESET ROLE; PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_restaurante('Corto','c@x.test','1234567','C'); r := r||'clave de 7 aceptada (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'clave de 7 rechazada: '||sqlerrm||E'\n'; END;
  j := crear_restaurante('Dulce Prueba','dueno@dulceprueba.test','TemporalSegura1','Dueña Prueba');
  rid := (j->>'restaurant_id')::uuid;
  r := r||'super admin crea restaurante: '||j::text||E'\n';
  RESET ROLE;
  SELECT r2.plan, r2.is_promo, r2.trial_ends_at, s.status AS sub_status, s.plan AS sub_plan INTO f FROM restaurants r2 JOIN subscriptions s ON s.restaurant_id = r2.id WHERE r2.id = rid;
  r := r||'plan='||f.plan||', promo='||f.is_promo||', prueba='||coalesce(f.trial_ends_at::text,'sin prueba')||', suscripcion='||f.sub_status||'/'||f.sub_plan||' (esperado emprende/false/sin prueba/active/emprende)'||E'\n';
  r := r||'admin nuevo debe cambiar la contrasena: '||(SELECT must_change_password FROM profiles WHERE restaurant_id = rid AND role='admin')||' (esperado true)'||E'\n';
  r := r||'clave de TV creada: '||(SELECT count(*) FROM kitchen_tv_tokens WHERE restaurant_id = rid)||' (esperado 1)'||E'\n';
  r := r||'config creada: '||(SELECT count(*) FROM restaurant_config WHERE restaurant_id = rid)||' (esperado 1)'||E'\n';
  r := r||'auditoria: '||(SELECT count(*) FROM platform_audit_log WHERE restaurant_id = rid AND action='crear_restaurante')||' (esperado 1)'||E'\n';

  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_activar_plan(rid,'gratis'); r := r||'plan invalido aceptado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'plan invalido rechazado: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM plataforma_activar_plan(gen_random_uuid(),'pro'); r := r||'restaurante inexistente aceptado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'restaurante inexistente: '||sqlerrm||E'\n'; END;
  j := plataforma_activar_plan(rid,'pro'); r := r||'super admin activa plan pro: '||j::text||E'\n';
  RESET ROLE;
  r := r||'plan ahora: '||(SELECT plan FROM restaurants WHERE id=rid)||'/'||(SELECT plan||'/'||status FROM subscriptions WHERE restaurant_id=rid)||' (esperado pro/pro/active)'||E'\n';
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
