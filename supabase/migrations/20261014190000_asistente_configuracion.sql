-- Asistente de configuracion de restaurante nuevo (Bloque 9 / Anexo D del spec).
-- 1) columnas nuevas, 2) tabla de progreso, 3) funciones de carga en lote (el restaurante SIEMPRE sale de la
--    sesion, nunca de lo que mande el navegador; solo admin; una transaccion por llamada).
-- Los restaurantes que YA existen quedan marcados como configurados: el asistente solo aparece en los nuevos.
-- Reversa: supabase/rollback/20261014190000_asistente_configuracion_down.sql

ALTER TABLE public.restaurant_config
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Razon social y NIT NO van en restaurant_config: esa tabla la lee cualquier visitante (menu publico).
CREATE TABLE IF NOT EXISTS public.restaurant_fiscal (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE DEFAULT public.current_restaurant_id(),
  razon_social  text,
  nit           text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona los datos fiscales de su restaurante" ON public.restaurant_fiscal
  FOR ALL TO authenticated
  USING ((( SELECT public.is_admin()) AND restaurant_id = ( SELECT public.current_restaurant_id())) OR ( SELECT public.is_super_admin()))
  WITH CHECK ((( SELECT public.is_admin()) AND restaurant_id = ( SELECT public.current_restaurant_id())) OR ( SELECT public.is_super_admin()));

UPDATE public.restaurant_config SET onboarding_completed_at = now() WHERE onboarding_completed_at IS NULL;

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_onboarding (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE DEFAULT public.current_restaurant_id(),
  current_step  integer NOT NULL DEFAULT 1,
  steps_done    jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gestiona el progreso de su asistente" ON public.restaurant_onboarding
  FOR ALL TO authenticated
  USING ((( SELECT public.is_admin()) AND restaurant_id = ( SELECT public.current_restaurant_id())) OR ( SELECT public.is_super_admin()))
  WITH CHECK ((( SELECT public.is_admin()) AND restaurant_id = ( SELECT public.current_restaurant_id())) OR ( SELECT public.is_super_admin()));

-- Solo el admin de un restaurante; devuelve su restaurant_id
CREATE OR REPLACE FUNCTION public._onb_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public.current_restaurant_id();
BEGIN
  IF NOT public.is_admin() OR rid IS NULL THEN RAISE EXCEPTION 'Solo el administrador del restaurante'; END IF;
  RETURN rid;
END $$;

-- Mesas 1..N sin duplicar las que ya existen. Devuelve cuantas mesas tiene el restaurante.
CREATE OR REPLACE FUNCTION public.crear_mesas(p_cantidad integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._onb_admin(); n int;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 0 OR p_cantidad > 100 THEN RAISE EXCEPTION 'La cantidad de mesas debe estar entre 0 y 100'; END IF;
  INSERT INTO public.mesas (restaurant_id, numero)
  SELECT rid, g FROM generate_series(1, p_cantidad) g
  ON CONFLICT (restaurant_id, numero) DO NOTHING;
  SELECT count(*) INTO n FROM public.mesas WHERE restaurant_id = rid;
  RETURN n;
END $$;

-- Proveedores: filas {nombre, telefono, correo, producto}. Si el nombre ya existe, se omite.
CREATE OR REPLACE FUNCTION public.importar_proveedores(p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._onb_admin(); f jsonb; nom text; c int := 0; e int := 0; i int := 0; err jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 500 THEN RAISE EXCEPTION 'Maximo 500 filas por carga'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    i := i + 1; nom := btrim(coalesce(f->>'nombre',''));
    IF nom = '' THEN CONTINUE; END IF;
    IF char_length(nom) > 120 THEN err := err || jsonb_build_object('fila', i, 'motivo', 'El nombre es muy largo'); CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.proveedores WHERE restaurant_id = rid AND lower(btrim(nombre)) = lower(nom)) THEN e := e + 1; CONTINUE; END IF;
    INSERT INTO public.proveedores (restaurant_id, nombre, telefono, email, producto)
    VALUES (rid, nom, left(nullif(btrim(f->>'telefono'),''), 40), nullif(btrim(f->>'correo'),''), left(nullif(btrim(f->>'producto'),''), 200));
    c := c + 1;
  END LOOP;
  RETURN jsonb_build_object('creados', c, 'existentes', e, 'errores', err);
END $$;

-- Ingredientes: filas {nombre, unidad, stock_actual, stock_minimo, costo_unitario, proveedor}.
CREATE OR REPLACE FUNCTION public.importar_ingredientes(p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._onb_admin(); f jsonb; nom text; u text; pid uuid; n int;
  c int := 0; e int := 0; i int := 0; err jsonb := '[]'::jsonb; sinprov jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 500 THEN RAISE EXCEPTION 'Maximo 500 filas por carga'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    i := i + 1; nom := btrim(coalesce(f->>'nombre',''));
    IF nom = '' THEN CONTINUE; END IF;
    BEGIN
      u := CASE lower(btrim(coalesce(f->>'unidad','')))
        WHEN 'kg' THEN 'kg' WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg' WHEN 'kilogramo' THEN 'kg' WHEN 'kilogramos' THEN 'kg'
        WHEN 'g' THEN 'gramo' WHEN 'gr' THEN 'gramo' WHEN 'gramo' THEN 'gramo' WHEN 'gramos' THEN 'gramo'
        WHEN 'l' THEN 'litro' WHEN 'lt' THEN 'litro' WHEN 'litro' THEN 'litro' WHEN 'litros' THEN 'litro'
        WHEN 'ml' THEN 'ml' WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
        WHEN 'pieza' THEN 'pieza' WHEN 'piezas' THEN 'pieza' WHEN 'unidad' THEN 'pieza' WHEN 'unidades' THEN 'pieza' WHEN 'und' THEN 'pieza' WHEN 'u' THEN 'pieza'
        WHEN 'paquete' THEN 'paquete' WHEN 'paquetes' THEN 'paquete' WHEN 'paq' THEN 'paquete'
        ELSE NULL END;
      IF u IS NULL THEN RAISE EXCEPTION 'Unidad no valida (usa kg, gramo, litro, ml, pieza o paquete)'; END IF;
      IF EXISTS (SELECT 1 FROM public.ingredientes WHERE restaurant_id = rid AND lower(btrim(nombre)) = lower(nom)) THEN e := e + 1; CONTINUE; END IF;
      pid := NULL;
      IF btrim(coalesce(f->>'proveedor','')) <> '' THEN
        SELECT id INTO pid FROM public.proveedores WHERE restaurant_id = rid AND lower(btrim(nombre)) = lower(btrim(f->>'proveedor')) LIMIT 1;
        IF pid IS NULL THEN sinprov := sinprov || to_jsonb(btrim(f->>'proveedor')); END IF;
      END IF;
      INSERT INTO public.ingredientes (restaurant_id, nombre, unidad_medida, stock_actual, stock_minimo, costo_unitario, proveedor_id)
      VALUES (rid, nom, u,
              coalesce(nullif(btrim(f->>'stock_actual'),'')::numeric, 0),
              coalesce(nullif(btrim(f->>'stock_minimo'),'')::numeric, 0),
              coalesce(nullif(btrim(f->>'costo_unitario'),'')::numeric, 0), pid)
      ON CONFLICT (restaurant_id, nombre) DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN e := e + 1; ELSE c := c + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      err := err || jsonb_build_object('fila', i, 'motivo', CASE WHEN SQLSTATE IN ('22P02','22003') THEN 'Un numero no es valido' WHEN SQLSTATE = '23514' THEN 'Un valor esta fuera de rango (no se aceptan negativos)' ELSE SQLERRM END);
    END;
  END LOOP;
  RETURN jsonb_build_object('creados', c, 'existentes', e, 'errores', err, 'proveedores_no_encontrados', sinprov);
END $$;

-- Menu: filas {nombre, categoria, precio, descripcion}. Crea las categorias nuevas y omite platos que ya existen.
CREATE OR REPLACE FUNCTION public.importar_menu(p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid := public._onb_admin(); f jsonb; nom text; catl text; catv text; price numeric; cats jsonb; modules jsonb;
  c int := 0; e int := 0; i int := 0; err jsonb := '[]'::jsonb; so int;
BEGIN
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 500 THEN RAISE EXCEPTION 'Maximo 500 filas por carga'; END IF;
  SELECT coalesce(modules_enabled, '{}'::jsonb) INTO modules FROM public.restaurant_config WHERE restaurant_id = rid;
  modules := coalesce(modules, '{}'::jsonb);
  cats := CASE WHEN jsonb_typeof(modules->'categories') = 'array' AND jsonb_array_length(modules->'categories') > 0 THEN modules->'categories'
    ELSE '[{"value":"entrada","label":"Entrada","emoji":"🥗","color":"#10B981"},{"value":"principal","label":"Principal","emoji":"🍽️","color":"#3B82F6"},{"value":"postre","label":"Postre","emoji":"🍰","color":"#EC4899"},{"value":"bebida","label":"Bebida","emoji":"🥤","color":"#06B6D4"},{"value":"especial","label":"Especial","emoji":"⭐","color":"#F59E0B"}]'::jsonb END;
  SELECT coalesce(max(sort_order), 0) INTO so FROM public.dishes WHERE restaurant_id = rid;
  FOR f IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    i := i + 1; nom := btrim(coalesce(f->>'nombre',''));
    IF nom = '' THEN CONTINUE; END IF;
    BEGIN
      IF char_length(nom) < 2 OR char_length(nom) > 100 THEN RAISE EXCEPTION 'El nombre debe tener entre 2 y 100 letras'; END IF;
      price := coalesce(nullif(btrim(f->>'precio'),'')::numeric, 0);
      IF price < 0 THEN RAISE EXCEPTION 'El precio no puede ser negativo'; END IF;
      IF EXISTS (SELECT 1 FROM public.dishes WHERE restaurant_id = rid AND lower(btrim(name)) = lower(nom)) THEN e := e + 1; CONTINUE; END IF;
      catl := btrim(coalesce(nullif(btrim(f->>'categoria'),''), 'Principal'));
      catv := NULL;
      SELECT x->>'value' INTO catv FROM jsonb_array_elements(cats) x WHERE lower(x->>'label') = lower(catl) OR lower(x->>'value') = lower(catl) LIMIT 1;
      IF catv IS NULL THEN
        catv := btrim(regexp_replace(lower(translate(catl, 'áéíóúñÁÉÍÓÚÑ', 'aeiounaeioun')), '[^a-z0-9]+', '_', 'g'), '_');
        IF catv = '' THEN catv := 'otro'; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cats) x WHERE x->>'value' = catv) THEN
          cats := cats || jsonb_build_array(jsonb_build_object('value', catv, 'label', left(catl, 40), 'emoji', '🍽️', 'color', '#FF6B4A'));
        END IF;
      END IF;
      so := so + 1;
      INSERT INTO public.dishes (restaurant_id, name, category, price, description, sort_order)
      VALUES (rid, nom, catv, price, left(nullif(btrim(f->>'descripcion'),''), 500), so);
      c := c + 1;
    EXCEPTION WHEN OTHERS THEN
      err := err || jsonb_build_object('fila', i, 'motivo', CASE WHEN SQLSTATE IN ('22P02','22003') THEN 'El precio no es un numero valido' ELSE SQLERRM END);
    END;
  END LOOP;
  UPDATE public.restaurant_config SET modules_enabled = modules || jsonb_build_object('categories', cats) WHERE restaurant_id = rid;
  RETURN jsonb_build_object('creados', c, 'existentes', e, 'errores', err);
END $$;

REVOKE ALL ON FUNCTION public._onb_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_mesas(integer), public.importar_proveedores(jsonb),
  public.importar_ingredientes(jsonb), public.importar_menu(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_mesas(integer), public.importar_proveedores(jsonb),
  public.importar_ingredientes(jsonb), public.importar_menu(jsonb) TO authenticated;
