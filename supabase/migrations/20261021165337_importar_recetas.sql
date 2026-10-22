-- Bloque 9, paso 1a: carga de recetas en lote para el asistente de configuración.
-- Aditiva (solo funciones nuevas). El restaurante sale de la sesión (_onb_admin), nunca del navegador.
-- Importante: al vender, descontar_ingredientes resta cantidad_necesaria DIRECTO del inventario, así que
-- la cantidad se guarda siempre en la unidad del INGREDIENTE (se convierte kg<->gramo y litro<->ml; lo demás debe coincidir).

-- Nombre de unidad -> unidad canónica (las 6 que acepta ingredientes). NULL si no se reconoce.
CREATE OR REPLACE FUNCTION public._unidad_canonica(p text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(coalesce(p,'')))
    WHEN 'kg' THEN 'kg' WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg' WHEN 'kilogramo' THEN 'kg' WHEN 'kilogramos' THEN 'kg'
    WHEN 'g' THEN 'gramo' WHEN 'gr' THEN 'gramo' WHEN 'gramo' THEN 'gramo' WHEN 'gramos' THEN 'gramo'
    WHEN 'l' THEN 'litro' WHEN 'lt' THEN 'litro' WHEN 'litro' THEN 'litro' WHEN 'litros' THEN 'litro'
    WHEN 'ml' THEN 'ml' WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
    WHEN 'pieza' THEN 'pieza' WHEN 'piezas' THEN 'pieza' WHEN 'unidad' THEN 'pieza' WHEN 'unidades' THEN 'pieza' WHEN 'und' THEN 'pieza' WHEN 'u' THEN 'pieza'
    WHEN 'paquete' THEN 'paquete' WHEN 'paquetes' THEN 'paquete' WHEN 'paq' THEN 'paquete'
    ELSE NULL END;
$function$;

-- p_filas: [{plato, ingrediente, cantidad, unidad}]. Valida TODAS las filas primero: si hay un error no se guarda nada.
-- Si todo está bien, reemplaza la receta de cada plato mencionado (una sola transacción).
CREATE OR REPLACE FUNCTION public.importar_recetas(p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rid uuid := public._onb_admin(); f jsonb; i int := 0; err jsonb := '[]'::jsonb; ok jsonb := '[]'::jsonb;
  nom_p text; nom_i text; did uuid; iid uuid; u_i text; u_r text; costo numeric; cant numeric; fac numeric; nplatos int; nlineas int;
BEGIN
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 500 THEN RAISE EXCEPTION 'Maximo 500 filas por carga'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    i := i + 1; nom_p := btrim(coalesce(f->>'plato','')); nom_i := btrim(coalesce(f->>'ingrediente',''));
    IF nom_p = '' AND nom_i = '' THEN CONTINUE; END IF;
    BEGIN
      IF nom_p = '' OR nom_i = '' THEN RAISE EXCEPTION 'Falta el plato o el ingrediente'; END IF;
      SELECT id INTO did FROM public.dishes WHERE restaurant_id = rid AND lower(btrim(name)) = lower(nom_p) ORDER BY created_at LIMIT 1;
      IF did IS NULL THEN RAISE EXCEPTION 'No existe el plato "%"', nom_p; END IF;
      SELECT id, unidad_medida, costo_unitario INTO iid, u_i, costo FROM public.ingredientes
       WHERE restaurant_id = rid AND lower(btrim(nombre)) = lower(nom_i) LIMIT 1;
      IF iid IS NULL THEN RAISE EXCEPTION 'No existe el ingrediente "%"', nom_i; END IF;
      cant := nullif(btrim(replace(coalesce(f->>'cantidad',''), ',', '.')), '')::numeric;
      IF cant IS NULL OR cant <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que 0'; END IF;
      IF btrim(coalesce(f->>'unidad','')) = '' THEN u_r := u_i;
      ELSE
        u_r := public._unidad_canonica(f->>'unidad');
        IF u_r IS NULL THEN RAISE EXCEPTION 'Unidad no valida (usa kg, gramo, litro, ml, pieza o paquete)'; END IF;
      END IF;
      fac := CASE WHEN u_r = u_i THEN 1
                  WHEN u_r = 'gramo' AND u_i = 'kg' THEN 0.001 WHEN u_r = 'kg' AND u_i = 'gramo' THEN 1000
                  WHEN u_r = 'ml' AND u_i = 'litro' THEN 0.001 WHEN u_r = 'litro' AND u_i = 'ml' THEN 1000
                  ELSE NULL END;
      IF fac IS NULL THEN RAISE EXCEPTION 'No se puede pasar de % a % (la unidad del ingrediente "%")', u_r, u_i, nom_i; END IF;
      ok := ok || jsonb_build_object('dish', did, 'ing', iid, 'nombre', nom_i, 'unidad', u_i, 'costo', costo, 'cant', cant * fac);
    EXCEPTION WHEN OTHERS THEN
      err := err || jsonb_build_object('fila', i, 'motivo', CASE WHEN SQLSTATE IN ('22P02','22003') THEN 'Un numero no es valido' ELSE SQLERRM END);
    END;
  END LOOP;
  IF jsonb_array_length(err) > 0 THEN
    RETURN jsonb_build_object('platos', 0, 'lineas', 0, 'errores', err);
  END IF;
  IF jsonb_array_length(ok) = 0 THEN RETURN jsonb_build_object('platos', 0, 'lineas', 0, 'errores', err); END IF;

  DELETE FROM public.recetas WHERE restaurant_id = rid
     AND producto_id IN (SELECT DISTINCT (x->>'dish')::uuid FROM jsonb_array_elements(ok) x);
  INSERT INTO public.recetas (restaurant_id, producto_id, ingrediente_id, nombre, costo_unitario, unidad, cantidad_necesaria)
  SELECT rid, (x->>'dish')::uuid, (x->>'ing')::uuid, max(x->>'nombre'), max((x->>'costo')::numeric), max(x->>'unidad'), sum((x->>'cant')::numeric)
    FROM jsonb_array_elements(ok) x GROUP BY (x->>'dish')::uuid, (x->>'ing')::uuid;
  GET DIAGNOSTICS nlineas = ROW_COUNT;
  SELECT count(DISTINCT x->>'dish') INTO nplatos FROM jsonb_array_elements(ok) x;
  RETURN jsonb_build_object('platos', nplatos, 'lineas', nlineas, 'errores', err);
END $function$;

REVOKE ALL ON FUNCTION public._unidad_canonica(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importar_recetas(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_recetas(jsonb) TO authenticated;
