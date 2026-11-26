-- Central en vivo: publica en Realtime el gasto de IA (central_consumo) para que Presupuestos y los totales suban solos.
-- Realtime respeta RLS: solo llegan las filas que esta sesión ya puede leer. No cambia datos ni permisos.
-- Solo la agrega si existe y si aún no está publicada. Se deshace con supabase/rollback/20261126140000_central_realtime_consumo_down.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND to_regclass('public.central_consumo') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'central_consumo') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.central_consumo;
  END IF;
END $$;
