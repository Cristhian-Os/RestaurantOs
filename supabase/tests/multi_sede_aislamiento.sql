-- Prueba del Módulo G (multi-sede), migración 20261021210000. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) el dueño ve la sede 1 y la 2; (2) el administrador de la sede 2 no ve la sede 1 ni puede cambiar o crear
-- sedes; (3) el dueño de la cuenta A no ve ni cambia a sedes de la cuenta B; (4) un plan Pro no crea una segunda sede;
-- (5) Premium no crea la sede 3 sin registrar el cobro adicional; (6) al cambiar de sede los datos de la otra dejan de verse;
-- (7) UPDATE directo de restaurant_id sigue bloqueado.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte. Requiere planes con max_sedes (la migración lo agrega).
DO $$
DECLARE r text := ''; n int; j jsonb;
  a1 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); a2 uuid; a3 uuid;
  uo uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); up uuid := gen_random_uuid();
  CO text; CS text; CB text; CP text; da1 uuid;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uo,'authenticated','authenticated','dueno@sedea.test', crypt('ClaveActual1', gen_salt('bf'))),
    (us,'authenticated','authenticated','admin2@sedea.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','dueno@sedeb.test', crypt('ClaveActual1', gen_salt('bf'))),
    (up,'authenticated','authenticated','dueno@sedep.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES
    (a1,'Sede A1','sede-a1','sedea1.test','premium',true),
    (b1,'Sede B1','sede-b1','sedeb1.test','premium',true),
    (p1,'Sede P1','sede-p1','sedep1.test','pro',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uo,'admin','Dueño A','dueno@sedea.test',a1),(ub,'admin','Dueño B','dueno@sedeb.test',b1),(up,'admin','Dueño P','dueno@sedep.test',p1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  UPDATE restaurants SET owner_id = ub WHERE id = b1;
  UPDATE restaurants SET owner_id = up WHERE id = p1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active'),(b1,'premium','active'),(p1,'pro','active');
  INSERT INTO dishes (restaurant_id, name, price) VALUES (a1,'Plato A1',10000) RETURNING id INTO da1;
  CO := '{"role":"authenticated","sub":"'||uo||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}';
  CB := '{"role":"authenticated","sub":"'||ub||'"}'; CP := '{"role":"authenticated","sub":"'||up||'"}';

  -- (1) el dueño de A crea la sede 2 y ve las dos
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Sede A2'); a2 := (j->>'restaurant_id')::uuid;
  r := r||'(1) sede 2 creada, numero '||(j->>'sede_numero')||' (esperado 2), cargo '||coalesce(j->>'cargo_adicional_cop','ninguno')||' (esperado ninguno)'||E'\n';
  SELECT jsonb_array_length(mis_sedes()) INTO n; r := r||'(1) dueño ve sedes: '||n||' (esperado 2)'||E'\n';
  RESET ROLE;

  -- administrador de la sede 2 (no es dueño de la cuenta)
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'admin','Admin A2','admin2@sedea.test',a2)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  SELECT jsonb_array_length(mis_sedes()) INTO n; r := r||'(2) admin de sede 2 ve sedes: '||n||' (esperado 1)'||E'\n';
  BEGIN PERFORM cambiar_sede(a1); r := r||'(2) admin de sede 2 cambia a sede 1 (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) admin de sede 2 no cambia a sede 1: '||sqlerrm||E'\n'; END;
  BEGIN PERFORM crear_sede('Intrusa'); r := r||'(2) admin de sede 2 crea sede (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) admin de sede 2 no crea sedes: '||sqlerrm||E'\n'; END;
  SELECT count(*) INTO n FROM dishes WHERE id = da1; r := r||'(2) admin de sede 2 ve plato de sede 1: '||n||' (esperado 0)'||E'\n';
  RESET ROLE;

  -- (3) la cuenta A no ve ni cambia a la cuenta B (y viceversa)
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM jsonb_array_elements(mis_sedes()) e WHERE (e->>'id')::uuid = b1; r := r||'(3) dueño A ve sede de B: '||n||' (esperado 0)'||E'\n';
  BEGIN PERFORM cambiar_sede(b1); r := r||'(3) dueño A cambia a sede de B (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) dueño A no cambia a sede de B: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM jsonb_array_elements(mis_sedes()) e WHERE (e->>'id')::uuid IN (a1, a2); r := r||'(3) dueño B ve sedes de A: '||n||' (esperado 0)'||E'\n';
  BEGIN PERFORM cambiar_sede(a2); r := r||'(3) dueño B cambia a sede de A (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) dueño B no cambia a sede de A: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (4) plan Pro no crea segunda sede
  PERFORM set_config('request.jwt.claims', CP, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM crear_sede('P2'); r := r||'(4) Pro crea segunda sede (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(4) Pro no crea segunda sede: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (5) Premium: la sede 3 registra el cobro adicional (la 2 no)
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Sede A3'); a3 := (j->>'restaurant_id')::uuid;
  RESET ROLE;
  SELECT count(*) INTO n FROM sede_cargos WHERE restaurant_id = a3 AND monto_mensual_cop = (SELECT precio_sede_extra_cop FROM planes WHERE id='premium');
  r := r||'(5) cargo registrado para sede 3: '||n||' (esperado 1), monto '||coalesce(j->>'cargo_adicional_cop','nulo')||E'\n';
  SELECT count(*) INTO n FROM sede_cargos WHERE restaurant_id = a2; r := r||'(5) cargo en sede 2: '||n||' (esperado 0)'||E'\n';

  -- (6) cambiar de sede: los datos de la otra sede dejan de verse y vuelven al regresar
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM dishes WHERE id = da1; r := r||'(6) en sede 1 ve su plato: '||n||' (esperado 1)'||E'\n';
  PERFORM cambiar_sede(a2);
  SELECT count(*) INTO n FROM dishes WHERE id = da1; r := r||'(6) en sede 2 ve plato de sede 1: '||n||' (esperado 0)'||E'\n';
  r := r||'(6) sede activa es la 2: '||(current_restaurant_id() = a2)||' (esperado true)'||E'\n';
  PERFORM cambiar_sede(a1);
  SELECT count(*) INTO n FROM dishes WHERE id = da1; r := r||'(6) de vuelta en sede 1 ve su plato: '||n||' (esperado 1)'||E'\n';

  -- (7) cambiar la sede por UPDATE directo sigue bloqueado
  BEGIN UPDATE profiles SET restaurant_id = b1 WHERE id = uo; r := r||'(7) UPDATE directo a sede de B (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(7) UPDATE directo bloqueado: '||sqlerrm||E'\n'; END;
  BEGIN UPDATE profiles SET restaurant_id = a2 WHERE id = uo; r := r||'(7) UPDATE directo a sede propia (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(7) UPDATE directo a sede propia bloqueado: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  RAISE EXCEPTION E'TEST_OUTPUT:\n%', r;
END $$;
