-- Reversa de importar_recetas: solo borra las funciones que creó esa migración.
DROP FUNCTION IF EXISTS public.importar_recetas(jsonb);
DROP FUNCTION IF EXISTS public._unidad_canonica(text);
