-- Reversa de 20261120120000_crecimiento_fase2 (borra prospectos, expedientes e historial y lo que se haya guardado en ellos).
-- La lista de no contactar (Fase 1) NO se toca: las bajas quedan.
DROP TABLE IF EXISTS public.growth_historial;
DROP TABLE IF EXISTS public.growth_expedientes;
DROP TABLE IF EXISTS public.growth_prospectos;
DROP FUNCTION IF EXISTS public.growth_prospecto_reglas();
DROP FUNCTION IF EXISTS public.growth_prospecto_historial();
DROP FUNCTION IF EXISTS public.growth_clave_nombre(text);
DROP FUNCTION IF EXISTS public.growth_clave_web(text);
