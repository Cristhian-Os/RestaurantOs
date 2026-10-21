-- Reversa de 20261021250000_interruptor_resti. Antes, apaga Resti en los restaurantes que lo tengan encendido (la clave queda en false).
UPDATE public.restaurant_config SET modules_enabled = jsonb_set(modules_enabled, '{resti_agent}', 'false'::jsonb) WHERE modules_enabled ? 'resti_agent';
DROP FUNCTION IF EXISTS public.plataforma_activar_resti(uuid, boolean);
DROP FUNCTION IF EXISTS public.plataforma_resti_estado();
