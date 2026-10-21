-- Reversa del Bloque 11, paso 1. Solo borra lo que agregó esa migración.
DROP FUNCTION IF EXISTS public.analisis_menu(integer);
DROP FUNCTION IF EXISTS public.alertas_food_cost();
DROP FUNCTION IF EXISTS public.alertas_revision(integer);
DROP FUNCTION IF EXISTS public.demanda_por_dia(integer);
DROP FUNCTION IF EXISTS public._costos_platos(uuid);
DROP FUNCTION IF EXISTS public._items_pedido(jsonb);
DROP FUNCTION IF EXISTS public._num(text);
DROP TABLE IF EXISTS public.analytics_config;
