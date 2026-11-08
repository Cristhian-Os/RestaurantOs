-- Fidelización, campañas: ciclo completo borrador → aprobación → envío por WhatsApp.
--
--  * El restaurante PREPARA (administrador o cajero) y el ADMINISTRADOR APRUEBA. Nada sale sin esa aprobación.
--  * Solo se escribe a clientes con consentimiento de promociones por WhatsApp; BAJA siempre gana.
--  * Una campaña usa una plantilla de WhatsApp de categoría "marketing", activa y APROBADA por Meta. Nunca texto libre.
--  * Si WhatsApp está apagado o faltan credenciales, no se puede aprobar (no se simula nada).
--  * Tope de frecuencia: por defecto 1 promoción por cliente cada 7 días (configurable por restaurante).
--  * Al aprobar se encola un mensaje por cliente elegible (una sola vez), repartidos a 20 por minuto.
--  * Estados: borrador → pendiente_aprobacion → aprobada → enviando → enviada; también rechazada y cancelada.
--    (Se renombran en_curso → enviando y finalizada → enviada: esas tablas aún no existen en producción.)

-- ─── 1. Estados y columnas nuevas ───────────────────────────────────────────
ALTER TABLE public.fid_campanas DROP CONSTRAINT IF EXISTS fid_campanas_estado_check;
UPDATE public.fid_campanas SET estado = 'enviando' WHERE estado = 'en_curso';
UPDATE public.fid_campanas SET estado = 'enviada'  WHERE estado = 'finalizada';
ALTER TABLE public.fid_campanas ADD CONSTRAINT fid_campanas_estado_check
  CHECK (estado IN ('borrador','pendiente_aprobacion','aprobada','enviando','enviada','rechazada','cancelada'));

ALTER TABLE public.fid_campanas
  ADD COLUMN IF NOT EXISTS variables         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- variable de la plantilla → "@nombre" | "@restaurante" | "@puntos" | texto fijo
  ADD COLUMN IF NOT EXISTS programada_para   timestamptz,
  ADD COLUMN IF NOT EXISTS creado_por        uuid,
  ADD COLUMN IF NOT EXISTS solicitada_por    uuid,
  ADD COLUMN IF NOT EXISTS solicitada_at     timestamptz,
  ADD COLUMN IF NOT EXISTS rechazada_por     uuid,
  ADD COLUMN IF NOT EXISTS rechazada_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rechazo_motivo    text CHECK (rechazo_motivo IS NULL OR char_length(rechazo_motivo) <= 300),
  ADD COLUMN IF NOT EXISTS cancelada_por     uuid,
  ADD COLUMN IF NOT EXISTS cancelada_at      timestamptz,
  ADD COLUMN IF NOT EXISTS elegibles_al_aprobar int;

ALTER TABLE public.fid_campana_destinatarios DROP CONSTRAINT IF EXISTS fid_campana_destinatarios_estado_check;
ALTER TABLE public.fid_campana_destinatarios ADD CONSTRAINT fid_campana_destinatarios_estado_check
  CHECK (estado IN ('pendiente','encolado','enviado','entregado','respondio','omitido_sin_consentimiento','fallido','cancelado'));

-- Las campañas solo cambian de estado por las funciones de abajo (si no, un UPDATE directo se saltaría la aprobación).
DROP POLICY IF EXISTS "fid_campanas: crea el admin" ON public.fid_campanas;
DROP POLICY IF EXISTS "fid_campanas: edita el admin" ON public.fid_campanas;
REVOKE INSERT, UPDATE ON public.fid_campanas FROM authenticated;

-- ─── 2. Configuración por restaurante (tope de frecuencia) ──────────────────
CREATE TABLE IF NOT EXISTS public.fid_campanas_config (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  promo_max     int NOT NULL DEFAULT 1 CHECK (promo_max BETWEEN 1 AND 20),   -- máximo de promociones por cliente…
  promo_dias    int NOT NULL DEFAULT 7 CHECK (promo_dias BETWEEN 1 AND 90),  -- …dentro de esta cantidad de días
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fid_campanas_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_campanas_config FROM anon, authenticated;

-- ─── 3. Funciones internas ──────────────────────────────────────────────────
-- ¿Puede este restaurante enviar por WhatsApp? NULL = sí; si no, el motivo en palabras sencillas.
CREATE OR REPLACE FUNCTION public._wa_motivo_no_listo(p_rid uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c wa_config%ROWTYPE;
BEGIN
  SELECT * INTO c FROM wa_config WHERE restaurant_id = p_rid;
  IF NOT FOUND OR c.modo = 'desactivado' THEN RETURN 'WhatsApp está apagado en este restaurante. Se enciende en Configuración → WhatsApp.'; END IF;
  IF c.phone_number_id IS NULL OR c.numero_negocio IS NULL THEN RETURN 'Falta conectar el número de WhatsApp del negocio.'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM wa_credenciales k WHERE k.restaurant_id = p_rid)
          OR EXISTS (SELECT 1 FROM wa_plataforma WHERE access_token_id IS NOT NULL)) THEN
    RETURN 'Falta la llave de WhatsApp. La carga el equipo de RestaurantOS.';
  END IF;
  RETURN NULL;
END;
$$;

-- Valida y normaliza el público de la campaña.
CREATE OR REPLACE FUNCTION public._fid_seg_normalizar(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_tipo text := COALESCE(p->>'tipo', 'todos'); v_dias int; v_lim int; v_ids jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Público inválido'; END IF;
  IF v_tipo NOT IN ('todos','inactivos','mejores','cumple_semana','manual') THEN RAISE EXCEPTION 'Tipo de público inválido'; END IF;
  IF v_tipo = 'inactivos' THEN
    v_dias := COALESCE((p->>'dias')::int, 30);
    IF v_dias < 1 OR v_dias > 365 THEN RAISE EXCEPTION 'Los días sin venir deben estar entre 1 y 365'; END IF;
    RETURN jsonb_build_object('tipo', v_tipo, 'dias', v_dias);
  ELSIF v_tipo = 'mejores' THEN
    v_lim := COALESCE((p->>'limite')::int, 20);
    IF v_lim < 1 OR v_lim > 500 THEN RAISE EXCEPTION 'La cantidad de mejores clientes debe estar entre 1 y 500'; END IF;
    RETURN jsonb_build_object('tipo', v_tipo, 'limite', v_lim);
  ELSIF v_tipo = 'manual' THEN
    v_ids := COALESCE(p->'cliente_ids', '[]'::jsonb);
    IF jsonb_typeof(v_ids) <> 'array' OR jsonb_array_length(v_ids) > 500 THEN RAISE EXCEPTION 'La lista de clientes es inválida (máximo 500)'; END IF;
    PERFORM (e)::uuid FROM jsonb_array_elements_text(v_ids) e;
    RETURN jsonb_build_object('tipo', v_tipo, 'cliente_ids', v_ids);
  END IF;
  RETURN jsonb_build_object('tipo', v_tipo);
END;
$$;

-- Candidatos del público con el motivo de exclusión (NULL = elegible). Es la ÚNICA definición de "elegible":
-- la vista previa, la aprobación y las estadísticas usan esta misma función.
CREATE OR REPLACE FUNCTION public._fid_campana_candidatos(p_rid uuid, p_seg jsonb, p_campana_id uuid DEFAULT NULL)
 RETURNS TABLE (cliente_id uuid, nombre text, telefono text, motivo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE
  v_tipo text := COALESCE(p_seg->>'tipo', 'todos');
  v_dias int := COALESCE((p_seg->>'dias')::int, 30);
  v_lim  int := COALESCE((p_seg->>'limite')::int, 20);
  v_ids  uuid[] := ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(COALESCE(p_seg->'cliente_ids', '[]'::jsonb)) e);
  v_hoy  date := hoy_local();
  v_max  int := COALESCE((SELECT promo_max  FROM fid_campanas_config WHERE restaurant_id = p_rid), 1);
  v_vent int := COALESCE((SELECT promo_dias FROM fid_campanas_config WHERE restaurant_id = p_rid), 7);
BEGIN
  RETURN QUERY
  WITH seg AS (
    SELECT c.id, c.nombre, c.telefono, c.created_at, c.consentimiento_marketing AS cons, c.consentimiento_canal AS canal
      FROM clientes c
      LEFT JOIN fid_cuentas a ON a.cliente_id = c.id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN c.cumpleanos IS NULL THEN NULL ELSE
          (CASE WHEN make_date(extract(year FROM v_hoy)::int, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28)) >= v_hoy
                THEN make_date(extract(year FROM v_hoy)::int, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28))
                ELSE make_date(extract(year FROM v_hoy)::int + 1, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28)) END) - v_hoy END AS en_dias
      ) cu ON true
     WHERE c.restaurant_id = p_rid AND c.activo AND (
           v_tipo = 'todos'
        OR (v_tipo = 'inactivos' AND COALESCE(a.ultima_visita, c.created_at) < now() - make_interval(days => v_dias))
        OR (v_tipo = 'mejores' AND c.id IN (
              SELECT x.cliente_id FROM fid_acreditaciones x
               WHERE x.restaurant_id = p_rid AND x.reversada_at IS NULL AND x.created_at >= now() - interval '90 days'
               GROUP BY x.cliente_id ORDER BY sum(x.total) DESC LIMIT v_lim))
        OR (v_tipo = 'cumple_semana' AND cu.en_dias IS NOT NULL AND cu.en_dias <= 7)
        OR (v_tipo = 'manual' AND c.id = ANY (v_ids)))
  ), chk AS (
    SELECT s.*,
           CASE WHEN s.telefono IS NOT NULL AND EXISTS (SELECT 1 FROM wa_bajas b WHERE b.restaurant_id = p_rid AND b.telefono = s.telefono) THEN 'baja'
                WHEN NOT s.cons OR s.canal IS NULL OR s.canal NOT IN ('whatsapp','ambos') THEN 'sin_consentimiento'
                WHEN s.telefono IS NULL OR s.telefono !~ '^[0-9]{8,15}$' THEN 'sin_telefono' END AS m1
      FROM seg s
  ), dup AS (
    SELECT k.id, row_number() OVER (PARTITION BY k.telefono ORDER BY k.created_at, k.id) AS rn FROM chk k WHERE k.m1 IS NULL
  ), freq AS (
    SELECT c2.telefono, count(*) AS n
      FROM fid_campana_destinatarios d
      JOIN wa_mensajes m ON m.id = d.mensaje_id
      JOIN clientes c2 ON c2.id = d.cliente_id
     WHERE d.restaurant_id = p_rid AND d.campana_id IS DISTINCT FROM p_campana_id
       AND m.estado <> 'fallido' AND m.programado_para >= now() - make_interval(days => v_vent)
     GROUP BY c2.telefono
  )
  SELECT k.id, k.nombre, k.telefono,
         COALESCE(k.m1, CASE WHEN d.rn > 1 THEN 'duplicado' WHEN COALESCE(f.n, 0) >= v_max THEN 'tope_frecuencia' END)
    FROM chk k LEFT JOIN dup d ON d.id = k.id LEFT JOIN freq f ON f.telefono = k.telefono;
END;
$$;

-- Sincroniza el avance de una campaña con lo que pasó en la cola de WhatsApp.
CREATE OR REPLACE FUNCTION public._fid_campana_refrescar(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE fid_campana_destinatarios d SET estado = n.nuevo
    FROM wa_mensajes m, LATERAL (SELECT CASE m.estado WHEN 'fallido' THEN 'fallido' WHEN 'en_cola' THEN 'encolado' WHEN 'enviando' THEN 'encolado'
                                                       WHEN 'enviado' THEN 'enviado' ELSE 'entregado' END AS nuevo) n
   WHERE d.campana_id = p_id AND m.id = d.mensaje_id AND d.estado NOT IN ('cancelado','omitido_sin_consentimiento','respondio') AND d.estado <> n.nuevo;
  UPDATE fid_campanas SET estado = 'enviando' WHERE id = p_id AND estado = 'aprobada' AND (programada_para IS NULL OR programada_para <= now());
  UPDATE fid_campanas SET estado = 'enviada'  WHERE id = p_id AND estado = 'enviando'
     AND NOT EXISTS (SELECT 1 FROM wa_mensajes WHERE campana_id = p_id AND estado IN ('en_cola','enviando'));
END;
$$;

-- Valores de las variables de la plantilla para un cliente.
CREATE OR REPLACE FUNCTION public._fid_campana_valores(p_variables jsonb, p_nombre text, p_restaurante text, p_puntos int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(k, CASE v
           WHEN '@nombre' THEN COALESCE(NULLIF(split_part(btrim(COALESCE(p_nombre, '')), ' ', 1), ''), 'cliente')
           WHEN '@nombre_completo' THEN COALESCE(NULLIF(btrim(p_nombre), ''), 'cliente')
           WHEN '@restaurante' THEN p_restaurante
           WHEN '@puntos' THEN COALESCE(p_puntos, 0)::text
           ELSE v END), '{}'::jsonb)
    FROM jsonb_each_text(COALESCE(p_variables, '{}'::jsonb)) t(k, v);
$$;

-- Cuando un mensaje de campaña sale de verdad, queda en la línea de tiempo del cliente.
CREATE OR REPLACE FUNCTION public._fid_campana_registrar_envio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO cliente_interacciones (restaurant_id, cliente_id, canal, tipo, resumen, ref_tipo, ref_id)
  SELECT d.restaurant_id, d.cliente_id, 'whatsapp', 'campana', left('Campaña «' || c.nombre || '»: mensaje enviado por WhatsApp', 500), 'campana', c.id
    FROM fid_campana_destinatarios d JOIN fid_campanas c ON c.id = d.campana_id
   WHERE d.mensaje_id = NEW.id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS wa_mensajes_campana_envio ON public.wa_mensajes;
CREATE TRIGGER wa_mensajes_campana_envio AFTER UPDATE OF estado ON public.wa_mensajes FOR EACH ROW
  WHEN (NEW.origen = 'campana' AND NEW.estado IN ('enviado','entregado','leido') AND OLD.estado IN ('en_cola','enviando'))
  EXECUTE FUNCTION public._fid_campana_registrar_envio();

-- ─── 4. Funciones para la pantalla (administrador y cajero) ─────────────────
-- ¿Se puede enviar por WhatsApp? Para avisar antes de que alguien arme una campaña que no podrá salir.
CREATE OR REPLACE FUNCTION public.fid_campanas_whatsapp_estado() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_mot text;
BEGIN
  IF v_rid IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_mot := _wa_motivo_no_listo(v_rid);
  RETURN jsonb_build_object('puede_enviar', v_mot IS NULL, 'motivo', v_mot,
    'plantillas_aprobadas', (SELECT count(*) FROM wa_plantillas WHERE restaurant_id = v_rid AND categoria = 'marketing' AND activa AND estado_meta = 'aprobada'));
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_campanas_config_obtener() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN jsonb_build_object(
    'promo_max',  COALESCE((SELECT promo_max  FROM fid_campanas_config WHERE restaurant_id = v_rid), 1),
    'promo_dias', COALESCE((SELECT promo_dias FROM fid_campanas_config WHERE restaurant_id = v_rid), 7));
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_campanas_config_guardar(p_promo_max int, p_promo_dias int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador cambia el tope de promociones'; END IF;
  IF p_promo_max IS NULL OR p_promo_max NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'El máximo de promociones debe estar entre 1 y 20'; END IF;
  IF p_promo_dias IS NULL OR p_promo_dias NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Los días deben estar entre 1 y 90'; END IF;
  INSERT INTO fid_campanas_config (restaurant_id, promo_max, promo_dias) VALUES (v_rid, p_promo_max, p_promo_dias)
  ON CONFLICT (restaurant_id) DO UPDATE SET promo_max = EXCLUDED.promo_max, promo_dias = EXCLUDED.promo_dias, updated_at = now();
  PERFORM _fid_audit(v_rid, 'campanas_tope_cambiado', 'campana', NULL, jsonb_build_object('promo_max', p_promo_max, 'promo_dias', p_promo_dias));
END;
$$;

-- Cuántas personas recibirían la campaña y por qué se excluye al resto (solo números, nunca nombres).
CREATE OR REPLACE FUNCTION public.fid_campana_audiencia(p_segmento jsonb, p_campana_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_seg jsonb;
BEGIN
  IF v_rid IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_seg := _fid_seg_normalizar(p_segmento);
  RETURN (SELECT jsonb_build_object(
      'en_publico', count(*),
      'elegibles', count(*) FILTER (WHERE motivo IS NULL),
      'excluidos', jsonb_build_object(
        'sin_consentimiento', count(*) FILTER (WHERE motivo = 'sin_consentimiento'),
        'baja',               count(*) FILTER (WHERE motivo = 'baja'),
        'sin_telefono',       count(*) FILTER (WHERE motivo = 'sin_telefono'),
        'duplicado',          count(*) FILTER (WHERE motivo = 'duplicado'),
        'tope_frecuencia',    count(*) FILTER (WHERE motivo = 'tope_frecuencia')))
    FROM _fid_campana_candidatos(v_rid, v_seg, p_campana_id));
END;
$$;

-- Texto de la plantilla ya con las variables puestas, para un cliente de muestra (o uno elegido).
CREATE OR REPLACE FUNCTION public.fid_campana_vista_previa(p_plantilla_id uuid, p_variables jsonb DEFAULT '{}'::jsonb, p_cliente_id uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); t wa_plantillas%ROWTYPE; v_vals jsonb; v_txt text; v_nom text := 'Ana María'; v_pts int := 120; v_resto text; i int;
BEGIN
  IF v_rid IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO t FROM wa_plantillas WHERE id = p_plantilla_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plantilla no encontrada'; END IF;
  IF p_cliente_id IS NOT NULL THEN
    SELECT c.nombre, COALESCE(a.puntos_saldo, 0) INTO v_nom, v_pts FROM clientes c LEFT JOIN fid_cuentas a ON a.cliente_id = c.id
     WHERE c.id = p_cliente_id AND c.restaurant_id = v_rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  END IF;
  SELECT name INTO v_resto FROM restaurants WHERE id = v_rid;
  v_vals := _fid_campana_valores(p_variables, v_nom, v_resto, v_pts);
  v_txt := t.cuerpo;
  FOR i IN 1 .. COALESCE(array_length(t.variables, 1), 0) LOOP
    v_txt := replace(v_txt, '{{' || i || '}}', COALESCE(NULLIF(v_vals->>t.variables[i], ''), '[' || t.variables[i] || ']'));
  END LOOP;
  RETURN v_txt;
END;
$$;

-- Crear (p_id NULL) o editar un borrador. Administrador: cualquiera. Cajero: solo los suyos.
CREATE OR REPLACE FUNCTION public.fid_campana_guardar(
  p_id uuid, p_nombre text, p_objetivo text, p_segmento jsonb, p_plantilla_id uuid, p_variables jsonb, p_programada_para timestamptz)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c fid_campanas%ROWTYPE; t wa_plantillas%ROWTYPE;
        v_seg jsonb; v_vars jsonb := COALESCE(p_variables, '{}'::jsonb); v_id uuid; k text; v text;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero preparan campañas'; END IF;
  IF char_length(btrim(COALESCE(p_nombre, ''))) < 2 THEN RAISE EXCEPTION 'Ponle un nombre a la campaña'; END IF;
  IF char_length(btrim(p_nombre)) > 100 THEN RAISE EXCEPTION 'El nombre es muy largo (máximo 100 letras)'; END IF;
  IF p_objetivo IS NOT NULL AND char_length(p_objetivo) > 400 THEN RAISE EXCEPTION 'El objetivo es muy largo (máximo 400 letras)'; END IF;
  v_seg := _fid_seg_normalizar(p_segmento);
  IF jsonb_typeof(v_vars) <> 'object' THEN RAISE EXCEPTION 'Variables inválidas'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each_text(v_vars) LOOP
    IF char_length(v) > 200 THEN RAISE EXCEPTION 'El texto de "%" es muy largo (máximo 200 letras)', k; END IF;
    IF left(v, 1) = '@' AND v NOT IN ('@nombre','@nombre_completo','@restaurante','@puntos') THEN RAISE EXCEPTION 'Dato "%" no reconocido', v; END IF;
  END LOOP;
  IF p_plantilla_id IS NOT NULL THEN
    SELECT * INTO t FROM wa_plantillas WHERE id = p_plantilla_id AND restaurant_id = v_rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plantilla no encontrada'; END IF;
    IF t.categoria <> 'marketing' OR NOT t.activa OR t.estado_meta <> 'aprobada' THEN
      RAISE EXCEPTION 'La plantilla debe ser de promoción, estar activa y aprobada por WhatsApp (Meta)';
    END IF;
  END IF;
  IF p_programada_para IS NOT NULL AND p_programada_para <= now() THEN RAISE EXCEPTION 'La fecha de envío debe ser futura'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO fid_campanas (restaurant_id, nombre, objetivo, segmento, canal, plantilla_id, variables, programada_para, estado, propuesta_por, creado_por)
    VALUES (v_rid, btrim(p_nombre), NULLIF(btrim(COALESCE(p_objetivo, '')), ''), v_seg, 'whatsapp', p_plantilla_id, v_vars, p_programada_para, 'borrador', 'admin', auth.uid())
    RETURNING id INTO v_id;
    PERFORM _fid_audit(v_rid, 'campana_creada', 'campana', v_id, jsonb_build_object('nombre', btrim(p_nombre)));
    RETURN v_id;
  END IF;

  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  IF v_rol = 'cashier' AND c.creado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo puedes editar tus propias campañas'; END IF;
  IF c.estado NOT IN ('borrador','rechazada') THEN RAISE EXCEPTION 'Solo se edita una campaña en borrador o rechazada'; END IF;
  UPDATE fid_campanas SET nombre = btrim(p_nombre), objetivo = NULLIF(btrim(COALESCE(p_objetivo, '')), ''), segmento = v_seg,
         plantilla_id = p_plantilla_id, variables = v_vars, programada_para = p_programada_para, mensaje = NULL,
         estado = 'borrador', rechazo_motivo = NULL, rechazada_por = NULL, rechazada_at = NULL
   WHERE id = c.id;
  PERFORM _fid_audit(v_rid, 'campana_editada', 'campana', c.id, '{}'::jsonb);
  RETURN c.id;
END;
$$;

-- Revisa que la campaña esté completa y se pueda enviar. Devuelve la plantilla; lanza el motivo si no.
CREATE OR REPLACE FUNCTION public._fid_campana_validar_envio(c fid_campanas) RETURNS wa_plantillas LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t wa_plantillas%ROWTYPE; v_mot text; n text;
BEGIN
  IF c.canal <> 'whatsapp' THEN RAISE EXCEPTION 'Por ahora las campañas solo salen por WhatsApp'; END IF;
  v_mot := _wa_motivo_no_listo(c.restaurant_id);
  IF v_mot IS NOT NULL THEN RAISE EXCEPTION '%', v_mot; END IF;
  IF c.plantilla_id IS NULL THEN RAISE EXCEPTION 'Elige la plantilla de WhatsApp de la campaña'; END IF;
  SELECT * INTO t FROM wa_plantillas WHERE id = c.plantilla_id AND restaurant_id = c.restaurant_id;
  IF NOT FOUND OR t.categoria <> 'marketing' OR NOT t.activa OR t.estado_meta <> 'aprobada' THEN
    RAISE EXCEPTION 'La plantilla ya no está activa y aprobada por WhatsApp (Meta). Elige otra.';
  END IF;
  FOREACH n IN ARRAY t.variables LOOP
    IF NULLIF(btrim(COALESCE(c.variables->>n, '')), '') IS NULL THEN RAISE EXCEPTION 'Falta llenar la variable "%" de la plantilla', n; END IF;
  END LOOP;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_campana_enviar_a_aprobacion(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c fid_campanas%ROWTYPE; v_n int;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero envían campañas a aprobación'; END IF;
  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  IF v_rol = 'cashier' AND c.creado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo puedes enviar a aprobación tus propias campañas'; END IF;
  IF c.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se envía a aprobación una campaña en borrador'; END IF;
  PERFORM _fid_campana_validar_envio(c);
  SELECT count(*) INTO v_n FROM _fid_campana_candidatos(v_rid, c.segmento, c.id) WHERE motivo IS NULL;
  IF v_n = 0 THEN RAISE EXCEPTION 'Ningún cliente cumple las condiciones para recibir esta campaña'; END IF;
  UPDATE fid_campanas SET estado = 'pendiente_aprobacion', solicitada_por = auth.uid(), solicitada_at = now() WHERE id = c.id;
  PERFORM _fid_audit(v_rid, 'campana_a_aprobacion', 'campana', c.id, jsonb_build_object('elegibles', v_n));
  RETURN jsonb_build_object('estado', 'pendiente_aprobacion', 'elegibles', v_n);
END;
$$;

-- Aprobar (solo administrador): encola UN mensaje por cliente elegible, a 20 por minuto. Repetirla no vuelve a encolar.
DROP FUNCTION IF EXISTS public.fid_campana_aprobar(uuid);
CREATE FUNCTION public.fid_campana_aprobar(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); c fid_campanas%ROWTYPE; t wa_plantillas%ROWTYPE; r record; v_resto text;
        v_base timestamptz; v_i int := 0; v_msg uuid; v_ins int; v_estado text;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador aprueba campañas'; END IF;
  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  IF c.estado IN ('aprobada','enviando','enviada') THEN
    RETURN jsonb_build_object('estado', c.estado, 'encolados', 0, 'ya_aprobada', true,
                              'elegibles', COALESCE(c.elegibles_al_aprobar, 0));
  END IF;
  IF c.estado NOT IN ('borrador','pendiente_aprobacion') THEN RAISE EXCEPTION 'Esta campaña está %: no se puede aprobar', replace(c.estado, '_', ' '); END IF;
  t := _fid_campana_validar_envio(c);
  SELECT name INTO v_resto FROM restaurants WHERE id = v_rid;
  v_base := GREATEST(now(), COALESCE(c.programada_para, now()));

  FOR r IN SELECT k.cliente_id, k.nombre, k.telefono, COALESCE(a.puntos_saldo, 0) AS puntos
             FROM _fid_campana_candidatos(v_rid, c.segmento, c.id) k LEFT JOIN fid_cuentas a ON a.cliente_id = k.cliente_id
            WHERE k.motivo IS NULL ORDER BY k.cliente_id LOOP
    INSERT INTO fid_campana_destinatarios (restaurant_id, campana_id, cliente_id, estado) VALUES (v_rid, c.id, r.cliente_id, 'pendiente')
    ON CONFLICT (campana_id, cliente_id) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    CONTINUE WHEN v_ins = 0;
    v_msg := _wa_encolar(v_rid, r.telefono, 'cliente', r.cliente_id, NULL, 'plantilla',
               jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma, 'vars', _fid_campana_valores(c.variables, r.nombre, v_resto, r.puntos)),
               t.id, 'campana');
    IF v_msg IS NULL THEN RAISE EXCEPTION 'WhatsApp no aceptó el mensaje en cola; no se aprobó la campaña'; END IF;
    UPDATE wa_mensajes SET campana_id = c.id, programado_para = v_base + make_interval(secs => (v_i / 20) * 60) WHERE id = v_msg;
    UPDATE fid_campana_destinatarios SET estado = 'encolado', mensaje_id = v_msg WHERE campana_id = c.id AND cliente_id = r.cliente_id;
    v_i := v_i + 1;
  END LOOP;

  IF v_i = 0 THEN RAISE EXCEPTION 'Ningún cliente cumple las condiciones para recibir esta campaña'; END IF;
  v_estado := CASE WHEN c.programada_para IS NOT NULL AND c.programada_para > now() THEN 'aprobada' ELSE 'enviando' END;
  UPDATE fid_campanas SET estado = v_estado, aprobada_por = auth.uid(), aprobada_at = now(), elegibles_al_aprobar = v_i WHERE id = c.id;
  PERFORM _fid_audit(v_rid, 'campana_aprobada', 'campana', c.id, jsonb_build_object('encolados', v_i));
  RETURN jsonb_build_object('estado', v_estado, 'encolados', v_i, 'ya_aprobada', false, 'elegibles', v_i);
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_campana_rechazar(p_id uuid, p_motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); c fid_campanas%ROWTYPE; v_mot text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador rechaza campañas'; END IF;
  IF char_length(v_mot) < 3 THEN RAISE EXCEPTION 'Escribe el motivo del rechazo'; END IF;
  IF char_length(v_mot) > 300 THEN RAISE EXCEPTION 'El motivo es muy largo (máximo 300 letras)'; END IF;
  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  IF c.estado <> 'pendiente_aprobacion' THEN RAISE EXCEPTION 'Solo se rechaza una campaña que está por aprobar'; END IF;
  UPDATE fid_campanas SET estado = 'rechazada', rechazo_motivo = v_mot, rechazada_por = auth.uid(), rechazada_at = now() WHERE id = c.id;
  PERFORM _fid_audit(v_rid, 'campana_rechazada', 'campana', c.id, jsonb_build_object('motivo', v_mot));
END;
$$;

-- Cancelar: detiene lo que aún está en cola. Lo ya enviado no se puede deshacer.
-- Administrador: cualquier campaña no terminada. Cajero: solo las suyas, antes de la aprobación.
CREATE OR REPLACE FUNCTION public.fid_campana_cancelar(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c fid_campanas%ROWTYPE; v_det int := 0;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero cancelan campañas'; END IF;
  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  IF c.estado = 'cancelada' THEN RETURN jsonb_build_object('estado', 'cancelada', 'detenidos', 0); END IF;
  IF c.estado = 'enviada' THEN RAISE EXCEPTION 'La campaña ya se envió completa'; END IF;
  IF v_rol = 'cashier' THEN
    IF c.creado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo puedes cancelar tus propias campañas'; END IF;
    IF c.estado NOT IN ('borrador','pendiente_aprobacion','rechazada') THEN RAISE EXCEPTION 'Una campaña aprobada solo la cancela el administrador'; END IF;
  END IF;
  UPDATE wa_mensajes SET estado = 'fallido', error = 'Campaña cancelada' WHERE campana_id = c.id AND estado = 'en_cola';
  GET DIAGNOSTICS v_det = ROW_COUNT;
  UPDATE fid_campana_destinatarios d SET estado = 'cancelado'
    FROM wa_mensajes m WHERE m.id = d.mensaje_id AND d.campana_id = c.id AND m.estado = 'fallido' AND m.error = 'Campaña cancelada';
  UPDATE fid_campanas SET estado = 'cancelada', cancelada_por = auth.uid(), cancelada_at = now() WHERE id = c.id;
  PERFORM _fid_audit(v_rid, 'campana_cancelada', 'campana', c.id, jsonb_build_object('detenidos', v_det));
  RETURN jsonb_build_object('estado', 'cancelada', 'detenidos', v_det);
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_campana_estadisticas(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); c fid_campanas%ROWTYPE; r jsonb; v_eleg int;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO c FROM fid_campanas WHERE id = p_id AND restaurant_id = v_rid;
  IF NOT FOUND OR (v_rol = 'cashier' AND c.creado_por IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
  PERFORM _fid_campana_refrescar(c.id);
  SELECT * INTO c FROM fid_campanas WHERE id = p_id;
  IF c.aprobada_at IS NULL THEN
    SELECT count(*) INTO v_eleg FROM _fid_campana_candidatos(v_rid, c.segmento, c.id) WHERE motivo IS NULL;
  ELSE
    SELECT count(*) INTO v_eleg FROM fid_campana_destinatarios WHERE campana_id = c.id;
  END IF;
  SELECT jsonb_build_object(
      'estado', c.estado,
      'elegibles', v_eleg,
      'en_cola',    count(*) FILTER (WHERE m.estado IN ('en_cola','enviando')),
      'enviados',   count(*) FILTER (WHERE m.estado IN ('enviado','entregado','leido')),
      'entregados', count(*) FILTER (WHERE m.estado IN ('entregado','leido')),
      'leidos',     count(*) FILTER (WHERE m.estado = 'leido'),
      'fallidos',   count(*) FILTER (WHERE m.estado = 'fallido' AND m.error IS DISTINCT FROM 'Campaña cancelada'),
      'cancelados', count(*) FILTER (WHERE m.estado = 'fallido' AND m.error = 'Campaña cancelada'),
      'bajas_posteriores', (SELECT count(*) FROM fid_campana_destinatarios d JOIN clientes cl ON cl.id = d.cliente_id
                             JOIN wa_bajas b ON b.restaurant_id = d.restaurant_id AND b.telefono = cl.telefono
                            WHERE d.campana_id = c.id AND c.aprobada_at IS NOT NULL AND b.created_at >= c.aprobada_at))
    INTO r FROM wa_mensajes m WHERE m.campana_id = c.id;
  RETURN r;
END;
$$;

-- Lista de campañas. Administrador: todas. Cajero: las suyas.
CREATE OR REPLACE FUNCTION public.fid_campanas_lista() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); x record;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  FOR x IN SELECT id FROM fid_campanas WHERE restaurant_id = v_rid AND estado IN ('aprobada','enviando') LOOP
    PERFORM _fid_campana_refrescar(x.id);
  END LOOP;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'objetivo', c.objetivo, 'segmento', c.segmento, 'plantilla_id', c.plantilla_id,
      'plantilla_nombre', t.nombre, 'variables', c.variables, 'estado', c.estado, 'programada_para', c.programada_para,
      'rechazo_motivo', c.rechazo_motivo, 'creado_por_yo', c.creado_por IS NOT DISTINCT FROM auth.uid(),
      'created_at', c.created_at, 'solicitada_at', c.solicitada_at, 'aprobada_at', c.aprobada_at,
      'elegibles_al_aprobar', c.elegibles_al_aprobar) ORDER BY c.created_at DESC)
    FROM fid_campanas c LEFT JOIN wa_plantillas t ON t.id = c.plantilla_id
   WHERE c.restaurant_id = v_rid AND (v_rol = 'admin' OR c.creado_por IS NOT DISTINCT FROM auth.uid())), '[]'::jsonb);
END;
$$;

-- ─── 5. Permisos ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._wa_motivo_no_listo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_seg_normalizar(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_campana_candidatos(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_campana_refrescar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_campana_valores(jsonb, text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_campana_registrar_envio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fid_campana_validar_envio(fid_campanas) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fid_campanas_whatsapp_estado() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campanas_config_obtener() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campanas_config_guardar(int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_audiencia(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_vista_previa(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_guardar(uuid, text, text, jsonb, uuid, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_enviar_a_aprobacion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_aprobar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_rechazar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_cancelar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_estadisticas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campanas_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fid_campanas_whatsapp_estado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campanas_config_obtener() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campanas_config_guardar(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_audiencia(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_vista_previa(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_guardar(uuid, text, text, jsonb, uuid, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_enviar_a_aprobacion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_aprobar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_rechazar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_cancelar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_estadisticas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campanas_lista() TO authenticated;
