-- Storage: buckets y politicas que existian solo en la base viva, ahora versionados y endurecidos
-- (hallazgos de la auditoria 2026-10-15).
--  * task-evidence pasa a PRIVADO: las fotos de evidencia de tareas eran legibles por cualquiera con la URL, sin pasar por
--    RLS. La app ahora las muestra con URLs firmadas (las politicas de lectura propia/admin del restaurante ya existen).
--  * branding: limite de 5 MB y solo imagenes jpeg/png/webp (no tenia limites).
--  * restaurant-assets: cualquier usuario autenticado podia subir y SOBREESCRIBIR archivos de cualquier restaurante
--    (los ids de platos son publicos). Ahora solo se sube a <carpeta>/<restaurant_id>/..., los avatares los sube cualquier
--    empleado de ese restaurante y el resto (platos, portadas) solo el admin; no hay UPDATE (no se sobreescribe).
-- Las politicas de lectura publica de restaurant-assets y de branding no cambian (son imagenes del menu publico).
-- Reversa: supabase/rollback/20261015205000_storage_buckets_y_politicas_down.sql

UPDATE storage.buckets SET public = false WHERE id = 'task-evidence';
UPDATE storage.buckets
   SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'branding';

DROP POLICY IF EXISTS "Auth users upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update assets" ON storage.objects;
DROP POLICY IF EXISTS "assets: subir en la carpeta del propio restaurante" ON storage.objects;
DROP POLICY IF EXISTS "assets: el admin borra lo de su restaurante" ON storage.objects;

CREATE POLICY "assets: subir en la carpeta del propio restaurante" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND (storage.foldername(name))[1] IN ('avatars', 'dishes', 'restaurants')
    AND (storage.foldername(name))[2] = public.current_restaurant_id()::text
    AND ((storage.foldername(name))[1] = 'avatars' OR public.is_admin())
  );

CREATE POLICY "assets: el admin borra lo de su restaurante" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND (storage.foldername(name))[2] = public.current_restaurant_id()::text
    AND public.is_admin()
  );
