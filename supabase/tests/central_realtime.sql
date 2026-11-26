-- Prueba de 20261126120000_central_realtime. Solo lee el catálogo. ESPERADO: todas las filas "OK".
-- Cada tabla que exista en el proyecto debe estar publicada; las que no existan se omiten (proyecto de prueba atrasado).
SELECT t.tabla,
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'OMITIDA (no existe aquí)'
            WHEN EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = t.tabla) THEN 'OK'
            ELSE 'FALLA: no está publicada' END AS resultado
FROM (VALUES ('central_mensajes'),('central_notificaciones'),('central_aprobaciones'),
             ('central_tareas'),('central_agentes'),('central_trabajos')) AS t(tabla)
ORDER BY 1;
