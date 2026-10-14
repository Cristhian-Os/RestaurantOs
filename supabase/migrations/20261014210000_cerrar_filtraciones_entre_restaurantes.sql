-- Cierra filtraciones entre restaurantes que veia un visitante SIN sesion (auditoria del 2026-10-14):
--  * pedido_estado_publico listaba los 676 pedidos de TODOS los restaurantes (estado, mesa, tipo, hora, si estan pagados).
--  * restaurants_public listaba todos los restaurantes activos (lista de clientes de la plataforma).
--  * El bucket task-evidence dejaba a cualquier usuario con sesion (de cualquier restaurante) leer y a cualquier admin
--    borrar las evidencias de tareas de otros restaurantes.
-- Ahora el visitante solo obtiene UN registro y solo si conoce su id / slug. El menu publico sigue igual.
-- Reversa: supabase/rollback/20261014210000_cerrar_filtraciones_entre_restaurantes_down.sql

-- A) Estado de UN pedido (el comensal conoce el id de su pedido)
CREATE OR REPLACE FUNCTION public.estado_pedido_publico(p_order_id uuid)
RETURNS TABLE(status text, pagado boolean, order_number_today integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.status, (o.paid_at IS NOT NULL), o.order_number_today FROM public.orders o WHERE o.id = p_order_id;
$$;

-- B) UN restaurante activo por su slug o su id
CREATE OR REPLACE FUNCTION public.restaurante_publico(p_slug text DEFAULT NULL, p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.slug, r.name FROM public.restaurants r
  WHERE r.active AND ((p_slug IS NOT NULL AND r.slug = lower(p_slug)) OR (p_id IS NOT NULL AND r.id = p_id))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.estado_pedido_publico(uuid), public.restaurante_publico(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estado_pedido_publico(uuid), public.restaurante_publico(text, uuid) TO anon, authenticated;

-- Las vistas que listaban todo ya no se pueden leer desde fuera
REVOKE ALL ON public.pedido_estado_publico, public.restaurants_public FROM PUBLIC, anon, authenticated;

-- C) Evidencias de tareas: cada quien lee y sube lo suyo; el admin solo ve y borra lo de SU restaurante
DROP POLICY IF EXISTS "Authenticated can read task evidence" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete evidence" ON storage.objects;

CREATE POLICY "Evidencia: propia o del mismo restaurante (admin)" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-evidence' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR (public.is_admin() AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id)::text = (storage.foldername(name))[1] AND p.restaurant_id = public.current_restaurant_id()))
    )
  );

CREATE POLICY "Evidencia: el admin borra solo la de su restaurante" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-evidence' AND public.is_admin() AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id)::text = (storage.foldername(name))[1] AND p.restaurant_id = public.current_restaurant_id())
  );
