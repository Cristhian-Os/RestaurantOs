-- Prueba de 20261126130000_central_realtime_crecimiento. Solo lee el catálogo. ESPERADO: "OK" (o "OMITIDA" si la tabla no existe en ese proyecto).
SELECT t.tabla,
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'OMITIDA (no existe aquí)'
            WHEN EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = t.tabla) THEN 'OK'
            ELSE 'FALLA: no está publicada' END AS resultado
FROM (VALUES ('central_trabajos'),('central_propuestas'),('central_plan_semanal'),('central_plan_items'),
             ('growth_prospectos'),('growth_historial'),('growth_mensajes'),('growth_citas'),('growth_misiones'),
             ('growth_autorizaciones'),('growth_funciones'),('growth_supresion')) AS t(tabla)
ORDER BY 1;
