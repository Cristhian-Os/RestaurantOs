-- Bloque 5A: facturas de compra con foto (Anexo E).
-- Tabla + bucket privado + funciones de guardado/edición. Admin y cajero leen y suben; solo admin edita y elimina.

CREATE TABLE IF NOT EXISTS public.facturas_compra (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id),
  proveedor_id   uuid REFERENCES public.proveedores (id) ON DELETE SET NULL,
  fecha          date NOT NULL DEFAULT current_date,
  monto          numeric NOT NULL CHECK (monto >= 0),
  nota           text CHECK (nota IS NULL OR char_length(nota) <= 500),
  fotos          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(fotos) BETWEEN 1 AND 10),
  gasto_id       uuid REFERENCES public.gastos (id) ON DELETE SET NULL,
  registrado_por uuid DEFAULT auth.uid() REFERENCES auth.users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facturas_compra_rest_fecha_idx ON public.facturas_compra (restaurant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS facturas_compra_proveedor_idx ON public.facturas_compra (proveedor_id);
ALTER TABLE public.facturas_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin y cajero ven facturas" ON public.facturas_compra FOR SELECT TO authenticated
  USING (((SELECT get_user_role()) = ANY (ARRAY['admin','cashier']) AND restaurant_id = (SELECT current_restaurant_id()))
         OR (SELECT is_super_admin()));
CREATE POLICY "Admin y cajero suben facturas" ON public.facturas_compra FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_user_role()) = ANY (ARRAY['admin','cashier']) AND restaurant_id = (SELECT current_restaurant_id()));
CREATE POLICY "Solo admin edita facturas" ON public.facturas_compra FOR UPDATE TO authenticated
  USING ((SELECT get_user_role()) = 'admin' AND restaurant_id = (SELECT current_restaurant_id()))
  WITH CHECK ((SELECT get_user_role()) = 'admin' AND restaurant_id = (SELECT current_restaurant_id()));
CREATE POLICY "Solo admin elimina facturas" ON public.facturas_compra FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) = 'admin' AND restaurant_id = (SELECT current_restaurant_id()));

CREATE TRIGGER facturas_compra_set_updated_at BEFORE UPDATE ON public.facturas_compra
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fotos: bucket privado; carpeta raíz = id del restaurante.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('facturas', 'facturas', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Facturas: admin y cajero suben a su carpeta" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'facturas' AND (SELECT get_user_role()) = ANY (ARRAY['admin','cashier'])
              AND (string_to_array(name, '/'))[1] = (SELECT current_restaurant_id())::text);
CREATE POLICY "Facturas: admin y cajero leen su carpeta" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'facturas' AND (SELECT get_user_role()) = ANY (ARRAY['admin','cashier'])
         AND (string_to_array(name, '/'))[1] = (SELECT current_restaurant_id())::text);
CREATE POLICY "Facturas: solo admin borra de su carpeta" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'facturas' AND (SELECT get_user_role()) = 'admin'
         AND (string_to_array(name, '/'))[1] = (SELECT current_restaurant_id())::text);

-- Guardar factura (+ gasto opcional) en una sola operación. SECURITY INVOKER: rige el RLS de quien llama.
-- p_id lo genera el cliente: si la subida se reintenta (cola sin internet), no duplica.
CREATE OR REPLACE FUNCTION public.registrar_factura_compra(
  p_id uuid, p_fecha date, p_proveedor_id uuid, p_monto numeric, p_nota text, p_fotos text[], p_registrar_gasto boolean
) RETURNS public.facturas_compra
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rid uuid := current_restaurant_id();
  v_row public.facturas_compra;
  v_prov text;
  v_gasto uuid;
  v_foto text;
BEGIN
  IF get_user_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Sin permiso para subir facturas'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Falta el identificador de la factura'; END IF;
  SELECT * INTO v_row FROM facturas_compra WHERE id = p_id;
  IF FOUND THEN RETURN v_row; END IF;                       -- reintento: ya estaba guardada
  IF p_monto IS NULL OR p_monto < 0 THEN RAISE EXCEPTION 'El monto debe ser un número positivo'; END IF;
  IF p_fotos IS NULL OR cardinality(p_fotos) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'La factura necesita de 1 a 10 fotos'; END IF;
  FOREACH v_foto IN ARRAY p_fotos LOOP
    IF (string_to_array(v_foto, '/'))[1] IS DISTINCT FROM v_rid::text THEN RAISE EXCEPTION 'Foto fuera de la carpeta del restaurante'; END IF;
  END LOOP;
  IF p_proveedor_id IS NOT NULL THEN
    SELECT nombre INTO v_prov FROM proveedores WHERE id = p_proveedor_id AND restaurant_id = v_rid;
    IF v_prov IS NULL THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  END IF;
  IF p_registrar_gasto THEN
    IF p_monto <= 0 THEN RAISE EXCEPTION 'Para registrar el gasto el monto debe ser mayor a cero'; END IF;
    INSERT INTO gastos (concepto, monto, categoria, registrado_por, proveedor_id)
    VALUES (left('Factura' || COALESCE(' ' || v_prov, ''), 200), p_monto,
            CASE WHEN p_proveedor_id IS NOT NULL THEN 'proveedor' ELSE 'otro' END, auth.uid(), p_proveedor_id)
    RETURNING id INTO v_gasto;
  END IF;
  INSERT INTO facturas_compra (id, fecha, proveedor_id, monto, nota, fotos, gasto_id)
  VALUES (p_id, COALESCE(p_fecha, current_date), p_proveedor_id, p_monto, NULLIF(btrim(p_nota), ''), p_fotos, v_gasto)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- Editar (solo admin por RLS): si la factura tiene gasto, el gasto sigue el mismo monto y proveedor.
CREATE OR REPLACE FUNCTION public.editar_factura_compra(
  p_id uuid, p_fecha date, p_proveedor_id uuid, p_monto numeric, p_nota text
) RETURNS public.facturas_compra
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rid uuid := current_restaurant_id();
  v_row public.facturas_compra;
  v_prov text;
BEGIN
  IF get_user_role() <> 'admin' THEN RAISE EXCEPTION 'Solo el administrador puede editar facturas'; END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN RAISE EXCEPTION 'El monto debe ser un número positivo'; END IF;
  IF p_proveedor_id IS NOT NULL THEN
    SELECT nombre INTO v_prov FROM proveedores WHERE id = p_proveedor_id AND restaurant_id = v_rid;
    IF v_prov IS NULL THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  END IF;
  UPDATE facturas_compra SET fecha = COALESCE(p_fecha, fecha), proveedor_id = p_proveedor_id, monto = p_monto,
         nota = NULLIF(btrim(p_nota), '')
   WHERE id = p_id AND restaurant_id = v_rid RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_row.gasto_id IS NOT NULL THEN
    IF p_monto <= 0 THEN RAISE EXCEPTION 'La factura tiene un gasto de caja: el monto debe ser mayor a cero'; END IF;
    UPDATE gastos SET monto = p_monto, proveedor_id = p_proveedor_id,
           categoria = CASE WHEN p_proveedor_id IS NOT NULL THEN 'proveedor' ELSE 'otro' END,
           concepto = left('Factura' || COALESCE(' ' || v_prov, ''), 200)
     WHERE id = v_row.gasto_id AND restaurant_id = v_rid;
  END IF;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.editar_factura_compra(uuid, date, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_factura_compra(uuid, date, uuid, numeric, text) TO authenticated;
