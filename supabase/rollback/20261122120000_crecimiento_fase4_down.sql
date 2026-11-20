-- Reversa de 20261122120000_crecimiento_fase4 (borra la bandeja de mensajes y sus disparadores; no toca prospectos, campañas ni lista de no contactar).
DROP TRIGGER IF EXISTS growth_supresion_cancela_mensajes ON public.growth_supresion;
DROP TRIGGER IF EXISTS growth_prospectos_cancela_mensajes ON public.growth_prospectos;
DROP TRIGGER IF EXISTS growth_autorizaciones_detiene_mensajes ON public.growth_autorizaciones;
DROP TABLE IF EXISTS public.growth_mensajes;
DROP FUNCTION IF EXISTS public.growth_mensajes_por_baja();
DROP FUNCTION IF EXISTS public.growth_mensajes_por_etapa();
DROP FUNCTION IF EXISTS public.growth_mensajes_por_campana();
DROP FUNCTION IF EXISTS public.growth_mensaje_historial();
DROP FUNCTION IF EXISTS public.growth_mensaje_reglas();
