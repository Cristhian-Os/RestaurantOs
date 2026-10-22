-- Rollback Bloque 5B. OJO: borra todas las opiniones guardadas.
DROP FUNCTION IF EXISTS public.plataforma_feedback_actualizar(uuid, text, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.plataforma_feedback_listar(text, text, text, uuid, int);
DROP FUNCTION IF EXISTS public.feedback_marcar_visto(uuid);
DROP TABLE IF EXISTS public.feedback_items;
