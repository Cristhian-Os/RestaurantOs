-- Reversa de 20261126150000_app_errores: borra la función y la tabla del detector de errores (solo contiene errores registrados, ningún dato de restaurantes).
DROP FUNCTION IF EXISTS public.registrar_error_app(text, text, text, text);
DROP TABLE IF EXISTS public.app_errores;
