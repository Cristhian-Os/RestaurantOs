-- Bloque 4 (Anexo B), paso 2: listas de opciones por restaurante, plantillas por tipo de negocio y función de aplicación.
-- No cambia ningún comportamiento existente: todo queda detrás de restaurant_config.modules_enabled.options_v2 (apagado por defecto).
-- El tipo de negocio ya existe en restaurant_config.business_type (asistente de configuración); aquí se suma la lista de plantillas
-- aplicadas para negocios mixtos (ej. heladería + cafetería).

ALTER TABLE public.restaurant_config
  ADD COLUMN IF NOT EXISTS plantillas_aplicadas text[] NOT NULL DEFAULT '{}';

-- ─── Listas reutilizables por restaurante ───
CREATE TABLE IF NOT EXISTS public.option_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key ~ '^[a-z0-9_]{1,60}$'),
  nombre        text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  items         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 300),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, key)
);
-- items: [{ "label":"Vainilla", "activo":true, "precio_extra":0, "ingrediente_id":null, "cantidad_consumo":null, "sub":{"lista":"sabores_helado","cantidad":1} }]
ALTER TABLE public.option_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.option_lists FROM anon;

CREATE POLICY "option_lists: personal lee las de su restaurante" ON public.option_lists FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) OR (SELECT public.is_super_admin()));
CREATE POLICY "option_lists: admin administra las de su restaurante" ON public.option_lists FOR ALL TO authenticated
  USING (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()))
  WITH CHECK (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()));

-- ─── Plantillas globales (las administra la plataforma) ───
CREATE TABLE IF NOT EXISTS public.restaurant_templates (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,40}$'),
  nombre      text NOT NULL,
  descripcion text,
  payload     jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  activo      boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_templates FROM anon;
CREATE POLICY "plantillas: autenticados leen las activas" ON public.restaurant_templates FOR SELECT TO authenticated
  USING (activo OR (SELECT public.is_super_admin()));
CREATE POLICY "plantillas: solo super admin escribe" ON public.restaurant_templates FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));

CREATE TABLE IF NOT EXISTS public.restaurant_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL REFERENCES public.restaurant_templates(key) ON DELETE CASCADE,
  version      integer NOT NULL,
  nombre       text NOT NULL,
  descripcion  text,
  payload      jsonb NOT NULL,
  nota         text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, version)
);
ALTER TABLE public.restaurant_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_template_versions FROM anon;
CREATE POLICY "versiones de plantilla: solo super admin" ON public.restaurant_template_versions FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));

-- ─── Lectura pública de las listas (menú del cliente): sin ids de inventario ───
CREATE OR REPLACE FUNCTION public.listas_opciones_publicas(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', l.key, 'nombre', l.nombre, 'sort_order', l.sort_order,
    'items', (SELECT COALESCE(jsonb_agg(i - 'ingrediente_id' - 'cantidad_consumo'), '[]'::jsonb) FROM jsonb_array_elements(l.items) i)
  ) ORDER BY l.sort_order, l.nombre), '[]'::jsonb)
  FROM public.option_lists l
  JOIN public.restaurants r ON r.id = l.restaurant_id AND r.active
  WHERE l.restaurant_id = p_restaurant_id;
$function$;
REVOKE EXECUTE ON FUNCTION public.listas_opciones_publicas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listas_opciones_publicas(uuid) TO anon, authenticated;

-- ─── Agotar o activar un ítem (admin y cajero) ───
CREATE OR REPLACE FUNCTION public.option_lista_set_activo(p_key text, p_label text, p_activo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rid uuid := public.current_restaurant_id(); v_n integer;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el restaurante'; END IF;
  UPDATE public.option_lists l
  SET items = (SELECT jsonb_agg(CASE WHEN i->>'label' = p_label THEN jsonb_set(i, '{activo}', to_jsonb(p_activo)) ELSE i END ORDER BY ord)
               FROM jsonb_array_elements(l.items) WITH ORDINALITY AS t(i, ord)),
      updated_at = now()
  WHERE l.restaurant_id = v_rid AND l.key = p_key AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.items) i WHERE i->>'label' = p_label);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'No encontré ese ítem en la lista'; END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.option_lista_set_activo(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.option_lista_set_activo(text, text, boolean) TO authenticated;

-- ─── Aplicar una plantilla (copia; idempotente; nunca pisa lo que el restaurante ya editó) ───
CREATE OR REPLACE FUNCTION public._aplicar_plantilla(p_rid uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t public.restaurant_templates%ROWTYPE;
  v_cfg public.restaurant_config%ROWTYPE;
  v_mods jsonb;
  v_cats jsonb;
  v_c jsonb; v_l jsonb; v_p jsonb; v_g text;
  v_grupos jsonb; v_opts jsonb; v_items jsonb; v_def jsonb;
  v_cat_nuevas text[] := '{}'; v_l_ok text[] := '{}'; v_l_omit text[] := '{}';
  v_p_ok text[] := '{}'; v_p_omit text[] := '{}';
BEGIN
  SELECT * INTO v_t FROM public.restaurant_templates WHERE key = p_key AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'La plantilla no existe o está desactivada'; END IF;
  SELECT * INTO v_cfg FROM public.restaurant_config WHERE restaurant_id = p_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Primero configura el restaurante'; END IF;
  v_mods := COALESCE(v_cfg.modules_enabled, '{}'::jsonb);

  -- Las opciones nuevas no se mezclan con platos heredados que ya tienen opciones: primero se migra el restaurante.
  IF COALESCE((v_mods->>'options_v2')::boolean, false) = false THEN
    IF EXISTS (SELECT 1 FROM public.dishes d WHERE d.restaurant_id = p_rid AND jsonb_typeof(d.options) = 'array' AND jsonb_array_length(d.options) > 0) THEN
      RAISE EXCEPTION 'Este restaurante tiene platos con opciones del modelo anterior. Activa primero las opciones nuevas (migración).';
    END IF;
    v_mods := jsonb_set(v_mods, '{options_v2}', 'true'::jsonb);
  END IF;

  -- Categorías (por valor)
  v_cats := CASE WHEN jsonb_typeof(v_mods->'categories') = 'array' THEN v_mods->'categories' ELSE '[]'::jsonb END;
  FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(v_t.payload->'categorias', '[]'::jsonb)) LOOP
    IF v_c->>'value' IS NULL OR v_c->>'label' IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cats) x WHERE x->>'value' = v_c->>'value') THEN
      v_cats := v_cats || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('value', v_c->>'value', 'label', v_c->>'label', 'emoji', v_c->>'emoji')));
      v_cat_nuevas := v_cat_nuevas || (v_c->>'value');
    END IF;
  END LOOP;
  v_mods := jsonb_set(v_mods, '{categories}', v_cats);

  -- Listas (por key; si ya existe no se toca)
  FOR v_l IN SELECT * FROM jsonb_array_elements(COALESCE(v_t.payload->'listas', '[]'::jsonb)) LOOP
    IF v_l->>'key' IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.option_lists WHERE restaurant_id = p_rid AND key = v_l->>'key') THEN
      v_l_omit := v_l_omit || (v_l->>'key'); CONTINUE;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'label', i->>'label', 'activo', true, 'precio_extra', COALESCE((i->>'precio_extra')::numeric, 0))), '[]'::jsonb)
      INTO v_items FROM jsonb_array_elements(COALESCE(v_l->'items', '[]'::jsonb)) i WHERE COALESCE(i->>'label', '') <> '';
    INSERT INTO public.option_lists (restaurant_id, key, nombre, items, sort_order)
    VALUES (p_rid, v_l->>'key', COALESCE(v_l->>'nombre', v_l->>'key'), v_items,
            (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.option_lists WHERE restaurant_id = p_rid));
    v_l_ok := v_l_ok || (v_l->>'key');
  END LOOP;

  -- Platos de ejemplo (por nombre; quedan NO disponibles hasta que el dueño ponga el precio)
  v_grupos := COALESCE(v_t.payload->'grupos_tipicos', '[]'::jsonb);
  FOR v_p IN SELECT * FROM jsonb_array_elements(COALESCE(v_t.payload->'platos_ejemplo', '[]'::jsonb)) LOOP
    IF COALESCE(v_p->>'nombre', '') = '' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.dishes WHERE restaurant_id = p_rid AND lower(name) = lower(v_p->>'nombre')) THEN
      v_p_omit := v_p_omit || (v_p->>'nombre'); CONTINUE;
    END IF;
    v_opts := '[]'::jsonb;
    FOR v_g IN SELECT jsonb_array_elements_text(COALESCE(v_p->'grupos', '[]'::jsonb)) LOOP
      SELECT g INTO v_def FROM jsonb_array_elements(v_grupos) g WHERE g->>'id' = v_g LIMIT 1;
      IF v_def IS NULL THEN CONTINUE; END IF;
      v_opts := v_opts || jsonb_build_array(jsonb_build_object(
        'v', 2, 'id', v_def->>'id', 'nombre', v_def->>'nombre',
        'modo', CASE WHEN v_def->>'modo' = 'single' THEN 'single' ELSE 'multi' END,
        'min', COALESCE((v_def->>'min')::int, 0), 'max', COALESCE((v_def->>'max')::int, 1),
        'requerido', COALESCE((v_def->>'requerido')::boolean, false), 'fuente', v_def->'fuente'));
    END LOOP;
    INSERT INTO public.dishes (restaurant_id, name, description, price, category, available, options)
    VALUES (p_rid, v_p->>'nombre', '', COALESCE((v_p->>'precio')::numeric, 0), COALESCE(v_p->>'categoria', 'principal'), false, v_opts);
    v_p_ok := v_p_ok || (v_p->>'nombre');
  END LOOP;

  UPDATE public.restaurant_config
  SET modules_enabled = v_mods,
      plantillas_aplicadas = CASE WHEN p_key = ANY(plantillas_aplicadas) THEN plantillas_aplicadas ELSE plantillas_aplicadas || p_key END,
      business_type = CASE WHEN COALESCE(business_type, '') IN ('', 'general') THEN p_key ELSE business_type END,
      updated_at = now()
  WHERE restaurant_id = p_rid;

  RETURN jsonb_build_object('plantilla', p_key, 'categorias_nuevas', to_jsonb(v_cat_nuevas),
    'listas_creadas', to_jsonb(v_l_ok), 'listas_omitidas', to_jsonb(v_l_omit),
    'platos_creados', to_jsonb(v_p_ok), 'platos_omitidos', to_jsonb(v_p_omit));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._aplicar_plantilla(uuid, text) FROM PUBLIC, anon, authenticated;

-- Para el administrador de su propio restaurante
CREATE OR REPLACE FUNCTION public.aplicar_plantilla(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'admin' OR public.current_restaurant_id() IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador del restaurante puede aplicar plantillas';
  END IF;
  RETURN public._aplicar_plantilla(public.current_restaurant_id(), p_key);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.aplicar_plantilla(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_plantilla(text) TO authenticated;

-- Para el dueño de la plataforma: aplica a cualquier restaurante (exige 2 pasos y deja registro)
CREATE OR REPLACE FUNCTION public.plataforma_aplicar_plantilla(p_restaurant_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb;
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  v_res := public._aplicar_plantilla(p_restaurant_id, p_key);
  INSERT INTO public.platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (auth.uid(), 'aplicar_plantilla', p_restaurant_id, jsonb_build_object('plantilla', p_key, 'resumen', v_res));
  RETURN v_res;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_aplicar_plantilla(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_aplicar_plantilla(uuid, text) TO authenticated;
