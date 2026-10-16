-- Bloque 3 (seguridad), correcciones compatibles con la app actual. Todo son funciones: no toca datos.
-- 1) cancelar_item_orden y calcular_costo_receta solo operan sobre datos del restaurante de quien llama.
-- 2) registrar_venta_stock y crear_plato_custom son internas (las llaman cobrar y crear orden): nadie las ejecuta desde la API.
-- 3) funciones de trigger y helper de ritmo cerradas a la API.
-- 4) ingredientes_publicos(restaurante): reemplaza la lectura de la vista ingredientes_menu_publico (se cierra en otra migración).
-- 5) change_my_password: mínimo 8 y contraseña actual (salvo el cambio obligatorio del primer ingreso).
-- 6) límite de ritmo por IP en comentarios, reseñas y reacciones públicas.

-- 1) Aislamiento entre restaurantes
CREATE OR REPLACE FUNCTION public.cancelar_item_orden(p_order_id uuid, p_item_index integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role TEXT;
  v_items JSONB;
  v_item JSONB;
  v_item_price NUMERIC;
  v_new_total NUMERIC;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;

  SELECT public.get_user_role() INTO v_role;
  IF v_role IS NULL OR v_role NOT IN ('kitchen', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'Solo cocina, cajero o admin pueden cancelar items';
  END IF;
  IF v_order.restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;

  IF v_order.status != 'cooking' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar items de órdenes en cooking';
  END IF;

  v_items := CASE
    WHEN jsonb_typeof(v_order.items::jsonb) = 'array' THEN v_order.items::jsonb
    ELSE '[]'::jsonb
  END;

  IF p_item_index < 0 OR p_item_index >= jsonb_array_length(v_items) THEN
    RAISE EXCEPTION 'Índice de item inválido';
  END IF;

  v_item := v_items -> p_item_index;
  v_item_price := COALESCE((v_item->>'price')::NUMERIC, 0);

  v_items := jsonb_set(v_items, ARRAY[p_item_index::text, 'cancelled'], 'true'::jsonb);

  v_new_total := GREATEST(0, v_order.total - v_item_price);

  UPDATE public.orders SET
    items = v_items,
    total = v_new_total,
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'order_id', p_order_id,
    'item_index', p_item_index,
    'item_name', v_item->>'name',
    'new_total', v_new_total,
    'message', 'Item cancelado'
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.calcular_costo_receta(p_dish_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(
    COALESCE(NULLIF(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria
  ), 0)
  FROM public.recetas r
  JOIN public.dishes d ON d.id = r.producto_id AND d.restaurant_id = public.current_restaurant_id()
  LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
  WHERE r.producto_id = p_dish_id;
$function$;

-- 2) Internas: solo las llaman otras funciones del servidor
REVOKE EXECUTE ON FUNCTION public.registrar_venta_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crear_plato_custom(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 3) Funciones de trigger: nadie las llama desde la API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_number_today() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.descontar_ingredientes() FROM PUBLIC, anon, authenticated;

-- Helper de ritmo por IP (la IP la lee el servidor de las cabeceras; el cliente no la controla)
CREATE OR REPLACE FUNCTION public._limite_ip(p_accion text, p_max integer, p_seg integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h jsonb; ip text;
BEGIN
  BEGIN h := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN h := NULL; END;
  ip := coalesce(h->>'cf-connecting-ip', nullif(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''), 'sin-ip');
  IF NOT public.check_rate_limit('ip:' || p_accion || ':' || ip, p_max, p_seg) THEN
    RAISE EXCEPTION 'Vas muy rápido, espera un momento e intenta de nuevo';
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._limite_ip(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- 4) Ingredientes del plato personalizado, solo de UN restaurante activo y sin listar los demás
CREATE OR REPLACE FUNCTION public.ingredientes_publicos(p_restaurant_id uuid)
 RETURNS SETOF public.ingredientes_menu_publico
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.* FROM public.ingredientes_menu_publico v
  JOIN public.restaurants r ON r.id = v.restaurant_id AND r.active = true
  WHERE v.restaurant_id = p_restaurant_id;
$function$;
REVOKE EXECUTE ON FUNCTION public.ingredientes_publicos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingredientes_publicos(uuid) TO anon, authenticated;

-- 5) Cambio de contraseña: mínimo 8; pide la actual salvo en el cambio obligatorio del primer ingreso
DROP FUNCTION IF EXISTS public.change_my_password(text);
CREATE FUNCTION public.change_my_password(p_new_password text, p_current_password text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pw text := trim(p_new_password);
  v_must boolean;
  v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF length(v_pw) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
  END IF;

  SELECT must_change_password INTO v_must FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_must, false) THEN
    SELECT encrypted_password INTO v_hash FROM auth.users WHERE id = auth.uid();
    IF p_current_password IS NULL OR v_hash IS NULL OR crypt(p_current_password, v_hash) <> v_hash THEN
      RAISE EXCEPTION 'La contraseña actual no es correcta';
    END IF;
  END IF;

  UPDATE auth.users SET
    encrypted_password = crypt(v_pw, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = auth.uid();

  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();

  RETURN jsonb_build_object('status','ok');
END; $function$;
REVOKE EXECUTE ON FUNCTION public.change_my_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_my_password(text, text) TO authenticated;

-- 6) Ritmo por IP en las rutas públicas de interacción
CREATE OR REPLACE FUNCTION public.crear_comentario_plato(p_dish_id uuid, p_cliente_nombre text, p_texto text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(comment_id uuid, comment_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_parent_id uuid;
  v_texto text;
  v_new_id uuid;
  v_new_token uuid;
begin
  perform public._limite_ip('comentario', 10, 300);
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then raise exception 'Plato no encontrado'; end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes comentar en platos que ya hayas pedido con ese nombre';
  end if;
  if not check_rate_limit('comentario:' || lower(btrim(p_cliente_nombre)), 8, 60) then
    raise exception 'Estás comentando muy rápido, espera un momento';
  end if;

  v_texto := btrim(coalesce(p_texto, ''));
  if v_texto = '' then raise exception 'Escribe un comentario'; end if;
  if length(v_texto) > 500 then raise exception 'El comentario es muy largo (máximo 500 caracteres)'; end if;

  v_parent_id := null;
  if p_parent_id is not null then
    select coalesce(cp.parent_id, cp.id) into v_parent_id
      from comentarios_platos cp where cp.id = p_parent_id and cp.dish_id = p_dish_id;
    if v_parent_id is null then raise exception 'El comentario al que respondes no existe'; end if;
  end if;

  insert into comentarios_platos (restaurant_id, dish_id, parent_id, cliente_nombre, texto)
  values (v_restaurant_id, p_dish_id, v_parent_id, btrim(p_cliente_nombre), v_texto)
  returning comentarios_platos.id, comentarios_platos.edit_token into v_new_id, v_new_token;

  return query select v_new_id, v_new_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dejar_resena_plato(p_dish_id uuid, p_cliente_nombre text, p_rating integer, p_comentario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_id uuid;
begin
  perform public._limite_ip('resena', 5, 300);
  if p_rating < 1 or p_rating > 5 then
    raise exception 'La calificación debe ser entre 1 y 5';
  end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then
    raise exception 'Plato no encontrado';
  end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes reseñar platos que ya hayas pedido con ese nombre';
  end if;

  insert into resenas_platos (restaurant_id, dish_id, cliente_nombre, rating, comentario, estado)
  values (v_restaurant_id, p_dish_id, btrim(p_cliente_nombre), p_rating, nullif(btrim(coalesce(p_comentario, '')), ''), 'pendiente')
  on conflict (dish_id, lower(btrim(cliente_nombre)))
  do update set rating = excluded.rating, comentario = excluded.comentario, estado = 'pendiente', updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reaccionar_plato(p_dish_id uuid, p_cliente_nombre text, p_reaccion text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid;
  v_actual text;
begin
  perform public._limite_ip('reaccion', 40, 60);
  if p_reaccion not in ('like', 'dislike') then
    raise exception 'Reacción inválida';
  end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then
    raise exception 'Plato no encontrado';
  end if;
  if not verificar_cliente_pidio_plato(p_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes calificar platos que ya hayas pedido con ese nombre';
  end if;
  if not check_rate_limit('reaccion:' || lower(btrim(p_cliente_nombre)), 20, 60) then
    raise exception 'Vas muy rápido, espera un momento';
  end if;

  select reaccion into v_actual from likes_platos
    where dish_id = p_dish_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));

  if v_actual is not null and v_actual = p_reaccion then
    delete from likes_platos
      where dish_id = p_dish_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));
    return null;
  end if;

  insert into likes_platos (restaurant_id, dish_id, cliente_nombre, reaccion)
  values (v_restaurant_id, p_dish_id, btrim(p_cliente_nombre), p_reaccion)
  on conflict (dish_id, lower(btrim(cliente_nombre)))
  do update set reaccion = excluded.reaccion, updated_at = now();

  return p_reaccion;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reaccionar_comentario_plato(p_comment_id uuid, p_cliente_nombre text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dish_id uuid;
  v_existe boolean;
begin
  perform public._limite_ip('reaccion_comentario', 40, 60);
  select dish_id into v_dish_id from comentarios_platos where id = p_comment_id and estado = 'visible';
  if v_dish_id is null then raise exception 'Comentario no encontrado'; end if;
  if not verificar_cliente_pidio_plato(v_dish_id, p_cliente_nombre) then
    raise exception 'Solo puedes reaccionar a comentarios de platos que ya hayas pedido con ese nombre';
  end if;

  select exists(
    select 1 from comentario_likes
    where comment_id = p_comment_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre))
  ) into v_existe;

  if v_existe then
    delete from comentario_likes
      where comment_id = p_comment_id and lower(btrim(cliente_nombre)) = lower(btrim(p_cliente_nombre));
    return false;
  else
    insert into comentario_likes (comment_id, cliente_nombre) values (p_comment_id, btrim(p_cliente_nombre));
    return true;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reportar_comentario_plato(p_comment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._limite_ip('reporte', 15, 60);
  if not check_rate_limit('reporte:' || p_comment_id::text, 20, 60) then
    raise exception 'Ese comentario ya se reportó varias veces, gracias';
  end if;
  update comentarios_platos set reportado_count = reportado_count + 1 where id = p_comment_id;
end;
$function$;
