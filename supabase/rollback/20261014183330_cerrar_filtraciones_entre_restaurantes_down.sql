-- Reversa de 20261014183330_cerrar_filtraciones_entre_restaurantes.sql
-- ATENCION: vuelve a abrir las lecturas que permitian ver los pedidos y los restaurantes de todos los clientes.
-- Usar solo si el menu publico deja de funcionar y no hay otra salida.
GRANT SELECT ON public.pedido_estado_publico, public.restaurants_public TO anon, authenticated;

DROP FUNCTION IF EXISTS public.estado_pedido_publico(uuid);
DROP FUNCTION IF EXISTS public.restaurante_publico(text, uuid);

DROP POLICY IF EXISTS "Evidencia: propia o del mismo restaurante (admin)" ON storage.objects;
DROP POLICY IF EXISTS "Evidencia: el admin borra solo la de su restaurante" ON storage.objects;
CREATE POLICY "Authenticated can read task evidence" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'task-evidence');
CREATE POLICY "Admins can delete evidence" ON storage.objects
  FOR DELETE USING (bucket_id = 'task-evidence' AND public.is_admin());
