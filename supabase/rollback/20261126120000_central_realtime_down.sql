-- Reversa de 20261126120000_central_realtime: quita de Realtime las tablas de Central. No toca datos.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['central_mensajes','central_notificaciones','central_aprobaciones',
                           'central_tareas','central_agentes','central_trabajos'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
