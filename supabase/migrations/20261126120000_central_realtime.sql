-- Central en vivo (etapa 1): publica en Realtime SOLO las tablas que Central necesita ver cambiar sin recargar.
-- Realtime respeta RLS: cada quien recibe únicamente las filas que ya puede leer. No cambia datos ni permisos.
-- Solo agrega a la publicación las tablas que existen en este proyecto (el proyecto de prueba va por detrás de producción).
-- Se deshace con supabase/rollback/20261126120000_central_realtime_down.sql
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['central_mensajes','central_notificaciones','central_aprobaciones',
                           'central_tareas','central_agentes','central_trabajos'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
