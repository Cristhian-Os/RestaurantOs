-- Interruptor de Resti por restaurante (Módulo B6): solo el dueño de la plataforma, con su código de 2 pasos.
-- Cambia únicamente la clave resti_agent dentro de restaurant_config.modules_enabled (el resto del jsonb no se toca) y queda en el registro.
-- Resti sigue APAGADO por defecto: esta migración no enciende nada. Aditiva (2 funciones). Reversa: supabase/rollback/20261022004716_interruptor_resti_down.sql

CREATE OR REPLACE FUNCTION public.plataforma_resti_estado()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN coalesce((SELECT jsonb_object_agg(restaurant_id::text, coalesce((modules_enabled->>'resti_agent')::boolean, false)) FROM restaurant_config), '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_activar_resti(p_restaurant_id uuid, p_activo boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mods jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT modules_enabled INTO v_mods FROM restaurant_config WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante sin configuracion'; END IF;
  UPDATE restaurant_config SET modules_enabled = jsonb_set(coalesce(v_mods, '{}'::jsonb), '{resti_agent}', to_jsonb(coalesce(p_activo, false))), updated_at = now()
   WHERE restaurant_id = p_restaurant_id;
  INSERT INTO platform_audit_log (actor_id, action, restaurant_id, detail)
  VALUES (auth.uid(), CASE WHEN p_activo THEN 'activar_resti' ELSE 'desactivar_resti' END, p_restaurant_id, jsonb_build_object('resti_agent', coalesce(p_activo, false)));
  RETURN jsonb_build_object('restaurant_id', p_restaurant_id, 'resti_agent', coalesce(p_activo, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.plataforma_resti_estado(), public.plataforma_activar_resti(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_resti_estado(), public.plataforma_activar_resti(uuid, boolean) TO authenticated;
