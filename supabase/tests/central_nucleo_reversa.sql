-- Prueba de la reversa 20261114140000_central_nucleo_down (Postgres local; nunca en producción: borra tablas).
--   node .claude/qa-mock/pg-local/correr.mjs --migracion supabase/migrations/20261114120000_cerrar_escalada_de_rol.sql
--     --migracion supabase/migrations/20261114130000_central_acceso_auditoria.sql --migracion supabase/migrations/20261114140000_central_nucleo.sql
--     --migracion supabase/rollback/20261114140000_central_nucleo_down.sql --prueba supabase/tests/central_nucleo_reversa.sql
-- ESPERADO: no queda ninguna tabla ni función del núcleo; el registro de auditoría y el acceso a Central siguen intactos.
DO $$
DECLARE r text := ''; n int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'central\_%' AND tablename <> 'central_auditoria';
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 1a no queda ninguna tabla del núcleo (quedan: '||n||')'||E'\n';
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('central_permite','central_tocar','central_auditar','central_versionar','central_validar_tarea','central_validar_mensaje','central_proteger_aprobacion','central_avisar','central_decidir_aprobacion','central_restaurantes');
  r := r || CASE WHEN n = 0 THEN 'ok   ' ELSE 'FALLA' END || ' 1b no queda ninguna función del núcleo (quedan: '||n||')'||E'\n';
  r := r || CASE WHEN to_regclass('public.central_auditoria') IS NOT NULL THEN 'ok   ' ELSE 'FALLA' END || ' 1c el registro de auditoría sigue ahí'||E'\n';
  r := r || CASE WHEN to_regprocedure('public.central_autorizado()') IS NOT NULL AND to_regprocedure('public.central_verificar_acceso()') IS NOT NULL THEN 'ok   ' ELSE 'FALLA' END || ' 1d el acceso a Central (fase 1) sigue ahí'||E'\n';
  RAISE EXCEPTION 'TEST_OUTPUT: %', E'\n'||r;
END $$;
