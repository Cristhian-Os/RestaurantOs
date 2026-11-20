-- Reversa de 20261120160000_traslados_ingredientes.
-- OJO: borra el historial de traslados (no deshace el stock ya movido). Hacer copia antes si hay datos reales.
DROP FUNCTION IF EXISTS public.trasladar_ingrediente(uuid, uuid, numeric, text);
DROP TABLE IF EXISTS public.traslados_ingredientes;
