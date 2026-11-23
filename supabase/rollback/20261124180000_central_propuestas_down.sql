-- Reversa de 20261124180000_central_propuestas (borra la tabla y lo que se haya guardado en ella).
DROP FUNCTION IF EXISTS public.central_avanzar_propuesta(uuid, text, text);
DROP FUNCTION IF EXISTS public.central_decidir_propuesta(uuid, text, text);
DROP TABLE IF EXISTS public.central_propuestas;
DROP FUNCTION IF EXISTS public.central_propuestas_avisar();
DROP FUNCTION IF EXISTS public.central_propuestas_reglas();
