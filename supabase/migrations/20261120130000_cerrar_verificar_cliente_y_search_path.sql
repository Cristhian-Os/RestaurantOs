-- Hallazgos de la auditoria de seguridad del 2026-11-20 (solo lectura en produccion, verificado antes).
-- 1) verificar_cliente_pidio_plato era ejecutable por anon y authenticated y no filtra por restaurante:
--    permitia saber si un nombre de cliente pidio un plato en cualquier restaurante. Ningun archivo de src/ la llama;
--    solo la usan funciones SECURITY DEFINER (dueno postgres), que conservan el permiso.
-- 2) Siete funciones auxiliares sin search_path fijo (advisor "Function Search Path Mutable").
-- Reversa: supabase/rollback/20261120130000_cerrar_verificar_cliente_y_search_path_down.sql

REVOKE EXECUTE ON FUNCTION public.verificar_cliente_pidio_plato(uuid, text) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public._fid_campana_valores(jsonb, text, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public._fid_no_editar() SET search_path = public, pg_temp;
ALTER FUNCTION public._fid_seg_normalizar(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public._fid_tel(text) SET search_path = public, pg_temp;
ALTER FUNCTION public._items_pedido(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public._mesa_codigo_trg() SET search_path = public, pg_temp;
ALTER FUNCTION public._num(text) SET search_path = public, pg_temp;
