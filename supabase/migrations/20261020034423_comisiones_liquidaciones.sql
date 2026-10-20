-- Bloque 8, pasos 7 y 8 (datos): cálculo de comisiones, ajustes por devolución y liquidaciones (Anexo C, sección 7).
-- Reglas: los montos los calcula SIEMPRE el servidor sobre el precio SIN IVA (base). El IVA nunca entra en la base.
-- Vendedor: bono = `bono_meses` del plan, mitad con el primer pago (bono_1) y mitad con el segundo (bono_2) + recurrente % durante
-- `recurrente_meses` desde el primer pago. Aliado: solo recurrente. Cada restaurante usa las condiciones con las que quedó atribuido.
-- La app registra los pagos; la transferencia se hace fuera (banco/Nequi).

CREATE OR REPLACE FUNCTION public.calcular_comisiones(p_periodo date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iva numeric; v_mes date := CASE WHEN p_periodo IS NULL THEN NULL ELSE date_trunc('month', p_periodo)::date END;
  v_creadas int := 0; v_omitidas int := 0; v_n int;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT valor INTO v_iva FROM platform_settings WHERE clave = 'iva_pct';

  DROP TABLE IF EXISTS pg_temp._pagos;               -- por si se llama dos veces en la misma transacción
  CREATE TEMP TABLE _pagos ON COMMIT DROP AS
  WITH base AS (
    SELECT p.id pid, p.restaurant_id rid, p.created_at,
           coalesce(p.base_cop, round((p.amount_in_cents / 100.0) / (1 + coalesce(v_iva, 19) / 100.0))) base,
           row_number() OVER (PARTITION BY p.restaurant_id ORDER BY p.created_at, p.id) n,
           min(p.created_at) OVER (PARTITION BY p.restaurant_id) primero
      FROM payments p
     WHERE p.kind = 'subscription' AND p.status = 'APPROVED' AND coalesce(p.amount_in_cents, 0) > 0)
  SELECT b.*, c.vendedor_id vid, coalesce(c.terminos_vendedor, public._terminos_vigentes(c.vendedor_id)) t,
         v.tipo, v.activo, v.causa_estado,
         date_trunc('month', b.created_at AT TIME ZONE 'America/Bogota')::date mes
    FROM base b
    JOIN restaurant_crm c ON c.restaurant_id = b.rid AND c.vendedor_id IS NOT NULL
    JOIN vendedores v ON v.id = c.vendedor_id;

  DELETE FROM _pagos WHERE v_mes IS NOT NULL AND mes <> v_mes;
  SELECT count(*) INTO v_omitidas FROM _pagos WHERE NOT activo AND causa_estado = 'incumplimiento';
  DELETE FROM _pagos WHERE NOT activo AND causa_estado = 'incumplimiento';

  -- bono 1 y bono 2 (solo vendedores, no aliados)
  INSERT INTO comisiones (vendedor_id, restaurant_id, payment_id, tipo, periodo, base_cop, porcentaje, monto_cop)
  SELECT vid, rid, pid, CASE n WHEN 1 THEN 'bono_1' ELSE 'bono_2' END, mes, base, 50 * (t->>'bono_meses')::numeric,
         round(base * (t->>'bono_meses')::numeric * 0.5)
    FROM _pagos WHERE tipo = 'vendedor' AND n IN (1, 2) AND coalesce((t->>'bono_meses')::numeric, 0) > 0
  ON CONFLICT (payment_id, vendedor_id, tipo) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_creadas := v_creadas + v_n;

  -- recurrente: durante `recurrente_meses` desde el primer pago
  INSERT INTO comisiones (vendedor_id, restaurant_id, payment_id, tipo, periodo, base_cop, porcentaje, monto_cop)
  SELECT vid, rid, pid, 'recurrente', mes, base, (t->>'recurrente_pct')::numeric, round(base * (t->>'recurrente_pct')::numeric / 100)
    FROM _pagos
   WHERE coalesce((t->>'recurrente_pct')::numeric, 0) > 0
     AND created_at < primero + make_interval(months => coalesce((t->>'recurrente_meses')::int, 12))
  ON CONFLICT (payment_id, vendedor_id, tipo) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_creadas := v_creadas + v_n;

  IF v_creadas > 0 OR v_omitidas > 0 THEN
    PERFORM public._auditar('calcular_comisiones', 'comisiones', NULL, NULL,
      jsonb_build_object('periodo', v_mes, 'creadas', v_creadas, 'omitidas_por_incumplimiento', v_omitidas), NULL);
  END IF;
  RETURN jsonb_build_object('creadas', v_creadas, 'omitidas_por_incumplimiento', v_omitidas);
END;
$function$;

-- Devolución dentro de la ventana (30 días): ajuste negativo por lo que ya se había generado de ese pago. Repetirlo no duplica.
CREATE OR REPLACE FUNCTION public.ajustar_por_devolucion(p_payment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p payments%ROWTYPE; v_ventana numeric; k record; n int := 0; v_hoy date := date_trunc('month', now() AT TIME ZONE 'America/Bogota')::date;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT * INTO p FROM payments WHERE id = p_payment_id AND kind = 'subscription';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago de suscripción no encontrado'; END IF;
  SELECT valor INTO v_ventana FROM platform_settings WHERE clave = 'ventana_devolucion_dias';
  IF p.created_at < now() - make_interval(days => coalesce(v_ventana, 30)::int) THEN
    RAISE EXCEPTION 'La devolución está fuera de la ventana de % días: no genera ajuste', coalesce(v_ventana, 30);
  END IF;
  FOR k IN SELECT vendedor_id, restaurant_id, sum(monto_cop) total, sum(base_cop) base FROM comisiones
            WHERE payment_id = p_payment_id AND tipo <> 'ajuste' AND estado <> 'anulada' GROUP BY vendedor_id, restaurant_id HAVING sum(monto_cop) > 0 LOOP
    INSERT INTO comisiones (vendedor_id, restaurant_id, payment_id, tipo, periodo, base_cop, porcentaje, monto_cop, motivo)
    VALUES (k.vendedor_id, k.restaurant_id, p_payment_id, 'ajuste', v_hoy, k.base, 100, -k.total, 'Devolución dentro de la ventana')
    ON CONFLICT (payment_id, vendedor_id, tipo) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  IF n > 0 THEN PERFORM public._auditar('ajustar_por_devolucion', 'comisiones', p_payment_id, NULL, jsonb_build_object('ajustes', n), NULL); END IF;
  RETURN n;
END;
$function$;

-- Recalcula los totales de una liquidación en borrador (suma de sus comisiones, menos la retención que fije el contador).
CREATE OR REPLACE FUNCTION public._liq_recalcular(p_id uuid) RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE liquidaciones_vendedor l SET
    total_bruto_cop = greatest(coalesce((SELECT sum(monto_cop) FROM comisiones k WHERE k.liquidacion_id = l.id AND k.estado <> 'anulada'), 0), 0),
    total_pagar_cop = greatest(greatest(coalesce((SELECT sum(monto_cop) FROM comisiones k WHERE k.liquidacion_id = l.id AND k.estado <> 'anulada'), 0), 0) - l.retencion_cop, 0)
   WHERE l.id = p_id AND l.estado = 'borrador';
$function$;
REVOKE ALL ON FUNCTION public._liq_recalcular(uuid) FROM PUBLIC, anon, authenticated;

-- Quita una comisión con motivo. Solo si no está en una liquidación aprobada o pagada.
CREATE OR REPLACE FUNCTION public.anular_comision(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k comisiones%ROWTYPE; l liquidaciones_vendedor%ROWTYPE;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Anular una comisión exige un motivo'; END IF;
  SELECT * INTO k FROM comisiones WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comisión no encontrada'; END IF;
  IF k.estado IN ('pagada', 'anulada') THEN RAISE EXCEPTION 'Esa comisión ya está %', k.estado; END IF;
  IF k.liquidacion_id IS NOT NULL THEN
    SELECT * INTO l FROM liquidaciones_vendedor WHERE id = k.liquidacion_id;
    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'La liquidación ya está aprobada: no se puede anular una de sus comisiones'; END IF;
  END IF;
  UPDATE comisiones SET estado = 'anulada', motivo = left(btrim(p_motivo), 500) WHERE id = p_id;
  IF k.liquidacion_id IS NOT NULL THEN PERFORM public._liq_recalcular(k.liquidacion_id); END IF;
  PERFORM public._auditar('anular_comision', 'comisiones', p_id, to_jsonb(k), jsonb_build_object('estado', 'anulada'), p_motivo);
END;
$function$;

-- Agrupa por vendedor las comisiones pendientes hasta el periodo dado y crea (o completa) la liquidación en borrador.
-- Si el total es cero o negativo (por devoluciones), no se crea y el saldo se arrastra al siguiente periodo.
CREATE OR REPLACE FUNCTION public.crear_liquidaciones(p_periodo date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mes date := date_trunc('month', p_periodo)::date; r record; v_liq uuid; v_estado text; v_creadas int := 0; v_actualizadas int := 0; v_arrastre int := 0;
BEGIN
  PERFORM public._exigir_dueno();
  FOR r IN SELECT vendedor_id, sum(monto_cop) total FROM comisiones
            WHERE estado = 'pendiente' AND liquidacion_id IS NULL AND periodo <= v_mes GROUP BY vendedor_id LOOP
    IF r.total <= 0 THEN v_arrastre := v_arrastre + 1; CONTINUE; END IF;
    SELECT id, estado INTO v_liq, v_estado FROM liquidaciones_vendedor WHERE vendedor_id = r.vendedor_id AND periodo = v_mes;
    IF NOT FOUND THEN
      INSERT INTO liquidaciones_vendedor (vendedor_id, periodo) VALUES (r.vendedor_id, v_mes) RETURNING id INTO v_liq;
      v_creadas := v_creadas + 1;
    ELSIF v_estado <> 'borrador' THEN
      CONTINUE;                                   -- ya aprobada o pagada: lo nuevo espera a la siguiente
    ELSE
      v_actualizadas := v_actualizadas + 1;
    END IF;
    UPDATE comisiones SET liquidacion_id = v_liq WHERE vendedor_id = r.vendedor_id AND estado = 'pendiente' AND liquidacion_id IS NULL AND periodo <= v_mes;
    PERFORM public._liq_recalcular(v_liq);
  END LOOP;
  IF v_creadas + v_actualizadas > 0 THEN
    PERFORM public._auditar('crear_liquidaciones', 'liquidaciones_vendedor', NULL, NULL,
      jsonb_build_object('periodo', v_mes, 'creadas', v_creadas, 'actualizadas', v_actualizadas, 'saldo_arrastrado', v_arrastre), NULL);
  END IF;
  RETURN jsonb_build_object('creadas', v_creadas, 'actualizadas', v_actualizadas, 'saldo_arrastrado', v_arrastre);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_liquidaciones_listar(p_estado text DEFAULT NULL)
 RETURNS TABLE (id uuid, numero text, vendedor_id uuid, vendedor text, codigo text, periodo date, total_bruto_cop numeric, retencion_cop numeric,
                total_pagar_cop numeric, estado text, cuenta_cobro_numero text, cuenta_cobro_ruta text, comprobante_ruta text, recibo_ruta text,
                aprobada_at timestamptz, pagada_at timestamptz, lineas bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT l.id, l.numero, l.vendedor_id, v.nombre, v.codigo, l.periodo, l.total_bruto_cop, l.retencion_cop, l.total_pagar_cop, l.estado,
         l.cuenta_cobro_numero, l.cuenta_cobro_ruta, l.comprobante_ruta, l.recibo_ruta, l.aprobada_at, l.pagada_at,
         (SELECT count(*) FROM comisiones k WHERE k.liquidacion_id = l.id AND k.estado <> 'anulada')
    FROM liquidaciones_vendedor l JOIN vendedores v ON v.id = l.vendedor_id
   WHERE p_estado IS NULL OR l.estado = p_estado
   ORDER BY (l.estado = 'pagada'), l.periodo DESC, v.nombre;
END;
$function$;

-- Detalle de una liquidación: cada cliente, pago, base sin IVA y comisión (también alimenta el recibo en PDF).
CREATE OR REPLACE FUNCTION public.plataforma_liquidacion_detalle(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT to_jsonb(l) || jsonb_build_object(
    'vendedor', jsonb_build_object('nombre', v.nombre, 'documento', v.documento, 'codigo', v.codigo, 'tipo', v.tipo,
                                   'contrato_version', v.contrato_version, 'firmado_at', v.firmado_at, 'medio_pago', v.medio_pago, 'datos_pago', v.datos_pago),
    'lineas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'tipo', k.tipo, 'restaurante', r.name, 'fecha_pago', p.created_at, 'base_cop', k.base_cop,
                                          'porcentaje', k.porcentaje, 'monto_cop', k.monto_cop, 'estado', k.estado, 'motivo', k.motivo) ORDER BY r.name, k.created_at)
                          FROM comisiones k LEFT JOIN restaurants r ON r.id = k.restaurant_id LEFT JOIN payments p ON p.id = k.payment_id
                         WHERE k.liquidacion_id = l.id), '[]'::jsonb))
    INTO v
    FROM liquidaciones_vendedor l JOIN vendedores v ON v.id = l.vendedor_id WHERE l.id = p_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Liquidación no encontrada'; END IF;
  RETURN v;
END;
$function$;

-- Retención en la fuente (la define el contador, no se calcula) y datos de la cuenta de cobro. Solo mientras es borrador.
CREATE OR REPLACE FUNCTION public.plataforma_liquidacion_editar(p_id uuid, p_retencion numeric, p_cuenta_numero text, p_cuenta_ruta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l liquidaciones_vendedor%ROWTYPE;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT * INTO l FROM liquidaciones_vendedor WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada'; END IF;
  IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'La liquidación ya está % y no se edita; los errores se corrigen con un ajuste en la siguiente', l.estado; END IF;
  IF p_retencion IS NOT NULL AND (p_retencion < 0 OR p_retencion > l.total_bruto_cop) THEN RAISE EXCEPTION 'La retención no puede ser negativa ni mayor al total'; END IF;
  UPDATE liquidaciones_vendedor SET
    retencion_cop = coalesce(p_retencion, retencion_cop),
    cuenta_cobro_numero = CASE WHEN p_cuenta_numero IS NULL THEN cuenta_cobro_numero ELSE NULLIF(btrim(p_cuenta_numero), '') END,
    cuenta_cobro_ruta = coalesce(NULLIF(p_cuenta_ruta, ''), cuenta_cobro_ruta)
   WHERE id = p_id;
  PERFORM public._liq_recalcular(p_id);
  PERFORM public._auditar('editar_liquidacion', 'liquidaciones_vendedor', p_id,
    jsonb_build_object('retencion', l.retencion_cop, 'cuenta', l.cuenta_cobro_numero), jsonb_build_object('retencion', p_retencion, 'cuenta', p_cuenta_numero), NULL);
END;
$function$;

-- Aprueba: congela los montos. Solo con cuenta de cobro cargada (número y foto o PDF).
CREATE OR REPLACE FUNCTION public.aprobar_liquidacion(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l liquidaciones_vendedor%ROWTYPE;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT * INTO l FROM liquidaciones_vendedor WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada'; END IF;
  IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'La liquidación ya está %', l.estado; END IF;
  IF NULLIF(l.cuenta_cobro_numero, '') IS NULL OR l.cuenta_cobro_ruta IS NULL THEN
    RAISE EXCEPTION 'Para aprobar hay que cargar la cuenta de cobro del vendedor (número y foto o PDF)';
  END IF;
  IF l.total_pagar_cop <= 0 THEN RAISE EXCEPTION 'No hay nada que pagar en esta liquidación'; END IF;
  UPDATE liquidaciones_vendedor SET estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now() WHERE id = p_id;
  UPDATE comisiones SET estado = 'aprobada' WHERE liquidacion_id = p_id AND estado = 'pendiente';
  PERFORM public._auditar('aprobar_liquidacion', 'liquidaciones_vendedor', p_id, jsonb_build_object('estado', 'borrador'),
    jsonb_build_object('estado', 'aprobada', 'total_pagar', l.total_pagar_cop, 'retencion', l.retencion_cop), NULL);
END;
$function$;

-- Registra que ya hiciste la transferencia. Falla si no está aprobada o si ya está pagada (nunca se paga dos veces).
-- Asigna el número consecutivo LIQ-AAAA-NNNN y devuelve ese número.
CREATE OR REPLACE FUNCTION public.registrar_pago_liquidacion(p_id uuid, p_medio text, p_referencia text, p_comprobante_ruta text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l liquidaciones_vendedor%ROWTYPE; v_num text;
BEGIN
  PERFORM public._exigir_dueno();
  SELECT * INTO l FROM liquidaciones_vendedor WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada'; END IF;
  IF l.estado = 'pagada' THEN RAISE EXCEPTION 'Esta liquidación ya está pagada (%): no se registra dos veces', l.numero; END IF;
  IF l.estado <> 'aprobada' THEN RAISE EXCEPTION 'Primero hay que aprobar la liquidación'; END IF;
  IF p_medio NOT IN ('nequi','bancolombia','otro') THEN RAISE EXCEPTION 'Elige el medio de pago'; END IF;
  IF NULLIF(btrim(p_referencia), '') IS NULL THEN RAISE EXCEPTION 'Escribe la referencia de la transferencia'; END IF;
  v_num := 'LIQ-' || extract(year FROM now() AT TIME ZONE 'America/Bogota')::int || '-' || lpad(nextval('public.liquidacion_numero_seq')::text, 4, '0');
  UPDATE liquidaciones_vendedor SET estado = 'pagada', numero = v_num, pagada_at = now(), pagada_por = auth.uid(), medio_pago = p_medio,
         referencia_pago = left(btrim(p_referencia), 120), comprobante_ruta = NULLIF(p_comprobante_ruta, '') WHERE id = p_id;
  UPDATE comisiones SET estado = 'pagada' WHERE liquidacion_id = p_id AND estado = 'aprobada';
  PERFORM public._auditar('registrar_pago_liquidacion', 'liquidaciones_vendedor', p_id, jsonb_build_object('estado', 'aprobada'),
    jsonb_build_object('estado', 'pagada', 'numero', v_num, 'medio', p_medio, 'total_pagar', l.total_pagar_cop), NULL);
  RETURN v_num;
END;
$function$;

-- Guarda la ruta del recibo en PDF ya generado (una sola vez, no se edita).
CREATE OR REPLACE FUNCTION public.plataforma_liquidacion_guardar_recibo(p_id uuid, p_ruta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  UPDATE liquidaciones_vendedor SET recibo_ruta = p_ruta WHERE id = p_id AND estado = 'pagada' AND recibo_ruta IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El recibo solo se guarda una vez y en liquidaciones pagadas'; END IF;
END;
$function$;

-- Cuánto se le debe a cada vendedor ahora (pendiente + aprobada sin pagar) y cuánto está congelado.
CREATE OR REPLACE FUNCTION public.plataforma_deuda_vendedores()
 RETURNS TABLE (vendedor_id uuid, vendedor text, codigo text, activo boolean, por_pagar_cop numeric, congelado_cop numeric, en_borrador_cop numeric)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT v.id, v.nombre, v.codigo, v.activo,
         coalesce(sum(k.monto_cop) FILTER (WHERE k.estado IN ('pendiente','aprobada')), 0),
         coalesce(sum(k.monto_cop) FILTER (WHERE k.estado = 'congelada'), 0),
         coalesce((SELECT l.total_pagar_cop FROM liquidaciones_vendedor l WHERE l.vendedor_id = v.id AND l.estado = 'borrador' ORDER BY l.periodo DESC LIMIT 1), 0)
    FROM vendedores v LEFT JOIN comisiones k ON k.vendedor_id = v.id
   GROUP BY v.id ORDER BY 5 DESC, v.nombre;
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'calcular_comisiones(date)', 'ajustar_por_devolucion(uuid)', 'anular_comision(uuid, text)', 'crear_liquidaciones(date)',
    'plataforma_liquidaciones_listar(text)', 'plataforma_liquidacion_detalle(uuid)', 'plataforma_liquidacion_editar(uuid, numeric, text, text)',
    'aprobar_liquidacion(uuid)', 'registrar_pago_liquidacion(uuid, text, text, text)', 'plataforma_liquidacion_guardar_recibo(uuid, text)',
    'plataforma_deuda_vendedores()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
