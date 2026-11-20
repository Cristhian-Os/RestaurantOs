-- Menús por franjas horarias — 2/3: funciones que deciden qué menú rige y a qué precio.
-- ADITIVA: solo funciones nuevas. No cambia ninguna función existente (eso va en la migración 3/3).
-- Toda decisión sale del servidor y de la zona horaria DEL RESTAURANTE (restaurant_config.zona_horaria),
-- nunca de la hora del celular.

-- ─── Menús vigentes en un momento dado ───────────────────────────────────────
-- Orden: franjas del día (o del día especial) → excepciones manuales (forzar reemplaza; extender suma) → suspender quita.
-- Una franja que cruza la medianoche cuenta para el día en que EMPIEZA.
CREATE OR REPLACE FUNCTION public._menus_vigentes(p_rid uuid, p_at timestamptz)
 RETURNS TABLE(menu_id uuid, origen text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE
  v_zona text; v_loc timestamp; v_d date; v_t time; v_dow int; v_pd date; v_pdow int;
  v_esp_hoy uuid; v_esp_ayer uuid;
BEGIN
  SELECT zona_horaria INTO v_zona FROM restaurant_config WHERE restaurant_id = p_rid;
  v_zona := COALESCE(v_zona, 'America/Bogota');
  v_loc := p_at AT TIME ZONE v_zona;
  v_d := v_loc::date; v_t := v_loc::time; v_dow := extract(dow FROM v_loc)::int;
  v_pd := v_d - 1;    v_pdow := extract(dow FROM v_pd::timestamp)::int;
  SELECT id INTO v_esp_hoy  FROM menu_horario_dias_especiales WHERE restaurant_id = p_rid AND fecha = v_d;
  SELECT id INTO v_esp_ayer FROM menu_horario_dias_especiales WHERE restaurant_id = p_rid AND fecha = v_pd;

  RETURN QUERY
  WITH base AS (
    SELECT DISTINCT m.id AS mid
    FROM menus_horario m
    JOIN menu_horario_franjas f ON f.menu_id = m.id
    WHERE m.restaurant_id = p_rid AND m.estado = 'activo'
      AND (
        ( (m.fecha_inicio IS NULL OR v_d >= m.fecha_inicio) AND (m.fecha_fin IS NULL OR v_d <= m.fecha_fin)
          AND CASE WHEN v_esp_hoy IS NOT NULL THEN f.dia_especial_id = v_esp_hoy
                   ELSE f.dia_especial_id IS NULL AND v_dow = ANY (f.dias) END
          AND f.hora_inicio <= v_t
          AND (f.hora_fin <= f.hora_inicio OR v_t < f.hora_fin) )
        OR
        ( (m.fecha_inicio IS NULL OR v_pd >= m.fecha_inicio) AND (m.fecha_fin IS NULL OR v_pd <= m.fecha_fin)
          AND CASE WHEN v_esp_ayer IS NOT NULL THEN f.dia_especial_id = v_esp_ayer
                   ELSE f.dia_especial_id IS NULL AND v_pdow = ANY (f.dias) END
          AND f.hora_fin <= f.hora_inicio AND v_t < f.hora_fin )
      )
  ), exc AS (
    SELECT e.tipo, e.menu_id FROM menu_horario_excepciones e
    JOIN menus_horario m ON m.id = e.menu_id AND m.estado = 'activo'
    WHERE e.restaurant_id = p_rid AND e.desde <= p_at AND (e.hasta IS NULL OR e.hasta > p_at)
      AND (e.cerrada_at IS NULL OR e.cerrada_at > p_at)
  ), hay_forzar AS (
    SELECT EXISTS (SELECT 1 FROM exc WHERE tipo = 'forzar') AS si
  ), todos AS (
    SELECT b.mid, 'horario'::text AS org FROM base b, hay_forzar h WHERE NOT h.si
    UNION ALL
    SELECT x.menu_id, 'extendido' FROM exc x, hay_forzar h WHERE x.tipo = 'extender' AND NOT h.si
    UNION ALL
    SELECT x.menu_id, 'forzado' FROM exc x WHERE x.tipo = 'forzar'
  )
  SELECT DISTINCT ON (t.mid) t.mid, t.org
  FROM todos t
  WHERE t.mid NOT IN (SELECT x.menu_id FROM exc x WHERE x.tipo = 'suspender')
  ORDER BY t.mid, CASE t.org WHEN 'forzado' THEN 0 WHEN 'horario' THEN 1 ELSE 2 END;
END $$;

-- ─── ¿Se puede vender este plato ahora y con qué precio de menú? ─────────────
-- Devuelve {permitido, menu_id, menu_nombre, precio_especial, precios_tamano, gracia, autorizado}.
-- Con el interruptor apagado: {permitido:true, sin_menus:true} (todo funciona como antes).
-- Gracia: si el plato estaba permitido hace ≤ menus_gracia_min, se acepta con el precio de ese momento
-- (carrito armado justo antes del cambio de franja).
CREATE OR REPLACE FUNCTION public._menu_plato(p_dish public.dishes, p_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg record; v_row record; v_at timestamptz; v_canal text := COALESCE(current_setting('app.menu_canal', true), '');
  v_found boolean;
BEGIN
  SELECT menus_horario_activo, menus_gracia_min, menus_staff_fuera_horario INTO v_cfg
    FROM restaurant_config WHERE restaurant_id = p_dish.restaurant_id;
  IF NOT COALESCE(v_cfg.menus_horario_activo, false) THEN
    RETURN jsonb_build_object('permitido', true, 'sin_menus', true);
  END IF;

  FOREACH v_at IN ARRAY ARRAY[p_at, p_at - make_interval(mins => COALESCE(v_cfg.menus_gracia_min, 0))] LOOP
    SELECT mp.menu_id, m.nombre, mp.precio_especial, mp.precios_tamano INTO v_row
    FROM _menus_vigentes(p_dish.restaurant_id, v_at) v
    JOIN menus_horario m ON m.id = v.menu_id
    JOIN menu_horario_productos mp ON mp.menu_id = m.id AND mp.dish_id = p_dish.id
    WHERE v_canal <> 'qr' OR m.mostrar_en_qr
    ORDER BY m.prioridad, m.created_at
    LIMIT 1;
    v_found := FOUND;
    IF v_found THEN
      RETURN jsonb_build_object('permitido', true, 'menu_id', v_row.menu_id, 'menu_nombre', v_row.nombre,
        'precio_especial', v_row.precio_especial, 'precios_tamano', v_row.precios_tamano, 'gracia', v_at <> p_at);
    END IF;
  END LOOP;

  IF p_dish.todo_el_dia THEN
    RETURN jsonb_build_object('permitido', true, 'todo_el_dia', true);
  END IF;
  -- Autorización explícita del administrador: el personal puede vender fuera de horario (a precio general)
  IF COALESCE(v_cfg.menus_staff_fuera_horario, false) AND v_canal <> 'qr'
     AND public.get_user_role() IN ('admin', 'waiter', 'cashier')
     AND public.current_restaurant_id() = p_dish.restaurant_id THEN
    RETURN jsonb_build_object('permitido', true, 'autorizado', true);
  END IF;
  RETURN jsonb_build_object('permitido', false);
END $$;

-- ─── Estado público/del personal: UNA llamada por carga ──────────────────────
-- p_canal 'qr' (público, solo menús marcados "mostrar en QR") o 'personal' (mesero/caja/admin de esa sede).
-- Devuelve el menú vigente, los platos visibles con su precio de menú, cuándo cambia y cuál es el siguiente.
CREATE OR REPLACE FUNCTION public.menu_horario_estado(p_restaurant_id uuid, p_canal text DEFAULT 'qr')
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE
  v_cfg record; v_now timestamptz := now(); v_personal boolean := (p_canal = 'personal');
  v_cur uuid[]; v_x uuid[]; v_prev uuid[]; v_menus jsonb; v_platos jsonb; v_manual jsonb;
  v_cambia timestamptz; v_sig timestamptz; v_sig_ids uuid[]; v_cand timestamptz; v_ld date; v_sig_json jsonb;
BEGIN
  IF v_personal AND (auth.uid() IS NULL OR p_restaurant_id IS DISTINCT FROM public.current_restaurant_id()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT menus_horario_activo, zona_horaria INTO v_cfg FROM restaurant_config WHERE restaurant_id = p_restaurant_id;
  IF NOT FOUND OR NOT v_cfg.menus_horario_activo THEN
    RETURN jsonb_build_object('activo', false, 'hora_servidor', v_now);
  END IF;

  SELECT COALESCE(array_agg(v.menu_id ORDER BY v.menu_id), '{}') INTO v_cur
    FROM _menus_vigentes(p_restaurant_id, v_now) v JOIN menus_horario m ON m.id = v.menu_id
   WHERE v_personal OR m.mostrar_en_qr;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'descripcion', m.descripcion,
           'color', m.color, 'origen', v.origen) ORDER BY m.prioridad, m.nombre), '[]'::jsonb) INTO v_menus
    FROM _menus_vigentes(p_restaurant_id, v_now) v JOIN menus_horario m ON m.id = v.menu_id
   WHERE v_personal OR m.mostrar_en_qr;

  WITH en_menu AS (
    SELECT DISTINCT ON (mp.dish_id) mp.dish_id, m.id AS menu_id, m.nombre, mp.precio_especial, mp.precios_tamano
      FROM _menus_vigentes(p_restaurant_id, v_now) v
      JOIN menus_horario m ON m.id = v.menu_id
      JOIN menu_horario_productos mp ON mp.menu_id = m.id
     WHERE v_personal OR m.mostrar_en_qr
     ORDER BY mp.dish_id, m.prioridad, m.created_at
  ), todo AS (
    SELECT d.id AS dish_id FROM dishes d
     WHERE d.restaurant_id = p_restaurant_id AND d.todo_el_dia AND d.id NOT IN (SELECT dish_id FROM en_menu)
  )
  SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_platos FROM (
    SELECT jsonb_build_object('dish_id', e.dish_id, 'menu_id', e.menu_id, 'menu_nombre', e.nombre,
             'precio_especial', e.precio_especial, 'precios_tamano', e.precios_tamano) AS j FROM en_menu e
    UNION ALL
    SELECT jsonb_build_object('dish_id', t.dish_id, 'todo_el_dia', true) FROM todo t
  ) q;

  -- ¿Hay control manual activo ahora?
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'menu_id', e.menu_id, 'hasta', e.hasta, 'nota', e.nota)), '[]'::jsonb)
    INTO v_manual
    FROM menu_horario_excepciones e
   WHERE e.restaurant_id = p_restaurant_id AND e.desde <= v_now AND (e.hasta IS NULL OR e.hasta > v_now) AND e.cerrada_at IS NULL;

  -- Próximo cambio y próximo menú: se revisan los instantes en que algo puede cambiar (próximos 8 días)
  v_ld := (v_now AT TIME ZONE v_cfg.zona_horaria)::date;
  v_prev := v_cur;
  FOR v_cand IN
    SELECT DISTINCT c.t FROM (
      SELECT ((v_ld + g) + f.hora_inicio) AT TIME ZONE v_cfg.zona_horaria AS t
        FROM menu_horario_franjas f, generate_series(-1, 8) g WHERE f.restaurant_id = p_restaurant_id
      UNION ALL
      SELECT ((v_ld + g) + f.hora_fin) AT TIME ZONE v_cfg.zona_horaria
        FROM menu_horario_franjas f, generate_series(-1, 8) g WHERE f.restaurant_id = p_restaurant_id
      UNION ALL
      SELECT (v_ld + g)::timestamp AT TIME ZONE v_cfg.zona_horaria FROM generate_series(0, 8) g
      UNION ALL
      SELECT e.desde FROM menu_horario_excepciones e WHERE e.restaurant_id = p_restaurant_id
      UNION ALL
      SELECT e.hasta FROM menu_horario_excepciones e WHERE e.restaurant_id = p_restaurant_id AND e.hasta IS NOT NULL
    ) c
    WHERE c.t > v_now AND c.t <= v_now + interval '8 days'
    ORDER BY c.t
  LOOP
    SELECT COALESCE(array_agg(v.menu_id ORDER BY v.menu_id), '{}') INTO v_x
      FROM _menus_vigentes(p_restaurant_id, v_cand) v JOIN menus_horario m ON m.id = v.menu_id
     WHERE v_personal OR m.mostrar_en_qr;
    IF v_x IS DISTINCT FROM v_prev THEN
      IF v_cambia IS NULL THEN v_cambia := v_cand; END IF;
      IF cardinality(v_x) > 0 THEN v_sig := v_cand; v_sig_ids := v_x; EXIT; END IF;
      v_prev := v_x;
    END IF;
  END LOOP;

  IF v_sig IS NOT NULL THEN
    SELECT jsonb_build_object('desde', v_sig, 'desde_local', to_char(v_sig AT TIME ZONE v_cfg.zona_horaria, 'YYYY-MM-DD"T"HH24:MI'),
             'menus', COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) ORDER BY m.prioridad, m.nombre), '[]'::jsonb))
      INTO v_sig_json FROM menus_horario m WHERE m.id = ANY (v_sig_ids);
  END IF;

  RETURN jsonb_build_object(
    'activo', true, 'zona', v_cfg.zona_horaria, 'hora_servidor', v_now,
    'hora_local', to_char(v_now AT TIME ZONE v_cfg.zona_horaria, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'modo', CASE WHEN jsonb_array_length(v_manual) > 0 THEN 'manual' ELSE 'automatico' END,
    'manual', CASE WHEN v_personal THEN v_manual END,
    'menus', v_menus, 'platos', v_platos,
    'cambia_en', v_cambia, 'siguiente', v_sig_json);
END $$;

-- ─── Administración (todas validan is_admin() y la sede activa) ───────────────
-- Guardar un menú completo (datos + franjas + productos) en una sola operación.
CREATE OR REPLACE FUNCTION public.menu_horario_guardar(p_menu jsonb)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := public.current_restaurant_id(); v_id uuid; v_f jsonb; v_p jsonb; v_dias smallint[]; v_hi time; v_hf time;
  v_esp uuid; v_prec numeric; v_pt jsonb; v_kv record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() OR v_rid IS NULL THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  IF p_menu IS NULL OR jsonb_typeof(p_menu) <> 'object' THEN RAISE EXCEPTION 'Datos del menú inválidos'; END IF;

  IF NULLIF(p_menu->>'id', '') IS NOT NULL THEN
    v_id := (p_menu->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM menus_horario WHERE id = v_id AND restaurant_id = v_rid) THEN RAISE EXCEPTION 'Menú no encontrado'; END IF;
    UPDATE menus_horario SET
      nombre = btrim(p_menu->>'nombre'), descripcion = NULLIF(btrim(COALESCE(p_menu->>'descripcion', '')), ''),
      estado = COALESCE(NULLIF(p_menu->>'estado', ''), estado),
      mostrar_en_qr = COALESCE((p_menu->>'mostrar_en_qr')::boolean, mostrar_en_qr),
      fecha_inicio = NULLIF(p_menu->>'fecha_inicio', '')::date, fecha_fin = NULLIF(p_menu->>'fecha_fin', '')::date,
      prioridad = COALESCE(NULLIF(p_menu->>'prioridad', '')::int, prioridad), color = NULLIF(p_menu->>'color', '')
    WHERE id = v_id;
  ELSE
    INSERT INTO menus_horario (restaurant_id, nombre, descripcion, estado, mostrar_en_qr, fecha_inicio, fecha_fin, prioridad, color)
    VALUES (v_rid, btrim(p_menu->>'nombre'), NULLIF(btrim(COALESCE(p_menu->>'descripcion', '')), ''),
            COALESCE(NULLIF(p_menu->>'estado', ''), 'activo'), COALESCE((p_menu->>'mostrar_en_qr')::boolean, true),
            NULLIF(p_menu->>'fecha_inicio', '')::date, NULLIF(p_menu->>'fecha_fin', '')::date,
            COALESCE(NULLIF(p_menu->>'prioridad', '')::int, 100), NULLIF(p_menu->>'color', ''))
    RETURNING id INTO v_id;
  END IF;

  IF p_menu ? 'franjas' THEN
    DELETE FROM menu_horario_franjas WHERE menu_id = v_id;
    FOR v_f IN SELECT * FROM jsonb_array_elements(COALESCE(p_menu->'franjas', '[]'::jsonb)) LOOP
      v_hi := (v_f->>'hora_inicio')::time; v_hf := (v_f->>'hora_fin')::time;
      v_esp := NULLIF(v_f->>'dia_especial_id', '')::uuid;
      v_dias := CASE WHEN v_esp IS NOT NULL THEN '{}'::smallint[]
                     ELSE ARRAY(SELECT x::smallint FROM jsonb_array_elements_text(COALESCE(v_f->'dias', '[]'::jsonb)) x) END;
      INSERT INTO menu_horario_franjas (menu_id, restaurant_id, dias, dia_especial_id, hora_inicio, hora_fin)
      VALUES (v_id, v_rid, v_dias, v_esp, v_hi, v_hf);
    END LOOP;
  END IF;

  IF p_menu ? 'productos' THEN
    DELETE FROM menu_horario_productos WHERE menu_id = v_id;
    FOR v_p IN SELECT * FROM jsonb_array_elements(COALESCE(p_menu->'productos', '[]'::jsonb)) LOOP
      v_prec := NULLIF(v_p->>'precio_especial', '')::numeric;
      v_pt := CASE WHEN jsonb_typeof(v_p->'precios_tamano') = 'object' THEN v_p->'precios_tamano' ELSE '{}'::jsonb END;
      FOR v_kv IN SELECT key, value FROM jsonb_each_text(v_pt) LOOP
        IF v_kv.value !~ '^[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Precio inválido para el tamaño %', v_kv.key; END IF;
      END LOOP;
      INSERT INTO menu_horario_productos (menu_id, restaurant_id, dish_id, precio_especial, precios_tamano, sort_order)
      VALUES (v_id, v_rid, (v_p->>'dish_id')::uuid, v_prec, v_pt, COALESCE(NULLIF(v_p->>'sort_order', '')::int, 0));
    END LOOP;
  END IF;
  RETURN v_id;
END $$;

-- Duplicar un menú (nace en pausa para no cambiar lo que ven los clientes sin que el admin lo decida).
CREATE OR REPLACE FUNCTION public.menu_horario_duplicar(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id(); v_new uuid; v_m menus_horario%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  SELECT * INTO v_m FROM menus_horario WHERE id = p_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menú no encontrado'; END IF;
  INSERT INTO menus_horario (restaurant_id, nombre, descripcion, estado, mostrar_en_qr, fecha_inicio, fecha_fin, prioridad, color)
  VALUES (v_rid, left(v_m.nombre, 50) || ' (copia)', v_m.descripcion, 'pausado', v_m.mostrar_en_qr, v_m.fecha_inicio, v_m.fecha_fin, v_m.prioridad, v_m.color)
  RETURNING id INTO v_new;
  INSERT INTO menu_horario_franjas (menu_id, restaurant_id, dias, dia_especial_id, hora_inicio, hora_fin)
    SELECT v_new, v_rid, dias, dia_especial_id, hora_inicio, hora_fin FROM menu_horario_franjas WHERE menu_id = p_id;
  INSERT INTO menu_horario_productos (menu_id, restaurant_id, dish_id, precio_especial, precios_tamano, sort_order)
    SELECT v_new, v_rid, dish_id, precio_especial, precios_tamano, sort_order FROM menu_horario_productos WHERE menu_id = p_id;
  RETURN v_new;
END $$;

-- Control manual: forzar (solo ese menú), extender (sumar ese menú) o suspender (quitarlo). p_hasta NULL = hasta volver a automático.
CREATE OR REPLACE FUNCTION public.menu_horario_excepcion(p_tipo text, p_menu_id uuid, p_hasta timestamptz DEFAULT NULL, p_nota text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id(); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  IF p_tipo NOT IN ('forzar', 'extender', 'suspender') THEN RAISE EXCEPTION 'Tipo de control no válido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM menus_horario WHERE id = p_menu_id AND restaurant_id = v_rid AND estado = 'activo') THEN
    RAISE EXCEPTION 'El menú debe existir y estar activo';
  END IF;
  IF p_hasta IS NOT NULL AND p_hasta <= now() THEN RAISE EXCEPTION 'La hora de fin debe ser futura'; END IF;
  IF p_tipo = 'forzar' THEN  -- solo un menú forzado a la vez
    UPDATE menu_horario_excepciones SET cerrada_at = now(), cerrada_by = auth.uid()
     WHERE restaurant_id = v_rid AND tipo = 'forzar' AND cerrada_at IS NULL AND (hasta IS NULL OR hasta > now());
  END IF;
  INSERT INTO menu_horario_excepciones (restaurant_id, tipo, menu_id, desde, hasta, nota)
  VALUES (v_rid, p_tipo, p_menu_id, now(), p_hasta, NULLIF(left(btrim(COALESCE(p_nota, '')), 200), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Volver al funcionamiento automático: cierra todo control manual abierto (queda en el historial).
CREATE OR REPLACE FUNCTION public.menu_horario_volver_automatico()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  UPDATE menu_horario_excepciones SET cerrada_at = now(), cerrada_by = auth.uid()
   WHERE restaurant_id = public.current_restaurant_id() AND cerrada_at IS NULL AND (hasta IS NULL OR hasta > now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Encender/apagar "Menús por horario" en la sede. Al encender se avisa si el menú de clientes quedaría vacío ahora.
CREATE OR REPLACE FUNCTION public.menu_horario_interruptor(p_activo boolean, p_confirmar_vacio boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := public.current_restaurant_id(); v_visibles integer; v_total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() OR v_rid IS NULL THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  IF p_activo THEN
    SELECT count(*) INTO v_total FROM dishes WHERE restaurant_id = v_rid AND available AND availability_status <> 'discontinued';
    SELECT count(*) INTO v_visibles FROM dishes d
     WHERE d.restaurant_id = v_rid AND d.available AND d.availability_status <> 'discontinued'
       AND (d.todo_el_dia OR EXISTS (SELECT 1 FROM _menus_vigentes(v_rid, now()) v JOIN menu_horario_productos mp ON mp.menu_id = v.menu_id WHERE mp.dish_id = d.id));
    IF v_visibles = 0 AND NOT p_confirmar_vacio THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'menu_vacio', 'platos_total', v_total, 'platos_visibles', 0);
    END IF;
  END IF;
  UPDATE restaurant_config SET menus_horario_activo = p_activo WHERE restaurant_id = v_rid;
  RETURN jsonb_build_object('ok', true, 'activo', p_activo);
END $$;

-- Reutilizar un menú en otra sede de la misma cuenta. Los platos se emparejan por nombre (cada sede tiene los suyos).
-- Nace en pausa. Devuelve los platos que no existen en la sede destino.
CREATE OR REPLACE FUNCTION public.menu_horario_copiar_a_sede(p_menu_id uuid, p_sede uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := public.current_restaurant_id(); v_m menus_horario%ROWTYPE; v_new uuid; v_ok integer; v_faltan jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede gestionar menús'; END IF;
  IF p_sede IS NULL OR p_sede = v_rid THEN RAISE EXCEPTION 'Elige otra sede'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(public.mis_sedes()) AS s(id uuid) WHERE s.id = p_sede) THEN
    RAISE EXCEPTION 'Esa sede no es de tu cuenta';
  END IF;
  SELECT * INTO v_m FROM menus_horario WHERE id = p_menu_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menú no encontrado'; END IF;

  INSERT INTO menus_horario (restaurant_id, nombre, descripcion, estado, mostrar_en_qr, fecha_inicio, fecha_fin, prioridad, color)
  VALUES (p_sede, v_m.nombre, v_m.descripcion, 'pausado', v_m.mostrar_en_qr, v_m.fecha_inicio, v_m.fecha_fin, v_m.prioridad, v_m.color)
  RETURNING id INTO v_new;
  INSERT INTO menu_horario_franjas (menu_id, restaurant_id, dias, hora_inicio, hora_fin)
    SELECT v_new, p_sede, dias, hora_inicio, hora_fin FROM menu_horario_franjas WHERE menu_id = p_menu_id AND dia_especial_id IS NULL;
  WITH ins AS (
    INSERT INTO menu_horario_productos (menu_id, restaurant_id, dish_id, precio_especial, precios_tamano, sort_order)
    SELECT DISTINCT ON (d2.id) v_new, p_sede, d2.id, mp.precio_especial, mp.precios_tamano, mp.sort_order
      FROM menu_horario_productos mp
      JOIN dishes d1 ON d1.id = mp.dish_id
      JOIN dishes d2 ON d2.restaurant_id = p_sede AND lower(btrim(d2.name)) = lower(btrim(d1.name)) AND d2.availability_status <> 'discontinued'
     WHERE mp.menu_id = p_menu_id
    RETURNING 1
  ) SELECT count(*) INTO v_ok FROM ins;
  SELECT COALESCE(jsonb_agg(d1.name), '[]'::jsonb) INTO v_faltan
    FROM menu_horario_productos mp JOIN dishes d1 ON d1.id = mp.dish_id
   WHERE mp.menu_id = p_menu_id
     AND NOT EXISTS (SELECT 1 FROM dishes d2 WHERE d2.restaurant_id = p_sede AND lower(btrim(d2.name)) = lower(btrim(d1.name)) AND d2.availability_status <> 'discontinued');
  RETURN jsonb_build_object('menu_id', v_new, 'productos_copiados', v_ok, 'productos_sin_equivalente', v_faltan);
END $$;

-- ─── Permisos ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._menus_vigentes(uuid, timestamptz), public._menu_plato(public.dishes, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.menu_horario_estado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.menu_horario_estado(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.menu_horario_guardar(jsonb), public.menu_horario_duplicar(uuid),
  public.menu_horario_excepcion(text, uuid, timestamptz, text), public.menu_horario_volver_automatico(),
  public.menu_horario_interruptor(boolean, boolean), public.menu_horario_copiar_a_sede(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_horario_guardar(jsonb), public.menu_horario_duplicar(uuid),
  public.menu_horario_excepcion(text, uuid, timestamptz, text), public.menu_horario_volver_automatico(),
  public.menu_horario_interruptor(boolean, boolean), public.menu_horario_copiar_a_sede(uuid, uuid) TO authenticated;
