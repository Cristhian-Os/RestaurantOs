-- FASE A. Funciones SECURITY DEFINER: fugas entre restaurantes, validaciones y evasion de cobro (auditoria 2026-10-22, 3.2).
-- Compatible con el frontend actual (mismos nombres y parametros; los parametros nuevos tienen DEFAULT).
--  * F-03 crear_plato_custom / crear_orden_con_custom: el ingrediente debe ser del restaurante (antes IDOR y fuga por el
--    mensaje de error), cantidades validadas (1..50 por plato; >0 por ingrediente), el stock se descuenta por la cantidad
--    pedida (antes una sola vez aunque quantity>1) y bajo bloqueo de fila; el pedido debe ser del restaurante. Parametro
--    nuevo p_cantidad (DEFAULT 1): se elimina la firma vieja (solo la llama crear_orden_con_custom; sigue sin acceso directo).
--    La validacion de mesa ya esta en 20261022122000: no se repite.
--  * F-12 obtener_items_pedido_cliente: limite por IP y mismo mensaje para "no existe" y "no editable" (no revela estados).
--    obtener_interacciones_platos: total_vendido solo lo ve el personal (admin/cajero) de ese restaurante o el dueño de la
--    plataforma; el publico recibe 0 (la app publica no lo usa); restaurantes inactivos no se consultan desde fuera.
--    verificar_cliente_pidio_plato (oraculo por nombre): se quita de anon/authenticated (solo la usan por dentro las
--    funciones de resenas/comentarios/reacciones, que son definer) y ademas ignora pedidos cancelados y exige que el
--    pedido sea del restaurante del plato.
--  * F-13 elegir_plan: DECISION. El frontend la llama ANTES de pagar y wompi-init cobra subscriptions.amount_in_cents, asi
--    que no se bloquea al admin. Pero ya no entrega derechos sin pago: el plan elegido queda en subscriptions.plan_pendiente
--    (el monto y el ciclo si cambian) y solo pasa a subscriptions.plan cuando procesar_pago_wompi confirma un pago APROBADO
--    por ese monto. El tope de mesas (y demas limites) siguen el plan efectivamente pagado. Con un pago de suscripcion
--    PENDIENTE en curso se rechaza cambiar el monto. Valida admin ACTIVO y bloquea la fila de la suscripcion.
--    registrar_compra_proveedor: cantidades > 0, precios >= 0, topes y total > 0; nuevo p_fuente ('caja'|'propio', DEFAULT
--    'caja'). registrar_base_caja: con el corte del dia hecho solo el administrador cambia la base (el cajero ya no puede
--    maquillar el efectivo esperado). NO se cambian marcar_transferencia ni corregir_pago: la verificacion no entra en las
--    cifras del corte, corregir_pago ya exige motivo, deja autor y esta bloqueada tras el corte; separar quien cobra de
--    quien verifica romperia al cajero que atiende solo.
--  * F-14 registrar_factura_compra (sigue SECURITY INVOKER): el rol NULL ya no pasa la comprobacion; p_fuente nuevo.
--    plataforma_*: rangos en terminos de vendedor (recurrente_pct 0..100, meses), planes (precios y topes), condiciones
--    generales y precio especial.
--  * registrar_lead: un lead existente (mismo WhatsApp en 24 h) solo se COMPLETA en lo vacio; ya no se pisan sus datos.
--  * reservar_stock_receta (invoker, la usan por dentro create_public_order/crear_orden_completa) ya no es ejecutable por anon.
-- Reversa: supabase/rollback/20261022124000_funciones_integridad_y_fugas_down.sql

-- 0) Estructura: plan elegido pendiente de pago ---------------------------------------------------------------------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_pendiente text REFERENCES public.planes(id);

-- Validador de numeros dentro de un jsonb (acepta numero o texto numerico; vacio/ausente/null = no hay valor).
CREATE OR REPLACE FUNCTION public._validar_numero_json(p jsonb, k text, lo numeric, hi numeric, etiqueta text, p_entero boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE t text := p #>> ARRAY[k];
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN; END IF;
  IF t !~ (CASE WHEN p_entero THEN '^[0-9]+$' ELSE '^[0-9]+(\.[0-9]+)?$' END) THEN
    RAISE EXCEPTION '% debe ser un numero% valido', etiqueta, CASE WHEN p_entero THEN ' entero' ELSE '' END;
  END IF;
  IF t::numeric < lo OR t::numeric > hi THEN RAISE EXCEPTION '% debe estar entre % y %', etiqueta, lo, hi; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._validar_numero_json(jsonb, text, numeric, numeric, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._validar_numero_json(jsonb, text, numeric, numeric, text, boolean) TO service_role;

-- F-03 crear_plato_custom ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.crear_plato_custom(uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.crear_plato_custom(p_order_id uuid, p_name text, p_description text DEFAULT NULL::text, p_ingredientes jsonb DEFAULT '{}'::jsonb, p_cantidad integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_custom_dish_id UUID;
  v_total_precio   NUMERIC(10,2) := 0;
  v_ingrediente_id UUID;
  v_cantidad_pedida NUMERIC(10,3);
  v_costo_unitario NUMERIC(10,2);
  v_stock_actual   NUMERIC(10,3);
  v_nombre         TEXT;
  v_rid            UUID := public.current_restaurant_id();
  v_name           TEXT := btrim(coalesce(p_name, ''));
  v_key            TEXT;
  v_val            JSONB;
  v_txt            TEXT;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier','client') THEN
    RAISE EXCEPTION 'No autorizado para crear platos personalizados';
  END IF;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el restaurante'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND restaurant_id = v_rid) THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'El plato personalizado necesita un nombre (máximo 100 letras)'; END IF;
  IF char_length(coalesce(p_description, '')) > 500 THEN RAISE EXCEPTION 'La descripción es demasiado larga (máximo 500 letras)'; END IF;
  IF p_ingredientes IS NULL OR jsonb_typeof(p_ingredientes) <> 'object' OR p_ingredientes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Elige al menos un ingrediente';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_ingredientes)) > 30 THEN RAISE EXCEPTION 'Demasiados ingredientes (máximo 30)'; END IF;

  INSERT INTO public.custom_dishes (order_id, name, description, created_by, restaurant_id)
  VALUES (p_order_id, v_name, p_description, auth.uid(), v_rid)
  RETURNING id INTO v_custom_dish_id;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_ingredientes) LOOP
    IF v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Ingrediente no disponible';
    END IF;
    v_txt := v_val #>> '{}';
    IF jsonb_typeof(v_val) NOT IN ('number','string') OR v_txt !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN
      RAISE EXCEPTION 'Cantidad de ingrediente inválida';
    END IF;
    v_ingrediente_id := v_key::uuid;
    v_cantidad_pedida := v_txt::numeric;
    IF v_cantidad_pedida <= 0 OR v_cantidad_pedida > 100000 THEN RAISE EXCEPTION 'Cantidad de ingrediente inválida'; END IF;

    -- Solo ingredientes de ESTE restaurante; el mensaje no distingue "no existe" de "es de otro restaurante".
    SELECT costo_unitario, stock_actual, nombre
    INTO v_costo_unitario, v_stock_actual, v_nombre
    FROM public.ingredientes
    WHERE id = v_ingrediente_id AND restaurant_id = v_rid
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente no disponible'; END IF;

    -- El stock se descuenta por TODAS las unidades pedidas del plato (cantidad del ingrediente x p_cantidad).
    IF v_stock_actual < v_cantidad_pedida * p_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente de %: disponible %, solicitado %',
        v_nombre, v_stock_actual, v_cantidad_pedida * p_cantidad;
    END IF;

    INSERT INTO public.custom_dish_ingredients (custom_dish_id, ingrediente_id, cantidad, restaurant_id)
    VALUES (v_custom_dish_id, v_ingrediente_id, v_cantidad_pedida, v_rid);

    UPDATE public.ingredientes
    SET stock_actual = stock_actual - (v_cantidad_pedida * p_cantidad)
    WHERE id = v_ingrediente_id AND restaurant_id = v_rid;

    -- Precio de venta POR UNIDAD = costo / 0.65 (mismo margen que ingredientes_menu_publico)
    v_total_precio := v_total_precio + (round(coalesce(v_costo_unitario, 0) / 0.65, 2) * v_cantidad_pedida);
  END LOOP;

  -- Redondeo hacia arriba al múltiplo de 100 más cercano (igual que create_public_order)
  UPDATE public.custom_dishes
  SET base_price = ceil(v_total_precio / 100) * 100
  WHERE id = v_custom_dish_id;

  RETURN v_custom_dish_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_plato_custom(uuid, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_plato_custom(uuid, text, text, jsonb, integer) TO service_role;

-- F-03 crear_orden_con_custom (parche sobre la definicion vigente) ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_con_custom(p_items_normales jsonb DEFAULT '[]'::jsonb, p_platos_custom jsonb DEFAULT '[]'::jsonb, p_tipo_pedido text DEFAULT 'LOCAL'::text, p_table_num integer DEFAULT NULL::integer, p_mesa_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id      UUID;
  v_total         NUMERIC := 0;
  v_item          JSONB;
  v_custom        JSONB;
  v_custom_id     UUID;
  v_custom_price  NUMERIC;
  v_qty           INTEGER;
  v_dish          public.dishes%ROWTYPE;
  v_rid           UUID := public.current_restaurant_id();
  v_items_final   JSONB := '[]'::JSONB;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','waiter','cashier','client') THEN
    RAISE EXCEPTION 'No autorizado para crear órdenes';
  END IF;
  IF v_rid IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el restaurante';
  END IF;
  IF p_mesa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mesas WHERE id = p_mesa_id AND restaurant_id = v_rid) THEN
    RAISE EXCEPTION 'La mesa no pertenece a tu restaurante';
  END IF;
  IF p_items_normales IS NULL OR jsonb_typeof(p_items_normales) <> 'array' OR jsonb_array_length(p_items_normales) > 50
     OR p_platos_custom IS NULL OR jsonb_typeof(p_platos_custom) <> 'array' OR jsonb_array_length(p_platos_custom) > 50 THEN
    RAISE EXCEPTION 'Pedido inválido: demasiados productos';
  END IF;

  INSERT INTO public.orders (user_id, mesa_id, table_num, items, total, tipo_pedido, notes, status, restaurant_id)
  VALUES (auth.uid(), p_mesa_id, p_table_num, '[]'::jsonb, 0, p_tipo_pedido, p_notes, 'pending', v_rid)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_normales) LOOP
    v_qty := coalesce((v_item->>'quantity')::INTEGER, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    SELECT * INTO v_dish FROM public.dishes
      WHERE id = (v_item->>'id')::uuid AND restaurant_id = v_rid
        AND available = true AND availability_status <> 'discontinued';
    IF NOT FOUND THEN RAISE EXCEPTION 'plato no disponible: %', v_item->>'id'; END IF;

    v_total := v_total + v_dish.price * v_qty;

    INSERT INTO public.detalles_pedidos (order_id, dish_id, cantidad, precio_unit, notes)
    VALUES (v_order_id, v_dish.id, v_qty, v_dish.price, v_item->>'notes');

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_dish.id, 'name', v_dish.name,
      'price', v_dish.price, 'quantity', v_qty
    );
  END LOOP;

  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_platos_custom) LOOP
    v_qty := COALESCE((v_custom->>'quantity')::INTEGER, 1);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'cantidad inválida'; END IF;

    v_custom_id := public.crear_plato_custom(
      v_order_id,
      v_custom->>'name',
      v_custom->>'description',
      COALESCE(v_custom->'ingredients', '{}'::jsonb),
      v_qty
    );

    SELECT base_price INTO v_custom_price FROM public.custom_dishes WHERE id = v_custom_id;
    v_total := v_total + v_custom_price * v_qty;

    v_items_final := v_items_final || jsonb_build_object(
      'id', v_custom_id, 'name', v_custom->>'name',
      'price', v_custom_price, 'quantity', v_qty, 'is_custom', true
    );
  END LOOP;

  UPDATE public.orders
  SET items = v_items_final, total = v_total
  WHERE id = v_order_id;

  RETURN json_build_object(
    'order_id', v_order_id,
    'total',    v_total,
    'status',   'pending'
  );
END; $function$;

-- F-12 obtener_items_pedido_cliente ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_items_pedido_cliente(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_items jsonb;
BEGIN
  PERFORM public._limite_ip('items_pedido', 30, 60);
  SELECT status, items INTO v_status, v_items FROM public.orders WHERE id = p_order_id;

  -- Mismo mensaje para "no existe" y "ya no se edita": no revela el estado de un pedido ajeno.
  IF v_status IS NULL OR v_status NOT IN ('pending', 'ready') THEN
    RAISE EXCEPTION 'Pedido no encontrado o ya no se puede editar';
  END IF;

  RETURN COALESCE(v_items, '[]'::jsonb);
END;
$function$;

-- F-12 obtener_interacciones_platos ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_interacciones_platos(p_restaurant_id uuid)
 RETURNS TABLE(dish_id uuid, likes_count integer, dislikes_count integer, rating_avg numeric, rating_count integer, comentarios_count integer, total_vendido integer, es_popular boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ventas as (
    select dp.dish_id, sum(dp.cantidad)::int as total_vendido
    from detalles_pedidos dp
    join dishes d on d.id = dp.dish_id
    where d.restaurant_id = p_restaurant_id
    group by dp.dish_id
  ),
  ranked as (
    select dish_id, total_vendido, rank() over (order by total_vendido desc) as rnk
    from ventas
  ),
  reacciones as (
    select l.dish_id,
           count(*) filter (where l.reaccion = 'like')::int as likes_count,
           count(*) filter (where l.reaccion = 'dislike')::int as dislikes_count
    from likes_platos l
    join dishes d on d.id = l.dish_id
    where d.restaurant_id = p_restaurant_id
    group by l.dish_id
  ),
  ratings as (
    select r.dish_id, round(avg(r.rating)::numeric, 1) as rating_avg, count(*)::int as rating_count
    from resenas_platos r
    join dishes d on d.id = r.dish_id
    where d.restaurant_id = p_restaurant_id and r.estado = 'aprobada'
    group by r.dish_id
  ),
  comentarios as (
    select c.dish_id, count(*)::int as comentarios_count
    from comentarios_platos c
    join dishes d on d.id = c.dish_id
    where d.restaurant_id = p_restaurant_id and c.estado in ('visible', 'eliminado')
    group by c.dish_id
  )
  select d.id as dish_id,
         coalesce(rc.likes_count, 0) as likes_count,
         coalesce(rc.dislikes_count, 0) as dislikes_count,
         rt.rating_avg,
         coalesce(rt.rating_count, 0) as rating_count,
         coalesce(cm.comentarios_count, 0) as comentarios_count,
         CASE WHEN (coalesce(public.current_restaurant_id() = p_restaurant_id AND public.get_user_role() IN ('admin','cashier'), false) OR public.is_super_admin()) THEN coalesce(v.total_vendido, 0) ELSE 0 END as total_vendido,
         coalesce(rk.rnk <= 3 and v.total_vendido > 0, false) as es_popular
  from dishes d
  left join ventas v on v.dish_id = d.id
  left join ranked rk on rk.dish_id = d.id
  left join reacciones rc on rc.dish_id = d.id
  left join ratings rt on rt.dish_id = d.id
  left join comentarios cm on cm.dish_id = d.id
  where d.restaurant_id = p_restaurant_id
    and (exists (select 1 from restaurants rr where rr.id = p_restaurant_id and rr.active) OR (coalesce(public.current_restaurant_id() = p_restaurant_id AND public.get_user_role() IN ('admin','cashier'), false) OR public.is_super_admin()));
$function$;

-- F-12 verificar_cliente_pidio_plato: solo uso interno (oraculo por nombre) -------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_cliente_pidio_plato(p_dish_id uuid, p_cliente_nombre text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from orders o
    join dishes d on d.id = p_dish_id and d.restaurant_id = o.restaurant_id,
         jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
    where btrim(coalesce(p_cliente_nombre, '')) <> ''
      and lower(btrim(o.customer_name)) = lower(btrim(p_cliente_nombre))
      and o.status <> 'cancelled'
      and (item->>'id') = p_dish_id::text
  );
$function$;
REVOKE ALL ON FUNCTION public.verificar_cliente_pidio_plato(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_cliente_pidio_plato(uuid, text) TO service_role;

-- reservar_stock_receta: helper interno (invoker); anon no tenia por que ejecutarla
REVOKE ALL ON FUNCTION public.reservar_stock_receta(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_stock_receta(uuid, integer, jsonb) TO service_role;

-- F-13 elegir_plan: el monto/ciclo cambian al elegir, el PLAN (y sus topes) solo al confirmarse el pago --------------
CREATE OR REPLACE FUNCTION public.elegir_plan(p_plan text, p_ciclo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid uuid := public.current_restaurant_id(); v_precio jsonb; v_sub public.subscriptions%ROWTYPE; v_monto integer;
BEGIN
  IF v_rid IS NULL OR public.get_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador del restaurante puede elegir el plan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planes WHERE id = p_plan AND disponible) THEN RAISE EXCEPTION 'Ese plan todavia no esta disponible'; END IF;
  SELECT * INTO v_sub FROM subscriptions WHERE restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tu restaurante no tiene suscripcion'; END IF;
  IF v_sub.is_promo OR EXISTS (SELECT 1 FROM restaurants WHERE id = v_rid AND is_founder) THEN RAISE EXCEPTION 'Tu restaurante tiene un acuerdo especial; el plan lo cambia el equipo de RestaurantOS'; END IF;
  v_precio := public.precio_plan(p_plan, p_ciclo);
  v_monto := ((v_precio->>'total_cop')::numeric * 100)::integer;
  -- Con un cobro en curso no se cambia el monto (el pago aprobado se compara contra subscriptions.amount_in_cents).
  IF (v_monto IS DISTINCT FROM v_sub.amount_in_cents OR p_plan IS DISTINCT FROM coalesce(v_sub.plan_pendiente, v_sub.plan))
     AND EXISTS (SELECT 1 FROM payments WHERE restaurant_id = v_rid AND kind = 'subscription' AND status = 'PENDING'
                  AND created_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Tienes un pago de la suscripcion en proceso: espera a que termine antes de cambiar el plan';
  END IF;
  UPDATE subscriptions SET ciclo = p_ciclo, amount_in_cents = v_monto,
         plan_pendiente = CASE WHEN p_plan = plan THEN NULL ELSE p_plan END
   WHERE restaurant_id = v_rid;
  RETURN v_precio || jsonb_build_object('plan', p_plan, 'ciclo', p_ciclo, 'plan_vigente', v_sub.plan, 'aplica_al_pagar', p_plan <> v_sub.plan);
END;
$function$;

-- F-13 procesar_pago_wompi: al aprobarse el pago de suscripcion se aplica el plan elegido -----------------------------
CREATE OR REPLACE FUNCTION public.procesar_pago_wompi(p_reference text, p_tx_id text, p_status text, p_amount_cents integer, p_currency text, p_method_type text, p_email text, p_raw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_mark jsonb := NULL;
  v_nota text := NULL;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'unknown_reference'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('APPROVED','DECLINED','VOIDED','ERROR','PENDING') THEN
    RETURN jsonb_build_object('result', 'ignored_status');
  END IF;

  -- APPROVED es terminal: un evento repetido o fuera de orden no cambia nada (un VOIDED si se registra para revision).
  IF v_pay.status = 'APPROVED' THEN
    IF p_status = 'VOIDED' THEN
      UPDATE public.payments SET status = 'VOIDED', raw = COALESCE(p_raw, raw), updated_at = now() WHERE id = v_pay.id;
      RETURN jsonb_build_object('result', 'voided_after_approval', 'kind', v_pay.kind, 'restaurant_id', v_pay.restaurant_id, 'order_id', v_pay.order_id);
    END IF;
    RETURN jsonb_build_object('result', 'already_approved');
  END IF;

  IF p_status = 'APPROVED' AND (p_amount_cents IS DISTINCT FROM v_pay.amount_in_cents
                                OR COALESCE(p_currency, v_pay.currency) IS DISTINCT FROM v_pay.currency) THEN
    UPDATE public.payments SET raw = COALESCE(p_raw, raw) || jsonb_build_object('_ros_nota', 'monto_o_moneda_no_coincide'), updated_at = now() WHERE id = v_pay.id;
    RETURN jsonb_build_object('result', 'amount_mismatch', 'expected_cents', v_pay.amount_in_cents, 'received_cents', p_amount_cents);
  END IF;

  UPDATE public.payments
     SET status = p_status,
         wompi_transaction_id = COALESCE(p_tx_id, wompi_transaction_id),
         payment_method_type = COALESCE(p_method_type, payment_method_type),
         customer_email = COALESCE(p_email, customer_email),
         raw = COALESCE(p_raw, raw),
         updated_at = now()
   WHERE id = v_pay.id;

  IF p_status = 'APPROVED' THEN
    IF v_pay.kind = 'subscription' THEN
      UPDATE public.subscriptions
         SET status = 'active', current_period_start = now(), current_period_end = now() + interval '1 month',
             grace_ends_at = NULL, purge_at = NULL,
             -- el plan elegido pasa a ser el vigente solo si el pago aprobado es por el monto de ese plan
             plan = CASE WHEN plan_pendiente IS NOT NULL AND amount_in_cents = v_pay.amount_in_cents THEN plan_pendiente ELSE plan END,
             plan_pendiente = CASE WHEN plan_pendiente IS NOT NULL AND amount_in_cents = v_pay.amount_in_cents THEN NULL ELSE plan_pendiente END
       WHERE restaurant_id = v_pay.restaurant_id;
    ELSIF v_pay.kind = 'diner' AND v_pay.order_id IS NOT NULL THEN
      v_mark := public.mark_order_paid(v_pay.order_id, p_method_type, p_tx_id, p_amount_cents);
      IF v_mark->>'status' NOT IN ('paid','already_paid','already_recorded') THEN
        v_nota := 'pedido_no_marcado_pagado:' || (v_mark->>'status');
        UPDATE public.payments SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('_ros_nota', v_nota) WHERE id = v_pay.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('result', 'applied', 'status', p_status, 'kind', v_pay.kind,
                            'restaurant_id', v_pay.restaurant_id, 'order_id', v_pay.order_id, 'order', v_mark);
END;
$function$;

-- F-13 registrar_compra_proveedor (firma nueva con p_fuente DEFAULT 'caja'; las llamadas actuales siguen funcionando) -----
DROP FUNCTION IF EXISTS public.registrar_compra_proveedor(text, jsonb);
CREATE OR REPLACE FUNCTION public.registrar_compra_proveedor(p_concepto text, p_items jsonb, p_fuente text DEFAULT 'caja'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid         UUID := public.current_restaurant_id();
  v_gasto_id    UUID;
  v_item        JSONB;
  v_total       NUMERIC := 0;
  v_ing_id      UUID;
  v_ing_unidad  TEXT;
  v_cantidad    NUMERIC;
  v_precio      NUMERIC;
  v_nombre      TEXT;
  v_unidad      TEXT;
  v_prov_nombre TEXT;
  v_prov_id     UUID;
  v_prov_nuevo  BOOLEAN := false;
  v_creados     JSONB := '[]'::jsonb;
  v_chk         JSONB;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar gastos';
  END IF;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el restaurante'; END IF;
  IF p_fuente IS NULL OR p_fuente NOT IN ('caja','propio') THEN RAISE EXCEPTION 'Fuente del gasto inválida (caja o propio)'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Maximo 200 productos por compra';
  END IF;
  -- Signos y topes: cantidad > 0, precio >= 0 (una compra negativa restaba gasto y stock).
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_chk) <> 'object' THEN RAISE EXCEPTION 'Un producto de la compra no es válido'; END IF;
    PERFORM public._validar_numero_json(v_chk, 'cantidad', 0.001, 1000000, 'La cantidad');
    PERFORM public._validar_numero_json(v_chk, 'precio_unitario', 0, 100000000, 'El precio unitario');
    IF coalesce(btrim(v_chk->>'cantidad'), '') = '' OR coalesce(btrim(v_chk->>'precio_unitario'), '') = '' THEN
      RAISE EXCEPTION 'Cada producto necesita cantidad y precio unitario';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((i->>'cantidad')::numeric * (i->>'precio_unitario')::numeric), 0)
  INTO v_total FROM jsonb_array_elements(p_items) i;
  IF v_total <= 0 OR v_total > 100000000000 THEN RAISE EXCEPTION 'El total de la compra debe ser mayor a cero'; END IF;

  -- Proveedor: buscar por nombre normalizado o crearlo.
  v_prov_nombre := regexp_replace(btrim(coalesce(p_concepto, '')), '\s+', ' ', 'g');
  IF char_length(v_prov_nombre) BETWEEN 1 AND 120 THEN
    SELECT id INTO v_prov_id FROM public.proveedores
    WHERE restaurant_id = v_rid AND public._norm_nombre(nombre) = public._norm_nombre(v_prov_nombre)
    ORDER BY created_at LIMIT 1;
    IF v_prov_id IS NULL THEN
      INSERT INTO public.proveedores (restaurant_id, nombre) VALUES (v_rid, v_prov_nombre)
      RETURNING id INTO v_prov_id;
      v_prov_nuevo := true;
    END IF;
  END IF;

  INSERT INTO public.gastos (restaurant_id, concepto, monto, categoria, registrado_por, proveedor_id, fuente, pagado_por_nombre)
  VALUES (v_rid, p_concepto, v_total, 'proveedor', auth.uid(), v_prov_id, p_fuente,
          CASE WHEN p_fuente = 'propio' THEN left(coalesce(nullif(btrim((SELECT full_name FROM public.profiles WHERE id = auth.uid())), ''), 'Empleado'), 80) END)
  RETURNING id INTO v_gasto_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_nombre   := regexp_replace(btrim(coalesce(v_item->>'nombre_producto', '')), '\s+', ' ', 'g');
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio   := (v_item->>'precio_unitario')::numeric;
    v_ing_id   := NULLIF(v_item->>'ingrediente_id', '')::uuid;

    IF v_nombre = '' THEN RAISE EXCEPTION 'Un producto de la compra no tiene nombre'; END IF;

    IF v_ing_id IS NOT NULL THEN
      -- Ingrediente elegido de la lista: debe ser de este restaurante.
      UPDATE public.ingredientes SET
        stock_actual   = stock_actual + v_cantidad,
        costo_unitario = v_precio,
        updated_at     = NOW()
      WHERE id = v_ing_id AND restaurant_id = v_rid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El ingrediente de "%" no existe en este restaurante', v_nombre;
      END IF;
    ELSE
      -- Producto escrito a mano: si ya existe con ese nombre, se suma ahi; si no, se crea.
      SELECT id, unidad_medida INTO v_ing_id, v_ing_unidad FROM public.ingredientes
      WHERE restaurant_id = v_rid AND public._norm_nombre(nombre) = public._norm_nombre(v_nombre)
      ORDER BY created_at LIMIT 1;

      v_unidad := public._unidad_ingrediente(v_item->>'unidad');

      IF v_ing_id IS NOT NULL THEN
        IF btrim(coalesce(v_item->>'unidad', '')) <> '' AND v_unidad IS DISTINCT FROM v_ing_unidad THEN
          RAISE EXCEPTION '"%" ya existe en el inventario en % y la compra viene en "%": registrala en %',
            v_nombre, v_ing_unidad, btrim(v_item->>'unidad'), v_ing_unidad;
        END IF;
        UPDATE public.ingredientes SET
          stock_actual   = stock_actual + v_cantidad,
          costo_unitario = v_precio,
          updated_at     = NOW()
        WHERE id = v_ing_id;
      ELSE
        IF v_unidad IS NULL THEN
          RAISE EXCEPTION '"%" es un producto nuevo: indica su unidad (kg, gramo, litro, ml, pieza o paquete)', v_nombre;
        END IF;
        IF char_length(v_nombre) > 100 THEN
          RAISE EXCEPTION 'El nombre de "%" es demasiado largo para el inventario (maximo 100 letras)', left(v_nombre, 40);
        END IF;
        INSERT INTO public.ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, proveedor_id)
        VALUES (v_rid, v_nombre, v_unidad, v_cantidad, 0, v_precio, v_prov_id)
        ON CONFLICT (restaurant_id, nombre) DO UPDATE SET
          stock_actual   = public.ingredientes.stock_actual + EXCLUDED.stock_actual,
          costo_unitario = EXCLUDED.costo_unitario,
          updated_at     = NOW()
        RETURNING id INTO v_ing_id;
        v_creados := v_creados || jsonb_build_object('id', v_ing_id, 'nombre', v_nombre, 'unidad', v_unidad);
      END IF;
    END IF;

    INSERT INTO public.gasto_items (gasto_id, ingrediente_id, nombre_producto, cantidad, unidad, precio_unitario, restaurant_id)
    VALUES (v_gasto_id, v_ing_id, v_nombre, v_cantidad, NULLIF(v_item->>'unidad', ''), v_precio, v_rid);
  END LOOP;

  RETURN jsonb_build_object(
    'gasto_id', v_gasto_id, 'total', v_total,
    'proveedor_id', v_prov_id, 'proveedor_creado', v_prov_nuevo,
    'ingredientes_creados', v_creados
  );
END; $function$;
REVOKE ALL ON FUNCTION public.registrar_compra_proveedor(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_proveedor(text, jsonb, text) TO authenticated, service_role;

-- F-13 registrar_base_caja -------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_base_caja(p_monto numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid UUID := public.current_restaurant_id();
  v_row public.bases_caja%ROWTYPE;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar la base de caja';
  END IF;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el restaurante'; END IF;
  -- Con el corte del dia hecho la base cambia el efectivo esperado: solo el administrador la corrige.
  IF public.get_user_role() <> 'admin' AND EXISTS (SELECT 1 FROM public.cortes_caja WHERE restaurant_id = v_rid AND fecha = public.hoy_local()) THEN
    RAISE EXCEPTION 'El día ya tiene corte de caja: solo el administrador puede cambiar la base';
  END IF;
  IF p_monto IS NULL OR p_monto < 0 OR p_monto > 100000000 THEN
    RAISE EXCEPTION 'Monto de base inválido';
  END IF;

  INSERT INTO public.bases_caja (restaurant_id, fecha, monto, registrado_por)
  VALUES (v_rid, public.hoy_local(), round(p_monto), auth.uid())
  ON CONFLICT (restaurant_id, fecha) DO UPDATE
    SET monto = EXCLUDED.monto, registrado_por = EXCLUDED.registrado_por, updated_at = now()
  RETURNING * INTO v_row;

  RETURN json_build_object('fecha', v_row.fecha, 'monto', v_row.monto);
END;
$function$;

-- F-14 registrar_factura_compra (SECURITY INVOKER; firma nueva con p_fuente DEFAULT 'caja') ------------------------------
DROP FUNCTION IF EXISTS public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean);
CREATE OR REPLACE FUNCTION public.registrar_factura_compra(p_id uuid, p_fecha date, p_proveedor_id uuid, p_monto numeric, p_nota text, p_fotos text[], p_registrar_gasto boolean, p_fuente text DEFAULT 'caja'::text)
 RETURNS facturas_compra
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rid uuid := current_restaurant_id();
  v_row public.facturas_compra;
  v_prov text;
  v_gasto uuid;
  v_foto text;
BEGIN
  -- get_user_role() NULL (sin perfil/inactivo) ya no pasa: NULL NOT IN (...) es NULL, no verdadero.
  IF v_rid IS NULL OR get_user_role() IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso para subir facturas'; END IF;
  IF p_fuente IS NULL OR p_fuente NOT IN ('caja','propio') THEN RAISE EXCEPTION 'Fuente del gasto inválida (caja o propio)'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Falta el identificador de la factura'; END IF;
  SELECT * INTO v_row FROM facturas_compra WHERE id = p_id;
  IF FOUND THEN RETURN v_row; END IF;
  IF p_monto IS NULL OR p_monto < 0 OR p_monto > 100000000000 THEN RAISE EXCEPTION 'El monto debe ser un número positivo'; END IF;
  IF p_fotos IS NULL OR cardinality(p_fotos) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'La factura necesita de 1 a 10 fotos'; END IF;
  FOREACH v_foto IN ARRAY p_fotos LOOP
    IF (string_to_array(v_foto, '/'))[1] IS DISTINCT FROM v_rid::text THEN RAISE EXCEPTION 'Foto fuera de la carpeta del restaurante'; END IF;
  END LOOP;
  IF p_proveedor_id IS NOT NULL THEN
    SELECT nombre INTO v_prov FROM proveedores WHERE id = p_proveedor_id AND restaurant_id = v_rid;
    IF v_prov IS NULL THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  END IF;
  IF p_registrar_gasto THEN
    IF p_monto <= 0 THEN RAISE EXCEPTION 'Para registrar el gasto el monto debe ser mayor a cero'; END IF;
    INSERT INTO gastos (concepto, monto, categoria, registrado_por, proveedor_id, fuente, pagado_por_nombre)
    VALUES (left('Factura' || COALESCE(' ' || v_prov, ''), 200), p_monto,
            CASE WHEN p_proveedor_id IS NOT NULL THEN 'proveedor' ELSE 'otro' END, auth.uid(), p_proveedor_id, p_fuente,
            CASE WHEN p_fuente = 'propio' THEN left(coalesce(nullif(btrim((SELECT full_name FROM profiles WHERE id = auth.uid())), ''), 'Empleado'), 80) END)
    RETURNING id INTO v_gasto;
  END IF;
  INSERT INTO facturas_compra (id, fecha, proveedor_id, monto, nota, fotos, gasto_id)
  VALUES (p_id, COALESCE(p_fecha, current_date), p_proveedor_id, p_monto, NULLIF(btrim(p_nota), ''), p_fotos, v_gasto)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean, text) TO authenticated, service_role;

-- registrar_lead: no pisar datos de un lead existente ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_lead(p_nombre text, p_whatsapp text, p_restaurante text DEFAULT NULL::text, p_ciudad text DEFAULT NULL::text, p_tipo_negocio text DEFAULT NULL::text, p_mesas integer DEFAULT NULL::integer, p_interes text DEFAULT 'otro'::text, p_resumen text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'); v_id uuid; v_nuevo boolean := true;
BEGIN
  IF length(v_wa) = 10 AND v_wa LIKE '3%' THEN v_wa := '57' || v_wa; END IF;
  IF p_ip_hash IS NOT NULL AND NOT public.check_rate_limit('lead:' || p_ip_hash, 5, 3600) THEN RAISE EXCEPTION 'Demasiados intentos, espera un momento'; END IF;
  SELECT id INTO v_id FROM leads WHERE whatsapp = v_wa AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    v_nuevo := false;
    -- Solo se COMPLETA lo que esta vacio: quien repite el WhatsApp ya no pisa nombre, interes ni resumen del lead.
    UPDATE leads SET updated_at = now(),
      nombre = coalesce(nullif(btrim(nombre), ''), btrim(p_nombre)),
      restaurante = coalesce(nullif(btrim(restaurante), ''), nullif(btrim(p_restaurante), '')),
      ciudad = coalesce(nullif(btrim(ciudad), ''), nullif(btrim(p_ciudad), '')),
      tipo_negocio = coalesce(nullif(btrim(tipo_negocio), ''), nullif(btrim(p_tipo_negocio), '')),
      mesas = coalesce(mesas, p_mesas),
      interes = CASE WHEN interes IS NULL OR interes = 'otro' THEN coalesce(p_interes, interes) ELSE interes END,
      resumen = coalesce(nullif(btrim(resumen), ''), nullif(btrim(p_resumen), ''))
     WHERE id = v_id;
  ELSE
    INSERT INTO leads (nombre, whatsapp, restaurante, ciudad, tipo_negocio, mesas, interes, resumen, ref, ip_hash)
    VALUES (btrim(p_nombre), v_wa, nullif(btrim(p_restaurante), ''), nullif(btrim(p_ciudad), ''), nullif(btrim(p_tipo_negocio), ''), p_mesas,
            coalesce(p_interes, 'otro'), nullif(btrim(p_resumen), ''), nullif(btrim(p_ref), ''), p_ip_hash)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'nuevo', v_nuevo);
END;
$function$;

-- F-14 plataforma_vendedor_guardar: rangos en los terminos ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plataforma_vendedor_guardar(p_id uuid, p_datos jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := p_id; v_antes vendedores%ROWTYPE; v_despues vendedores%ROWTYPE; v_motivo text := NULLIF(btrim(p_motivo), '');
  v_codigo text; v_en_uso boolean; v_cambia_contrato boolean;
BEGIN
  PERFORM public._exigir_dueno();
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k NOT IN
     ('tipo','nombre','codigo','correo','telefono','documento','medio_pago','datos_pago','notas','contrato_ruta','contrato_version','firmado_at','vigente_hasta','terminos')) THEN
    RAISE EXCEPTION 'Campo no editable';
  END IF;
  IF p_datos ? 'terminos' AND jsonb_typeof(p_datos->'terminos') = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos->'terminos') k
       WHERE k NOT IN ('bono_meses','recurrente_pct','recurrente_meses')) THEN
    RAISE EXCEPTION 'Condición no permitida';
  END IF;
  IF p_datos ? 'terminos' AND jsonb_typeof(p_datos->'terminos') = 'object' THEN
    PERFORM public._validar_numero_json(p_datos->'terminos', 'recurrente_pct', 0, 100, 'El porcentaje recurrente');
    PERFORM public._validar_numero_json(p_datos->'terminos', 'bono_meses', 0, 24, 'Los meses de bono');
    PERFORM public._validar_numero_json(p_datos->'terminos', 'recurrente_meses', 0, 60, 'Los meses de comisión recurrente', true);
  END IF;

  IF v_id IS NULL THEN
    IF NULLIF(p_datos->>'contrato_ruta', '') IS NULL OR NULLIF(p_datos->>'contrato_version', '') IS NULL OR NULLIF(p_datos->>'firmado_at', '') IS NULL THEN
      RAISE EXCEPTION 'Sin contrato firmado no se puede crear ni activar un código (adjunta el PDF, la versión y la fecha de firma)';
    END IF;
    v_codigo := upper(btrim(p_datos->>'codigo'));
    INSERT INTO vendedores (tipo, nombre, codigo, correo, telefono, documento, medio_pago, datos_pago, notas, contrato_ruta, contrato_version, firmado_at, vigente_hasta, terminos, activo)
    VALUES (p_datos->>'tipo', btrim(p_datos->>'nombre'), v_codigo, NULLIF(btrim(p_datos->>'correo'), ''), NULLIF(btrim(p_datos->>'telefono'), ''),
            NULLIF(btrim(p_datos->>'documento'), ''), NULLIF(p_datos->>'medio_pago', ''), NULLIF(btrim(p_datos->>'datos_pago'), ''), NULLIF(btrim(p_datos->>'notas'), ''),
            p_datos->>'contrato_ruta', p_datos->>'contrato_version', (p_datos->>'firmado_at')::date, NULLIF(p_datos->>'vigente_hasta', '')::date,
            CASE WHEN jsonb_typeof(p_datos->'terminos') = 'object' THEN p_datos->'terminos' END, true)
    RETURNING id INTO v_id;
    PERFORM public._auditar('crear_vendedor', 'vendedores', v_id, NULL,
      jsonb_build_object('tipo', p_datos->>'tipo', 'nombre', p_datos->>'nombre', 'codigo', v_codigo, 'contrato_version', p_datos->>'contrato_version',
                         'firmado_at', p_datos->>'firmado_at', 'terminos', p_datos->'terminos'), v_motivo);
    RETURN v_id;
  END IF;

  SELECT * INTO v_antes FROM vendedores WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendedor no encontrado'; END IF;
  v_en_uso := EXISTS (SELECT 1 FROM restaurant_crm c WHERE c.vendedor_id = v_id) OR EXISTS (SELECT 1 FROM prospectos p WHERE p.vendedor_id = v_id)
              OR EXISTS (SELECT 1 FROM comisiones k WHERE k.vendedor_id = v_id);
  IF p_datos ? 'codigo' AND upper(btrim(p_datos->>'codigo')) IS DISTINCT FROM v_antes.codigo AND v_en_uso THEN
    RAISE EXCEPTION 'El código ya tuvo registros atribuidos y no se puede cambiar: crea un vendedor nuevo con otro código y desactiva este';
  END IF;
  IF p_datos ? 'tipo' AND p_datos->>'tipo' IS DISTINCT FROM v_antes.tipo AND v_en_uso THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de un vendedor con registros atribuidos';
  END IF;
  v_cambia_contrato := p_datos ? 'contrato_ruta' OR p_datos ? 'contrato_version' OR p_datos ? 'firmado_at' OR p_datos ? 'terminos' OR p_datos ? 'vigente_hasta';
  IF v_cambia_contrato AND v_motivo IS NULL THEN RAISE EXCEPTION 'Cambiar el contrato, las condiciones o la vigencia exige un motivo'; END IF;
  IF p_datos ? 'contrato_ruta' AND NULLIF(p_datos->>'contrato_ruta', '') IS NULL THEN RAISE EXCEPTION 'No se puede quitar el contrato'; END IF;

  UPDATE vendedores SET
    tipo = CASE WHEN p_datos ? 'tipo' THEN p_datos->>'tipo' ELSE tipo END,
    nombre = CASE WHEN p_datos ? 'nombre' THEN btrim(p_datos->>'nombre') ELSE nombre END,
    codigo = CASE WHEN p_datos ? 'codigo' THEN upper(btrim(p_datos->>'codigo')) ELSE codigo END,
    correo = CASE WHEN p_datos ? 'correo' THEN NULLIF(btrim(p_datos->>'correo'), '') ELSE correo END,
    telefono = CASE WHEN p_datos ? 'telefono' THEN NULLIF(btrim(p_datos->>'telefono'), '') ELSE telefono END,
    documento = CASE WHEN p_datos ? 'documento' THEN NULLIF(btrim(p_datos->>'documento'), '') ELSE documento END,
    medio_pago = CASE WHEN p_datos ? 'medio_pago' THEN NULLIF(p_datos->>'medio_pago', '') ELSE medio_pago END,
    datos_pago = CASE WHEN p_datos ? 'datos_pago' THEN NULLIF(btrim(p_datos->>'datos_pago'), '') ELSE datos_pago END,
    notas = CASE WHEN p_datos ? 'notas' THEN NULLIF(btrim(p_datos->>'notas'), '') ELSE notas END,
    contrato_ruta = CASE WHEN p_datos ? 'contrato_ruta' THEN p_datos->>'contrato_ruta' ELSE contrato_ruta END,
    contrato_version = CASE WHEN p_datos ? 'contrato_version' THEN p_datos->>'contrato_version' ELSE contrato_version END,
    firmado_at = CASE WHEN p_datos ? 'firmado_at' THEN NULLIF(p_datos->>'firmado_at', '')::date ELSE firmado_at END,
    vigente_hasta = CASE WHEN p_datos ? 'vigente_hasta' THEN NULLIF(p_datos->>'vigente_hasta', '')::date ELSE vigente_hasta END,
    terminos = CASE WHEN p_datos ? 'terminos' THEN CASE WHEN jsonb_typeof(p_datos->'terminos') = 'object' THEN p_datos->'terminos' END ELSE terminos END,
    updated_at = now()
   WHERE id = v_id RETURNING * INTO v_despues;

  PERFORM public._auditar('editar_vendedor', 'vendedores', v_id,
    to_jsonb(v_antes) - 'datos_pago' - 'documento' || jsonb_build_object('datos_pago_cambiado', p_datos ? 'datos_pago'),
    to_jsonb(v_despues) - 'datos_pago' - 'documento', v_motivo);
  RETURN v_id;
END;
$function$;

-- F-14 plataforma_guardar_plan: rangos -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plataforma_guardar_plan(p_id text, p_datos jsonb, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_antes jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Escribe el motivo del cambio'; END IF;
  SELECT to_jsonb(p) INTO v_antes FROM planes p WHERE id = p_id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Plan no valido'; END IF;
  IF jsonb_typeof(p_datos) <> 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  IF p_datos ? 'nombre' AND char_length(btrim(coalesce(p_datos->>'nombre', ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'El nombre del plan debe tener entre 1 y 60 letras'; END IF;
  PERFORM public._validar_numero_json(p_datos, 'precio_mensual_cop', 1000, 100000000, 'El precio mensual', true);
  PERFORM public._validar_numero_json(p_datos, 'precio_sede_extra_cop', 1000, 100000000, 'El precio de la sede extra', true);
  PERFORM public._validar_numero_json(p_datos, 'max_mesas', 1, 100000, 'El tope de mesas', true);
  PERFORM public._validar_numero_json(p_datos, 'max_usuarios', 1, 100000, 'El tope de usuarios', true);
  PERFORM public._validar_numero_json(p_datos, 'max_docs_dian', 1, 10000000, 'El tope de documentos', true);
  UPDATE planes SET
    nombre                = coalesce(p_datos->>'nombre', nombre),
    precio_mensual_cop    = coalesce((p_datos->>'precio_mensual_cop')::integer, precio_mensual_cop),
    precio_sede_extra_cop = CASE WHEN p_datos ? 'precio_sede_extra_cop' THEN (p_datos->>'precio_sede_extra_cop')::integer ELSE precio_sede_extra_cop END,
    max_mesas             = CASE WHEN p_datos ? 'max_mesas' THEN (p_datos->>'max_mesas')::integer ELSE max_mesas END,
    max_usuarios          = CASE WHEN p_datos ? 'max_usuarios' THEN (p_datos->>'max_usuarios')::integer ELSE max_usuarios END,
    max_docs_dian         = CASE WHEN p_datos ? 'max_docs_dian' THEN (p_datos->>'max_docs_dian')::integer ELSE max_docs_dian END,
    disponible            = coalesce((p_datos->>'disponible')::boolean, disponible),
    updated_at            = now()
  WHERE id = p_id;
  PERFORM public._auditar('guardar_plan', 'planes', NULL, v_antes, (SELECT to_jsonb(p) FROM planes p WHERE id = p_id), p_motivo);
  RETURN public.planes_publicos();
END;
$function$;

-- F-14 plataforma_settings_guardar: rangos ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plataforma_settings_guardar(p_clave text, p_valor numeric, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_antes numeric;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Cambiar una condición general exige un motivo'; END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_clave LIKE '%pct' AND p_valor > 100 THEN RAISE EXCEPTION 'Un porcentaje no puede pasar de 100'; END IF;
  IF p_clave = 'dia_pago_mes' AND (p_valor < 1 OR p_valor > 28) THEN RAISE EXCEPTION 'El día de pago debe estar entre 1 y 28'; END IF;
  IF p_valor > 1000000000 THEN RAISE EXCEPTION 'Valor demasiado grande'; END IF;
  IF p_clave = 'anual_meses' AND (p_valor < 1 OR p_valor > 12) THEN RAISE EXCEPTION 'Los meses del plan anual deben estar entre 1 y 12'; END IF;
  IF p_clave LIKE '%meses' AND p_valor > 120 THEN RAISE EXCEPTION 'Una cantidad de meses no puede pasar de 120'; END IF;
  IF p_clave LIKE '%dias' AND p_valor > 365 THEN RAISE EXCEPTION 'Una cantidad de días no puede pasar de 365'; END IF;
  SELECT valor INTO v_antes FROM platform_settings WHERE clave = p_clave;
  IF NOT FOUND THEN RAISE EXCEPTION 'Condición desconocida'; END IF;
  UPDATE platform_settings SET valor = p_valor, updated_at = now(), updated_by = auth.uid() WHERE clave = p_clave;
  PERFORM public._auditar('editar_condicion', 'platform_settings', NULL, jsonb_build_object('clave', p_clave, 'valor', v_antes), jsonb_build_object('clave', p_clave, 'valor', p_valor), p_motivo);
END;
$function$;

-- F-14 plataforma_actualizar_ficha: rango del precio especial -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plataforma_actualizar_ficha(p_id uuid, p_cambios jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_antes restaurant_crm%ROWTYPE; v_despues restaurant_crm%ROWTYPE; v_rest restaurants%ROWTYPE;
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_vend vendedores%ROWTYPE; v_trial_antes timestamptz; v_prueba date;
BEGIN
  PERFORM public._exigir_dueno();
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' OR p_cambios = '{}'::jsonb THEN RAISE EXCEPTION 'No hay cambios'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_cambios) k WHERE k NOT IN
      ('estado_comercial','notas','proxima_accion','proxima_accion_fecha','precio_especial_cop','origen','origen_detalle','vendedor_id','prueba_hasta')) THEN
    RAISE EXCEPTION 'Campo no editable';
  END IF;
  PERFORM public._validar_numero_json(p_cambios, 'precio_especial_cop', 0, 100000000, 'El precio especial');
  SELECT * INTO v_antes FROM restaurant_crm WHERE restaurant_id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  SELECT * INTO v_rest FROM restaurants WHERE id = p_id;

  IF p_cambios ? 'vendedor_id' AND (p_cambios->>'vendedor_id') IS DISTINCT FROM v_antes.vendedor_id::text THEN
    IF v_motivo IS NULL THEN RAISE EXCEPTION 'Cambiar el vendedor exige un motivo'; END IF;
    IF v_rest.created_at < now() - interval '30 days' THEN RAISE EXCEPTION 'El vendedor solo se puede asignar o corregir durante los 30 días siguientes al alta'; END IF;
    IF NULLIF(p_cambios->>'vendedor_id', '') IS NOT NULL THEN
      SELECT * INTO v_vend FROM vendedores WHERE id = (p_cambios->>'vendedor_id')::uuid;
      IF NOT FOUND OR NOT v_vend.activo THEN RAISE EXCEPTION 'Vendedor no encontrado o inactivo'; END IF;
    END IF;
  END IF;

  IF p_cambios ? 'prueba_hasta' THEN
    IF v_motivo IS NULL THEN RAISE EXCEPTION 'Extender la prueba exige un motivo'; END IF;
    v_prueba := NULLIF(p_cambios->>'prueba_hasta', '')::date;
    v_trial_antes := v_rest.trial_ends_at;
    UPDATE restaurants SET trial_ends_at = CASE WHEN v_prueba IS NULL THEN NULL
        ELSE ((v_prueba::timestamp + interval '23 hours 59 minutes') AT TIME ZONE 'America/Bogota') END
     WHERE id = p_id;
  END IF;

  UPDATE restaurant_crm SET
    estado_comercial     = CASE WHEN p_cambios ? 'estado_comercial' THEN p_cambios->>'estado_comercial' ELSE estado_comercial END,
    notas                = CASE WHEN p_cambios ? 'notas' THEN NULLIF(btrim(p_cambios->>'notas'), '') ELSE notas END,
    proxima_accion       = CASE WHEN p_cambios ? 'proxima_accion' THEN NULLIF(btrim(p_cambios->>'proxima_accion'), '') ELSE proxima_accion END,
    proxima_accion_fecha = CASE WHEN p_cambios ? 'proxima_accion_fecha' THEN NULLIF(p_cambios->>'proxima_accion_fecha', '')::date ELSE proxima_accion_fecha END,
    precio_especial_cop  = CASE WHEN p_cambios ? 'precio_especial_cop' THEN NULLIF(p_cambios->>'precio_especial_cop', '')::numeric ELSE precio_especial_cop END,
    origen               = CASE WHEN p_cambios ? 'origen' THEN NULLIF(p_cambios->>'origen', '') ELSE origen END,
    origen_detalle       = CASE WHEN p_cambios ? 'origen_detalle' THEN left(NULLIF(btrim(p_cambios->>'origen_detalle'), ''), 200) ELSE origen_detalle END,
    vendedor_id          = CASE WHEN p_cambios ? 'vendedor_id' THEN NULLIF(p_cambios->>'vendedor_id', '')::uuid ELSE vendedor_id END,
    vendedor_asignado_at = CASE WHEN p_cambios ? 'vendedor_id' AND (p_cambios->>'vendedor_id') IS DISTINCT FROM v_antes.vendedor_id::text
                                THEN CASE WHEN NULLIF(p_cambios->>'vendedor_id', '') IS NULL THEN NULL ELSE now() END ELSE vendedor_asignado_at END,
    updated_at           = now()
   WHERE restaurant_id = p_id
  RETURNING * INTO v_despues;

  PERFORM public._auditar('editar_ficha', 'restaurant_crm', p_id,
    to_jsonb(v_antes) || CASE WHEN p_cambios ? 'prueba_hasta' THEN jsonb_build_object('prueba_hasta', v_trial_antes) ELSE '{}'::jsonb END,
    to_jsonb(v_despues) || CASE WHEN p_cambios ? 'prueba_hasta' THEN jsonb_build_object('prueba_hasta', v_prueba) ELSE '{}'::jsonb END,
    v_motivo);
END;
$function$;

