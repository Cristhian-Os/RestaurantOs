-- Reversa de 20261015204000_costos_recetas_y_reconciliar_produccion.sql
-- Solo se retiran los objetos nuevos. Los objetos "reconciliados" (get_platform_overview, platform_chat_logs,
-- ingredientes.sustituto_id, indice unico de push_subscriptions) YA existian en produccion: no se tocan.
DROP FUNCTION IF EXISTS public.costos_recetas();
DROP FUNCTION IF EXISTS public.purgar_chat_logs_antiguos();
DROP INDEX IF EXISTS public.platform_chat_logs_created_idx;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
