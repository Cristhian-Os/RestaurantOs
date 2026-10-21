-- Reversa del Bloque 11, paso 3. Borra los reportes y el consumo registrados (la IA vuelve a no existir en la base).
DROP FUNCTION IF EXISTS public.plataforma_ai_activar(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.plataforma_ai_consumo(date);
DROP FUNCTION IF EXISTS public.ai_cupo(uuid, text, date, date);
DROP TABLE IF EXISTS public.ai_usage;
DROP TABLE IF EXISTS public.ai_reports;
DROP TABLE IF EXISTS public.ai_restaurant_settings;
DELETE FROM public.platform_settings WHERE clave IN ('ai_tope_global_usd_mes', 'ai_alerta_pct', 'ai_precio_entrada_usd_millon', 'ai_precio_salida_usd_millon');
