-- ============================================================
-- TRIGGERS (public schema) -- snapshot desde produccion
-- Generado automaticamente el 2026-09-26. NO editar a mano.
-- ============================================================

CREATE TRIGGER custom_dishes_set_updated_at BEFORE UPDATE ON public.custom_dishes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER detalles_descontar_stock AFTER INSERT ON public.detalles_pedidos FOR EACH ROW EXECUTE FUNCTION descontar_ingredientes();
CREATE TRIGGER dishes_set_updated_at BEFORE UPDATE ON public.dishes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employee_schedules_updated_at BEFORE UPDATE ON public.employee_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ingredientes_set_updated_at BEFORE UPDATE ON public.ingredientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER mesas_set_updated_at BEFORE UPDATE ON public.mesas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_status_change AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION on_order_status_change();
CREATE TRIGGER trg_orders_broadcast_estado_publico AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION notify_pedido_estado_publico();
CREATE TRIGGER trg_pay_touch BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prevent_self_role_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_self_role_escalation();
CREATE TRIGGER trg_rpc_touch BEFORE UPDATE ON public.restaurant_payment_config FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER restaurants_set_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subs_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
