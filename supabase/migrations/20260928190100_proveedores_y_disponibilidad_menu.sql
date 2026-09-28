-- Panel del cajero: Proveedores y Gestión del menú.

-- ── Proveedores: lista simple y editable (nombre, teléfono, qué provee) ──
CREATE TABLE IF NOT EXISTS public.proveedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id),
  nombre        text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),
  telefono      text CHECK (telefono IS NULL OR char_length(telefono) <= 40),
  producto      text CHECK (producto IS NULL OR char_length(producto) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proveedores_restaurant_id_idx ON public.proveedores (restaurant_id);
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin y cajero gestionan proveedores" ON public.proveedores;
CREATE POLICY "Admin y cajero gestionan proveedores" ON public.proveedores AS PERMISSIVE FOR ALL TO public
  USING ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)))
  WITH CHECK ((((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'cashier'::text])) AND (restaurant_id = ( SELECT current_restaurant_id() AS current_restaurant_id))) OR ( SELECT is_super_admin() AS is_super_admin)));

DROP TRIGGER IF EXISTS proveedores_set_updated_at ON public.proveedores;
CREATE TRIGGER proveedores_set_updated_at BEFORE UPDATE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Gestión del menú: activar/desactivar sabores y toppings ─────────────
-- Los sabores (restaurant_config.modules_enabled.helado_flavors / jugo_flavors)
-- y los toppings (dishes.toppings) siguen siendo los que define el admin; aquí
-- solo se marca cuáles están agotados HOY, en listas aparte:
--   modules_enabled.helado_flavors_off / jugo_flavors_off / toppings_off
-- El cajero no puede escribir restaurant_config (RLS solo admin), por eso va
-- por esta función con el rol revalidado adentro.
CREATE OR REPLACE FUNCTION public.set_opcion_menu_activa(p_tipo text, p_nombre text, p_activo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid  UUID := public.current_restaurant_id();
  v_key  TEXT;
  v_mods JSONB;
  v_off  JSONB;
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cambiar la disponibilidad del menú';
  END IF;
  v_key := CASE p_tipo
    WHEN 'helado'  THEN 'helado_flavors_off'
    WHEN 'jugo'    THEN 'jugo_flavors_off'
    WHEN 'topping' THEN 'toppings_off'
  END;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Tipo de opción inválido'; END IF;
  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) = 0 OR char_length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'Nombre inválido';
  END IF;

  SELECT COALESCE(modules_enabled, '{}'::jsonb) INTO v_mods
  FROM public.restaurant_config WHERE restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuración del restaurante no encontrada'; END IF;

  -- Idempotente: se quita el nombre y se vuelve a agregar solo si queda inactivo.
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_off
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_mods->v_key) = 'array' THEN v_mods->v_key ELSE '[]'::jsonb END) e
  WHERE e #>> '{}' IS DISTINCT FROM p_nombre;
  IF NOT p_activo THEN v_off := v_off || to_jsonb(p_nombre); END IF;

  UPDATE public.restaurant_config
  SET modules_enabled = jsonb_set(v_mods, ARRAY[v_key], v_off), updated_at = now()
  WHERE restaurant_id = v_rid;

  RETURN v_off;
END;
$function$;

-- Producto agotado / disponible (mismo efecto que el ⏸️/▶️ del admin en Menú).
CREATE OR REPLACE FUNCTION public.set_plato_disponible(p_dish_id uuid, p_disponible boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('admin','cashier') THEN
    RAISE EXCEPTION 'Solo cajero o administrador pueden cambiar la disponibilidad del menú';
  END IF;
  UPDATE public.dishes
  SET available = p_disponible,
      availability_status = CASE WHEN p_disponible THEN 'available' ELSE 'out_of_stock' END,
      updated_at = now()
  WHERE id = p_dish_id
    AND restaurant_id = public.current_restaurant_id()
    AND availability_status <> 'discontinued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_opcion_menu_activa(text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_plato_disponible(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opcion_menu_activa(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_plato_disponible(uuid, boolean) TO authenticated;

-- ── Orden inicial de categorías del menú de Cholaos (piloto) ────────────
-- El orden de aparición de las categorías es el orden del arreglo
-- modules_enabled.categories (se cambia después con ▲▼ en Menú → Configurar).
-- Las categorías que no están en la lista quedan al final, en su orden actual.
UPDATE public.restaurant_config rc
SET modules_enabled = jsonb_set(rc.modules_enabled, '{categories}', (
  SELECT jsonb_agg(x.c ORDER BY COALESCE(array_position(ARRAY[
    'principal',         -- Tradicionales
    'cholao',            -- Cholado
    'postre',            -- Granizados
    'limonadas',
    'bebidas_frias',
    'malteadas',
    'entrada',           -- Ensaladas
    'salpicon',          -- Salpicones
    'especial',          -- Especiales
    'sodas_micheladas',  -- Sodas
    'helados',
    'bebidas_calientes',
    'adicionales'
  ], x.c->>'value'), 1000), x.ord)
  FROM jsonb_array_elements(rc.modules_enabled->'categories') WITH ORDINALITY AS x(c, ord)
))
FROM public.restaurants r
WHERE r.id = rc.restaurant_id
  AND r.slug = 'cholaos'
  AND jsonb_typeof(rc.modules_enabled->'categories') = 'array';

NOTIFY pgrst, 'reload schema';
