-- ============================================================
-- Harden: Cocina/Mesero/Caja no pueden saltarse el cobro
-- ------------------------------------------------------------
-- Bug: KitchenBoard tenía un botón que hacía
--   UPDATE orders SET status = 'completed'
-- directo, sin pasar por cobrar_orden(). Eso ya se quitó del
-- frontend (KitchenBoard.tsx), pero la política RLS seguía
-- permitiendo que cualquier staff pusiera status='completed'
-- por cualquier otro camino (consola, futuro bug, etc). Esto
-- causaba que órdenes desaparecieran del panel de caja antes de
-- que el cajero pudiera cobrarlas.
--
-- Esta migración restringe la actualización directa de status
-- por parte de waiter/kitchen/cashier a solo
-- pending -> cooking -> ready. Pasar a 'completed' (o
-- 'cancelled') solo puede hacerlo:
--   - un RPC SECURITY DEFINER como cobrar_orden() (corre como
--     dueño de la tabla, no está sujeto a esta política), o
--   - el rol admin (política "Admin full access orders", sin
--     tocar).
--
-- IMPORTANTE (2026-09-25): el fix inicial de esta migración se
-- aplicó sin el filtro restaurant_id que sí tienen las otras 3
-- políticas de orders (Admin full access, Staff view orders,
-- Waiter create orders) — producción ya es multi-tenant real,
-- cosa que este archivo local desconocía. Sin ese filtro, un
-- mesero/cocinero/cajero de un restaurante podía actualizar el
-- status de una orden de OTRO restaurante si conocía su UUID.
-- Se corrigió agregando restaurant_id = current_restaurant_id()
-- también en esta política, igual que las demás.
-- ============================================================

DROP POLICY IF EXISTS "Staff update order status" ON public.orders;
CREATE POLICY "Staff update order status" ON public.orders
  FOR UPDATE USING (
    get_user_role() = ANY (ARRAY['waiter'::text, 'kitchen'::text, 'cashier'::text])
    AND restaurant_id = current_restaurant_id()
  )
  WITH CHECK (
    get_user_role() = ANY (ARRAY['waiter'::text, 'kitchen'::text, 'cashier'::text])
    AND restaurant_id = current_restaurant_id()
    AND status = ANY (ARRAY['pending'::text, 'cooking'::text, 'ready'::text])
  );
