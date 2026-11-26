-- Central en vivo (etapa 5): publica en Realtime las tablas de Crecimiento, propuestas y plan semanal, y la cola de trabajos.
-- Realtime respeta RLS: cada quien recibe únicamente las filas que ya puede leer. No cambia datos ni permisos.
-- Solo agrega las tablas que existen en este proyecto (el proyecto de prueba va por detrás de producción) y las que aún no estén publicadas.
-- Se deshace con supabase/rollback/20261126130000_central_realtime_crecimiento_down.sql
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['central_trabajos','central_propuestas','central_plan_semanal','central_plan_items',
                           'growth_prospectos','growth_historial','growth_mensajes','growth_citas','growth_misiones',
                           'growth_autorizaciones','growth_funciones','growth_supresion'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
