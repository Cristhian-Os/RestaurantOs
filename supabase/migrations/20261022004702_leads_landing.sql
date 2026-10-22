-- Módulo D (prompt maestro Resti): Resti vendedor en la landing guarda los datos de quien quiere comprar.
-- * leads: RLS activa y SIN políticas: nadie la toca directo. Se inserta solo con registrar_lead (la ejecuta únicamente la
--   Edge Function con service_role) y se lee solo con plataforma_leads (dueño de la plataforma con 2 pasos, aal2).
-- * registrar_lead: un mismo WhatsApp en 24 h actualiza el lead en vez de duplicarlo; límite por IP (hash) dentro de la función.
-- Aditiva: tabla y funciones nuevas. Reversa: supabase/rollback/20261022004702_leads_landing_down.sql

CREATE TABLE IF NOT EXISTS public.leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  nombre       text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  restaurante  text CHECK (restaurante IS NULL OR char_length(restaurante) <= 120),
  ciudad       text CHECK (ciudad IS NULL OR char_length(ciudad) <= 80),
  whatsapp     text NOT NULL CHECK (whatsapp ~ '^[0-9]{7,15}$'),
  tipo_negocio text CHECK (tipo_negocio IS NULL OR char_length(tipo_negocio) <= 60),
  mesas        integer CHECK (mesas IS NULL OR mesas BETWEEN 0 AND 1000),
  interes      text NOT NULL DEFAULT 'otro' CHECK (interes IN ('esencial', 'pro', 'multisede', 'otro')),
  resumen      text CHECK (resumen IS NULL OR char_length(resumen) <= 1000),
  ref          text CHECK (ref IS NULL OR ref ~ '^[A-Za-z0-9_-]{1,40}$'),
  ip_hash      text,
  estado       text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'contactado', 'descartado'))
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leads_whatsapp_idx ON public.leads (whatsapp, created_at DESC);

CREATE OR REPLACE FUNCTION public.registrar_lead(p_nombre text, p_whatsapp text, p_restaurante text DEFAULT NULL, p_ciudad text DEFAULT NULL,
  p_tipo_negocio text DEFAULT NULL, p_mesas integer DEFAULT NULL, p_interes text DEFAULT 'otro', p_resumen text DEFAULT NULL,
  p_ref text DEFAULT NULL, p_ip_hash text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'); v_id uuid; v_nuevo boolean := true;
BEGIN
  IF length(v_wa) = 10 AND v_wa LIKE '3%' THEN v_wa := '57' || v_wa; END IF;   -- celular colombiano escrito sin indicativo
  IF p_ip_hash IS NOT NULL AND NOT public.check_rate_limit('lead:' || p_ip_hash, 5, 3600) THEN RAISE EXCEPTION 'Demasiados intentos, espera un momento'; END IF;
  SELECT id INTO v_id FROM leads WHERE whatsapp = v_wa AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    v_nuevo := false;
    UPDATE leads SET updated_at = now(), nombre = btrim(p_nombre), restaurante = coalesce(nullif(btrim(p_restaurante), ''), restaurante),
      ciudad = coalesce(nullif(btrim(p_ciudad), ''), ciudad), tipo_negocio = coalesce(nullif(btrim(p_tipo_negocio), ''), tipo_negocio),
      mesas = coalesce(p_mesas, mesas), interes = coalesce(p_interes, interes), resumen = coalesce(nullif(btrim(p_resumen), ''), resumen)
     WHERE id = v_id;
  ELSE
    INSERT INTO leads (nombre, whatsapp, restaurante, ciudad, tipo_negocio, mesas, interes, resumen, ref, ip_hash)
    VALUES (btrim(p_nombre), v_wa, nullif(btrim(p_restaurante), ''), nullif(btrim(p_ciudad), ''), nullif(btrim(p_tipo_negocio), ''), p_mesas,
            coalesce(p_interes, 'otro'), nullif(btrim(p_resumen), ''), nullif(btrim(p_ref), ''), p_ip_hash)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'nuevo', v_nuevo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_leads(p_limite integer DEFAULT 200)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(l) - 'ip_hash' ORDER BY l.created_at DESC)
                     FROM (SELECT * FROM leads ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limite, 200), 1), 500)) l), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_marcar_lead(p_id uuid, p_estado text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  IF p_estado NOT IN ('nuevo', 'contactado', 'descartado') THEN RAISE EXCEPTION 'Estado no valido'; END IF;
  UPDATE leads SET estado = p_estado, updated_at = now() WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_lead(text, text, text, text, text, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_lead(text, text, text, text, text, integer, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.plataforma_leads(integer), public.plataforma_marcar_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_leads(integer), public.plataforma_marcar_lead(uuid, text) TO authenticated;
