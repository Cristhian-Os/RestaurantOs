-- Reversa de 20261023100000_fase_b_cierre_acceso_anonimo.sql (politicas y privilegios generados desde la base previa a la fase B).
-- ATENCION: vuelve a abrir la lectura anonima de restaurant_config y de todas las tablas, el UPDATE de profiles.active y el DELETE de profiles,
-- y hace publico task-evidence. Usar solo si el menu publico o un flujo critico deja de funcionar y no hay otra salida.
-- NO se revierte la limpieza de URLs (http->https, vacios y basura -> NULL): son datos y no se pueden reconstruir.

-- 1) Politicas
DROP POLICY IF EXISTS "Public read config" ON public.restaurant_config;
CREATE POLICY "Public read config" ON public.restaurant_config AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.role() AS role) = 'anon'::text));
DROP POLICY IF EXISTS "Public can read available dishes" ON public.dishes;
CREATE POLICY "Public can read available dishes" ON public.dishes AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.role() AS role) = 'anon'::text) AND (available = true) AND (availability_status <> 'discontinued'::text)));

DROP FUNCTION IF EXISTS public._restaurante_activo(uuid);

-- 2) Restricciones https
ALTER TABLE public.restaurant_config DROP CONSTRAINT IF EXISTS restaurant_config_instagram_url_https;
ALTER TABLE public.restaurant_config DROP CONSTRAINT IF EXISTS restaurant_config_facebook_url_https;
ALTER TABLE public.restaurant_config DROP CONSTRAINT IF EXISTS restaurant_config_logo_url_https;
ALTER TABLE public.restaurant_config DROP CONSTRAINT IF EXISTS restaurant_config_portada_url_https;
ALTER TABLE public.restaurant_config DROP CONSTRAINT IF EXISTS restaurant_config_mascota_url_https;
ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_image_url_https;

-- 3) Privilegios (diferencias exactas contra la base previa)
GRANT SELECT ON public.bases_caja TO anon;
GRANT SELECT ON public.comentario_likes TO anon;
GRANT SELECT ON public.comentarios_platos TO anon;
GRANT SELECT ON public.cortes_caja TO anon;
GRANT SELECT ON public.cuentas TO anon;
GRANT SELECT ON public.custom_dish_ingredients TO anon;
GRANT SELECT ON public.custom_dishes TO anon;
GRANT SELECT ON public.detalles_pedidos TO anon;
GRANT SELECT ON public.employee_schedules TO anon;
GRANT SELECT ON public.facturas_compra TO anon;
GRANT SELECT ON public.gasto_items TO anon;
GRANT SELECT ON public.gastos TO anon;
GRANT SELECT ON public.ingredientes TO anon;
GRANT SELECT ON public.ingredientes_disponibles TO anon;
GRANT INSERT, UPDATE, DELETE ON public.ingredientes_disponibles TO authenticated;
GRANT SELECT ON public.leads TO anon;
GRANT SELECT ON public.likes_platos TO anon;
GRANT SELECT ON public.mesas TO anon;
GRANT SELECT ON public.order_rate_limit TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.payments TO anon;
GRANT SELECT ON public.planes TO anon;
GRANT SELECT ON public.platform_chat_logs TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.proveedores TO anon;
GRANT SELECT ON public.push_subscriptions TO anon;
GRANT SELECT ON public.recetas TO anon;
GRANT SELECT ON public.resenas_platos TO anon;
GRANT SELECT ON public.restaurant_config TO anon;
GRANT SELECT ON public.restaurants TO anon;
GRANT SELECT ON public.sede_cargos TO anon;
GRANT SELECT ON public.shift_checkins TO anon;
GRANT SELECT ON public.subscriptions TO anon;
GRANT SELECT ON public.task_evidence TO anon;
GRANT SELECT ON public.tasks TO anon;
GRANT SELECT ON public.tasks_with_profiles TO anon;
GRANT INSERT, UPDATE, DELETE ON public.tasks_with_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vista_lista_compras TO authenticated;
GRANT SELECT ON public.vista_productos_disponibles TO anon;
GRANT INSERT, UPDATE, DELETE ON public.vista_productos_disponibles TO authenticated;
GRANT UPDATE (active) ON public.profiles TO authenticated;
-- (profiles: el DELETE de authenticated ya viene en la linea de GRANT de arriba)

-- 4) Storage (defensivo). task-evidence vuelve a publico; branding sin limites; restaurant-assets recupera la lectura publica.
-- El nombre y la definicion exactos de la politica publica original de restaurant-assets no estan en la replica local:
-- se recrea con la forma habitual de Supabase para un bucket publico.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Sin esquema storage completo: nada que revertir en Storage';
    RETURN;
  END IF;
  UPDATE storage.buckets SET public = true WHERE id = 'task-evidence';
  UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'branding';
  DROP POLICY IF EXISTS "assets: cada restaurante lee lo suyo" ON storage.objects;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read assets') THEN
    CREATE POLICY "Public read assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'restaurant-assets');
  END IF;
END $$;
