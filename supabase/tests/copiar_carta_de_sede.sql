-- Prueba de 20261120140000_copiar_carta_de_sede. SOLO para un proyecto de PRUEBA.
-- Comprueba: (1) el dueño copia la carta de la sede 1 a la sede 2 con todo conectado y stock en 0;
-- (2) lo copiado es independiente: editar o borrar en la sede 2 no toca la sede 1; (3) no copia a una sede con carta;
-- (4) el administrador de la sede 2 que no es dueño no puede copiar; (5) otra cuenta no puede copiar desde la sede 1;
-- (6) no copia a la misma sede.
-- Termina con RAISE EXCEPTION a propósito: todo se revierte.
DO $$
DECLARE r text := ''; n int; j jsonb; t text;
  a1 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); a2 uuid;
  uo uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  CO text; CS text; CB text;
  pv uuid; i1 uuid; i2 uuid; d1 uuid; d2 uuid; nd1 uuid; ni1 uuid;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password) VALUES
    (uo,'authenticated','authenticated','dueno@copia-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (us,'authenticated','authenticated','admin2@copia-a.test', crypt('ClaveActual1', gen_salt('bf'))),
    (ub,'authenticated','authenticated','dueno@copia-b.test', crypt('ClaveActual1', gen_salt('bf')));
  INSERT INTO restaurants (id, name, slug, email_domain, plan, active) VALUES
    (a1,'Copia A1','copia-a1','copiaa1.test','premium',true),
    (b1,'Copia B1','copia-b1','copiab1.test','premium',true);
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES
    (uo,'admin','Dueño A','dueno@copia-a.test',a1),(ub,'admin','Dueño B','dueno@copia-b.test',b1)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  UPDATE restaurants SET owner_id = uo WHERE id = a1;
  UPDATE restaurants SET owner_id = ub WHERE id = b1;
  INSERT INTO subscriptions (restaurant_id, plan, status) VALUES (a1,'premium','active'),(b1,'premium','active');

  -- Carta de la sede 1
  INSERT INTO proveedores (restaurant_id, nombre, telefono) VALUES (a1,'Lácteos del Quindío','3000000000') RETURNING id INTO pv;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, proveedor_id)
    VALUES (a1,'Leche','litro',40,5,3000,pv) RETURNING id INTO i1;
  INSERT INTO ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, sustituto_id)
    VALUES (a1,'Leche deslactosada','litro',10,2,3500,i1) RETURNING id INTO i2;
  INSERT INTO dishes (restaurant_id, name, price, category, availability_status, options, toppings, image_url)
    VALUES (a1,'Malteada',12000,'bebidas','out_of_stock','[{"tipo":"helado","nombre":"Sabor","cantidad":1}]',
            '[{"nombre":"Chispas","precio":1000}]',
            'https://x.supabase.co/storage/v1/object/public/restaurant-assets/dishes/abc.jpg?v=1') RETURNING id INTO d1;
  INSERT INTO dishes (restaurant_id, name, price, category, available) VALUES (a1,'Plato oculto',8000,'principal',false) RETURNING id INTO d2;
  INSERT INTO recetas (restaurant_id, producto_id, ingrediente_id, cantidad_necesaria) VALUES (a1,d1,i1,0.3);
  INSERT INTO recetas (restaurant_id, producto_id, ingrediente_id, cantidad_necesaria, nombre) VALUES (a1,d1,NULL,1,'Vaso');
  INSERT INTO option_lists (restaurant_id, key, nombre, items) VALUES (a1,'salsas','Salsas','[{"nombre":"Rosada"}]');
  INSERT INTO restaurant_config (restaurant_id, display_name, modules_enabled)
    VALUES (a1,'Copia A1','{"categories":[{"value":"bebidas","color":"#f00"}],"helado_flavors":["Fresa"],"helado_flavors_off":["Fresa"],"options_v2":true}')
    ON CONFLICT (restaurant_id) DO UPDATE SET modules_enabled = EXCLUDED.modules_enabled;

  CO := '{"role":"authenticated","sub":"'||uo||'"}'; CS := '{"role":"authenticated","sub":"'||us||'"}';
  CB := '{"role":"authenticated","sub":"'||ub||'"}';

  -- El dueño crea la sede 2 y queda parado en ella
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  j := crear_sede('Copia A2'); a2 := (j->>'restaurant_id')::uuid;
  PERFORM cambiar_sede(a2);

  -- (6) misma sede
  BEGIN PERFORM copiar_carta_de_sede(a2); r := r||'(6) copia a la misma sede (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(6) no copia a la misma sede: '||sqlerrm||E'\n'; END;

  -- (1) copia
  j := copiar_carta_de_sede(a1);
  r := r||'(1) resultado: '||(j - 'fotos')::text||' (esperado platos 2, ingredientes 2, recetas 2, proveedores 1, listas 1)'||E'\n';
  r := r||'(1) fotos a duplicar: '||jsonb_array_length(j->'fotos')||', origen '||(j->'fotos'->0->>'origen')||' (esperado 1, dishes/abc.jpg)'||E'\n';
  RESET ROLE;

  SELECT count(*) INTO n FROM dishes WHERE restaurant_id = a2; r := r||'(1) platos en sede 2: '||n||' (esperado 2)'||E'\n';
  SELECT id INTO nd1 FROM dishes WHERE restaurant_id = a2 AND name = 'Malteada';
  SELECT availability_status||' / '||toppings::text INTO t FROM dishes WHERE id = nd1;
  r := r||'(1) malteada copiada: '||t||' (esperado available y Chispas)'||E'\n';
  SELECT available::text INTO t FROM dishes WHERE restaurant_id = a2 AND name = 'Plato oculto'; r := r||'(1) plato oculto sigue oculto: '||(t = 'false')||E'\n';
  SELECT coalesce(sum(stock_actual),-1)::text INTO t FROM ingredientes WHERE restaurant_id = a2; r := r||'(1) stock total sede 2: '||t||' (esperado 0)'||E'\n';
  SELECT id INTO ni1 FROM ingredientes WHERE restaurant_id = a2 AND nombre = 'Leche';
  SELECT count(*) INTO n FROM ingredientes i JOIN proveedores p ON p.id = i.proveedor_id
    WHERE i.id = ni1 AND p.restaurant_id = a2; r := r||'(1) proveedor de la leche es de sede 2: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM ingredientes WHERE restaurant_id = a2 AND nombre = 'Leche deslactosada' AND sustituto_id = ni1;
  r := r||'(1) sustituto reconectado en sede 2: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM recetas WHERE restaurant_id = a2 AND producto_id = nd1 AND (ingrediente_id = ni1 OR (ingrediente_id IS NULL AND nombre = 'Vaso'));
  r := r||'(1) recetas reconectadas: '||n||' (esperado 2)'||E'\n';
  SELECT count(*) INTO n FROM recetas WHERE restaurant_id = a2 AND (producto_id IN (d1,d2) OR ingrediente_id IN (i1,i2));
  r := r||'(1) recetas que apuntan a la sede 1: '||n||' (esperado 0)'||E'\n';
  SELECT (modules_enabled ? 'categories')::text||' / '||(modules_enabled ? 'helado_flavors_off')::text INTO t FROM restaurant_config WHERE restaurant_id = a2;
  r := r||'(1) config: categorías / agotados del día: '||t||' (esperado true / false)'||E'\n';
  SELECT count(*) INTO n FROM option_lists WHERE restaurant_id = a2 AND key = 'salsas'; r := r||'(1) lista de salsas: '||n||' (esperado 1)'||E'\n';
  SELECT count(*) INTO n FROM platform_audit_log WHERE action = 'copiar_carta_de_sede' AND restaurant_id = a2; r := r||'(1) queda en auditoría: '||n||' (esperado 1)'||E'\n';

  -- (2) independencia: el dueño edita y borra en la sede 2
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  UPDATE dishes SET price = 15000, name = 'Malteada grande' WHERE id = nd1;
  DELETE FROM dishes WHERE restaurant_id = a2 AND name = 'Plato oculto';
  UPDATE ingredientes SET stock_actual = 7 WHERE id = ni1;
  RESET ROLE;
  SELECT name||' '||price::int INTO t FROM dishes WHERE id = d1; r := r||'(2) sede 1 conserva: '||t||' (esperado Malteada 12000)'||E'\n';
  SELECT count(*) INTO n FROM dishes WHERE id = d2; r := r||'(2) plato oculto de sede 1 sigue: '||n||' (esperado 1)'||E'\n';
  SELECT stock_actual::int INTO n FROM ingredientes WHERE id = i1; r := r||'(2) stock leche sede 1: '||n||' (esperado 40)'||E'\n';
  SELECT count(*) INTO n FROM recetas WHERE producto_id = d1; r := r||'(2) recetas de sede 1: '||n||' (esperado 2)'||E'\n';
  SELECT name||' '||price::int INTO t FROM dishes WHERE id = nd1; r := r||'(2) sede 2 editada: '||t||' (esperado Malteada grande 15000)'||E'\n';

  -- (3) segunda copia a la sede 2 (ya tiene carta)
  PERFORM set_config('request.jwt.claims', CO, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM copiar_carta_de_sede(a1); r := r||'(3) copia a sede con carta (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(3) no copia a sede con carta: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (4) administrador de la sede 2 que no es dueño
  INSERT INTO profiles (id, role, full_name, email, restaurant_id) VALUES (us,'admin','Admin A2','admin2@copia-a.test',a2)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id;
  DELETE FROM recetas WHERE restaurant_id = a2; DELETE FROM dishes WHERE restaurant_id = a2;
  UPDATE ingredientes SET sustituto_id = NULL WHERE restaurant_id = a2; DELETE FROM ingredientes WHERE restaurant_id = a2;
  PERFORM set_config('request.jwt.claims', CS, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM copiar_carta_de_sede(a1); r := r||'(4) admin no dueño copia (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(4) admin no dueño no copia: '||sqlerrm||E'\n'; END;
  RESET ROLE;

  -- (5) otra cuenta copia desde la sede 1
  PERFORM set_config('request.jwt.claims', CB, true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM copiar_carta_de_sede(a1); r := r||'(5) otra cuenta copia (FALLA)'||E'\n';
  EXCEPTION WHEN OTHERS THEN r := r||'(5) otra cuenta no copia: '||sqlerrm||E'\n'; END;
  SELECT count(*) INTO n FROM dishes WHERE restaurant_id = b1; r := r||'(5) platos en la otra cuenta: '||n||' (esperado 0)'||E'\n';
  RESET ROLE;

  RAISE EXCEPTION E'RESULTADO (se revierte todo):\n%', r;
END $$;
