-- Bloque 4 (Anexo B 3.2), paso 5b: editor de plantillas del panel de superadministrador.
-- Toda escritura pasa por estas funciones (2 pasos + versiones + registro); la tabla queda de solo lectura para la API.
-- Una plantilla es una COPIA al aplicarse: editarla nunca modifica restaurantes que ya la aplicaron.

-- Solo lectura directa: las escrituras van por las funciones de abajo
DROP POLICY IF EXISTS "plantillas: solo super admin escribe" ON public.restaurant_templates;
DROP POLICY IF EXISTS "versiones de plantilla: solo super admin" ON public.restaurant_template_versions;
CREATE POLICY "versiones de plantilla: super admin lee" ON public.restaurant_template_versions FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_templates, public.restaurant_template_versions FROM authenticated, anon;

-- Valida la estructura de una plantilla (mismas reglas que el generador de borradores)
CREATE OR REPLACE FUNCTION public._validar_payload_plantilla(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  c jsonb; l jsonb; g jsonb; pl jsonb; gid text; k text;
  v_cats text[] := '{}'; v_listas text[] := '{}'; v_ids text[] := '{}'; v_nombres text[] := '{}';
BEGIN
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'La plantilla debe ser un objeto'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p->'categorias', '[]'::jsonb)) LOOP
    IF COALESCE(c->>'value', '') !~ '^[a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'Categoría con identificador inválido: %', c->>'value'; END IF;
    IF COALESCE(c->>'label', '') = '' THEN RAISE EXCEPTION 'Categoría sin nombre: %', c->>'value'; END IF;
    IF c->>'value' = ANY(v_cats) THEN RAISE EXCEPTION 'Categoría repetida: %', c->>'value'; END IF;
    v_cats := v_cats || (c->>'value');
  END LOOP;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p->'listas', '[]'::jsonb)) LOOP
    IF COALESCE(l->>'key', '') !~ '^[a-z0-9_]{1,60}$' THEN RAISE EXCEPTION 'Lista con identificador inválido: %', l->>'key'; END IF;
    IF l->>'key' = ANY(v_listas) THEN RAISE EXCEPTION 'Lista repetida: %', l->>'key'; END IF;
    v_listas := v_listas || (l->>'key');
    IF jsonb_typeof(l->'items') <> 'array' THEN RAISE EXCEPTION 'La lista % necesita ítems', l->>'key'; END IF;
    IF (SELECT count(DISTINCT lower(i->>'label')) FROM jsonb_array_elements(l->'items') i) <> jsonb_array_length(l->'items') THEN
      RAISE EXCEPTION 'La lista % tiene ítems repetidos', l->>'key';
    END IF;
  END LOOP;
  FOR g IN SELECT * FROM jsonb_array_elements(COALESCE(p->'grupos_tipicos', '[]'::jsonb)) LOOP
    gid := g->>'id';
    IF COALESCE(gid, '') !~ '^[a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'Grupo con identificador inválido: %', gid; END IF;
    IF gid = ANY(v_ids) THEN RAISE EXCEPTION 'Grupo repetido: %', gid; END IF;
    v_ids := v_ids || gid;
    IF COALESCE(g->>'nombre', '') = '' THEN RAISE EXCEPTION 'El grupo % necesita nombre', gid; END IF;
    IF (g->>'nombre') = ANY(v_nombres) THEN RAISE EXCEPTION 'Dos grupos se llaman igual: %', g->>'nombre'; END IF;
    v_nombres := v_nombres || (g->>'nombre');
    IF g->>'modo' NOT IN ('single', 'multi') THEN RAISE EXCEPTION 'Modo inválido en %', gid; END IF;
    IF COALESCE((g->>'min')::int, 0) > COALESCE((g->>'max')::int, 1) THEN RAISE EXCEPTION 'En % el mínimo supera el máximo', gid; END IF;
    IF NOT COALESCE((g->>'requerido')::boolean, false) AND COALESCE((g->>'min')::int, 0) > 0 THEN
      RAISE EXCEPTION 'En % el grupo no es obligatorio pero exige mínimo', gid;
    END IF;
    IF g->'fuente' ? 'lista' THEN
      IF NOT (g->'fuente'->>'lista') = ANY(v_listas) THEN RAISE EXCEPTION 'El grupo % usa una lista que no existe: %', gid, g->'fuente'->>'lista'; END IF;
    ELSIF jsonb_typeof(g->'fuente'->'items') <> 'array' THEN
      RAISE EXCEPTION 'El grupo % necesita una lista o sus propias opciones', gid;
    END IF;
  END LOOP;
  -- Preguntas para el administrador (opcionales): [{id, texto}]
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p->'preguntas', '[]'::jsonb)) LOOP
    IF COALESCE(c->>'id', '') !~ '^[a-z0-9_]{1,40}$' OR btrim(COALESCE(c->>'texto', '')) = '' OR length(c->>'texto') > 600 THEN
      RAISE EXCEPTION 'Pregunta inválida: %', c->>'id';
    END IF;
  END LOOP;
  FOR pl IN SELECT * FROM jsonb_array_elements(COALESCE(p->'platos_ejemplo', '[]'::jsonb)) LOOP
    IF COALESCE(pl->>'nombre', '') = '' THEN RAISE EXCEPTION 'Hay un plato de ejemplo sin nombre'; END IF;
    IF COALESCE((pl->>'precio')::numeric, 0) <> 0 THEN RAISE EXCEPTION 'Los platos de ejemplo van con precio 0: %', pl->>'nombre'; END IF;
    IF NOT (pl->>'categoria') = ANY(v_cats) THEN RAISE EXCEPTION 'El plato % usa una categoría que no existe', pl->>'nombre'; END IF;
    FOR k IN SELECT jsonb_array_elements_text(COALESCE(pl->'grupos', '[]'::jsonb)) LOOP
      IF NOT k = ANY(v_ids) THEN RAISE EXCEPTION 'El plato % usa un grupo que no existe: %', pl->>'nombre', k; END IF;
    END LOOP;
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._validar_payload_plantilla(jsonb) FROM PUBLIC, anon, authenticated;

-- Lista para el panel: todas las plantillas con cuántos restaurantes las han aplicado
CREATE OR REPLACE FUNCTION public.plataforma_listar_plantillas()
 RETURNS TABLE (key text, nombre text, descripcion text, activo boolean, version integer, updated_at timestamptz, aplicada_en integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  RETURN QUERY
    SELECT t.key, t.nombre, t.descripcion, t.activo, t.version, t.updated_at,
           (SELECT count(*)::int FROM public.restaurant_config c WHERE t.key = ANY(c.plantillas_aplicadas))
    FROM public.restaurant_templates t ORDER BY t.activo DESC, t.nombre;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_listar_plantillas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_listar_plantillas() TO authenticated;

-- Crear o guardar: cada guardado crea una versión nueva. Una plantilla nueva nace inactiva.
CREATE OR REPLACE FUNCTION public.plataforma_guardar_plantilla(p_key text, p_nombre text, p_descripcion text, p_payload jsonb, p_nota text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_version integer; v_existe boolean;
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  IF COALESCE(p_key, '') !~ '^[a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'El identificador solo admite minúsculas, números y guion bajo'; END IF;
  IF btrim(COALESCE(p_nombre, '')) = '' THEN RAISE EXCEPTION 'La plantilla necesita un nombre'; END IF;
  PERFORM public._validar_payload_plantilla(p_payload);
  SELECT true, version INTO v_existe, v_version FROM public.restaurant_templates WHERE key = p_key FOR UPDATE;
  IF v_existe THEN
    v_version := v_version + 1;
    UPDATE public.restaurant_templates SET nombre = btrim(p_nombre), descripcion = p_descripcion, payload = p_payload, version = v_version, updated_at = now() WHERE key = p_key;
  ELSE
    v_version := 1;
    INSERT INTO public.restaurant_templates (key, nombre, descripcion, payload, activo, version) VALUES (p_key, btrim(p_nombre), p_descripcion, p_payload, false, 1);
  END IF;
  INSERT INTO public.restaurant_template_versions (template_key, version, nombre, descripcion, payload, nota, created_by)
  VALUES (p_key, v_version, btrim(p_nombre), p_descripcion, p_payload, NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid());
  INSERT INTO public.platform_audit_log (actor_id, action, detail)
  VALUES (auth.uid(), CASE WHEN v_existe THEN 'editar_plantilla' ELSE 'crear_plantilla' END, jsonb_build_object('plantilla', p_key, 'version', v_version, 'nota', p_nota));
  RETURN v_version;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_guardar_plantilla(text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_guardar_plantilla(text, text, text, jsonb, text) TO authenticated;

-- Activar o desactivar: una plantilla inactiva no se ofrece ni se puede aplicar
CREATE OR REPLACE FUNCTION public.plataforma_set_plantilla_activa(p_key text, p_activo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  UPDATE public.restaurant_templates SET activo = p_activo, updated_at = now() WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'La plantilla no existe'; END IF;
  INSERT INTO public.platform_audit_log (actor_id, action, detail)
  VALUES (auth.uid(), CASE WHEN p_activo THEN 'activar_plantilla' ELSE 'desactivar_plantilla' END, jsonb_build_object('plantilla', p_key));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_set_plantilla_activa(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_set_plantilla_activa(text, boolean) TO authenticated;

-- Volver a una versión anterior: se guarda como versión NUEVA (el historial no se borra)
CREATE OR REPLACE FUNCTION public.plataforma_restaurar_version_plantilla(p_key text, p_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old public.restaurant_template_versions%ROWTYPE;
BEGIN
  PERFORM public._exigir_aal2();
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma puede hacer esto'; END IF;
  SELECT * INTO v_old FROM public.restaurant_template_versions WHERE template_key = p_key AND version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa versión no existe'; END IF;
  RETURN public.plataforma_guardar_plantilla(p_key, v_old.nombre, v_old.descripcion, v_old.payload, 'Restaurada desde la versión ' || p_version);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.plataforma_restaurar_version_plantilla(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_restaurar_version_plantilla(text, integer) TO authenticated;
