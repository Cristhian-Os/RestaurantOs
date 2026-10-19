-- Bloque 7, pasos 3 y 4 (parte de datos): lista de restaurantes con semáforo, ficha editable, contactos, activar/desactivar y registro de cambios.
-- Todas las funciones: SECURITY DEFINER, search_path fijo, y exigen dueño de la plataforma + verificación de 2 pasos (aal2).

CREATE OR REPLACE FUNCTION public._exigir_dueno() RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._exigir_dueno() FROM PUBLIC, anon, authenticated;

-- Uso por restaurante. Semáforo: verde = pedido en los últimos 3 días; amarillo = hace 4 a 7 días (o restaurante nuevo sin pedidos aún);
-- rojo = más de 7 días, o sin ningún pedido pasados 7 días desde que se creó; gris = restaurante desactivado.
CREATE OR REPLACE FUNCTION public.plataforma_salud_restaurantes()
 RETURNS TABLE (restaurant_id uuid, pedidos_7d integer, pedidos_30d integer, ultimo_pedido timestamptz, usuarios_activos integer, semaforo text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT r.id,
         coalesce(o.p7, 0)::int, coalesce(o.p30, 0)::int, o.ultimo,
         coalesce(u.n, 0)::int,
         CASE
           WHEN NOT r.active THEN 'gris'
           WHEN o.ultimo >= now() - interval '3 days' THEN 'verde'
           WHEN o.ultimo >= now() - interval '7 days' THEN 'amarillo'
           WHEN o.ultimo IS NULL AND r.created_at >= now() - interval '7 days' THEN 'amarillo'
           ELSE 'rojo'
         END
    FROM restaurants r
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.created_at >= now() - interval '7 days') p7,
             count(*) FILTER (WHERE x.created_at >= now() - interval '30 days') p30,
             max(x.created_at) ultimo
        FROM orders x WHERE x.restaurant_id = r.id AND x.status <> 'cancelled') o ON true
    LEFT JOIN LATERAL (
      SELECT count(*) n FROM profiles p WHERE p.restaurant_id = r.id AND p.active IS NOT FALSE AND p.role <> 'client') u ON true;
END;
$function$;

-- Lista para la pantalla Restaurantes (sin las notas: esas van en la ficha).
CREATE OR REPLACE FUNCTION public.plataforma_restaurantes()
 RETURNS TABLE (id uuid, nombre text, slug text, pais text, activo boolean, plan text, creado timestamptz, prueba_hasta timestamptz,
                suscripcion text, estado_comercial text, origen text, codigo_usado text, codigo_estado text, vendedor_id uuid, vendedor text,
                proxima_accion text, proxima_accion_fecha date, ultimo_contacto timestamptz,
                pedidos_7d integer, pedidos_30d integer, ultimo_pedido timestamptz, usuarios_activos integer, semaforo text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT r.id, r.name, r.slug, r.country, r.active, r.plan, r.created_at, r.trial_ends_at,
         s.status, c.estado_comercial, c.origen, c.codigo_usado, c.codigo_estado, c.vendedor_id, v.nombre,
         c.proxima_accion, c.proxima_accion_fecha, c.ultimo_contacto_at,
         h.pedidos_7d, h.pedidos_30d, h.ultimo_pedido, h.usuarios_activos, h.semaforo
    FROM restaurants r
    LEFT JOIN restaurant_crm c ON c.restaurant_id = r.id
    LEFT JOIN vendedores v ON v.id = c.vendedor_id
    LEFT JOIN subscriptions s ON s.restaurant_id = r.id
    LEFT JOIN public.plataforma_salud_restaurantes() h ON h.restaurant_id = r.id
   ORDER BY r.created_at DESC;
END;
$function$;

-- Ficha completa de un restaurante (incluye notas, contactos, pagos de suscripción y los últimos cambios).
CREATE OR REPLACE FUNCTION public.plataforma_restaurante_ficha(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT jsonb_build_object(
    'restaurante', jsonb_build_object('id', r.id, 'nombre', r.name, 'slug', r.slug, 'pais', r.country, 'activo', r.active, 'plan', r.plan,
                                      'creado', r.created_at, 'prueba_hasta', r.trial_ends_at),
    'suscripcion', (SELECT to_jsonb(x) FROM (SELECT s.status, s.plan, s.current_period_end, s.grace_ends_at FROM subscriptions s WHERE s.restaurant_id = r.id LIMIT 1) x),
    'crm', to_jsonb(c) || jsonb_build_object('vendedor', v.nombre, 'vendedor_codigo', v.codigo),
    'salud', (SELECT to_jsonb(h) FROM public.plataforma_salud_restaurantes() h WHERE h.restaurant_id = r.id),
    'contactos', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.fecha DESC, k.created_at DESC)
                             FROM (SELECT t.id, t.fecha, t.canal, t.resumen, t.created_at FROM restaurant_contactos t
                                    WHERE t.restaurant_id = r.id ORDER BY t.fecha DESC, t.created_at DESC LIMIT 30) k), '[]'::jsonb),
    'pagos', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at DESC)
                         FROM (SELECT p.created_at, p.amount_in_cents, p.status, p.payment_method_type FROM payments p
                                WHERE p.restaurant_id = r.id AND p.kind = 'subscription' ORDER BY p.created_at DESC LIMIT 6) k), '[]'::jsonb),
    'cambios', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at DESC)
                           FROM (SELECT a.created_at, a.accion, a.motivo, a.antes, a.despues FROM auditoria_plataforma a
                                  WHERE a.registro_id = r.id ORDER BY a.created_at DESC LIMIT 20) k), '[]'::jsonb)
  ) INTO v
  FROM restaurants r
  JOIN restaurant_crm c ON c.restaurant_id = r.id
  LEFT JOIN vendedores v ON v.id = c.vendedor_id
  WHERE r.id = p_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  RETURN v;
END;
$function$;

-- Edita la ficha. p_cambios solo admite estos campos: estado_comercial, notas, proxima_accion, proxima_accion_fecha,
-- precio_especial_cop, origen, origen_detalle, vendedor_id (null = quitar), prueba_hasta (fecha). Un valor vacío borra el campo.
-- Cambiar vendedor o extender la prueba EXIGE motivo; el vendedor solo se puede asignar/corregir durante los 30 días siguientes al alta.
CREATE OR REPLACE FUNCTION public.plataforma_actualizar_ficha(p_id uuid, p_cambios jsonb, p_motivo text DEFAULT NULL)
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

-- Anota un contacto (visita, WhatsApp, llamada…) y actualiza la fecha del último contacto.
CREATE OR REPLACE FUNCTION public.plataforma_agregar_contacto(p_id uuid, p_canal text, p_resumen text, p_fecha date DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_fecha date := coalesce(p_fecha, (now() AT TIME ZONE 'America/Bogota')::date);
BEGIN
  PERFORM public._exigir_dueno();
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_id) THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  INSERT INTO restaurant_contactos (restaurant_id, fecha, canal, resumen, creado_por)
  VALUES (p_id, v_fecha, p_canal, p_resumen, auth.uid()) RETURNING id INTO v_id;
  UPDATE restaurant_crm SET ultimo_contacto_at = greatest(coalesce(ultimo_contacto_at, 'epoch'), (v_fecha::timestamp AT TIME ZONE 'America/Bogota')), updated_at = now()
   WHERE restaurant_id = p_id;
  PERFORM public._auditar('agregar_contacto', 'restaurant_contactos', p_id, NULL,
    jsonb_build_object('id', v_id, 'canal', p_canal, 'resumen', left(p_resumen, 200), 'fecha', v_fecha), NULL);
END;
$function$;

-- Activa o desactiva un restaurante (pide motivo; queda en el registro de cambios).
CREATE OR REPLACE FUNCTION public.plataforma_activar_restaurante(p_id uuid, p_activo boolean, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_antes boolean;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Activar o desactivar un restaurante exige un motivo'; END IF;
  SELECT active INTO v_antes FROM restaurants WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  IF v_antes IS NOT DISTINCT FROM p_activo THEN RETURN; END IF;
  UPDATE restaurants SET active = p_activo, updated_at = now() WHERE id = p_id;
  PERFORM public._auditar(CASE WHEN p_activo THEN 'activar_restaurante' ELSE 'desactivar_restaurante' END, 'restaurants', p_id,
    jsonb_build_object('active', v_antes), jsonb_build_object('active', p_activo), p_motivo);
END;
$function$;

-- Registro de cambios (pantalla futura "Registro de cambios"): últimos movimientos, con filtro opcional por tabla.
CREATE OR REPLACE FUNCTION public.plataforma_auditoria(p_tabla text DEFAULT NULL, p_limite integer DEFAULT 100)
 RETURNS TABLE (created_at timestamptz, actor text, accion text, tabla text, registro_id uuid, motivo text, antes jsonb, despues jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT a.created_at, p.full_name, a.accion, a.tabla, a.registro_id, a.motivo, a.antes, a.despues
    FROM auditoria_plataforma a LEFT JOIN profiles p ON p.id = a.actor_id
   WHERE p_tabla IS NULL OR a.tabla = p_tabla
   ORDER BY a.created_at DESC
   LIMIT least(greatest(p_limite, 1), 500);
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'plataforma_salud_restaurantes()', 'plataforma_restaurantes()', 'plataforma_restaurante_ficha(uuid)',
    'plataforma_actualizar_ficha(uuid, jsonb, text)', 'plataforma_agregar_contacto(uuid, text, text, date)',
    'plataforma_activar_restaurante(uuid, boolean, text)', 'plataforma_auditoria(text, integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
