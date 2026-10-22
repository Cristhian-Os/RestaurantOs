-- Reversa de fotos_por_restaurante: vuelve a las políticas anteriores del bucket restaurant-assets (las amplias).
DROP POLICY IF EXISTS "assets: cada restaurante sube lo suyo" ON storage.objects;
DROP POLICY IF EXISTS "assets: cada restaurante cambia lo suyo" ON storage.objects;
CREATE POLICY "Auth users upload assets" ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated'
              AND (storage.foldername(name))[1] = ANY (ARRAY['avatars','dishes','restaurants']));
CREATE POLICY "Auth users update assets" ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated');
DROP FUNCTION IF EXISTS public._asset_ok(text);
