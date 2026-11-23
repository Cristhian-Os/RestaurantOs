-- Reversa de 20261124120000_central_runtime_trabajos (borra la cola, su registro y los 3 interruptores).
DROP TRIGGER IF EXISTS central_trabajos_por_autorizacion ON public.growth_autorizaciones;
DROP FUNCTION IF EXISTS public.central_trabajos_por_autorizacion();
DROP FUNCTION IF EXISTS public.central_interruptor(text, jsonb);
DROP FUNCTION IF EXISTS public.central_trabajo_terminar(uuid, boolean, jsonb, text, numeric);
DROP FUNCTION IF EXISTS public.central_trabajo_tomar(text, integer);
DROP FUNCTION IF EXISTS public.central_trabajo_encolar(text, text, text, uuid, jsonb, timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.central_trabajo_puede(uuid);
DROP FUNCTION IF EXISTS public._central_trabajo_motivo(uuid);
DROP TABLE IF EXISTS public.central_trabajos_log;
DROP TABLE IF EXISTS public.central_trabajos;
DROP FUNCTION IF EXISTS public.central_trabajos_cerrado();
DROP FUNCTION IF EXISTS public.central_trabajos_registrar();
DELETE FROM public.central_config WHERE clave IN ('agentes_activos', 'pausa_agentes', 'pausa_tipos');
