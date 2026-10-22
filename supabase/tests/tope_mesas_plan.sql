-- Prueba del tope de mesas por plan (migración 20261022004625). SOLO para un proyecto de PRUEBA.
-- Comprueba: crear_mesas hasta el tope funciona y es repetible; una mesa más se rechaza (por crear_mesas y por INSERT directo);
-- un plan sin tope (Pro) crea más del tope de Esencial; un restaurante ajeno no se afecta.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; n int; cap int;
  a uuid := gen_random_uuid(); p uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); CA text; CP text;
BEGIN
  SELECT max_mesas INTO cap FROM planes WHERE id = 'emprende';
  IF cap IS NULL THEN RAISE EXCEPTION 'TEST_OUTPUT: el plan emprende no tiene tope en planes.max_mesas'; END IF;
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (ua,'authenticated','authenticated','admin@mesa-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (up,'authenticated','authenticated','admin@mesa-p.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES (a,'Mesa A','mesa-a','mesaa.test','emprende',true),(p,'Mesa P','mesa-p','mesap.test','pro',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (ua,'admin','Admin A','admin@mesa-a.test',a),(up,'admin','Admin P','admin@mesa-p.test',p)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a,'emprende','active'),(p,'pro','active');
  CA := '{"role":"authenticated","sub":"'||ua||'"}'; CP := '{"role":"authenticated","sub":"'||up||'"}';
  r := r||'tope Esencial = '||cap||E'\n';

  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  n := crear_mesas(cap);     r := r||'(1) crear_mesas('||cap||') -> '||n||' mesas (esperado '||cap||')'||E'\n';
  n := crear_mesas(cap);     r := r||'(2) repetir crear_mesas('||cap||') -> '||n||' mesas (esperado '||cap||', sin error)'||E'\n';
  BEGIN PERFORM crear_mesas(cap + 1); r := r||'(3) crear_mesas('||(cap+1)||') (FALLA: debía rechazar)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(3) crear_mesas('||(cap+1)||') rechazada: '||sqlerrm||E'\n'; END;
  BEGIN INSERT INTO mesas (restaurant_id, numero) VALUES (a, cap + 50); r := r||'(4) INSERT directo de una mesa más (FALLA: debía rechazar)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(4) INSERT directo rechazado: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM mesas WHERE restaurant_id = a; r := r||'(5) mesas de A tras los rechazos: '||n||' (esperado '||cap||')'||E'\n';

  PERFORM set_config('request.jwt.claims', CP, true); SET LOCAL ROLE authenticated;
  n := crear_mesas(cap + 8); r := r||'(6) Pro crea '||(cap+8)||' -> '||n||' (esperado '||(cap+8)||', sin tope)'||E'\n';
  RESET ROLE;

  RAISE EXCEPTION E'TEST_OUTPUT:\n%', r;
END $$;
