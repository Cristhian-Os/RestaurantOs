-- Reversa de 20261119120000_crecimiento_fase1 (borra las 3 tablas de Crecimiento y lo que se haya guardado en ellas).
DROP FUNCTION IF EXISTS public.growth_activar_autorizacion(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.growth_revocar_autorizacion(uuid, text);
DROP FUNCTION IF EXISTS public.growth_autorizacion_vigente(uuid);
DROP FUNCTION IF EXISTS public.growth_suprimir(text, text, text, text);
DROP FUNCTION IF EXISTS public.growth_esta_suprimido(text, text);
DROP TABLE IF EXISTS public.growth_autorizaciones;
DROP TABLE IF EXISTS public.growth_supresion;
DROP TABLE IF EXISTS public.growth_funciones;
DROP FUNCTION IF EXISTS public.growth_autorizacion_reglas();
DROP FUNCTION IF EXISTS public.growth_normalizar_contacto(text, text);
