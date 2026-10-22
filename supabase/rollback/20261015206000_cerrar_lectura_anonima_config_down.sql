-- Reversa de 20261015206000_cerrar_lectura_anonima_config.sql
-- ATENCION: vuelve a exponer restaurant_config y la vista de ingredientes de TODOS los restaurantes a cualquier visitante.
GRANT SELECT ON public.restaurant_config TO anon;
DROP POLICY IF EXISTS "Public read config" ON public.restaurant_config;
CREATE POLICY "Public read config" ON public.restaurant_config FOR SELECT USING ((SELECT auth.role()) = 'anon');
ALTER VIEW public.ingredientes_menu_publico RESET (security_invoker);
GRANT SELECT ON public.ingredientes_menu_publico TO anon, authenticated;
