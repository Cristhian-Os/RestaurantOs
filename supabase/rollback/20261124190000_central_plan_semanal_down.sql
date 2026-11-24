-- Reversa de 20261124190000_central_plan_semanal (borra el plan, sus tareas y las funciones; los trabajos ya encolados quedan en la cola).
DROP FUNCTION IF EXISTS public.central_plan_aprobar(uuid);
DROP FUNCTION IF EXISTS public.central_plan_item_cambiar(uuid, boolean, text, date);
DROP FUNCTION IF EXISTS public.central_plan_crear(date, text, jsonb);
DROP TABLE IF EXISTS public.central_plan_items;
DROP TABLE IF EXISTS public.central_plan_semanal;
