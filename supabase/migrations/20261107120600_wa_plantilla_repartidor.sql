-- La plantilla del aviso al repartidor usaba el mismo nombre (dom_asignado) que el aviso de estado al cliente.
-- El nombre es único por restaurante, así que solo uno de los dos podía existir. El del repartidor pasa a dom_repartidor_asignado.
-- Misma firma que la función anterior: reemplaza, no crea un duplicado.
CREATE OR REPLACE FUNCTION public.dom_asignar_repartidor(p_id uuid, p_repartidor_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); d domicilios%ROWTYPE; r repartidores%ROWTYPE; t wa_plantillas%ROWTYPE; v_nombre text;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero asignan repartidores'; END IF;
  SELECT * INTO d FROM domicilios WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domicilio no encontrado'; END IF;
  IF d.estado NOT IN ('listo','buscando_repartidor','asignado') THEN RAISE EXCEPTION 'El pedido aún no está listo para asignar repartidor'; END IF;
  SELECT * INTO r FROM repartidores WHERE id = p_repartidor_id AND restaurant_id = v_rid AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado o inactivo'; END IF;
  UPDATE domicilios SET repartidor_id = r.id, estado = 'asignado' WHERE id = d.id;
  INSERT INTO domicilio_eventos (restaurant_id, domicilio_id, estado, origen, detalle, creado_por)
  VALUES (v_rid, d.id, 'asignado', 'manual', jsonb_build_object('repartidor', r.nombre), auth.uid());
  d.estado := 'asignado';
  PERFORM _dom_avisar_cliente(d.id);
  IF _wa_activo(v_rid) THEN
    SELECT * INTO t FROM wa_plantillas WHERE restaurant_id = v_rid AND uso = 'repartidor' AND nombre = 'dom_repartidor_asignado' AND activa AND estado_meta = 'aprobada';
    IF FOUND THEN
      SELECT COALESCE(d.contacto_nombre, c.nombre) INTO v_nombre FROM (SELECT 1) x LEFT JOIN clientes c ON c.id = d.cliente_id;
      PERFORM _wa_encolar(v_rid, r.telefono, 'repartidor', NULL, r.id, 'plantilla',
        jsonb_build_object('plantilla', t.nombre, 'idioma', t.idioma,
          'vars', jsonb_build_object('direccion', d.direccion, 'referencia', d.referencia, 'lat', d.lat, 'lng', d.lng,
                                     'cliente', split_part(COALESCE(v_nombre, ''), ' ', 1), 'costo_envio', d.costo_envio)),
        t.id, 'sistema', d.id);
    END IF;
  END IF;
END;
$$;
