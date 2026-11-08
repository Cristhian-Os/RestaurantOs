-- Fidelización · configuración de premios, canje con stock, corte mensual y asistente ARM (generador de sugerencias).
-- Diseño: docs/informes/FIDELIZACION_ARQUITECTURA.md + docs/informes/FIDELIZACION_CORTE_MENSUAL.md
--
--  * Se reutilizan las tablas existentes. Solo se agregan: nombre del club, vencimiento opcional de puntos, stock de recompensas,
--    clave de deduplicación de propuestas del ARM y la tabla del registro de cortes (fid_cortes).
--  * Funciones con la MISMA firma que antes (fid_canjear, fid_anular_canje, fid_tarjeta_publica): se reemplazan, no se duplican.
--  * "Hoy" siempre con hoy_local() (America/Bogota). Nada se programa aquí: el corte automático está documentado, no activado.

-- ─── Columnas nuevas ────────────────────────────────────────────────────────
ALTER TABLE public.fid_programas
  ADD COLUMN IF NOT EXISTS nombre_club text CHECK (nombre_club IS NULL OR char_length(btrim(nombre_club)) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS meses_vencimiento int CHECK (meses_vencimiento IS NULL OR meses_vencimiento BETWEEN 1 AND 60); -- NULL = los puntos no vencen

ALTER TABLE public.fid_recompensas
  ADD COLUMN IF NOT EXISTS stock int CHECK (stock IS NULL OR stock >= 0);   -- NULL = sin límite de existencias

ALTER TABLE public.arm_acciones ADD COLUMN IF NOT EXISTS clave text CHECK (clave IS NULL OR char_length(clave) <= 80);
-- Una sola propuesta pendiente por clave y restaurante (la misma sugerencia no se repite mientras espera decisión).
CREATE UNIQUE INDEX IF NOT EXISTS arm_acciones_clave_pendiente_uq ON public.arm_acciones (restaurant_id, clave)
  WHERE clave IS NOT NULL AND estado = 'propuesta';

-- ─── Registro de cortes mensuales ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fid_cortes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  mes                date NOT NULL CHECK (extract(day FROM mes) = 1),      -- primer día del mes que se cerró
  origen             text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','automatico')),
  ejecutado_por      uuid,
  ejecutado_at       timestamptz NOT NULL DEFAULT now(),
  clientes_expirados int NOT NULL DEFAULT 0,
  puntos_expirados   int NOT NULL DEFAULT 0,
  niveles_cambiados  int NOT NULL DEFAULT 0,
  resumen            jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (restaurant_id, mes)                                             -- el mismo mes no se cierra dos veces
);
ALTER TABLE public.fid_cortes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_cortes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_cortes FROM authenticated;
CREATE POLICY "fid_cortes: lee el admin" ON public.fid_cortes FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
-- (Sin bloqueo de UPDATE: el corte se reclama primero y se completa despues en la misma transaccion; ninguna sesion de usuario puede escribir aqui.)

-- ═════════════════════════ CANJE (mismas firmas; agrega stock) ═════════════════════════
CREATE OR REPLACE FUNCTION public.fid_canjear(p_cliente_id uuid, p_recompensa_id uuid, p_order_id uuid DEFAULT NULL, p_clave text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_clave text := COALESCE(NULLIF(btrim(p_clave), ''), gen_random_uuid()::text);
  r fid_recompensas%ROWTYPE; a fid_cuentas%ROWTYPE; v_req int; v_usados int; v_red uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero aplican recompensas'; END IF;
  SELECT id INTO v_red FROM fid_redenciones WHERE restaurant_id = v_rid AND clave = v_clave;
  IF FOUND THEN RETURN v_red; END IF;

  SELECT * INTO r FROM fid_recompensas WHERE id = p_recompensa_id AND restaurant_id = v_rid AND activa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa recompensa no está disponible'; END IF;
  IF (r.vigente_desde IS NOT NULL AND r.vigente_desde > now()) OR (r.vigente_hasta IS NOT NULL AND r.vigente_hasta < now()) THEN
    RAISE EXCEPTION 'Esa recompensa está fuera de vigencia';
  END IF;
  IF r.stock IS NOT NULL AND r.stock <= 0 THEN RAISE EXCEPTION 'Esa recompensa está agotada'; END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = p_cliente_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND activo) THEN RAISE EXCEPTION 'El cliente está desactivado'; END IF;
  IF r.nivel_minimo_id IS NOT NULL THEN
    SELECT puntos_minimos INTO v_req FROM fid_niveles WHERE id = r.nivel_minimo_id;
    IF a.puntos_historicos < COALESCE(v_req, 0) THEN RAISE EXCEPTION 'El cliente aún no alcanza el nivel de esta recompensa'; END IF;
  END IF;
  IF r.limite_por_cliente IS NOT NULL THEN
    SELECT count(*) INTO v_usados FROM fid_redenciones WHERE cliente_id = p_cliente_id AND recompensa_id = r.id AND estado = 'aplicada';
    IF v_usados >= r.limite_por_cliente THEN RAISE EXCEPTION 'El cliente ya usó esta recompensa el máximo de veces'; END IF;
  END IF;
  IF (r.unidad = 'puntos' AND a.puntos_saldo < r.costo) OR (r.unidad = 'sellos' AND a.sellos_saldo < r.costo) THEN
    RAISE EXCEPTION 'El cliente no tiene % suficientes', r.unidad;
  END IF;

  IF r.stock IS NOT NULL THEN UPDATE fid_recompensas SET stock = stock - 1 WHERE id = r.id; END IF;
  INSERT INTO fid_redenciones (restaurant_id, cliente_id, recompensa_id, unidad, costo, order_id, clave, creado_por)
  VALUES (v_rid, p_cliente_id, r.id, r.unidad, r.costo, p_order_id, v_clave, auth.uid()) RETURNING id INTO v_red;
  INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, order_id, motivo, idempotency_key, creado_por)
  VALUES (v_rid, p_cliente_id, 'canje', r.unidad, -r.costo, p_order_id, 'Canje: ' || r.nombre, 'canje:' || v_red, auth.uid());
  PERFORM _fid_audit(v_rid, 'canje_aplicado', 'redencion', v_red, jsonb_build_object('recompensa', r.nombre, 'costo', r.costo, 'unidad', r.unidad));
  RETURN v_red;
END;
$$;

CREATE OR REPLACE FUNCTION public.fid_anular_canje(p_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); x fid_redenciones%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador anula canjes'; END IF;
  IF char_length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO x FROM fid_redenciones WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canje no encontrado'; END IF;
  IF x.estado = 'anulada' THEN RAISE EXCEPTION 'El canje ya estaba anulado'; END IF;
  UPDATE fid_redenciones SET estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo) WHERE id = x.id;
  INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, motivo, idempotency_key, creado_por)
  VALUES (v_rid, x.cliente_id, 'reversa_canje', x.unidad, x.costo, 'Canje anulado: ' || btrim(p_motivo), 'revcanje:' || x.id, auth.uid());
  UPDATE fid_recompensas SET stock = stock + 1 WHERE id = x.recompensa_id AND stock IS NOT NULL;
  PERFORM _fid_audit(v_rid, 'canje_anulado', 'redencion', x.id, jsonb_build_object('motivo', p_motivo));
END;
$$;

-- Recompensas para el mostrador: cuáles puede canjear YA este cliente y, si no, por qué. Admin y cajero (el mesero no canjea).
-- La decisión se calcula en la base: el cajero nunca ve el historial ni el gasto del cliente.
CREATE OR REPLACE FUNCTION public.fid_recompensas_disponibles(p_cliente_id uuid)
 RETURNS TABLE (id uuid, nombre text, descripcion text, tipo text, valor numeric, unidad text, costo int, condiciones text, stock int, disponible boolean, motivo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); a fid_cuentas%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS NULL OR get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero consultan recompensas'; END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = p_cliente_id AND restaurant_id = v_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  RETURN QUERY
    SELECT s.id, s.nombre, s.descripcion, s.tipo, s.valor, s.unidad, s.costo, s.condiciones, s.stock, (s.razon IS NULL), s.razon
      FROM (
        SELECT r.id, r.nombre, r.descripcion, r.tipo, r.valor, r.unidad, r.costo, r.condiciones, r.stock,
               CASE
                 WHEN r.stock IS NOT NULL AND r.stock <= 0 THEN 'Agotada'
                 WHEN r.limite_por_cliente IS NOT NULL AND
                      (SELECT count(*) FROM fid_redenciones d WHERE d.cliente_id = p_cliente_id AND d.recompensa_id = r.id AND d.estado = 'aplicada') >= r.limite_por_cliente
                   THEN 'Ya la usó el máximo de veces'
                 WHEN r.nivel_minimo_id IS NOT NULL AND a.puntos_historicos < COALESCE((SELECT n.puntos_minimos FROM fid_niveles n WHERE n.id = r.nivel_minimo_id), 0)
                   THEN 'Requiere nivel ' || (SELECT n.nombre FROM fid_niveles n WHERE n.id = r.nivel_minimo_id)
                 WHEN r.unidad = 'puntos' AND a.puntos_saldo < r.costo THEN 'Faltan ' || (r.costo - a.puntos_saldo) || ' puntos'
                 WHEN r.unidad = 'sellos' AND a.sellos_saldo < r.costo THEN 'Faltan ' || (r.costo - a.sellos_saldo) || ' sellos'
               END AS razon
          FROM fid_recompensas r
         WHERE r.restaurant_id = v_rid AND r.activa
           AND (r.vigente_desde IS NULL OR r.vigente_desde <= now()) AND (r.vigente_hasta IS NULL OR r.vigente_hasta >= now())
      ) s
     ORDER BY (s.razon IS NULL) DESC, s.costo;
END;
$$;

-- Historial de canjes con quién y cuándo (huella de auditoría visible para el administrador).
CREATE OR REPLACE FUNCTION public.fid_canjes_historial(p_limite int DEFAULT 100)
 RETURNS TABLE (id uuid, created_at timestamptz, cliente text, recompensa text, unidad text, costo int, estado text, hecho_por text, anulada_at timestamptz, motivo_anulacion text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador consulta el historial de canjes'; END IF;
  RETURN QUERY
    SELECT d.id, d.created_at, c.nombre, r.nombre, d.unidad, d.costo, d.estado, COALESCE(p.full_name, 'Sin dato'), d.anulada_at, d.motivo_anulacion
      FROM fid_redenciones d
      JOIN clientes c ON c.id = d.cliente_id
      JOIN fid_recompensas r ON r.id = d.recompensa_id
      LEFT JOIN profiles p ON p.id = d.creado_por
     WHERE d.restaurant_id = v_rid
     ORDER BY d.created_at DESC
     LIMIT LEAST(GREATEST(p_limite, 1), 500);
END;
$$;

-- Tarjeta pública (misma firma): ahora también devuelve el nombre del club del restaurante.
CREATE OR REPLACE FUNCTION public.fid_tarjeta_publica(p_token text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c clientes%ROWTYPE; a fid_cuentas%ROWTYPE; n fid_niveles%ROWTYPE; s fid_niveles%ROWTYPE; r restaurants%ROWTYPE; v_movs json; v_club text;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO c FROM clientes WHERE qr_token = p_token AND activo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT nombre_club INTO v_club FROM fid_programas WHERE restaurant_id = c.restaurant_id AND activo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO a FROM fid_cuentas WHERE cliente_id = c.id;
  SELECT * INTO r FROM restaurants WHERE id = c.restaurant_id;
  SELECT * INTO n FROM fid_niveles WHERE id = a.nivel_id;
  SELECT * INTO s FROM fid_niveles WHERE restaurant_id = c.restaurant_id AND activo AND puntos_minimos > COALESCE(a.puntos_historicos, 0)
    ORDER BY puntos_minimos LIMIT 1;
  SELECT COALESCE(json_agg(m), '[]'::json) INTO v_movs FROM (
    SELECT created_at AS fecha, tipo, unidad, cantidad, motivo FROM fid_movimientos WHERE cliente_id = c.id ORDER BY created_at DESC LIMIT 10) m;
  RETURN json_build_object(
    'restaurante', r.name,
    'club', v_club,
    'nombre', split_part(btrim(c.nombre), ' ', 1),
    'puntos', COALESCE(a.puntos_saldo, 0), 'sellos', COALESCE(a.sellos_saldo, 0),
    'nivel', n.nombre, 'nivel_beneficios', n.beneficios,
    'siguiente_nivel', s.nombre,
    'puntos_para_siguiente', CASE WHEN s.id IS NULL THEN NULL ELSE s.puntos_minimos - COALESCE(a.puntos_historicos, 0) END,
    'progreso_pct', CASE WHEN s.id IS NULL THEN 100
                         ELSE round(100.0 * (COALESCE(a.puntos_historicos, 0) - COALESCE(n.puntos_minimos, 0)) / NULLIF(s.puntos_minimos - COALESCE(n.puntos_minimos, 0), 0)) END,
    'movimientos', v_movs);
END;
$$;

-- ═════════════════════════ CORTE MENSUAL ═════════════════════════
-- Interpretación: cerrar un mes YA TERMINADO. En una sola transacción, y una sola vez por mes y restaurante:
--   1) vence los puntos de quien lleva N meses sin comprar (solo si el restaurante definió meses_vencimiento y el programa está activo);
--   2) vuelve a evaluar el nivel de todos los clientes;
--   3) guarda la foto del mes (puntos emitidos/canjeados/vencidos, compras, clientes nuevos y activos, niveles).
-- Repetirlo para el mismo mes no hace nada: devuelve lo ya guardado.
CREATE OR REPLACE FUNCTION public._fid_corte_aplicar(p_rid uuid, p_mes date, p_actor uuid, p_origen text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  t0 timestamptz := v_ini::timestamp AT TIME ZONE 'America/Bogota';
  t1 timestamptz := v_fin::timestamp AT TIME ZONE 'America/Bogota';
  prog fid_programas%ROWTYPE; v_id uuid; v_cli int := 0; v_pts int := 0; v_niv int := 0; v_res jsonb; x record; e fid_cortes%ROWTYPE;
BEGIN
  INSERT INTO fid_cortes (restaurant_id, mes, origen, ejecutado_por) VALUES (p_rid, v_ini, p_origen, p_actor)
  ON CONFLICT (restaurant_id, mes) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO e FROM fid_cortes WHERE restaurant_id = p_rid AND mes = v_ini;
    RETURN json_build_object('mes', e.mes, 'ya_existia', true, 'ejecutado_at', e.ejecutado_at, 'clientes_expirados', e.clientes_expirados,
                             'puntos_expirados', e.puntos_expirados, 'niveles_cambiados', e.niveles_cambiados, 'resumen', e.resumen);
  END IF;

  SELECT * INTO prog FROM fid_programas WHERE restaurant_id = p_rid;

  IF FOUND AND prog.activo AND prog.meses_vencimiento IS NOT NULL THEN
    FOR x IN
      SELECT a.cliente_id, a.puntos_saldo FROM fid_cuentas a JOIN clientes c ON c.id = a.cliente_id
       WHERE a.restaurant_id = p_rid AND a.puntos_saldo > 0
         AND COALESCE(a.ultima_visita, c.created_at) < t1 - make_interval(months => prog.meses_vencimiento)
    LOOP
      INSERT INTO fid_movimientos (restaurant_id, cliente_id, tipo, unidad, cantidad, motivo, idempotency_key, creado_por)
      VALUES (p_rid, x.cliente_id, 'expiracion', 'puntos', -x.puntos_saldo,
              'Vencimiento: ' || prog.meses_vencimiento || ' meses sin comprar', 'exp:' || v_id || ':' || x.cliente_id, p_actor);
      v_cli := v_cli + 1; v_pts := v_pts + x.puntos_saldo;
    END LOOP;
  END IF;

  WITH nuevo AS (
    SELECT a.cliente_id, (SELECT n.id FROM fid_niveles n WHERE n.restaurant_id = a.restaurant_id AND n.activo AND n.puntos_minimos <= a.puntos_historicos
                           ORDER BY n.puntos_minimos DESC LIMIT 1) AS nid
      FROM fid_cuentas a WHERE a.restaurant_id = p_rid),
  upd AS (UPDATE fid_cuentas a SET nivel_id = nuevo.nid FROM nuevo WHERE a.cliente_id = nuevo.cliente_id AND a.nivel_id IS DISTINCT FROM nuevo.nid RETURNING 1)
  SELECT count(*) INTO v_niv FROM upd;

  SELECT jsonb_build_object(
    'puntos_emitidos',  COALESCE((SELECT sum(cantidad) FROM fid_movimientos WHERE restaurant_id = p_rid AND unidad = 'puntos' AND tipo IN ('acredito','reversa_acredito') AND created_at >= t0 AND created_at < t1), 0),
    'puntos_canjeados', -COALESCE((SELECT sum(cantidad) FROM fid_movimientos WHERE restaurant_id = p_rid AND unidad = 'puntos' AND tipo IN ('canje','reversa_canje') AND created_at >= t0 AND created_at < t1), 0),
    'sellos_canjeados', -COALESCE((SELECT sum(cantidad) FROM fid_movimientos WHERE restaurant_id = p_rid AND unidad = 'sellos' AND tipo IN ('canje','reversa_canje') AND created_at >= t0 AND created_at < t1), 0),
    'canjes',           (SELECT count(*) FROM fid_redenciones WHERE restaurant_id = p_rid AND estado = 'aplicada' AND created_at >= t0 AND created_at < t1),
    'puntos_vencidos',  v_pts,
    'compras',          (SELECT count(*) FROM fid_acreditaciones WHERE restaurant_id = p_rid AND reversada_at IS NULL AND created_at >= t0 AND created_at < t1),
    'ventas',           COALESCE((SELECT sum(total) FROM fid_acreditaciones WHERE restaurant_id = p_rid AND reversada_at IS NULL AND created_at >= t0 AND created_at < t1), 0),
    'clientes_activos', (SELECT count(DISTINCT cliente_id) FROM fid_acreditaciones WHERE restaurant_id = p_rid AND reversada_at IS NULL AND created_at >= t0 AND created_at < t1),
    'clientes_nuevos',  (SELECT count(*) FROM clientes WHERE restaurant_id = p_rid AND created_at >= t0 AND created_at < t1),
    'clientes_total',   (SELECT count(*) FROM clientes WHERE restaurant_id = p_rid AND activo),
    'puntos_en_circulacion', COALESCE((SELECT sum(puntos_saldo) FROM fid_cuentas WHERE restaurant_id = p_rid), 0),
    'niveles', COALESCE((SELECT jsonb_object_agg(q.nombre, q.n) FROM (
                  SELECT COALESCE(nv.nombre, 'Sin nivel') AS nombre, count(*) AS n FROM fid_cuentas a LEFT JOIN fid_niveles nv ON nv.id = a.nivel_id
                   WHERE a.restaurant_id = p_rid GROUP BY 1) q), '{}'::jsonb)
  ) INTO v_res;

  UPDATE fid_cortes SET clientes_expirados = v_cli, puntos_expirados = v_pts, niveles_cambiados = v_niv, resumen = v_res WHERE id = v_id;
  INSERT INTO fid_auditoria (restaurant_id, actor, actor_rol, accion, entidad, entidad_id, detalle)
  VALUES (p_rid, p_actor, CASE WHEN p_actor IS NULL THEN 'sistema' ELSE 'admin' END, 'corte_mensual', 'corte', v_id,
          jsonb_build_object('mes', v_ini, 'origen', p_origen, 'clientes_expirados', v_cli, 'puntos_expirados', v_pts, 'niveles_cambiados', v_niv));
  RETURN json_build_object('mes', v_ini, 'ya_existia', false, 'clientes_expirados', v_cli, 'puntos_expirados', v_pts, 'niveles_cambiados', v_niv, 'resumen', v_res);
END;
$$;

-- Administrador: cierra un mes de SU restaurante. Sin fecha = el último mes terminado.
CREATE OR REPLACE FUNCTION public.fid_corte_mensual(p_mes date DEFAULT NULL)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_mes date; v_actual date := date_trunc('month', hoy_local())::date;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador hace el corte mensual'; END IF;
  v_mes := COALESCE(date_trunc('month', p_mes)::date, (v_actual - interval '1 month')::date);
  IF v_mes >= v_actual THEN RAISE EXCEPTION 'Solo se puede cerrar un mes que ya terminó'; END IF;
  IF v_mes < (v_actual - interval '24 months')::date THEN RAISE EXCEPTION 'Ese mes es demasiado antiguo para cerrarlo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fid_programas WHERE restaurant_id = v_rid) THEN RAISE EXCEPTION 'Primero configura el programa de fidelidad'; END IF;
  RETURN _fid_corte_aplicar(v_rid, v_mes, auth.uid(), 'manual');
END;
$$;

-- Solo proceso de servicio (programación automática): cierra el mes de todos los restaurantes con programa activo.
CREATE OR REPLACE FUNCTION public.fid_corte_mensual_todos(p_mes date DEFAULT NULL)
 RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actual date := date_trunc('month', hoy_local())::date; v_mes date; x record; v_n int := 0;
BEGIN
  v_mes := COALESCE(date_trunc('month', p_mes)::date, (v_actual - interval '1 month')::date);
  IF v_mes >= v_actual THEN RAISE EXCEPTION 'Solo se puede cerrar un mes que ya terminó'; END IF;
  FOR x IN SELECT restaurant_id FROM fid_programas WHERE activo LOOP
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM fid_cortes WHERE restaurant_id = x.restaurant_id AND mes = v_mes) THEN
        PERFORM _fid_corte_aplicar(x.restaurant_id, v_mes, NULL, 'automatico'); v_n := v_n + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO fid_auditoria (restaurant_id, accion, entidad, detalle) VALUES (x.restaurant_id, 'corte_fallido', 'corte', jsonb_build_object('mes', v_mes, 'error', SQLERRM));
    END;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ═════════════════════════ ARM: generador de sugerencias (reglas fijas, sin IA, no envía nada) ═════════════════════════
CREATE OR REPLACE FUNCTION public._arm_proponer(p_rid uuid, p_clave text, p_tipo text, p_titulo text, p_razon text, p_evidencia jsonb, p_payload jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  -- Ni repetida mientras espera decisión, ni vuelta a crear 14 días después de haberla decidido.
  IF EXISTS (SELECT 1 FROM arm_acciones WHERE restaurant_id = p_rid AND clave = p_clave AND estado IN ('propuesta','aprobada','rechazada','ejecutada')
                AND created_at > now() - interval '14 days') THEN RETURN false; END IF;
  INSERT INTO arm_acciones (restaurant_id, tipo, titulo, razon, evidencia, payload, propuesta_por, clave)
  VALUES (p_rid, p_tipo, p_titulo, p_razon, p_evidencia, p_payload, 'reglas', p_clave)
  ON CONFLICT (restaurant_id, clave) WHERE clave IS NOT NULL AND estado = 'propuesta' DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.arm_generar_sugerencias()
 RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid uuid := current_restaurant_id(); v_hoy date := hoy_local(); v_n int := 0;
  v_total int; v_cons int; v_muestra jsonb;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador genera sugerencias'; END IF;
  UPDATE arm_acciones SET estado = 'expirada' WHERE restaurant_id = v_rid AND estado = 'propuesta' AND expira_at < now();

  -- 1) Clientes que dejaron de venir (45 días o más)
  WITH ina AS (
    SELECT c.nombre, c.consentimiento_marketing AS ok, a.gasto_total FROM clientes c JOIN fid_cuentas a ON a.cliente_id = c.id
     WHERE c.restaurant_id = v_rid AND c.activo AND a.ultima_visita IS NOT NULL AND a.ultima_visita < now() - interval '45 days')
  SELECT count(*), count(*) FILTER (WHERE ok),
         COALESCE((SELECT jsonb_agg(nombre) FROM (SELECT nombre FROM ina ORDER BY gasto_total DESC LIMIT 5) s), '[]'::jsonb)
    INTO v_total, v_cons, v_muestra FROM ina;
  IF v_total >= 3 AND _arm_proponer(v_rid, 'inactivos_45', 'campana',
      v_total || ' clientes llevan 45 días sin venir: campaña de reactivación',
      'Son clientes que ya compraron y dejaron de venir. Un mensaje a tiempo suele recuperar a una parte. Solo se escribiría a quienes aceptaron recibir mensajes (' || v_cons || ' de ' || v_total || ').',
      jsonb_build_object('total', v_total, 'con_consentimiento', v_cons, 'dias', 45, 'mayor_gasto', v_muestra),
      jsonb_build_object('accion', 'crear_campana_borrador', 'nombre', 'Reactivación 45 días', 'objetivo', 'Que vuelvan los clientes que dejaron de venir',
                         'canal', 'whatsapp', 'segmento', jsonb_build_object('inactivos_dias', 45), 'requiere_consentimiento', true))
  THEN v_n := v_n + 1; END IF;

  -- 2) Cumpleaños de los próximos 7 días
  SELECT count(*), count(*) FILTER (WHERE acepta_mensajes), COALESCE(jsonb_agg(nombre), '[]'::jsonb)
    INTO v_total, v_cons, v_muestra FROM fid_cumpleanos_proximos(7);
  IF v_total >= 1 AND _arm_proponer(v_rid, 'cumple:' || to_char(date_trunc('week', v_hoy), 'YYYY-MM-DD'), 'campana',
      v_total || ' cliente' || CASE WHEN v_total = 1 THEN '' ELSE 's' END || ' cumple' || CASE WHEN v_total = 1 THEN '' ELSE 'n' END || ' años esta semana: saludo con detalle',
      'Un saludo de cumpleaños con un detalle pequeño invita a celebrar contigo. Solo se escribiría a quienes aceptaron mensajes (' || v_cons || ' de ' || v_total || ').',
      jsonb_build_object('total', v_total, 'con_consentimiento', v_cons, 'clientes', v_muestra, 'dias', 7),
      jsonb_build_object('accion', 'crear_campana_borrador', 'nombre', 'Cumpleaños de la semana', 'objetivo', 'Saludar y regalar un detalle',
                         'canal', 'whatsapp', 'segmento', jsonb_build_object('cumple_esta_semana', true), 'requiere_consentimiento', true))
  THEN v_n := v_n + 1; END IF;

  -- 3) Mejores clientes de los últimos 90 días
  WITH top AS (SELECT * FROM fid_mejores_clientes(now() - interval '90 days', now(), 5))
  SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'compras', compras, 'gasto', gasto) ORDER BY gasto DESC), '[]'::jsonb)
    INTO v_total, v_muestra FROM top;
  IF v_total >= 3 AND _arm_proponer(v_rid, 'top:' || to_char(v_hoy, 'YYYY-MM'), 'promocion',
      'Agradece a tus ' || v_total || ' mejores clientes de los últimos 90 días',
      'Son quienes más compraron en los últimos 3 meses. Reconocerlos con un detalle exclusivo ayuda a que sigan viniendo.',
      jsonb_build_object('total', v_total, 'dias', 90, 'clientes', v_muestra),
      jsonb_build_object('accion', 'crear_campana_borrador', 'nombre', 'Gracias a nuestros mejores clientes', 'objetivo', 'Reconocer a los clientes más fieles',
                         'canal', 'whatsapp', 'segmento', jsonb_build_object('mejores_clientes', 5, 'dias', 90), 'requiere_consentimiento', true))
  THEN v_n := v_n + 1; END IF;

  RETURN v_n;
END;
$$;

-- ─── Permisos ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._fid_corte_aplicar(uuid, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._arm_proponer(uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fid_corte_mensual_todos(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fid_canjear(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_anular_canje(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_recompensas_disponibles(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_canjes_historial(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_corte_mensual(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arm_generar_sugerencias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_tarjeta_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fid_canjear(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_anular_canje(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_recompensas_disponibles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_canjes_historial(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_corte_mensual(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arm_generar_sugerencias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_tarjeta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fid_corte_mensual_todos(date) TO service_role;
