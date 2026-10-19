-- Bloque 4: preguntas de cada plantilla al administrador (asistente de configuración).
-- Cada plantilla trae una lista de preguntas (payload.preguntas: [{id, texto}]). El administrador responde en texto libre;
-- las respuestas se guardan por restaurante y las lee el administrador de ese restaurante y el dueño de la plataforma.
-- Nada se aplica solo a partir de una respuesta: sirven para ajustar la configuración y para mejorar las plantillas.

CREATE TABLE IF NOT EXISTS public.restaurant_template_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id) ON DELETE CASCADE,
  template_key  text NOT NULL,
  pregunta_id   text NOT NULL CHECK (pregunta_id ~ '^[a-z0-9_]{1,40}$'),
  pregunta      text NOT NULL CHECK (length(pregunta) BETWEEN 1 AND 600),
  respuesta     text NOT NULL CHECK (length(btrim(respuesta)) BETWEEN 1 AND 2000),
  answered_by   uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, template_key, pregunta_id)
);
ALTER TABLE public.restaurant_template_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_template_answers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_template_answers FROM authenticated;
CREATE POLICY "respuestas de plantilla: admin del restaurante o dueño de la plataforma leen" ON public.restaurant_template_answers FOR SELECT TO authenticated
  USING (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()));

-- Guarda (o actualiza) las respuestas del administrador de su propio restaurante. Una respuesta vacía borra la anterior.
-- p_respuestas: [{ "plantilla": "heladeria", "pregunta_id": "p1", "pregunta": "...", "respuesta": "..." }]
CREATE OR REPLACE FUNCTION public.guardar_respuestas_plantilla(p_respuestas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_rid uuid := public.current_restaurant_id(); v_n integer := 0; v_txt text;
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'admin' OR v_rid IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador del restaurante puede responder estas preguntas';
  END IF;
  IF jsonb_typeof(p_respuestas) <> 'array' OR jsonb_array_length(p_respuestas) > 200 THEN
    RAISE EXCEPTION 'Respuestas inválidas';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_respuestas) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.restaurant_templates WHERE key = r->>'plantilla') THEN
      RAISE EXCEPTION 'La plantilla % no existe', r->>'plantilla';
    END IF;
    v_txt := btrim(COALESCE(r->>'respuesta', ''));
    IF v_txt = '' THEN
      DELETE FROM public.restaurant_template_answers WHERE restaurant_id = v_rid AND template_key = r->>'plantilla' AND pregunta_id = r->>'pregunta_id';
    ELSE
      INSERT INTO public.restaurant_template_answers (restaurant_id, template_key, pregunta_id, pregunta, respuesta)
      VALUES (v_rid, r->>'plantilla', r->>'pregunta_id', left(COALESCE(r->>'pregunta', ''), 600), left(v_txt, 2000))
      ON CONFLICT (restaurant_id, template_key, pregunta_id)
      DO UPDATE SET respuesta = EXCLUDED.respuesta, pregunta = EXCLUDED.pregunta, answered_by = auth.uid(), updated_at = now();
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guardar_respuestas_plantilla(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_respuestas_plantilla(jsonb) TO authenticated;
