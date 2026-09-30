-- Expone el número secuencial del día en la vista pública de seguimiento
-- (solo el número; sin total ni datos del cliente). Requiere la migración
-- 20260930120000_numero_secuencial_pedido_del_dia. La columna nueva va al
-- final, como exige CREATE OR REPLACE VIEW; se conserva security_invoker=false.
CREATE OR REPLACE VIEW public.pedido_estado_publico AS
 SELECT id,
    status,
    table_num,
    tipo_pedido,
    created_at,
    updated_at,
    (paid_at IS NOT NULL) AS pagado,
    order_number_today
   FROM orders;
