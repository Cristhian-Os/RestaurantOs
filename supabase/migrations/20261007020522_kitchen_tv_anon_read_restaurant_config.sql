-- REGISTRO HISTORICO: esta migracion ya esta aplicada en produccion (version 20261007020522,
-- nombre kitchen_tv_anon_read_restaurant_config). Se agrega al repo para que el historial quede completo.
-- Texto reconstruido desde pg_policies de produccion el 2026-10-14.
-- Cerrada por 20261014142351_cerrar_lectura_anonima_pedidos_y_config.sql.

DROP POLICY IF EXISTS "Kitchen TV anon read config" ON public.restaurant_config;
CREATE POLICY "Kitchen TV anon read config" ON public.restaurant_config
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);
