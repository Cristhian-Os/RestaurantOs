-- Central · PLAN SEMANAL. Chef Mayor arma la semana, el dueño la revisa (quita, cambia, aprueba) y solo lo APROBADO se convierte en trabajos para los agentes.
-- Aditiva: 2 tablas nuevas y funciones. No toca restaurantes, pedidos ni dinero. No contacta ni publica nada.
-- Reglas que hace cumplir la base:
--   · Solo el dueño con 2 pasos (central_autorizado) edita y aprueba; solo mientras el plan está en borrador. Aprobado, no se edita.
--   · Solo el servidor crea el borrador (una vez por semana; no se sobrescribe).
--   · Al aprobar, cada tarea de un agente pasa a la cola con su clave de día (no se duplica con "Crear el trabajo de hoy") y el guardián de trabajos sigue mandando:
--     interruptor, campaña vigente y tope de gasto se revisan igual al correr. Los días que ya pasaron no se encolan.
-- Depende de: central_nucleo, central_runtime_trabajos (central_trabajos) y crecimiento_fase1 (growth_autorizaciones).
-- Reversa: supabase/rollback/20261124190000_central_plan_semanal_down.sql

CREATE TABLE IF NOT EXISTS public.central_plan_semanal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana        date NOT NULL UNIQUE CHECK (EXTRACT(ISODOW FROM semana) = 1),      -- el lunes de esa semana
  estado        text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'cancelado')),
  generado_por  text NOT NULL DEFAULT 'chef-mayor' REFERENCES public.central_agentes (id),
  resumen       text NOT NULL DEFAULT '' CHECK (char_length(resumen) <= 1500),
  decidido_por  uuid,
  decidido_en   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.central_plan_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES public.central_plan_semanal (id) ON DELETE CASCADE,
  dia             date NOT NULL,
  agente_id       text NOT NULL REFERENCES public.central_agentes (id),
  tipo            text NOT NULL CHECK (tipo IN ('investigar_prospectos', 'redactar_borrador', 'tarea_humana')),
  descripcion     text NOT NULL CHECK (char_length(descripcion) BETWEEN 3 AND 300),
  autorizacion_id uuid REFERENCES public.growth_autorizaciones (id),
  estado          text NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto', 'quitado', 'encolado', 'para_ti')),
  trabajo_id      uuid REFERENCES public.central_trabajos (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo = 'tarea_humana' OR autorizacion_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS central_plan_items_plan_idx ON public.central_plan_items (plan_id, dia);

DROP TRIGGER IF EXISTS central_plan_semanal_auditar ON public.central_plan_semanal;
CREATE TRIGGER central_plan_semanal_auditar AFTER INSERT OR UPDATE OR DELETE ON public.central_plan_semanal FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');
DROP TRIGGER IF EXISTS central_plan_items_auditar ON public.central_plan_items;
CREATE TRIGGER central_plan_items_auditar AFTER INSERT OR UPDATE OR DELETE ON public.central_plan_items FOR EACH ROW EXECUTE FUNCTION public.central_auditar('');

ALTER TABLE public.central_plan_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.central_plan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.central_plan_semanal, public.central_plan_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.central_plan_semanal, public.central_plan_items TO authenticated;
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_plan_semanal;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_plan_semanal FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.central_plan_items;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.central_plan_items FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));

-- El servidor crea el borrador (una sola vez por semana).
CREATE OR REPLACE FUNCTION public.central_plan_crear(p_semana date, p_resumen text, p_items jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; i jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Solo el servidor crea el borrador.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 60 THEN RAISE EXCEPTION 'El plan debe tener entre 1 y 60 tareas.' USING ERRCODE = 'P0001'; END IF;
  SELECT id INTO v_id FROM public.central_plan_semanal WHERE semana = p_semana;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;                      -- ya existe: no se sobrescribe lo que el dueño pudo editar
  INSERT INTO public.central_plan_semanal (semana, resumen) VALUES (p_semana, left(coalesce(p_resumen, ''), 1500)) RETURNING id INTO v_id;
  FOR i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.central_plan_items (plan_id, dia, agente_id, tipo, descripcion, autorizacion_id)
    VALUES (v_id, (i ->> 'dia')::date, i ->> 'agente_id', i ->> 'tipo', i ->> 'descripcion', NULLIF(i ->> 'autorizacion_id', '')::uuid);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.central_plan_items WHERE plan_id = v_id AND (dia < p_semana OR dia > p_semana + 5)) THEN
    RAISE EXCEPTION 'Hay tareas fuera de lunes a sábado de esa semana.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.central_notificaciones (tipo, severidad, titulo, detalle, origen, enlace)
  VALUES ('aprobacion', 'importante', 'Plan de la semana listo para tu aprobación', left(coalesce(p_resumen, ''), 400), 'plan_semanal', '/central');
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_plan_crear(date, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.central_plan_crear(date, text, jsonb) TO service_role;

-- El dueño quita, devuelve o cambia una tarea (solo con el plan en borrador).
CREATE OR REPLACE FUNCTION public.central_plan_item_cambiar(p_item uuid, p_quitado boolean DEFAULT NULL, p_descripcion text DEFAULT NULL, p_dia date DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_plan uuid; v_semana date; v_est text; v_filas integer;
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  SELECT i.plan_id, p.semana, p.estado INTO v_plan, v_semana, v_est FROM public.central_plan_items i JOIN public.central_plan_semanal p ON p.id = i.plan_id WHERE i.id = p_item;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'No existe esa tarea.' USING ERRCODE = 'P0001'; END IF;
  IF v_est <> 'borrador' THEN RAISE EXCEPTION 'El plan ya no está en borrador: no se edita.' USING ERRCODE = 'P0001'; END IF;
  IF p_dia IS NOT NULL AND (p_dia < v_semana OR p_dia > v_semana + 5) THEN RAISE EXCEPTION 'El día debe ser de lunes a sábado de esa semana.' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.central_plan_items SET
    estado      = CASE WHEN p_quitado IS NULL THEN estado WHEN p_quitado THEN 'quitado' ELSE 'propuesto' END,
    descripcion = coalesce(left(nullif(btrim(p_descripcion), ''), 300), descripcion),
    dia         = coalesce(p_dia, dia)
  WHERE id = p_item;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN RAISE EXCEPTION 'No se pudo cambiar la tarea.' USING ERRCODE = 'P0001'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.central_plan_item_cambiar(uuid, boolean, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_plan_item_cambiar(uuid, boolean, text, date) TO authenticated;

-- El dueño aprueba: lo ejecutable pasa a la cola (a las 7:30 a. m. de su día), lo humano queda "para ti". Devuelve cuántas.
CREATE OR REPLACE FUNCTION public.central_plan_aprobar(p_plan uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_est text; v_hoy date := (now() AT TIME ZONE 'America/Bogota')::date;
  it record; v_trabajo uuid; v_clave text; v_enc integer := 0; v_hum integer := 0; v_pasados integer := 0; v_ejec timestamptz;
BEGIN
  IF NOT public.central_autorizado() THEN RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501'; END IF;
  SELECT estado INTO v_est FROM public.central_plan_semanal WHERE id = p_plan FOR UPDATE;
  IF v_est IS NULL THEN RAISE EXCEPTION 'No existe ese plan.' USING ERRCODE = 'P0001'; END IF;
  IF v_est <> 'borrador' THEN RAISE EXCEPTION 'Ese plan ya fue decidido.' USING ERRCODE = 'P0001'; END IF;
  FOR it IN SELECT * FROM public.central_plan_items WHERE plan_id = p_plan AND estado = 'propuesto' ORDER BY dia, created_at LOOP
    IF it.tipo = 'tarea_humana' THEN
      UPDATE public.central_plan_items SET estado = 'para_ti' WHERE id = it.id; v_hum := v_hum + 1; CONTINUE;
    END IF;
    IF it.dia < v_hoy THEN v_pasados := v_pasados + 1; CONTINUE; END IF;               -- días que ya pasaron: no se encolan
    v_clave := CASE it.tipo WHEN 'investigar_prospectos' THEN 'inv:' ELSE 'nico:' END || it.autorizacion_id || ':' || it.dia;   -- misma clave que "Crear el trabajo de hoy": no se duplica
    v_ejec := ((it.dia::text || ' 12:30:00+00')::timestamptz);                         -- 7:30 a. m. en Bogotá
    INSERT INTO public.central_trabajos (tipo, agente_id, autorizacion_id, clave_idempotencia, ejecutar_en, vence_en, payload)
    VALUES (it.tipo, it.agente_id, it.autorizacion_id, v_clave, greatest(v_ejec, now()), greatest(v_ejec, now()) + interval '20 hours', jsonb_build_object('plan_item', it.id))
    ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING id INTO v_trabajo;
    IF v_trabajo IS NULL THEN SELECT id INTO v_trabajo FROM public.central_trabajos WHERE clave_idempotencia = v_clave; END IF;
    UPDATE public.central_plan_items SET estado = 'encolado', trabajo_id = v_trabajo WHERE id = it.id;
    v_enc := v_enc + 1; v_trabajo := NULL;
  END LOOP;
  UPDATE public.central_plan_semanal SET estado = 'aprobado', decidido_por = auth.uid(), decidido_en = now(), updated_at = now() WHERE id = p_plan;
  RETURN jsonb_build_object('encolados', v_enc, 'para_ti', v_hum, 'dias_pasados', v_pasados);
END;
$function$;
REVOKE ALL ON FUNCTION public.central_plan_aprobar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_plan_aprobar(uuid) TO authenticated;
