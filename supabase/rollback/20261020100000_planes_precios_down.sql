-- Reversa del Bloque 6 (planes y precios). Solo borra lo que creó esa migración.
DROP FUNCTION IF EXISTS public.plataforma_guardar_plan(text, jsonb, text);
DROP FUNCTION IF EXISTS public.elegir_plan(text, text);
DROP FUNCTION IF EXISTS public.planes_publicos();
DROP FUNCTION IF EXISTS public.precio_plan(text, text);
DROP FUNCTION IF EXISTS public.desglose_cobro(numeric);
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS ciclo;
DELETE FROM public.platform_settings WHERE clave = 'anual_meses';
DROP TABLE IF EXISTS public.planes;
