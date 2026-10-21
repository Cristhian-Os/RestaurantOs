-- Bloque 5B: opiniones de los restaurantes dentro del chatbot (Anexo F).
-- La tabla solo la escribe la función `chat-support` (rol de servicio) con el restaurante y el usuario sacados de la sesión.
-- Cada restaurante lee lo suyo (el admin todo el restaurante; el resto solo lo que envió). El dueño de la plataforma
-- lee y gestiona todo SOLO por las funciones plataforma_feedback_* (exigen verificación de 2 pasos).

CREATE TABLE IF NOT EXISTS public.feedback_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            bigint GENERATED ALWAYS AS IDENTITY,
  restaurant_id     uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  user_role         text,
  tipo              text NOT NULL CHECK (tipo IN ('fallo','mejora','personalizacion','pregunta','otro')),
  modulo            text NOT NULL CHECK (modulo IN ('pedidos','cocina','caja','inventario','menu','menu_publico','equipo','pagos','otro')),
  urgencia          text NOT NULL DEFAULT 'media' CHECK (urgencia IN ('baja','media','alta')),
  titulo            text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 140),
  detalle           text NOT NULL CHECK (char_length(detalle) <= 4000),
  pasos             text CHECK (pasos IS NULL OR char_length(pasos) <= 2000),
  pantalla          text CHECK (pantalla IS NULL OR char_length(pantalla) <= 80),
  dispositivo       text CHECK (dispositivo IS NULL OR char_length(dispositivo) <= 120),
  conversacion      jsonb,
  estado            text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','revisado','planeado','en_progreso','hecho','descartado')),
  duplicado_de      uuid REFERENCES public.feedback_items (id) ON DELETE SET NULL,
  nota_interna      text CHECK (nota_interna IS NULL OR char_length(nota_interna) <= 2000),
  cierre_visto_at   timestamptz,          -- cuando el restaurante vio el aviso de "hecho"
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_items_rest_idx ON public.feedback_items (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_estado_idx ON public.feedback_items (estado, urgencia, created_at DESC);
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.feedback_items FROM authenticated;

CREATE POLICY "feedback: cada restaurante lee lo suyo" ON public.feedback_items FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id())
         AND ((SELECT public.get_user_role()) = 'admin' OR user_id = (SELECT auth.uid())));

CREATE TRIGGER feedback_items_set_updated_at BEFORE UPDATE ON public.feedback_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Restaurante: marca como visto el aviso de una sugerencia terminada.
CREATE OR REPLACE FUNCTION public.feedback_marcar_visto(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE feedback_items SET cierre_visto_at = now()
   WHERE id = p_id AND estado = 'hecho' AND cierre_visto_at IS NULL
     AND restaurant_id = current_restaurant_id()
     AND (get_user_role() = 'admin' OR user_id = auth.uid());
END;
$function$;

-- Dueño de la plataforma: lista con filtros (todos opcionales). Incluye el nombre del restaurante.
CREATE OR REPLACE FUNCTION public.plataforma_feedback_listar(
  p_tipo text DEFAULT NULL, p_urgencia text DEFAULT NULL, p_estado text DEFAULT NULL, p_restaurante uuid DEFAULT NULL, p_limite int DEFAULT 200)
 RETURNS TABLE (id uuid, numero bigint, restaurant_id uuid, restaurante text, user_role text, tipo text, modulo text, urgencia text,
                titulo text, detalle text, pasos text, pantalla text, dispositivo text, estado text, duplicado_de uuid, nota_interna text, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma'; END IF;
  PERFORM _exigir_aal2();
  RETURN QUERY
    SELECT f.id, f.numero, f.restaurant_id, r.name, f.user_role, f.tipo, f.modulo, f.urgencia, f.titulo, f.detalle, f.pasos,
           f.pantalla, f.dispositivo, f.estado, f.duplicado_de, f.nota_interna, f.created_at
      FROM feedback_items f JOIN restaurants r ON r.id = f.restaurant_id
     WHERE (p_tipo IS NULL OR f.tipo = p_tipo) AND (p_urgencia IS NULL OR f.urgencia = p_urgencia)
       AND (p_estado IS NULL OR f.estado = p_estado) AND (p_restaurante IS NULL OR f.restaurant_id = p_restaurante)
     ORDER BY (f.estado = 'nuevo') DESC, (f.urgencia = 'alta') DESC, f.created_at DESC
     LIMIT least(greatest(p_limite, 1), 500);
END;
$function$;

-- Dueño de la plataforma: cambia estado, marca duplicado o escribe nota interna. Solo lo que se pasa (NULL = no tocar).
CREATE OR REPLACE FUNCTION public.plataforma_feedback_actualizar(
  p_id uuid, p_estado text DEFAULT NULL, p_duplicado_de uuid DEFAULT NULL, p_quitar_duplicado boolean DEFAULT false, p_nota_interna text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Solo el dueño de la plataforma'; END IF;
  PERFORM _exigir_aal2();
  IF p_estado IS NOT NULL AND p_estado NOT IN ('nuevo','revisado','planeado','en_progreso','hecho','descartado') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  IF p_duplicado_de = p_id THEN RAISE EXCEPTION 'Una opinión no puede ser duplicado de sí misma'; END IF;
  UPDATE feedback_items SET
    estado = COALESCE(p_estado, estado),
    cierre_visto_at = CASE WHEN p_estado IS NOT NULL AND p_estado <> 'hecho' THEN NULL ELSE cierre_visto_at END,
    duplicado_de = CASE WHEN p_quitar_duplicado THEN NULL ELSE COALESCE(p_duplicado_de, duplicado_de) END,
    nota_interna = CASE WHEN p_nota_interna IS NULL THEN nota_interna ELSE NULLIF(btrim(p_nota_interna), '') END
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opinión no encontrada'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.feedback_marcar_visto(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plataforma_feedback_listar(text, text, text, uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plataforma_feedback_actualizar(uuid, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feedback_marcar_visto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_feedback_listar(text, text, text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_feedback_actualizar(uuid, text, uuid, boolean, text) TO authenticated;
