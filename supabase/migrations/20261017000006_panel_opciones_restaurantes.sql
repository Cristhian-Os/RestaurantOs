-- Bloque 4: datos para la pestaña "Opciones por restaurante" del panel de plataforma (solo dueño de la plataforma, con 2 pasos).

-- Una fila por restaurante: si tiene las opciones nuevas encendidas, qué plantillas aplicó y cuántas respuestas dio al asistente
CREATE OR REPLACE FUNCTION public.plataforma_opciones_restaurantes()
 RETURNS TABLE (restaurant_id uuid, nombre text, slug text, activo boolean, options_v2 boolean, plantillas text[], respuestas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  RETURN QUERY
    SELECT r.id, r.name, r.slug, r.active,
           COALESCE((c.modules_enabled->>'options_v2')::boolean, false),
           COALESCE(c.plantillas_aplicadas, '{}'::text[]),
           (SELECT count(*)::int FROM public.restaurant_template_answers a WHERE a.restaurant_id = r.id)
    FROM public.restaurants r LEFT JOIN public.restaurant_config c ON c.restaurant_id = r.id
    ORDER BY r.name;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_opciones_restaurantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_opciones_restaurantes() TO authenticated;

-- Las respuestas de un restaurante a las preguntas de sus plantillas
CREATE OR REPLACE FUNCTION public.plataforma_respuestas_restaurante(p_restaurant_id uuid)
 RETURNS TABLE (template_key text, pregunta_id text, pregunta text, respuesta text, updated_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  RETURN QUERY
    SELECT a.template_key, a.pregunta_id, a.pregunta, a.respuesta, a.updated_at
    FROM public.restaurant_template_answers a WHERE a.restaurant_id = p_restaurant_id
    ORDER BY a.template_key, a.pregunta_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_respuestas_restaurante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_respuestas_restaurante(uuid) TO authenticated;
