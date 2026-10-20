-- Bloque 8, paso 6 (datos): vendedores y aliados con contrato, prospectos y condiciones generales (platform_settings).
-- Todas las funciones: SECURITY DEFINER, search_path fijo, y exigen dueño + 2 pasos (_exigir_dueno). Todo cambio queda en auditoria_plataforma.
-- `datos_pago` nunca se copia al registro de cambios.

-- Condiciones del contrato de un vendedor: las pactadas encima de las generales (platform_settings).
CREATE OR REPLACE FUNCTION public._terminos_vigentes(p_vendedor uuid) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v vendedores%ROWTYPE; s jsonb; base jsonb;
BEGIN
  SELECT * INTO v FROM vendedores WHERE id = p_vendedor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_object_agg(clave, valor) INTO s FROM platform_settings;
  base := jsonb_build_object(
    'tipo', v.tipo,
    'bono_meses', CASE WHEN v.tipo = 'aliado' THEN 0 ELSE coalesce((s->>'bono_meses')::numeric, 1) END,
    'recurrente_pct', CASE WHEN v.tipo = 'aliado' THEN coalesce((s->>'aliado_pct')::numeric, 10) ELSE coalesce((s->>'recurrente_pct')::numeric, 10) END,
    'recurrente_meses', coalesce((s->>'recurrente_meses')::numeric, 12));
  RETURN base || coalesce((SELECT jsonb_object_agg(k, val) FROM jsonb_each(coalesce(v.terminos, '{}'::jsonb)) AS t(k, val)
                            WHERE k IN ('bono_meses','recurrente_pct','recurrente_meses')), '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public._terminos_vigentes(uuid) FROM PUBLIC, anon, authenticated;

-- Cuando un restaurante queda atribuido a un vendedor, conserva las condiciones de ese contrato aunque luego cambien.
CREATE OR REPLACE FUNCTION public._crm_copiar_terminos() RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    NEW.terminos_vendedor := CASE WHEN NEW.vendedor_id IS NULL THEN NULL ELSE public._terminos_vigentes(NEW.vendedor_id) END;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._crm_copiar_terminos() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER restaurant_crm_terminos BEFORE INSERT OR UPDATE OF vendedor_id ON public.restaurant_crm
  FOR EACH ROW EXECUTE FUNCTION public._crm_copiar_terminos();

-- Lista de vendedores y aliados con sus cifras.
CREATE OR REPLACE FUNCTION public.plataforma_vendedores_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object(
      'restaurantes', (SELECT count(*) FROM restaurant_crm c WHERE c.vendedor_id = v.id),
      'restaurantes_activos', (SELECT count(*) FROM restaurant_crm c JOIN restaurants r ON r.id = c.restaurant_id WHERE c.vendedor_id = v.id AND r.active),
      'prospectos', (SELECT count(*) FROM prospectos p WHERE p.vendedor_id = v.id AND p.etapa <> 'perdido'),
      'por_pagar_cop', (SELECT coalesce(sum(monto_cop), 0) FROM comisiones k WHERE k.vendedor_id = v.id AND k.estado IN ('pendiente','aprobada')),
      'codigo_en_uso', (EXISTS (SELECT 1 FROM restaurant_crm c WHERE c.vendedor_id = v.id) OR EXISTS (SELECT 1 FROM prospectos p WHERE p.vendedor_id = v.id)
                        OR EXISTS (SELECT 1 FROM comisiones k WHERE k.vendedor_id = v.id))
    ) ORDER BY v.created_at DESC) FROM vendedores v), '[]'::jsonb);
END;
$function$;

-- Crea o edita un vendedor/aliado. Crear EXIGE contrato adjunto (ruta en el bucket privado), versión y fecha de firma.
-- Cambiar contrato, condiciones o vigencia exige motivo. El código no se puede cambiar una vez que tuvo registros atribuidos.
CREATE OR REPLACE FUNCTION public.plataforma_vendedor_guardar(p_id uuid, p_datos jsonb, p_motivo text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := p_id; v_antes vendedores%ROWTYPE; v_despues vendedores%ROWTYPE; v_motivo text := NULLIF(btrim(p_motivo), '');
  v_codigo text; v_en_uso boolean; v_cambia_contrato boolean;
BEGIN
  PERFORM public._exigir_dueno();
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k NOT IN
     ('tipo','nombre','codigo','correo','telefono','documento','medio_pago','datos_pago','notas','contrato_ruta','contrato_version','firmado_at','vigente_hasta','terminos')) THEN
    RAISE EXCEPTION 'Campo no editable';
  END IF;
  IF p_datos ? 'terminos' AND jsonb_typeof(p_datos->'terminos') = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos->'terminos') k
       WHERE k NOT IN ('bono_meses','recurrente_pct','recurrente_meses')) THEN
    RAISE EXCEPTION 'Condición no permitida';
  END IF;

  IF v_id IS NULL THEN
    IF NULLIF(p_datos->>'contrato_ruta', '') IS NULL OR NULLIF(p_datos->>'contrato_version', '') IS NULL OR NULLIF(p_datos->>'firmado_at', '') IS NULL THEN
      RAISE EXCEPTION 'Sin contrato firmado no se puede crear ni activar un código (adjunta el PDF, la versión y la fecha de firma)';
    END IF;
    v_codigo := upper(btrim(p_datos->>'codigo'));
    INSERT INTO vendedores (tipo, nombre, codigo, correo, telefono, documento, medio_pago, datos_pago, notas, contrato_ruta, contrato_version, firmado_at, vigente_hasta, terminos, activo)
    VALUES (p_datos->>'tipo', btrim(p_datos->>'nombre'), v_codigo, NULLIF(btrim(p_datos->>'correo'), ''), NULLIF(btrim(p_datos->>'telefono'), ''),
            NULLIF(btrim(p_datos->>'documento'), ''), NULLIF(p_datos->>'medio_pago', ''), NULLIF(btrim(p_datos->>'datos_pago'), ''), NULLIF(btrim(p_datos->>'notas'), ''),
            p_datos->>'contrato_ruta', p_datos->>'contrato_version', (p_datos->>'firmado_at')::date, NULLIF(p_datos->>'vigente_hasta', '')::date,
            CASE WHEN jsonb_typeof(p_datos->'terminos') = 'object' THEN p_datos->'terminos' END, true)
    RETURNING id INTO v_id;
    PERFORM public._auditar('crear_vendedor', 'vendedores', v_id, NULL,
      jsonb_build_object('tipo', p_datos->>'tipo', 'nombre', p_datos->>'nombre', 'codigo', v_codigo, 'contrato_version', p_datos->>'contrato_version',
                         'firmado_at', p_datos->>'firmado_at', 'terminos', p_datos->'terminos'), v_motivo);
    RETURN v_id;
  END IF;

  SELECT * INTO v_antes FROM vendedores WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendedor no encontrado'; END IF;
  v_en_uso := EXISTS (SELECT 1 FROM restaurant_crm c WHERE c.vendedor_id = v_id) OR EXISTS (SELECT 1 FROM prospectos p WHERE p.vendedor_id = v_id)
              OR EXISTS (SELECT 1 FROM comisiones k WHERE k.vendedor_id = v_id);
  IF p_datos ? 'codigo' AND upper(btrim(p_datos->>'codigo')) IS DISTINCT FROM v_antes.codigo AND v_en_uso THEN
    RAISE EXCEPTION 'El código ya tuvo registros atribuidos y no se puede cambiar: crea un vendedor nuevo con otro código y desactiva este';
  END IF;
  IF p_datos ? 'tipo' AND p_datos->>'tipo' IS DISTINCT FROM v_antes.tipo AND v_en_uso THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de un vendedor con registros atribuidos';
  END IF;
  v_cambia_contrato := p_datos ? 'contrato_ruta' OR p_datos ? 'contrato_version' OR p_datos ? 'firmado_at' OR p_datos ? 'terminos' OR p_datos ? 'vigente_hasta';
  IF v_cambia_contrato AND v_motivo IS NULL THEN RAISE EXCEPTION 'Cambiar el contrato, las condiciones o la vigencia exige un motivo'; END IF;
  IF p_datos ? 'contrato_ruta' AND NULLIF(p_datos->>'contrato_ruta', '') IS NULL THEN RAISE EXCEPTION 'No se puede quitar el contrato'; END IF;

  UPDATE vendedores SET
    tipo = CASE WHEN p_datos ? 'tipo' THEN p_datos->>'tipo' ELSE tipo END,
    nombre = CASE WHEN p_datos ? 'nombre' THEN btrim(p_datos->>'nombre') ELSE nombre END,
    codigo = CASE WHEN p_datos ? 'codigo' THEN upper(btrim(p_datos->>'codigo')) ELSE codigo END,
    correo = CASE WHEN p_datos ? 'correo' THEN NULLIF(btrim(p_datos->>'correo'), '') ELSE correo END,
    telefono = CASE WHEN p_datos ? 'telefono' THEN NULLIF(btrim(p_datos->>'telefono'), '') ELSE telefono END,
    documento = CASE WHEN p_datos ? 'documento' THEN NULLIF(btrim(p_datos->>'documento'), '') ELSE documento END,
    medio_pago = CASE WHEN p_datos ? 'medio_pago' THEN NULLIF(p_datos->>'medio_pago', '') ELSE medio_pago END,
    datos_pago = CASE WHEN p_datos ? 'datos_pago' THEN NULLIF(btrim(p_datos->>'datos_pago'), '') ELSE datos_pago END,
    notas = CASE WHEN p_datos ? 'notas' THEN NULLIF(btrim(p_datos->>'notas'), '') ELSE notas END,
    contrato_ruta = CASE WHEN p_datos ? 'contrato_ruta' THEN p_datos->>'contrato_ruta' ELSE contrato_ruta END,
    contrato_version = CASE WHEN p_datos ? 'contrato_version' THEN p_datos->>'contrato_version' ELSE contrato_version END,
    firmado_at = CASE WHEN p_datos ? 'firmado_at' THEN NULLIF(p_datos->>'firmado_at', '')::date ELSE firmado_at END,
    vigente_hasta = CASE WHEN p_datos ? 'vigente_hasta' THEN NULLIF(p_datos->>'vigente_hasta', '')::date ELSE vigente_hasta END,
    terminos = CASE WHEN p_datos ? 'terminos' THEN CASE WHEN jsonb_typeof(p_datos->'terminos') = 'object' THEN p_datos->'terminos' END ELSE terminos END,
    updated_at = now()
   WHERE id = v_id RETURNING * INTO v_despues;

  PERFORM public._auditar('editar_vendedor', 'vendedores', v_id,
    to_jsonb(v_antes) - 'datos_pago' - 'documento' || jsonb_build_object('datos_pago_cambiado', p_datos ? 'datos_pago'),
    to_jsonb(v_despues) - 'datos_pago' - 'documento', v_motivo);
  RETURN v_id;
END;
$function$;

-- Activa o desactiva el código. Siempre con motivo. Desactivar por "incumplimiento" congela lo no pagado; por "termino_normal" se conserva lo ganado.
-- Un código no se puede activar sin contrato ni con la vigencia vencida. Reactivar descongela.
CREATE OR REPLACE FUNCTION public.plataforma_vendedor_estado(p_id uuid, p_activo boolean, p_causa text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v vendedores%ROWTYPE; n int := 0;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Activar o desactivar un código exige un motivo'; END IF;
  SELECT * INTO v FROM vendedores WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendedor no encontrado'; END IF;
  IF p_activo THEN
    IF v.contrato_ruta IS NULL THEN RAISE EXCEPTION 'No se puede activar un código sin contrato adjunto'; END IF;
    IF v.vigente_hasta IS NOT NULL AND v.vigente_hasta < current_date THEN RAISE EXCEPTION 'El contrato está vencido: renuévalo (nueva vigencia con motivo) antes de activar'; END IF;
    UPDATE comisiones SET estado = 'pendiente' WHERE vendedor_id = p_id AND estado = 'congelada';
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE vendedores SET activo = true, causa_estado = NULL, motivo_estado = left(btrim(p_motivo), 500), updated_at = now() WHERE id = p_id;
  ELSE
    IF p_causa NOT IN ('termino_normal','incumplimiento') THEN RAISE EXCEPTION 'Elige la causa: término normal o incumplimiento'; END IF;
    IF p_causa = 'incumplimiento' THEN
      UPDATE comisiones SET estado = 'congelada' WHERE vendedor_id = p_id AND estado = 'pendiente' AND liquidacion_id IS NULL;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
    UPDATE vendedores SET activo = false, causa_estado = p_causa, motivo_estado = left(btrim(p_motivo), 500), updated_at = now() WHERE id = p_id;
  END IF;
  PERFORM public._auditar(CASE WHEN p_activo THEN 'activar_codigo' ELSE 'desactivar_codigo' END, 'vendedores', p_id,
    jsonb_build_object('activo', v.activo, 'causa', v.causa_estado), jsonb_build_object('activo', p_activo, 'causa', p_causa, 'comisiones_afectadas', n), p_motivo);
END;
$function$;

-- Prospectos (negocios que registra un vendedor; solo el dueño los anota por ahora). Gana el primer registro.
CREATE OR REPLACE FUNCTION public.plataforma_prospecto_agregar(p_vendedor uuid, p_nombre text, p_ciudad text DEFAULT NULL, p_contacto text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public._exigir_dueno();
  IF NOT EXISTS (SELECT 1 FROM vendedores WHERE id = p_vendedor) THEN RAISE EXCEPTION 'Vendedor no encontrado'; END IF;
  BEGIN
    INSERT INTO prospectos (vendedor_id, nombre_negocio, ciudad, contacto)
    VALUES (p_vendedor, btrim(p_nombre), NULLIF(btrim(p_ciudad), ''), NULLIF(btrim(p_contacto), '')) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese negocio ya fue registrado por un vendedor (gana el primer registro)';
  END;
  PERFORM public._auditar('agregar_prospecto', 'prospectos', v_id, NULL, jsonb_build_object('vendedor_id', p_vendedor, 'negocio', btrim(p_nombre), 'ciudad', p_ciudad), NULL);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_prospectos_listar(p_vendedor uuid DEFAULT NULL)
 RETURNS TABLE (id uuid, vendedor_id uuid, vendedor text, nombre_negocio text, ciudad text, contacto text, etapa text, fecha_registro date, vence_at date, restaurant_id uuid)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY
  SELECT p.id, p.vendedor_id, v.nombre, p.nombre_negocio, p.ciudad, p.contacto, p.etapa, p.fecha_registro, p.vence_at, p.restaurant_id
    FROM prospectos p JOIN vendedores v ON v.id = p.vendedor_id
   WHERE p_vendedor IS NULL OR p.vendedor_id = p_vendedor
   ORDER BY p.fecha_registro DESC, p.created_at DESC LIMIT 300;
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_prospecto_actualizar(p_id uuid, p_etapa text, p_restaurant_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_antes text;
BEGIN
  PERFORM public._exigir_dueno();
  IF p_etapa NOT IN ('prospecto','demo','prueba','cerrado','perdido') THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
  SELECT etapa INTO v_antes FROM prospectos WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospecto no encontrado'; END IF;
  UPDATE prospectos SET etapa = p_etapa, restaurant_id = coalesce(p_restaurant_id, restaurant_id) WHERE id = p_id;
  PERFORM public._auditar('actualizar_prospecto', 'prospectos', p_id, jsonb_build_object('etapa', v_antes), jsonb_build_object('etapa', p_etapa, 'restaurant_id', p_restaurant_id), NULL);
END;
$function$;

-- Condiciones generales (platform_settings).
CREATE OR REPLACE FUNCTION public.plataforma_settings_listar()
 RETURNS TABLE (clave text, valor numeric, descripcion text, updated_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._exigir_dueno();
  RETURN QUERY SELECT s.clave, s.valor, s.descripcion, s.updated_at FROM platform_settings s ORDER BY s.clave;
END;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_settings_guardar(p_clave text, p_valor numeric, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_antes numeric;
BEGIN
  PERFORM public._exigir_dueno();
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Cambiar una condición general exige un motivo'; END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_clave LIKE '%pct' AND p_valor > 100 THEN RAISE EXCEPTION 'Un porcentaje no puede pasar de 100'; END IF;
  IF p_clave = 'dia_pago_mes' AND (p_valor < 1 OR p_valor > 28) THEN RAISE EXCEPTION 'El día de pago debe estar entre 1 y 28'; END IF;
  SELECT valor INTO v_antes FROM platform_settings WHERE clave = p_clave;
  IF NOT FOUND THEN RAISE EXCEPTION 'Condición desconocida'; END IF;
  UPDATE platform_settings SET valor = p_valor, updated_at = now(), updated_by = auth.uid() WHERE clave = p_clave;
  PERFORM public._auditar('editar_condicion', 'platform_settings', NULL, jsonb_build_object('clave', p_clave, 'valor', v_antes), jsonb_build_object('clave', p_clave, 'valor', p_valor), p_motivo);
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'plataforma_vendedores_listar()', 'plataforma_vendedor_guardar(uuid, jsonb, text)', 'plataforma_vendedor_estado(uuid, boolean, text, text)',
    'plataforma_prospecto_agregar(uuid, text, text, text)', 'plataforma_prospectos_listar(uuid)', 'plataforma_prospecto_actualizar(uuid, text, uuid)',
    'plataforma_settings_listar()', 'plataforma_settings_guardar(text, numeric, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
