-- RestaurantOS Central · Fase 1: acceso y registro de auditoría.
-- ESTADO: probada SOLO en el Postgres local (PGlite). NO aplicada en el proyecto de prueba ni en producción.
-- Depende de: is_super_admin(), _auditoria_inmutable() (ya existen) y de 20261114120000_cerrar_escalada_de_rol
--             (sin ese arreglo, "ser super_admin" no es una garantía y Central no debe activarse).
--
-- Qué crea:
--   central_autorizado()       verdadero SOLO para el super admin con código de 2 pasos (sesión aal2). Es la única regla
--                              de acceso de Central: la usan sus políticas y sus funciones.
--   central_auditoria          registro de Central. Solo se agrega: nadie edita ni borra (ni el dueño, ni un agente,
--                              ni la llave de servicio). Solo lo lee quien cumple central_autorizado().
--   central_verificar_acceso() la pantalla la llama al entrar: responde sí o no y deja registro del acceso concedido
--                              o del intento denegado (un intento denegado se anota máximo una vez por hora y usuario).
-- Reversa: supabase/rollback/20261114130000_central_acceso_auditoria_down.sql

CREATE OR REPLACE FUNCTION public.central_autorizado()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_super_admin() AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$function$;
REVOKE EXECUTE ON FUNCTION public.central_autorizado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_autorizado() TO authenticated;

CREATE TABLE IF NOT EXISTS public.central_auditoria (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now(),
  actor_tipo     text NOT NULL CHECK (actor_tipo IN ('humano', 'agente', 'sistema')),
  actor_id       uuid,                                  -- usuario que pide (sin llave foránea: el registro sobrevive al usuario)
  agente_id      text CHECK (agente_id IS NULL OR char_length(agente_id) <= 80),   -- agente que pide, cuando existan (Fase 5)
  accion         text NOT NULL CHECK (char_length(accion) <= 80),
  recurso        text CHECK (recurso IS NULL OR char_length(recurso) <= 200),
  nivel          text CHECK (nivel IN ('N0', 'N1', 'N2', 'N3')),                   -- nivel de autorización de la acción
  aprobador_id   uuid,                                  -- quién aprobó, cuando la acción exige aprobación humana
  resultado      text NOT NULL CHECK (resultado IN ('ok', 'denegado', 'error', 'pendiente')),
  detalle        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- evidencias y errores
  correlacion_id uuid NOT NULL DEFAULT gen_random_uuid()   -- une solicitud, aprobación, ejecución y resultado de una misma acción
);

-- Nadie edita ni borra el registro (misma regla que auditoria_plataforma).
DROP TRIGGER IF EXISTS central_auditoria_no_editar ON public.central_auditoria;
CREATE TRIGGER central_auditoria_no_editar BEFORE UPDATE OR DELETE ON public.central_auditoria
  FOR EACH ROW EXECUTE FUNCTION public._auditoria_inmutable();
DROP TRIGGER IF EXISTS central_auditoria_no_truncar ON public.central_auditoria;
CREATE TRIGGER central_auditoria_no_truncar BEFORE TRUNCATE ON public.central_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION public._auditoria_inmutable();

-- Sin permisos directos de escritura: solo se escribe desde funciones del servidor. Leer: solo el dueño con 2 pasos.
ALTER TABLE public.central_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.central_auditoria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.central_auditoria TO authenticated;
DROP POLICY IF EXISTS "Central: solo el dueño con 2 pasos lee la auditoría" ON public.central_auditoria;
CREATE POLICY "Central: solo el dueño con 2 pasos lee la auditoría" ON public.central_auditoria
  FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));

CREATE OR REPLACE FUNCTION public.central_verificar_acceso()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'sin_sesion');
  END IF;

  IF public.central_autorizado() THEN
    INSERT INTO public.central_auditoria (actor_tipo, actor_id, accion, recurso, nivel, resultado)
    VALUES ('humano', v_uid, 'acceso_concedido', 'central', 'N0', 'ok');
    RETURN jsonb_build_object('permitido', true);
  END IF;

  v_motivo := CASE WHEN public.is_super_admin() THEN 'requiere_mfa' ELSE 'sin_permiso' END;
  -- Máximo un registro por hora y usuario: nadie llena el registro a punta de intentos.
  IF NOT EXISTS (SELECT 1 FROM public.central_auditoria
                 WHERE actor_id = v_uid AND accion = 'acceso_denegado' AND created_at > now() - interval '1 hour') THEN
    INSERT INTO public.central_auditoria (actor_tipo, actor_id, accion, recurso, resultado, detalle)
    VALUES ('humano', v_uid, 'acceso_denegado', 'central', 'denegado', jsonb_build_object('motivo', v_motivo));
  END IF;
  RETURN jsonb_build_object('permitido', false, 'motivo', v_motivo);
END;
$function$;
REVOKE ALL ON FUNCTION public.central_verificar_acceso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_verificar_acceso() TO authenticated;
