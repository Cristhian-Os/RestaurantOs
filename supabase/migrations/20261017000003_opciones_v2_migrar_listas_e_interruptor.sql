-- Bloque 4 (Anexo B), paso 4: convertir los sabores heredados en listas, tiempo real y el interruptor options_v2 por restaurante.
-- El interruptor solo lo mueve el dueño de la plataforma (con 2 pasos y registro). Los platos NO se convierten aquí:
-- el adaptador del motor lee los grupos heredados, así que apagar el interruptor es siempre seguro mientras ningún plato tenga grupos v2.

-- Lo que el administrador cambie en las listas se ve en vivo en caja y cocina
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'option_lists') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.option_lists;
  END IF;
END $$;

-- Sabores de helado y de jugo (modules_enabled.helado_flavors / jugo_flavors y sus *_off) -> option_lists. Idempotente.
CREATE OR REPLACE FUNCTION public._migrar_listas_heredadas(p_rid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb; k record; v_items jsonb; v_creadas text[] := '{}'; v_omitidas text[] := '{}';
BEGIN
  SELECT modules_enabled INTO m FROM public.restaurant_config WHERE restaurant_id = p_rid;
  IF m IS NULL THEN RETURN jsonb_build_object('creadas', '[]'::jsonb, 'omitidas', '[]'::jsonb); END IF;
  FOR k IN SELECT * FROM (VALUES ('sabores_helado', 'Sabores de helado', 'helado_flavors'), ('sabores_jugo', 'Sabores de jugo', 'jugo_flavors')) AS t(lkey, nombre, mkey) LOOP
    IF jsonb_typeof(m->k.mkey) <> 'array' OR jsonb_array_length(m->k.mkey) = 0 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.option_lists WHERE restaurant_id = p_rid AND key = k.lkey) THEN
      v_omitidas := v_omitidas || k.lkey; CONTINUE;
    END IF;
    SELECT jsonb_agg(jsonb_build_object('label', f, 'activo', NOT (COALESCE(m->(k.mkey || '_off'), '[]'::jsonb) ? f)) ORDER BY ord)
      INTO v_items FROM jsonb_array_elements_text(m->k.mkey) WITH ORDINALITY AS t(f, ord) WHERE btrim(f) <> '';
    INSERT INTO public.option_lists (restaurant_id, key, nombre, items, sort_order)
    VALUES (p_rid, k.lkey, k.nombre, COALESCE(v_items, '[]'::jsonb), (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.option_lists WHERE restaurant_id = p_rid));
    v_creadas := v_creadas || k.lkey;
  END LOOP;
  RETURN jsonb_build_object('creadas', to_jsonb(v_creadas), 'omitidas', to_jsonb(v_omitidas));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._migrar_listas_heredadas(uuid) FROM PUBLIC, anon, authenticated;

-- Interruptor por restaurante (solo dueño de la plataforma, con 2 pasos y registro)
CREATE OR REPLACE FUNCTION public.plataforma_activar_opciones_v2(p_restaurant_id uuid, p_activo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb := '{}'::jsonb; v_mods jsonb;
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  SELECT modules_enabled INTO v_mods FROM public.restaurant_config WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante sin configuración'; END IF;
  IF p_activo THEN
    v_res := public._migrar_listas_heredadas(p_restaurant_id);
  ELSIF EXISTS (SELECT 1 FROM public.dishes d WHERE d.restaurant_id = p_restaurant_id AND jsonb_typeof(d.options) = 'array'
                AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.options) g WHERE g->>'v' = '2')) THEN
    RAISE EXCEPTION 'Hay platos con opciones del modelo nuevo; no se puede apagar sin convertirlos antes';
  END IF;
  UPDATE public.restaurant_config
  SET modules_enabled = jsonb_set(COALESCE(v_mods, '{}'::jsonb), '{options_v2}', to_jsonb(p_activo)), updated_at = now()
  WHERE restaurant_id = p_restaurant_id;
  INSERT INTO public.platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (auth.uid(), CASE WHEN p_activo THEN 'activar_opciones_v2' ELSE 'desactivar_opciones_v2' END, p_restaurant_id, v_res);
  RETURN jsonb_build_object('options_v2', p_activo) || v_res;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_activar_opciones_v2(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_activar_opciones_v2(uuid, boolean) TO authenticated;
