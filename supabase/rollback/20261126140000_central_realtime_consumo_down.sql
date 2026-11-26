-- Reversa de 20261126140000_central_realtime_consumo: quita central_consumo de Realtime. No toca datos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'central_consumo') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.central_consumo;
  END IF;
END $$;
