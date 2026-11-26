-- Prueba de 20261126140000_central_realtime_consumo. Solo lee el catálogo. ESPERADO: "OK".
SELECT 'central_consumo' AS tabla,
       CASE WHEN to_regclass('public.central_consumo') IS NULL THEN 'OMITIDA (no existe aquí)'
            WHEN EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = 'central_consumo') THEN 'OK'
            ELSE 'FALLA: no está publicada' END AS resultado;
