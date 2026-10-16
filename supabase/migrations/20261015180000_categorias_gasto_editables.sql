-- Estado: APLICADA en producción el 2026-10-15 (verificada: 5 restaurantes con 7 categorías sugeridas cada uno + 0 en gastos existentes; RLS activo con 3 políticas; anon sin acceso; sin avisos nuevos del asesor de seguridad).
-- Reversa: supabase/rollback/20261015180000_categorias_gasto_editables_down.sql
--
-- Categorías de gastos editables por restaurante ("¿en qué se gastó?").
--  • gastos.categoria guarda la CLAVE de la categoría (texto estable, ej. 'insumos'); el nombre que se
--    ve es categorias_gasto.nombre, así que renombrar una categoría actualiza todo el historial.
--  • "Quitar" una categoría = desactivarla (activa = false): deja de ofrecerse al registrar gastos,
--    pero los gastos ya hechos conservan su nombre. Por eso no hay política de DELETE.
--  • Admin y cajero VEN las categorías (el cajero las necesita para registrar gastos); solo el admin
--    crea y edita (lo exige también la base de datos).
--  • Las claves 'proveedor' (compras a proveedor) y 'sin_categoria' son del sistema y no se pueden crear.

CREATE TABLE public.categorias_gasto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  clave          text NOT NULL CHECK (clave ~ '^[a-z0-9_]{1,40}$' AND clave NOT IN ('proveedor', 'sin_categoria')),
  nombre         text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 60),
  activa         boolean NOT NULL DEFAULT true,
  orden          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, clave)
);
-- Dos categorías del mismo restaurante no pueden llamarse igual (sin importar mayúsculas ni espacios de los bordes).
CREATE UNIQUE INDEX categorias_gasto_nombre_unico_idx ON public.categorias_gasto (restaurant_id, lower(btrim(nombre)));

ALTER TABLE public.categorias_gasto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.categorias_gasto FROM anon;

CREATE POLICY "Admin y cajero ven categorias de gasto" ON public.categorias_gasto AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ((( SELECT public.get_user_role() AS r) = ANY (ARRAY['admin'::text, 'cashier'::text]))
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  );

CREATE POLICY "Solo admin crea categorias de gasto" ON public.categorias_gasto AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((( SELECT public.get_user_role() AS r) = 'admin')
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  );

CREATE POLICY "Solo admin edita categorias de gasto" ON public.categorias_gasto AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    ((( SELECT public.get_user_role() AS r) = 'admin')
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  )
  WITH CHECK (
    ((( SELECT public.get_user_role() AS r) = 'admin')
      AND (restaurant_id = ( SELECT public.current_restaurant_id() AS c)))
    OR ( SELECT public.is_super_admin() AS s)
  );

-- Categorías iniciales para los restaurantes que ya existen: las mismas que ofrecía la app hasta hoy.
-- (Un restaurante nuevo, sin filas, sigue viendo esas mismas categorías sugeridas y el admin puede crearlas
-- desde la pantalla de edición.)
INSERT INTO public.categorias_gasto (restaurant_id, clave, nombre, orden)
SELECT r.id, v.clave, v.nombre, v.orden
FROM public.restaurants r
CROSS JOIN (VALUES
  ('insumos',       'Insumos y mercado',                    1),
  ('nomina',        'Nómina y pagos al equipo',             2),
  ('servicios',     'Servicios (luz, agua, gas, internet)', 3),
  ('arriendo',      'Arriendo',                             4),
  ('transporte',    'Transporte y domicilios',              5),
  ('mantenimiento', 'Mantenimiento y reparaciones',         6),
  ('otros',         'Otros',                                7)
) AS v(clave, nombre, orden)
ON CONFLICT DO NOTHING;
