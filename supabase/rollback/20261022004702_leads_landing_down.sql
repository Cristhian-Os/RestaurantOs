-- Reversa de 20261022004702_leads_landing (borra también los leads guardados: exporta antes si ya hay datos reales).
DROP FUNCTION IF EXISTS public.plataforma_marcar_lead(uuid, text);
DROP FUNCTION IF EXISTS public.plataforma_leads(integer);
DROP FUNCTION IF EXISTS public.registrar_lead(text, text, text, text, text, integer, text, text, text, text);
DROP TABLE IF EXISTS public.leads;
