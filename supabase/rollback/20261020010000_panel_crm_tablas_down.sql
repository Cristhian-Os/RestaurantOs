-- Rollback Bloque 7, paso 1. OJO: borra las notas, contactos y el registro de cambios del panel.
DROP TRIGGER IF EXISTS restaurants_crm_ficha ON public.restaurants;
DROP FUNCTION IF EXISTS public._crm_ficha_nueva();
DROP FUNCTION IF EXISTS public._auditar(text, text, uuid, jsonb, jsonb, text);
DROP TABLE IF EXISTS public.restaurant_contactos;
DROP TABLE IF EXISTS public.restaurant_crm;
DROP TABLE IF EXISTS public.vendedores;
DROP TABLE IF EXISTS public.auditoria_plataforma;
DROP FUNCTION IF EXISTS public._auditoria_inmutable();
