-- Prueba de 20261126150000_app_errores. Un solo bloque DO que termina con RAISE EXCEPTION: todo se deshace. ESPERADO: todo "OK".
DO $$
DECLARE
  r text := ''; n int; v int; est text; ruta_g text; ok boolean; i int;
BEGIN
  -- 1. Sin sesión (anon) se puede registrar; el mismo error dos veces suma al contador, no crea otra fila
  SET LOCAL ROLE anon;
  PERFORM public.registrar_error_app('ventana', 'Cannot read properties of undefined', E'Error\n  en x', '/caja');
  PERFORM public.registrar_error_app('ventana', 'Cannot read properties of undefined', E'Error\n  en x', '/caja');
  RESET ROLE;
  SELECT count(*), max(veces) INTO n, v FROM public.app_errores WHERE mensaje = 'Cannot read properties of undefined';
  r := r || CASE WHEN n = 1 AND v = 2 THEN 'OK   ' ELSE 'FALLA' END || ' 1 mismo error: una fila, contador 2 (filas=' || n || ', veces=' || coalesce(v, 0) || ')' || E'\n';

  -- 2. La ruta se guarda sin consulta, sin # y sin identificadores
  SET LOCAL ROLE anon;
  PERFORM public.registrar_error_app('promesa', 'fallo con id', NULL, '/menu/123456/mesa/9f8b7c6d-1111-2222-3333-444455556666?token=secreto#parte');
  RESET ROLE;
  SELECT ruta INTO ruta_g FROM public.app_errores WHERE mensaje = 'fallo con id';
  r := r || CASE WHEN ruta_g = '/menu/:n/mesa/:id' THEN 'OK   ' ELSE 'FALLA' END || ' 2 ruta sin datos de nadie (' || coalesce(ruta_g, 'NULL') || ')' || E'\n';

  -- 3. Origen inválido o mensaje vacío: se ignora sin error
  SET LOCAL ROLE anon;
  PERFORM public.registrar_error_app('otra_cosa', 'x', NULL, '/');
  PERFORM public.registrar_error_app('react', '   ', NULL, '/');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.app_errores WHERE mensaje IN ('x') OR btrim(mensaje) = '';
  r := r || CASE WHEN n = 0 THEN 'OK   ' ELSE 'FALLA' END || ' 3 origen inválido o mensaje vacío se ignoran' || E'\n';

  -- 4. Quien no es el dueño no puede leer la tabla (ni anon, ni un usuario con sesión)
  ok := false;
  BEGIN SET LOCAL ROLE anon; PERFORM 1 FROM public.app_errores LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  RESET ROLE;
  r := r || CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' 4a anon no puede leer app_errores' || E'\n';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', gen_random_uuid(), 'aal', 'aal2')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.app_errores;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'OK   ' ELSE 'FALLA' END || ' 4b un usuario cualquiera ve 0 filas (RLS)' || E'\n';

  -- 5. Nadie puede escribir directo en la tabla
  ok := false;
  BEGIN SET LOCAL ROLE anon; INSERT INTO public.app_errores (huella, origen, mensaje) VALUES ('h', 'react', 'directo'); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  RESET ROLE;
  r := r || CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' 5 no se escribe directo en la tabla' || E'\n';

  -- 6. Un error "resuelto" que vuelve a ocurrir se reabre como "nuevo"
  UPDATE public.app_errores SET estado = 'resuelto' WHERE mensaje = 'fallo con id';
  SET LOCAL ROLE anon; PERFORM public.registrar_error_app('promesa', 'fallo con id', NULL, '/menu'); RESET ROLE;
  SELECT estado INTO est FROM public.app_errores WHERE mensaje = 'fallo con id';
  r := r || CASE WHEN est = 'nuevo' THEN 'OK   ' ELSE 'FALLA' END || ' 6 un error resuelto que vuelve se reabre (' || coalesce(est, 'NULL') || ')' || E'\n';

  -- 7. Freno contra abuso: más de 30 errores NUEVOS en un minuto, los demás se descartan
  SET LOCAL ROLE anon;
  FOR i IN 1..60 LOOP PERFORM public.registrar_error_app('ventana', 'inundacion ' || i, NULL, '/'); END LOOP;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.app_errores WHERE mensaje LIKE 'inundacion %';
  r := r || CASE WHEN n BETWEEN 1 AND 30 THEN 'OK   ' ELSE 'FALLA' END || ' 7 freno de 30 nuevos por minuto (entraron ' || n || ' de 60)' || E'\n';

  RAISE EXCEPTION E'\n%', r;
END $$;
