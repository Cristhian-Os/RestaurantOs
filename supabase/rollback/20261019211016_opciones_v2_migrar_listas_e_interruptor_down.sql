-- Reversa de 20261017000003. Las listas ya creadas se conservan (si se quieren borrar: DELETE FROM option_lists WHERE key IN ('sabores_helado','sabores_jugo')).
DROP FUNCTION IF EXISTS public.plataforma_activar_opciones_v2(uuid, boolean);
DROP FUNCTION IF EXISTS public._migrar_listas_heredadas(uuid);
ALTER PUBLICATION supabase_realtime DROP TABLE public.option_lists;
