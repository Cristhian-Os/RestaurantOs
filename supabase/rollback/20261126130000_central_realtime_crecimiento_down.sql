-- Reversa de 20261126130000_central_realtime_crecimiento: quita de Realtime esas tablas. No toca datos.
-- (central_trabajos también la publica 20261126120000_central_realtime; si se quiere conservar allí, volver a agregarla con esa migración.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['central_propuestas','central_plan_semanal','central_plan_items',
                           'growth_prospectos','growth_historial','growth_mensajes','growth_citas','growth_misiones',
                           'growth_autorizaciones','growth_funciones','growth_supresion'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
