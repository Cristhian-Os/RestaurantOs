-- Compra a proveedor: crea el proveedor y los ingredientes que todavia no existen.
-- REVERSA: supabase/rollback/20261015073000_compra_crea_ingrediente_y_proveedor_down.sql
--
-- Antes: registrar_compra_proveedor solo sumaba stock si la linea traia un ingrediente_id ya existente.
--   Un producto nuevo (o mal escrito) quedaba en gasto_items pero nunca llegaba al inventario, y el proveedor
--   era solo texto en `concepto`.
-- Ahora, dentro de la MISMA transaccion del gasto:
--   * El proveedor (nombre = p_concepto, convencion de la caja) se busca sin distinguir mayusculas, tildes ni
--     espacios repetidos; si no existe se crea. Si p_concepto es largo (> 120) se toma como texto libre y
--     no se crea proveedor.
--   * Cada linea sin ingrediente_id se busca por nombre con la misma normalizacion; si no existe se crea
--     (stock = cantidad comprada, minimo 0, costo = precio de la compra, proveedor = el de la compra).
--   * Las lineas nuevas EXIGEN una unidad valida (kg, gramo, litro, ml, pieza, paquete): sin unidad no se
--     puede saber en que se cuenta el stock. Si falta, la compra completa se rechaza (nada queda a medias).
--   * Si la linea nombra un ingrediente que ya existe pero con otra unidad, se rechaza en vez de sumar
--     500 "g" a un stock en "kg".
--   * Un ingrediente_id de OTRO restaurante ya no se acepta (antes quedaba referenciado en gasto_items).
-- Quien puede crear: admin y cajero (decision del dueño). La funcion es SECURITY DEFINER, por eso no choca
--   con las politicas RLS de `ingredientes` (solo admin) ni de `proveedores` (solo admin crea).

-- ── 1. El gasto recuerda a que proveedor se le compro ──────────────────────────────────────────────
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gastos_proveedor_id_idx ON public.gastos (proveedor_id) WHERE proveedor_id IS NOT NULL;

-- ── 2. Ayudantes internos (no se exponen al API) ───────────────────────────────────────────────────
-- Nombre normalizado para comparar: minusculas, sin tildes (n con tilde incluida) y espacios colapsados.
CREATE OR REPLACE FUNCTION public._norm_nombre(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public' AS $$
  SELECT lower(translate(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'),
                         'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
$$;

-- Unidad del texto libre a las 6 que acepta ingredientes.unidad_medida (mismo mapa que importar_ingredientes).
CREATE OR REPLACE FUNCTION public._unidad_ingrediente(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public' AS $$
  SELECT CASE lower(btrim(coalesce(t, '')))
    WHEN 'kg' THEN 'kg' WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg' WHEN 'kilogramo' THEN 'kg' WHEN 'kilogramos' THEN 'kg'
    WHEN 'g' THEN 'gramo' WHEN 'gr' THEN 'gramo' WHEN 'gramo' THEN 'gramo' WHEN 'gramos' THEN 'gramo'
    WHEN 'l' THEN 'litro' WHEN 'lt' THEN 'litro' WHEN 'litro' THEN 'litro' WHEN 'litros' THEN 'litro'
    WHEN 'ml' THEN 'ml' WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
    WHEN 'pieza' THEN 'pieza' WHEN 'piezas' THEN 'pieza' WHEN 'unidad' THEN 'pieza' WHEN 'unidades' THEN 'pieza'
    WHEN 'und' THEN 'pieza' WHEN 'u' THEN 'pieza'
    WHEN 'paquete' THEN 'paquete' WHEN 'paquetes' THEN 'paquete' WHEN 'paq' THEN 'paquete'
    ELSE NULL END
$$;

REVOKE ALL ON FUNCTION public._norm_nombre(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._unidad_ingrediente(text) FROM PUBLIC, anon, authenticated;

-- ── 3. La compra ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_compra_proveedor(p_concepto text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid         UUID := public.current_restaurant_id();
  v_gasto_id    UUID;
  v_item        JSONB;
  v_total       NUMERIC := 0;
  v_ing_id      UUID;
  v_ing_unidad  TEXT;
  v_cantidad    NUMERIC;
  v_precio      NUMERIC;
  v_nombre      TEXT;
  v_unidad      TEXT;
  v_prov_nombre TEXT;
  v_prov_id     UUID;
  v_prov_nuevo  BOOLEAN := false;
  v_creados     JSONB := '[]'::jsonb;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden registrar gastos';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Maximo 200 productos por compra';
  END IF;

  SELECT COALESCE(SUM((i->>'cantidad')::numeric * (i->>'precio_unitario')::numeric), 0)
  INTO v_total FROM jsonb_array_elements(p_items) i;

  -- Proveedor: buscar por nombre normalizado o crearlo.
  v_prov_nombre := regexp_replace(btrim(coalesce(p_concepto, '')), '\s+', ' ', 'g');
  IF char_length(v_prov_nombre) BETWEEN 1 AND 120 THEN
    SELECT id INTO v_prov_id FROM public.proveedores
    WHERE restaurant_id = v_rid AND public._norm_nombre(nombre) = public._norm_nombre(v_prov_nombre)
    ORDER BY created_at LIMIT 1;
    IF v_prov_id IS NULL THEN
      INSERT INTO public.proveedores (restaurant_id, nombre) VALUES (v_rid, v_prov_nombre)
      RETURNING id INTO v_prov_id;
      v_prov_nuevo := true;
    END IF;
  END IF;

  INSERT INTO public.gastos (restaurant_id, concepto, monto, categoria, registrado_por, proveedor_id)
  VALUES (v_rid, p_concepto, v_total, 'proveedor', auth.uid(), v_prov_id)
  RETURNING id INTO v_gasto_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_nombre   := regexp_replace(btrim(coalesce(v_item->>'nombre_producto', '')), '\s+', ' ', 'g');
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio   := (v_item->>'precio_unitario')::numeric;
    v_ing_id   := NULLIF(v_item->>'ingrediente_id', '')::uuid;

    IF v_nombre = '' THEN RAISE EXCEPTION 'Un producto de la compra no tiene nombre'; END IF;

    IF v_ing_id IS NOT NULL THEN
      -- Ingrediente elegido de la lista: debe ser de este restaurante.
      UPDATE public.ingredientes SET
        stock_actual   = stock_actual + v_cantidad,
        costo_unitario = v_precio,
        updated_at     = NOW()
      WHERE id = v_ing_id AND restaurant_id = v_rid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El ingrediente de "%" no existe en este restaurante', v_nombre;
      END IF;
    ELSE
      -- Producto escrito a mano: si ya existe con ese nombre, se suma ahi; si no, se crea.
      SELECT id, unidad_medida INTO v_ing_id, v_ing_unidad FROM public.ingredientes
      WHERE restaurant_id = v_rid AND public._norm_nombre(nombre) = public._norm_nombre(v_nombre)
      ORDER BY created_at LIMIT 1;

      v_unidad := public._unidad_ingrediente(v_item->>'unidad');

      IF v_ing_id IS NOT NULL THEN
        IF btrim(coalesce(v_item->>'unidad', '')) <> '' AND v_unidad IS DISTINCT FROM v_ing_unidad THEN
          RAISE EXCEPTION '"%" ya existe en el inventario en % y la compra viene en "%": registrala en %',
            v_nombre, v_ing_unidad, btrim(v_item->>'unidad'), v_ing_unidad;
        END IF;
        UPDATE public.ingredientes SET
          stock_actual   = stock_actual + v_cantidad,
          costo_unitario = v_precio,
          updated_at     = NOW()
        WHERE id = v_ing_id;
      ELSE
        IF v_unidad IS NULL THEN
          RAISE EXCEPTION '"%" es un producto nuevo: indica su unidad (kg, gramo, litro, ml, pieza o paquete)', v_nombre;
        END IF;
        IF char_length(v_nombre) > 100 THEN
          RAISE EXCEPTION 'El nombre de "%" es demasiado largo para el inventario (maximo 100 letras)', left(v_nombre, 40);
        END IF;
        INSERT INTO public.ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, proveedor_id)
        VALUES (v_rid, v_nombre, v_unidad, v_cantidad, 0, v_precio, v_prov_id)
        ON CONFLICT (restaurant_id, nombre) DO UPDATE SET
          stock_actual   = public.ingredientes.stock_actual + EXCLUDED.stock_actual,
          costo_unitario = EXCLUDED.costo_unitario,
          updated_at     = NOW()
        RETURNING id INTO v_ing_id;
        v_creados := v_creados || jsonb_build_object('id', v_ing_id, 'nombre', v_nombre, 'unidad', v_unidad);
      END IF;
    END IF;

    INSERT INTO public.gasto_items (gasto_id, ingrediente_id, nombre_producto, cantidad, unidad, precio_unitario, restaurant_id)
    VALUES (v_gasto_id, v_ing_id, v_nombre, v_cantidad, NULLIF(v_item->>'unidad', ''), v_precio, v_rid);
  END LOOP;

  RETURN jsonb_build_object(
    'gasto_id', v_gasto_id, 'total', v_total,
    'proveedor_id', v_prov_id, 'proveedor_creado', v_prov_nuevo,
    'ingredientes_creados', v_creados
  );
END; $function$;

REVOKE ALL ON FUNCTION public.registrar_compra_proveedor(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_proveedor(text, jsonb) TO authenticated;
