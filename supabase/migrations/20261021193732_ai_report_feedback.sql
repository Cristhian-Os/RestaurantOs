-- Bloque 11, paso 5: "Me sirvió / No me sirvió" por hallazgo de un reporte con IA (Anexo I, 7). Aditiva.
CREATE TABLE IF NOT EXISTS public.ai_report_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.ai_reports (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL DEFAULT auth.uid(),
  hallazgo_idx  integer NOT NULL CHECK (hallazgo_idx BETWEEN 0 AND 9),
  util          boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, hallazgo_idx, user_id)
);
ALTER TABLE public.ai_report_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_report_feedback FROM anon;
-- El reporte tiene que ser de SU restaurante: no se puede opinar sobre reportes ajenos.
CREATE POLICY "feedback ia: el admin lee el de su restaurante" ON public.ai_report_feedback FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "feedback ia: el admin opina sobre reportes suyos" ON public.ai_report_feedback FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin' AND user_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM public.ai_reports r WHERE r.id = report_id AND r.restaurant_id = restaurant_id));
CREATE POLICY "feedback ia: el admin cambia su opinión" ON public.ai_report_feedback FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND user_id = (SELECT auth.uid()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND user_id = (SELECT auth.uid()));
CREATE TRIGGER ai_report_feedback_updated_at BEFORE UPDATE ON public.ai_report_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
