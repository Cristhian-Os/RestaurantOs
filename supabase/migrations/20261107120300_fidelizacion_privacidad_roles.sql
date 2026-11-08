-- Fidelización · privacidad por rol (decisión de Cristhian, 2026-11-07)
--  * Cajero y mesero NO ven compras, gasto ni teléfono completo: solo nombre, nivel, puntos/sellos y los últimos 4 dígitos.
--  * Solo el administrador lee directo las tablas de clientes, cuentas y movimientos.
--  * El mesero también puede registrar clientes.
-- Cajero y mesero consultan SOLO por funciones (fid_buscar_cliente / fid_ficha_cliente), que ya devuelven el teléfono tapado.

DROP POLICY IF EXISTS "clientes: admin y cajero leen los suyos" ON public.clientes;
CREATE POLICY "clientes: lee el admin" ON public.clientes FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "fid_cuentas: admin y cajero leen" ON public.fid_cuentas;
CREATE POLICY "fid_cuentas: lee el admin" ON public.fid_cuentas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "fid_acreditaciones: admin y cajero leen" ON public.fid_acreditaciones;
CREATE POLICY "fid_acreditaciones: lee el admin" ON public.fid_acreditaciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "fid_movimientos: admin y cajero leen" ON public.fid_movimientos;
CREATE POLICY "fid_movimientos: lee el admin" ON public.fid_movimientos FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

DROP POLICY IF EXISTS "fid_redenciones: admin y cajero leen" ON public.fid_redenciones;
CREATE POLICY "fid_redenciones: lee el admin" ON public.fid_redenciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

-- Registrar cliente: administrador, cajero o mesero (misma firma: reemplaza, no duplica).
CREATE OR REPLACE FUNCTION public.fid_registrar_cliente(
  p_nombre text, p_telefono text DEFAULT NULL, p_correo text DEFAULT NULL, p_cumpleanos date DEFAULT NULL,
  p_consentimiento boolean DEFAULT false, p_canal text DEFAULT NULL, p_origen text DEFAULT 'caja')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_tel text := _fid_tel(p_telefono); v_id uuid;
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para registrar clientes'; END IF;
  IF p_consentimiento AND p_canal IS NULL THEN RAISE EXCEPTION 'Indica por qué canal acepta recibir mensajes'; END IF;
  IF v_tel IS NOT NULL AND EXISTS (SELECT 1 FROM clientes WHERE restaurant_id = v_rid AND telefono = v_tel) THEN
    RAISE EXCEPTION 'Ya existe un cliente con ese teléfono';
  END IF;
  INSERT INTO clientes (restaurant_id, nombre, telefono, correo, cumpleanos, consentimiento_marketing, consentimiento_at, consentimiento_canal, origen, creado_por)
  VALUES (v_rid, btrim(p_nombre), v_tel, NULLIF(btrim(p_correo), ''), p_cumpleanos, COALESCE(p_consentimiento, false),
          CASE WHEN p_consentimiento THEN now() END, CASE WHEN p_consentimiento THEN p_canal END,
          CASE WHEN COALESCE(p_origen, 'caja') IN ('caja','mesa','qr','whatsapp','manual','importado') THEN COALESCE(p_origen, 'caja') ELSE 'caja' END, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO fid_cuentas (cliente_id, restaurant_id) VALUES (v_id, v_rid);
  PERFORM _fid_audit(v_rid, 'cliente_registrado', 'cliente', v_id, jsonb_build_object('origen', p_origen, 'rol', v_rol));
  RETURN v_id;
END;
$$;

-- Buscar por QR, teléfono (últimos dígitos) o nombre. Solo el admin ve el teléfono completo.
CREATE OR REPLACE FUNCTION public.fid_buscar_cliente(p_q text)
 RETURNS TABLE (id uuid, nombre text, telefono text, puntos_saldo int, sellos_saldo int, nivel text, ultima_visita timestamptz, acepta_mensajes boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role(); v_q text := btrim(COALESCE(p_q, '')); v_dig text := regexp_replace(COALESCE(p_q, ''), '\D', '', 'g');
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para consultar clientes'; END IF;
  IF char_length(v_q) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.nombre,
           CASE WHEN c.telefono IS NULL THEN NULL WHEN v_rol = 'admin' THEN c.telefono ELSE '******' || right(c.telefono, 4) END,
           a.puntos_saldo, a.sellos_saldo, n.nombre, CASE WHEN v_rol = 'admin' THEN a.ultima_visita END, c.consentimiento_marketing
      FROM clientes c
      JOIN fid_cuentas a ON a.cliente_id = c.id
      LEFT JOIN fid_niveles n ON n.id = a.nivel_id
     WHERE c.restaurant_id = v_rid AND c.activo
       AND ( c.qr_token = v_q
          OR (char_length(v_dig) >= 4 AND c.telefono LIKE '%' || v_dig)
          OR position(lower(v_q) in lower(c.nombre)) > 0 )
     ORDER BY (c.qr_token = v_q) DESC, c.nombre
     LIMIT 20;
END;
$$;

-- Ficha de un cliente por id (para mostrarla justo después de registrarlo o elegirlo).
CREATE OR REPLACE FUNCTION public.fid_ficha_cliente(p_id uuid)
 RETURNS TABLE (id uuid, nombre text, telefono text, puntos_saldo int, sellos_saldo int, nivel text, acepta_mensajes boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier','waiter') THEN RAISE EXCEPTION 'Sin permiso para consultar clientes'; END IF;
  RETURN QUERY
    SELECT c.id, c.nombre,
           CASE WHEN c.telefono IS NULL THEN NULL WHEN v_rol = 'admin' THEN c.telefono ELSE '******' || right(c.telefono, 4) END,
           a.puntos_saldo, a.sellos_saldo, n.nombre, c.consentimiento_marketing
      FROM clientes c
      JOIN fid_cuentas a ON a.cliente_id = c.id
      LEFT JOIN fid_niveles n ON n.id = a.nivel_id
     WHERE c.id = p_id AND c.restaurant_id = v_rid;
END;
$$;

REVOKE ALL ON FUNCTION public.fid_ficha_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fid_ficha_cliente(uuid) TO authenticated;
