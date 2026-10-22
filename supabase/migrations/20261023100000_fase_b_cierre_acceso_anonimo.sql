-- FASE B: cierre del acceso anonimo. APLICAR SOLO DESPUES de publicar el frontend nuevo (rama actual):
--   * el menu publico ya lee la config por la RPC config_publica(uuid) y los ingredientes por ingredientes_publicos(uuid);
--   * TeamManager/Resti/voz cambian el estado del empleado con set_employee_active / eliminar_empleado (nada escribe profiles.active ni borra perfiles);
--   * las evidencias de tareas se guardan como ruta y se muestran con URL firmada (evidenciaUrlFirmada).
-- El frontend anterior (origin/main) deja de funcionar con esta fase: lee restaurant_config como anon, usa photo_url publica y escribe profiles.active.
-- Orden de despliegue: 20261022125000 (fase A) -> publicar frontend nuevo -> esta migracion.
--
--  * restaurant_config: sin lectura anonima (politica "Public read config" fuera + REVOKE SELECT a anon).
--  * ingredientes_menu_publico: security_invoker y sin grants para anon/authenticated (en esta base ya estaba asi desde
--    20261016210055; se deja explicito e idempotente). Las funciones definer que la usan (create_public_order,
--    ingredientes_publicos) siguen funcionando porque corren como propietario.
--  * dishes: el anonimo solo lee platos disponibles de restaurantes ACTIVOS (el menu publico necesita las columnas completas).
--  * profiles: authenticated sin UPDATE(active) y sin DELETE; anon sin ningun acceso.
--  * Higiene de privilegios: anon solo conserva SELECT sobre dishes; vistas sin INSERT/UPDATE/DELETE; sin TRUNCATE/REFERENCES/TRIGGER.
--  * CHECK https en las URLs que se pintan en paginas publicas (restaurant_config.*_url; dishes.image_url acepta https o ruta propia /...)
--    con limpieza previa (http->https, dominio sin esquema, esquemas peligrosos y basura -> NULL; el frontend nuevo ya la descartaba).
--  * Storage (defensivo: solo actua si existen storage.buckets / storage.objects y los buckets):
--      task-evidence -> privado; branding -> 5 MB y jpeg/png/webp; restaurant-assets -> sin LISTADO anonimo.
-- Reversa: supabase/rollback/20261023100000_fase_b_cierre_acceso_anonimo_down.sql

-- 1) restaurant_config ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read config" ON public.restaurant_config;

-- 2) ingredientes_menu_publico ------------------------------------------------------------------------------------
ALTER VIEW public.ingredientes_menu_publico SET (security_invoker = true);
REVOKE ALL ON public.ingredientes_menu_publico FROM PUBLIC, anon, authenticated;

-- 3) dishes: solo platos disponibles de restaurantes activos -----------------------------------------------------
CREATE OR REPLACE FUNCTION public._restaurante_activo(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_id AND active);
$function$;
REVOKE ALL ON FUNCTION public._restaurante_activo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._restaurante_activo(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can read available dishes" ON public.dishes;
CREATE POLICY "Public can read available dishes" ON public.dishes FOR SELECT
  USING ((( SELECT auth.role()) = 'anon') AND available = true AND availability_status <> 'discontinued'
         AND ( SELECT public._restaurante_activo(restaurant_id)));

-- 4) profiles ------------------------------------------------------------------------------------------------------
REVOKE UPDATE (active) ON public.profiles FROM anon, authenticated;
REVOKE DELETE ON public.profiles FROM anon, authenticated;

-- 5) Higiene de privilegios ---------------------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname, c.relkind FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f') LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated', t.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon', t.relname);
    -- Las vistas no se escriben desde la API (una vista simple escribiria en la tabla base bajo su RLS).
    IF t.relkind IN ('v','m') THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t.relname);
    END IF;
    -- El anonimo solo lee platos (menu publico); todo lo demas lo hace por RPC SECURITY DEFINER.
    IF t.relname <> 'dishes' THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t.relname);
    END IF;
  END LOOP;
END $$;
-- Sin privilegios por columna residuales para anon
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT DISTINCT table_name, column_name FROM information_schema.column_privileges
            WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','REFERENCES')
              AND table_name <> 'dishes' LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM anon', c.column_name, c.table_name);
  END LOOP;
END $$;
-- dishes: el anonimo solo lee
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.dishes FROM anon;
GRANT SELECT ON public.dishes TO anon;

-- 6) URLs https en lo que se pinta en paginas publicas ---------------------------------------------------------------
-- Limpieza evidente: vacio -> NULL; http:// -> https://; dominio de Instagram/Facebook sin esquema -> https://; esquemas peligrosos -> NULL.
UPDATE public.restaurant_config SET
  instagram_url = CASE
    WHEN btrim(instagram_url) = '' OR instagram_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN instagram_url ~* '^\s*http://' THEN regexp_replace(btrim(instagram_url), '^http://', 'https://', 'i')
    WHEN instagram_url ~* '^\s*(www\.)?instagram\.com/' THEN 'https://' || btrim(instagram_url)
    WHEN instagram_url ~ '^\s*@[A-Za-z0-9._]{1,30}\s*$' THEN 'https://instagram.com/' || substr(btrim(instagram_url), 2)
    ELSE btrim(instagram_url) END,
  facebook_url = CASE
    WHEN btrim(facebook_url) = '' OR facebook_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN facebook_url ~* '^\s*http://' THEN regexp_replace(btrim(facebook_url), '^http://', 'https://', 'i')
    WHEN facebook_url ~* '^\s*(www\.)?(facebook|fb)\.com/' THEN 'https://' || btrim(facebook_url)
    ELSE btrim(facebook_url) END,
  logo_url = CASE
    WHEN btrim(logo_url) = '' OR logo_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN logo_url ~* '^\s*http://' THEN regexp_replace(btrim(logo_url), '^http://', 'https://', 'i')
    ELSE btrim(logo_url) END,
  portada_url = CASE
    WHEN btrim(portada_url) = '' OR portada_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN portada_url ~* '^\s*http://' THEN regexp_replace(btrim(portada_url), '^http://', 'https://', 'i')
    ELSE btrim(portada_url) END,
  mascota_url = CASE
    WHEN btrim(mascota_url) = '' OR mascota_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN mascota_url ~* '^\s*http://' THEN regexp_replace(btrim(mascota_url), '^http://', 'https://', 'i')
    ELSE btrim(mascota_url) END
WHERE (instagram_url IS NOT NULL AND instagram_url !~* '^https://')
   OR (facebook_url  IS NOT NULL AND facebook_url  !~* '^https://')
   OR (logo_url      IS NOT NULL AND logo_url      !~* '^https://')
   OR (portada_url   IS NOT NULL AND portada_url   !~* '^https://')
   OR (mascota_url   IS NOT NULL AND mascota_url   !~* '^https://');

UPDATE public.dishes SET image_url = CASE
    WHEN btrim(image_url) = '' OR image_url ~* '^\s*(javascript|data|vbscript|file):' THEN NULL
    WHEN image_url ~* '^\s*http://' THEN regexp_replace(btrim(image_url), '^http://', 'https://', 'i')
    ELSE btrim(image_url) END
WHERE image_url IS NOT NULL AND image_url !~* '^https://' AND image_url !~ '^/[^/]';

-- Lo que siga sin cumplir ya no se pintaba (el frontend nuevo lo descarta con urlSegura): se deja en NULL para que no bloquee
-- futuras ediciones de la fila (un CHECK, incluso NOT VALID, se evalua en cualquier UPDATE de la fila).
DO $$
DECLARE n_cfg int; n_dishes int;
BEGIN
  UPDATE public.restaurant_config SET
    instagram_url = CASE WHEN instagram_url IS NULL OR instagram_url ~* '^https://' THEN instagram_url END,
    facebook_url  = CASE WHEN facebook_url  IS NULL OR facebook_url  ~* '^https://' THEN facebook_url  END,
    logo_url      = CASE WHEN logo_url      IS NULL OR logo_url      ~* '^https://' THEN logo_url      END,
    portada_url   = CASE WHEN portada_url   IS NULL OR portada_url   ~* '^https://' THEN portada_url   END,
    mascota_url   = CASE WHEN mascota_url   IS NULL OR mascota_url   ~* '^https://' THEN mascota_url   END
  WHERE (instagram_url IS NOT NULL AND instagram_url !~* '^https://') OR (facebook_url IS NOT NULL AND facebook_url !~* '^https://')
     OR (logo_url IS NOT NULL AND logo_url !~* '^https://') OR (portada_url IS NOT NULL AND portada_url !~* '^https://')
     OR (mascota_url IS NOT NULL AND mascota_url !~* '^https://');
  GET DIAGNOSTICS n_cfg = ROW_COUNT;
  -- Platos: https, o una ruta propia del sitio (/assets/...); nada de http:, data:, javascript:, //otro-sitio
  UPDATE public.dishes SET image_url = NULL
   WHERE image_url IS NOT NULL AND image_url !~* '^https://' AND image_url !~ '^/[^/]';
  GET DIAGNOSTICS n_dishes = ROW_COUNT;
  RAISE NOTICE 'URLs no validas limpiadas: % filas de restaurant_config, % platos', n_cfg, n_dishes;
END $$;

DO $$
DECLARE x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES
      ('restaurant_config','instagram_url'),('restaurant_config','facebook_url'),('restaurant_config','logo_url'),
      ('restaurant_config','portada_url'),('restaurant_config','mascota_url')) AS v(t, c) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', x.t, x.t || '_' || x.c || '_https');
    -- NOT VALID por si entra una fila antigua entre la limpieza y aqui; luego se intenta validar.
    EXECUTE format($f$ALTER TABLE public.%1$I ADD CONSTRAINT %2$I CHECK (%3$I IS NULL OR (%3$I ~* '^https://[^[:space:]<>"]+$' AND char_length(%3$I) <= 2000)) NOT VALID$f$,
                   x.t, x.t || '_' || x.c || '_https', x.c);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', x.t, x.t || '_' || x.c || '_https');
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'La restriccion %.% queda NOT VALID: hay filas antiguas sin https://', x.t, x.t || '_' || x.c || '_https';
    END;
  END LOOP;

  ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_image_url_https;
  ALTER TABLE public.dishes ADD CONSTRAINT dishes_image_url_https
    CHECK (image_url IS NULL OR (char_length(image_url) <= 2000 AND (image_url ~* '^https://[^[:space:]<>"]+$' OR image_url ~ '^/[^/[:space:]<>"][^[:space:]<>"]*$'))) NOT VALID;
  BEGIN
    ALTER TABLE public.dishes VALIDATE CONSTRAINT dishes_image_url_https;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'La restriccion dishes_image_url_https queda NOT VALID: hay filas antiguas que no cumplen';
  END;
END $$;

-- 7) Storage (defensivo: la replica local no trae el esquema storage completo) ---------------------------------------
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Sin esquema storage completo: se omiten los cambios de buckets y politicas de Storage';
    RETURN;
  END IF;

  -- Evidencias de tareas: privadas. Las politicas existentes (lectura propia / admin del restaurante) siguen; la app firma las URLs.
  UPDATE storage.buckets SET public = false WHERE id = 'task-evidence';

  -- Logos y portadas: limite de tamano y tipos que la app ya valida (validarImagen).
  UPDATE storage.buckets SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'] WHERE id = 'branding';

  -- restaurant-assets: las rutas permitidas NO cambian (_asset_ok). Se cierra solo el LISTADO anonimo de objetos.
  -- En un bucket public=true las URL por ruta exacta (/object/public/restaurant-assets/<ruta>) se sirven SIN politica SELECT;
  -- la politica SELECT solo habilita listar/firmar/descargar por la API autenticada y el upsert.
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
                AND (roles && ARRAY['public'::name, 'anon'::name])
                AND qual ~ 'restaurant-assets' AND qual !~ '(task-evidence|branding|shift-checkins|facturas|vendedores)' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'assets: cada restaurante lee lo suyo') THEN
    -- Necesaria para subir con upsert:true (la app lo usa) y para que el admin/empleado vea sus propias rutas.
    CREATE POLICY "assets: cada restaurante lee lo suyo" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'restaurant-assets' AND public._asset_ok(name));
  END IF;
END $$;
