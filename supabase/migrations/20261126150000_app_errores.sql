-- Detector de errores de la app (etapa 1): la app registra sus propios errores y el vigía de Central (Ronda) los revisa.
-- Aditiva: una tabla nueva y una función nueva. No toca ninguna tabla existente.
-- Seguridad:
--   · La tabla no se escribe directamente desde la app: solo con registrar_error_app (con límites).
--   · Solo el dueño con 2 pasos (central_autorizado) puede leerla. Los restaurantes no ven nada de esto.
--   · Se guarda lo mínimo: tipo, mensaje (300 car.), pila (1500 car.) y la ruta SIN consulta ni identificadores. Sin datos personales.
--   · Contra abuso (la función también la puede llamar quien no ha iniciado sesión): máximo 30 errores nuevos por minuto y 5000 en total.
-- Los errores repetidos no crean filas nuevas: suben el contador "veces". Si uno marcado "resuelto" vuelve a ocurrir, reabre como "nuevo".
-- Depende de: central_nucleo (central_autorizado) y current_restaurant_id().
-- Reversa: supabase/rollback/20261126150000_app_errores_down.sql

CREATE TABLE IF NOT EXISTS public.app_errores (
  huella         text PRIMARY KEY,
  origen         text NOT NULL CHECK (origen IN ('ventana', 'promesa', 'react')),
  mensaje        text NOT NULL CHECK (char_length(mensaje) BETWEEN 1 AND 300),
  pila           text CHECK (pila IS NULL OR char_length(pila) <= 1500),
  ruta           text NOT NULL DEFAULT '' CHECK (char_length(ruta) <= 200),
  restaurante_id uuid,
  veces          integer NOT NULL DEFAULT 1 CHECK (veces >= 1),
  estado         text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'visto', 'resuelto', 'ignorado')),
  primera_vez    timestamptz NOT NULL DEFAULT now(),
  ultima_vez     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_errores_estado_idx ON public.app_errores (estado, ultima_vez DESC);

ALTER TABLE public.app_errores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_errores FROM anon, authenticated;
GRANT SELECT ON public.app_errores TO authenticated;
DROP POLICY IF EXISTS "Central: lee el dueño con 2 pasos" ON public.app_errores;
CREATE POLICY "Central: lee el dueño con 2 pasos" ON public.app_errores FOR SELECT TO authenticated USING ((SELECT public.central_autorizado()));

CREATE OR REPLACE FUNCTION public.registrar_error_app(p_origen text, p_mensaje text, p_pila text DEFAULT NULL, p_ruta text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_msg text; v_ruta text; v_pila text; v_huella text; v_rest uuid; v_nuevos integer;
BEGIN
  IF p_origen IS NULL OR p_origen NOT IN ('ventana', 'promesa', 'react') THEN RETURN; END IF;
  v_msg := left(btrim(regexp_replace(coalesce(p_mensaje, ''), '\s+', ' ', 'g')), 300);
  IF v_msg = '' THEN RETURN; END IF;
  -- La ruta se guarda sin consulta ni #; los identificadores (uuid, números largos) se unifican para no guardar datos de nadie.
  v_ruta := left(regexp_replace(regexp_replace(split_part(split_part(coalesce(p_ruta, ''), '?', 1), '#', 1),
              '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'), '/[0-9]{3,}', '/:n', 'g'), 200);
  v_pila := nullif(left(p_pila, 1500), '');
  v_huella := md5(p_origen || '|' || v_msg);

  -- Contra abuso: si es un error nuevo, se revisa el ritmo y el tamaño total. Los ya conocidos solo suman al contador.
  IF NOT EXISTS (SELECT 1 FROM public.app_errores WHERE huella = v_huella) THEN
    SELECT count(*) INTO v_nuevos FROM public.app_errores WHERE primera_vez > now() - interval '1 minute';
    IF v_nuevos >= 30 THEN RETURN; END IF;
    IF (SELECT count(*) FROM public.app_errores) >= 5000 THEN RETURN; END IF;
  END IF;

  v_rest := CASE WHEN auth.uid() IS NULL THEN NULL ELSE (SELECT public.current_restaurant_id()) END;

  INSERT INTO public.app_errores (huella, origen, mensaje, pila, ruta, restaurante_id)
  VALUES (v_huella, p_origen, v_msg, v_pila, v_ruta, v_rest)
  ON CONFLICT (huella) DO UPDATE
    SET veces = public.app_errores.veces + 1,
        ultima_vez = now(),
        estado = CASE WHEN public.app_errores.estado = 'resuelto' THEN 'nuevo' ELSE public.app_errores.estado END;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_error_app(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_error_app(text, text, text, text) TO anon, authenticated;
