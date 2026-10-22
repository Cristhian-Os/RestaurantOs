-- FASE B: cierra la lectura anonima de los datos de TODOS los restaurantes. Aplicar DESPUES de publicar el frontend
-- nuevo (el menu publico ya usa config_publica / ingredientes_publicos, creadas en 20261015201000).
--  * restaurant_config se leia anonimamente completa (nombre, WhatsApp, direccion, ids de todos los clientes).
--  * ingredientes_menu_publico era una vista SECURITY DEFINER legible por anon: listaba ingredientes de todos los
--    restaurantes y el precio (costo/0.65) se invierte hasta el costo de compra. Pasa a security_invoker (las funciones
--    SECURITY DEFINER create_public_order / crear_plato_custom que la usan siguen funcionando) y deja de ser legible.
-- Reversa: supabase/rollback/20261015206000_cerrar_lectura_anonima_config_down.sql

DROP POLICY IF EXISTS "Public read config" ON public.restaurant_config;
REVOKE SELECT ON public.restaurant_config FROM anon;

ALTER VIEW public.ingredientes_menu_publico SET (security_invoker = true);
REVOKE ALL ON public.ingredientes_menu_publico FROM anon, authenticated;
