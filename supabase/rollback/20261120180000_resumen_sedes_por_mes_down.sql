-- Reversa de 20261120180000_resumen_sedes_por_mes: borra la versión con mes y vuelve a crear la anterior
-- (aplicar de nuevo supabase/migrations/20261120150000_resumen_sedes.sql). Función de solo lectura: no toca datos.
DROP FUNCTION IF EXISTS public.resumen_sedes(date);
