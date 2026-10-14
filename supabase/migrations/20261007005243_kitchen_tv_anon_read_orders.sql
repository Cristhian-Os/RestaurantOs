-- REGISTRO HISTORICO: esta migracion ya esta aplicada en produccion (version 20261007005243,
-- nombre kitchen_tv_anon_read_orders). Se agrega al repo para que el historial quede completo.
-- Texto reconstruido desde pg_policies de produccion el 2026-10-14.
-- Cerrada por 20261014142351_cerrar_lectura_anonima_pedidos_y_config.sql.

DROP POLICY IF EXISTS "Kitchen TV anon read active orders" ON public.orders;
CREATE POLICY "Kitchen TV anon read active orders" ON public.orders
  AS PERMISSIVE FOR SELECT TO anon
  USING (status = ANY (ARRAY['pending'::text, 'cooking'::text, 'ready'::text]));
