-- Reversa de 20261121120000_crecimiento_fase3 (borra citas, misiones y las 2 tareas automáticas nuevas; no toca el vigía ni las fases 1 y 2).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('central-mision-manana', 'central-mision-cierre');
DROP FUNCTION IF EXISTS public.central_mision_programada(text);
DROP TABLE IF EXISTS public.growth_misiones;
DROP TABLE IF EXISTS public.growth_citas;
DROP FUNCTION IF EXISTS public.growth_cita_reglas();
