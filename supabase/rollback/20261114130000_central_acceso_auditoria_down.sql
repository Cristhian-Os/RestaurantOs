-- Reversa de 20261114130000_central_acceso_auditoria.
-- OJO: borra la tabla central_auditoria CON su contenido (el registro de accesos a Central). Hacer copia antes.
-- No toca _auditoria_inmutable() ni is_super_admin(): son anteriores y las usa el resto de la plataforma.
DROP FUNCTION IF EXISTS public.central_verificar_acceso();
DROP TABLE IF EXISTS public.central_auditoria;
DROP FUNCTION IF EXISTS public.central_autorizado();
