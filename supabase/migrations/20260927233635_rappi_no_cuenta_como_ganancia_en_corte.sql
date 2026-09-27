-- Rappi no debe sumar ni a "ganancias (ventas)" ni a "beneficio neto" del
-- corte de caja: esa plata no la maneja el restaurante en el dia a dia (la
-- paga Rappi aparte, en su propio ciclo), asi que mezclarla infla el
-- numero que el cajero usa para saber cuanto vendio HOY por caja. Rappi
-- sigue contandose aparte (total_rappi, ya existia) solo para que quede
-- registrado cuanto entro por esa via, sin afectar el resto de las cuentas.
CREATE OR REPLACE FUNCTION public.hacer_corte_caja(p_notas text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_corte public.cortes_caja%ROWTYPE;
  v_total_efectivo NUMERIC; v_total_transf NUMERIC; v_total_rappi NUMERIC;
  v_total_propinas NUMERIC; v_total_propinas_efectivo NUMERIC;
  v_total_ordenes INTEGER; v_ordenes_ids UUID[];
  v_total_gastos NUMERIC; v_total_neto NUMERIC;
  v_rid UUID := public.current_restaurant_id();
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden hacer el corte de caja';
  END IF;

  SELECT COALESCE(SUM(total) FILTER (WHERE payment_method='efectivo'),0),
         COALESCE(SUM(total) FILTER (WHERE payment_method='transferencia'),0),
         COALESCE(SUM(total) FILTER (WHERE payment_method='rappi'),0),
         COALESCE(SUM(propina),0),
         COALESCE(SUM(propina) FILTER (WHERE payment_method='efectivo'),0),
         COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_total_efectivo, v_total_transf, v_total_rappi, v_total_propinas, v_total_propinas_efectivo, v_total_ordenes, v_ordenes_ids
  FROM public.orders
  WHERE status='completed' AND paid_at>=CURRENT_DATE AND paid_at<CURRENT_DATE+INTERVAL '1 day'
    AND restaurant_id=v_rid;

  SELECT COALESCE(SUM(monto),0) INTO v_total_gastos
  FROM public.gastos
  WHERE created_at>=CURRENT_DATE AND created_at<CURRENT_DATE+INTERVAL '1 day'
    AND restaurant_id=v_rid;

  -- Rappi queda fuera de la ganancia/neto de caja a propósito (ver comentario arriba).
  v_total_neto := v_total_efectivo + v_total_transf - v_total_gastos;

  INSERT INTO public.cortes_caja (
    cashier_id, total_efectivo, total_transferencia, total_rappi, total_ordenes, ordenes_ids, notas,
    restaurant_id, total_gastos, total_neto, total_propinas, total_propinas_efectivo
  )
  VALUES (
    auth.uid(), v_total_efectivo, v_total_transf, v_total_rappi, v_total_ordenes, v_ordenes_ids, p_notas,
    v_rid, v_total_gastos, v_total_neto, v_total_propinas, v_total_propinas_efectivo
  )
  RETURNING * INTO v_corte;

  RETURN json_build_object(
    'corte_id', v_corte.id, 'fecha', v_corte.fecha,
    'total_efectivo', v_total_efectivo, 'total_transferencia', v_total_transf, 'total_rappi', v_total_rappi,
    'total_general', v_total_efectivo + v_total_transf, 'total_ordenes', v_total_ordenes,
    'total_gastos', v_total_gastos, 'total_neto', v_total_neto,
    'total_propinas', v_total_propinas, 'total_propinas_efectivo', v_total_propinas_efectivo,
    'efectivo_esperado_cajon', v_total_efectivo + v_total_propinas_efectivo
  );
END;
$function$;
