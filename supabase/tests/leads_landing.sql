-- Prueba de leads de la landing (migración 20261021230000). SOLO para un proyecto de PRUEBA.
-- Comprueba: anon no lee ni inserta leads ni ejecuta registrar_lead; un administrador de restaurante no los lee;
-- registrar_lead (service_role) crea y deduplica por WhatsApp en 24 h y valida datos; el dueño con 2 pasos los lee sin la IP;
-- el límite por IP corta el abuso. Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; n int; j jsonb; ok boolean; us uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); a uuid := gen_random_uuid(); CS2 text; CS1 text; CA text; i int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (us,'authenticated','authenticated','dueno@lead.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ua,'authenticated','authenticated','admin@lead.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES (a,'Lead R','lead-r','leadr.test','pro',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'super_admin','Dueño','dueno@lead.test',NULL),(ua,'admin','Admin','admin@lead.test',a)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  CS2 := '{"role":"authenticated","sub":"'||us||'","aal":"aal2"}'; CS1 := '{"role":"authenticated","sub":"'||us||'","aal":"aal1"}'; CA := '{"role":"authenticated","sub":"'||ua||'","aal":"aal1"}';

  -- (1) anon
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM leads; r := r||'(1) anon ve leads: '||n||' (esperado 0)'||E'\n';
  BEGIN INSERT INTO leads (nombre, whatsapp) VALUES ('Intruso','3001112222'); r := r||'(1) anon inserta lead (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(1) anon no inserta: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  r := r||'(1) registrar_lead ejecutable por anon/authenticated: '||has_function_privilege('anon','public.registrar_lead(text,text,text,text,text,integer,text,text,text,text)','EXECUTE')||'/'||has_function_privilege('authenticated','public.registrar_lead(text,text,text,text,text,integer,text,text,text,text)','EXECUTE')||' (esperado false/false), service_role: '||has_function_privilege('service_role','public.registrar_lead(text,text,text,text,text,integer,text,text,text,text)','EXECUTE')||' (esperado true)'||E'\n';

  -- (2) administrador de restaurante
  PERFORM set_config('request.jwt.claims', CA, true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM leads; r := r||'(2) admin de restaurante ve leads directo: '||n||' (esperado 0)'||E'\n';
  BEGIN PERFORM plataforma_leads(); r := r||'(2) admin lee plataforma_leads (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(2) admin no lee plataforma_leads: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (3) registrar_lead como service_role (aquí: postgres, que es quien la ejecuta con service_role)
  j := registrar_lead('Ana Pérez','+57 300 111 2222','Heladería Ana','Armenia','heladeria',12,'pro','Quiere Pro para 12 mesas','promo-1','h:abc'); r := r||'(3) primer registro nuevo='||(j->>'nuevo')||' (esperado true)'||E'\n';
  j := registrar_lead('Ana Pérez','3001112222',NULL,NULL,NULL,NULL,'pro','Pidió el precio anual',NULL,'h:abc'); r := r||'(3) mismo WhatsApp nuevo='||(j->>'nuevo')||' (esperado false)'||E'\n';
  SELECT count(*) INTO n FROM leads; r := r||'(3) leads guardados: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM leads WHERE whatsapp = '573001112222' AND ref = 'promo-1' AND restaurante = 'Heladería Ana'; r := r||'(3) WhatsApp normalizado, ref y datos conservados: '||n||' (esperado 1)'||E'\n';
  BEGIN PERFORM registrar_lead('Bob','abc'); r := r||'(3) WhatsApp inválido aceptado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) WhatsApp inválido rechazado'||E'\n'; END;
  BEGIN PERFORM registrar_lead('Bob','3109998888',NULL,NULL,NULL,NULL,'otro',NULL,'ref con espacios <script>'); r := r||'(3) ref inválido aceptado (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(3) ref inválido rechazado'||E'\n'; END;

  -- (4) dueño de la plataforma
  PERFORM set_config('request.jwt.claims', CS1, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM plataforma_leads(); r := r||'(4) dueño SIN 2 pasos lee leads (FALLA)'||E'\n'; EXCEPTION WHEN OTHERS THEN r := r||'(4) dueño sin 2 pasos no lee: '||sqlerrm||E'\n'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', CS2, true); SET LOCAL ROLE authenticated;
  j := plataforma_leads(); r := r||'(4) dueño con 2 pasos ve '||jsonb_array_length(j)||' lead(s) (esperado 1), ip_hash expuesto: '||(j->0 ? 'ip_hash')||' (esperado false)'||E'\n';
  PERFORM plataforma_marcar_lead((j->0->>'id')::uuid, 'contactado');
  RESET ROLE;
  SELECT count(*) INTO n FROM leads WHERE estado = 'contactado'; r := r||'(4) lead marcado contactado: '||n||' (esperado 1)'||E'\n';

  -- (5) límite por IP: 5 por hora
  ok := true; n := 0;
  BEGIN
    FOR i IN 1..8 LOOP n := i; PERFORM registrar_lead('Spam '||i, '31299900'||lpad(i::text,2,'0'), NULL, NULL, NULL, NULL, 'otro', NULL, NULL, 'h:spam'); END LOOP;
  EXCEPTION WHEN OTHERS THEN ok := false; END;
  r := r||'(5) el límite por IP cortó en el intento '||n||' (esperado 6): '||(NOT ok)||E'\n';

  RAISE EXCEPTION E'TEST_OUTPUT:\n%', r;
END $$;
