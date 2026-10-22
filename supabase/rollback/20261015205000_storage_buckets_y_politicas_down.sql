-- Reversa de 20261015205000_storage_buckets_y_politicas.sql
-- ATENCION: task-evidence vuelve a ser publico y cualquier usuario autenticado puede subir/sobreescribir en restaurant-assets.
UPDATE storage.buckets SET public = true WHERE id = 'task-evidence';
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'branding';
DROP POLICY IF EXISTS "assets: subir en la carpeta del propio restaurante" ON storage.objects;
DROP POLICY IF EXISTS "assets: el admin borra lo de su restaurante" ON storage.objects;
CREATE POLICY "Auth users upload assets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated'
              AND (storage.foldername(name))[1] = ANY (ARRAY['avatars','dishes','restaurants']));
CREATE POLICY "Auth users update assets" ON storage.objects FOR UPDATE
  USING (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated');
