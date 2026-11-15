-- Reversa de 20261114140000_central_nucleo.
-- ADVERTENCIA: borra las tablas del núcleo de Central y TODO lo que Central haya guardado en ellas
-- (tareas, conversaciones, memoria, documentos, ubicaciones…). Haz una copia antes si ya hay datos.
-- NO toca central_auditoria (el registro de auditoría se conserva siempre) ni la migración 20261114130000.
DROP FUNCTION IF EXISTS public.central_restaurantes();
DROP FUNCTION IF EXISTS public.central_decidir_aprobacion(uuid, text, text);

-- Tablas, de las que dependen de otras hacia las que no dependen de nadie
DROP TABLE IF EXISTS public.central_mensajes CASCADE;
DROP TABLE IF EXISTS public.central_conversaciones CASCADE;
DROP TABLE IF EXISTS public.central_aprobaciones CASCADE;
DROP TABLE IF EXISTS public.central_tareas CASCADE;
DROP TABLE IF EXISTS public.central_proyectos CASCADE;
DROP TABLE IF EXISTS public.central_reuniones CASCADE;
DROP TABLE IF EXISTS public.central_notificaciones CASCADE;
DROP TABLE IF EXISTS public.central_documentos CASCADE;
DROP TABLE IF EXISTS public.central_memoria CASCADE;
DROP TABLE IF EXISTS public.central_versiones CASCADE;
DROP TABLE IF EXISTS public.central_integraciones CASCADE;
DROP TABLE IF EXISTS public.central_consumo CASCADE;
DROP TABLE IF EXISTS public.central_config CASCADE;
DROP TABLE IF EXISTS public.central_ubicaciones CASCADE;
DROP TABLE IF EXISTS public.central_agentes CASCADE;
DROP TABLE IF EXISTS public.central_departamentos CASCADE;

-- Funciones de apoyo (ya sin disparadores que las usen)
DROP FUNCTION IF EXISTS public.central_validar_tarea();
DROP FUNCTION IF EXISTS public.central_validar_mensaje();
DROP FUNCTION IF EXISTS public.central_proteger_aprobacion();
DROP FUNCTION IF EXISTS public.central_avisar();
DROP FUNCTION IF EXISTS public.central_versionar();
DROP FUNCTION IF EXISTS public.central_auditar();
DROP FUNCTION IF EXISTS public.central_tocar();
DROP FUNCTION IF EXISTS public.central_permite(text, text, boolean);
