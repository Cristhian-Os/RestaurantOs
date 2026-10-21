-- Bloque 9, paso 1b: cada restaurante solo escribe sus propias fotos en el bucket restaurant-assets.
-- ANTES: cualquier usuario con sesión podía crear y SOBRESCRIBIR cualquier archivo del bucket (el id de un plato se ve en el menú público).
-- AHORA (_asset_ok), sobre la ruta del archivo:
--   <id del restaurante>/...        -> solo el admin de ese restaurante (portada, fotos nuevas)
--   dishes/<id del plato>.ext       -> solo el admin y solo si el plato es de su restaurante (rutas actuales)
--   avatars/<id del perfil>.ext     -> la propia persona, o el admin si esa persona es de su restaurante
-- La lectura sigue pública (el menú muestra las fotos). Compatible con todo lo que sube la app hoy.

CREATE OR REPLACE FUNCTION public._asset_ok(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  rid uuid := public.current_restaurant_id();
  f1 text := (storage.foldername(p_name))[1];
  f2 text := (storage.foldername(p_name))[2];
  base text := regexp_replace(storage.filename(p_name), '\.[^.]+$', '');
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF f1 = 'avatars' AND f2 IS NULL THEN
    RETURN base = auth.uid()::text
        OR (rid IS NOT NULL AND public.is_admin() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = base AND p.restaurant_id = rid));
  END IF;
  IF rid IS NULL OR NOT public.is_admin() THEN RETURN false; END IF;
  IF f1 = rid::text THEN RETURN true; END IF;
  IF f1 = 'dishes' AND f2 IS NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.dishes d WHERE d.id::text = base AND d.restaurant_id = rid);
  END IF;
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public._asset_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._asset_ok(text) TO authenticated;

DROP POLICY IF EXISTS "Auth users upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update assets" ON storage.objects;

CREATE POLICY "assets: cada restaurante sube lo suyo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'restaurant-assets' AND public._asset_ok(name));
CREATE POLICY "assets: cada restaurante cambia lo suyo" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'restaurant-assets' AND public._asset_ok(name))
  WITH CHECK (bucket_id = 'restaurant-assets' AND public._asset_ok(name));
