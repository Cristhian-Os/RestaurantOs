-- Reversa de 20261016000001_aislar_funciones_limites_y_clave.sql: deja las funciones como estaban el 2026-10-16.

-- 6) comentarios/reseñas/reacciones sin límite por IP
CREATE OR REPLACE FUNCTION public.crear_comentario_plato(p_dish_id uuid, p_cliente_nombre text, p_texto text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(comment_id uuid, comment_token uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid; v_parent_id uuid; v_texto text; v_new_id uuid; v_new_token uuid;
begin
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid; v_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'La calificación debe ser entre 1 y 5'; end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then raise exception 'Plato no encontrado'; end if;
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_restaurant_id uuid; v_actual text;
begin
  if p_reaccion not in ('like', 'dislike') then raise exception 'Reacción inválida'; end if;
  select restaurant_id into v_restaurant_id from dishes where id = p_dish_id;
  if v_restaurant_id is null then raise exception 'Plato no encontrado'; end if;
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_dish_id uuid; v_existe boolean;
begin
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not check_rate_limit('reporte:' || p_comment_id::text, 20, 60) then
    raise exception 'Ese comentario ya se reportó varias veces, gracias';
  end if;
  update comentarios_platos set reportado_count = reportado_count + 1 where id = p_comment_id;
end;
$function$;

-- 5) change_my_password como estaba (mínimo 6, sin contraseña actual)
DROP FUNCTION IF EXISTS public.change_my_password(text, text);
CREATE FUNCTION public.change_my_password(p_new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pw text := trim(p_new_password);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF length(v_pw) < 6 THEN RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres'; END IF;
  UPDATE auth.users SET encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = NOW() WHERE id = auth.uid();
  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();
  RETURN jsonb_build_object('status','ok');
END; $function$;
REVOKE EXECUTE ON FUNCTION public.change_my_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_my_password(text) TO authenticated;

-- 4) fuera la función de ingredientes públicos y el helper de ritmo
DROP FUNCTION IF EXISTS public.ingredientes_publicos(uuid);
DROP FUNCTION IF EXISTS public._limite_ip(text, integer, integer);

-- 3) y 2) permisos como estaban (ejecutables por todos, como los dejó Postgres por defecto)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_order_status_change() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_number_today() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_self_role_escalation() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_ingredientes() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_plato_custom(uuid, text, text, jsonb) TO authenticated;

-- 1) calcular_costo_receta y cancelar_item_orden sin validar restaurante
CREATE OR REPLACE FUNCTION public.calcular_costo_receta(p_dish_id uuid)
 RETURNS numeric
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(
    COALESCE(NULLIF(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria
  ), 0)
  FROM public.recetas r
  LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
  WHERE r.producto_id = p_dish_id;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_item_orden(p_order_id uuid, p_item_index integer)
 RETURNS json
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE; v_role TEXT; v_items JSONB; v_item JSONB; v_item_price NUMERIC; v_new_total NUMERIC;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  SELECT public.get_user_role() INTO v_role;
  IF v_role IS NULL OR v_role NOT IN ('kitchen', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'Solo cocina, cajero o admin pueden cancelar items';
  END IF;
  IF v_order.status != 'cooking' THEN RAISE EXCEPTION 'Solo se pueden cancelar items de órdenes en cooking'; END IF;
  v_items := CASE WHEN jsonb_typeof(v_order.items::jsonb) = 'array' THEN v_order.items::jsonb ELSE '[]'::jsonb END;
  IF p_item_index < 0 OR p_item_index >= jsonb_array_length(v_items) THEN RAISE EXCEPTION 'Índice de item inválido'; END IF;
  v_item := v_items -> p_item_index;
  v_item_price := COALESCE((v_item->>'price')::NUMERIC, 0);
  v_items := jsonb_set(v_items, ARRAY[p_item_index::text, 'cancelled'], 'true'::jsonb);
  v_new_total := GREATEST(0, v_order.total - v_item_price);
  UPDATE public.orders SET items = v_items, total = v_new_total, updated_at = NOW() WHERE id = p_order_id;
  RETURN json_build_object('order_id', p_order_id, 'item_index', p_item_index, 'item_name', v_item->>'name', 'new_total', v_new_total, 'message', 'Item cancelado');
END; $function$;
