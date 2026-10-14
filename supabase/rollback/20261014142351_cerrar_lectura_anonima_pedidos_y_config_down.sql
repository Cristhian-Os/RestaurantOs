-- REVERSA de 20261014142351_cerrar_lectura_anonima_pedidos_y_config.sql
-- Vuelve a abrir la lectura anonima tal como estaba en produccion antes del arreglo.
-- NO es una migracion: no se aplica automaticamente. Ejecutar solo si algo se rompe.

DROP POLICY IF EXISTS "Kitchen TV anon read active orders" ON public.orders;
CREATE POLICY "Kitchen TV anon read active orders" ON public.orders
  AS PERMISSIVE FOR SELECT TO anon
  USING (status = ANY (ARRAY['pending'::text, 'cooking'::text, 'ready'::text]));

DROP POLICY IF EXISTS "Kitchen TV anon read config" ON public.restaurant_config;
CREATE POLICY "Kitchen TV anon read config" ON public.restaurant_config
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);
