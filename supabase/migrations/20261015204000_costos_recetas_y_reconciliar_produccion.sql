-- (1) costos_recetas: costo de receta de todos los platos del restaurante en una sola llamada (la analitica hacia una
--     llamada por plato y dejaba el costo en 0, asi que la matriz BCG mostraba margen 100% en todo).
-- (2) Reconciliacion con produccion: objetos que existian SOLO en la base viva y no estaban en git. Todo es idempotente
--     (IF NOT EXISTS / CREATE OR REPLACE): en produccion no cambia nada; en una base nueva deja el mismo esquema.
--       - get_platform_overview, platform_chat_logs (+ RLS), ingredientes.sustituto_id, push_subscriptions.endpoint unico,
--         trigger on_auth_user_created y los GRANT/REVOKE de funciones internas.
-- Reversa: supabase/rollback/20261015204000_costos_recetas_y_reconciliar_produccion_down.sql

-- 1) costos_recetas ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.costos_recetas()
 RETURNS TABLE(dish_id uuid, costo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, COALESCE(SUM(COALESCE(NULLIF(r.costo_unitario, 0), i.costo_unitario, 0) * r.cantidad_necesaria), 0)
    FROM public.dishes d
    LEFT JOIN public.recetas r ON r.producto_id = d.id
    LEFT JOIN public.ingredientes i ON i.id = r.ingrediente_id
   WHERE d.restaurant_id = public.current_restaurant_id()
     AND public.get_user_role() IN ('admin','cashier')
   GROUP BY d.id;
$function$;
REVOKE ALL ON FUNCTION public.costos_recetas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costos_recetas() TO authenticated, service_role;

-- 2) Reconciliacion con produccion ---------------------------------------------------------------------------------
ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS sustituto_id uuid REFERENCES public.ingredientes(id) ON DELETE SET NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingredientes_sustituto_no_self') THEN
    ALTER TABLE public.ingredientes ADD CONSTRAINT ingredientes_sustituto_no_self CHECK (sustituto_id IS NULL OR sustituto_id <> id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_chat_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id uuid,
  user_message text NOT NULL,
  bot_reply text NOT NULL,
  ip text
);
ALTER TABLE public.platform_chat_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'platform_chat_logs' AND policyname = 'Super admin reads chat logs') THEN
    CREATE POLICY "Super admin reads chat logs" ON public.platform_chat_logs FOR SELECT USING (is_super_admin());
  END IF;
END $$;
REVOKE ALL ON public.platform_chat_logs FROM anon, authenticated;
GRANT SELECT ON public.platform_chat_logs TO authenticated;
CREATE INDEX IF NOT EXISTS platform_chat_logs_created_idx ON public.platform_chat_logs (created_at);

-- Retencion: los mensajes del chat de soporte guardan la IP; se conservan 90 dias.
CREATE OR REPLACE FUNCTION public.purgar_chat_logs_antiguos()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d AS (DELETE FROM public.platform_chat_logs WHERE created_at < now() - interval '90 days' RETURNING 1)
  SELECT count(*)::int FROM d;
$function$;
REVOKE ALL ON FUNCTION public.purgar_chat_logs_antiguos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_chat_logs_antiguos() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND indexname = 'push_subscriptions_endpoint_key') THEN
    -- El frontend hace upsert con onConflict:'endpoint'. Se conserva la suscripcion mas reciente de cada endpoint.
    DELETE FROM public.push_subscriptions a USING public.push_subscriptions b
     WHERE a.endpoint = b.endpoint AND a.ctid < b.ctid;
    CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions (endpoint);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_platform_overview()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result json;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el super-administrador puede ver esto';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT
      r.id, r.name, r.slug, r.country, r.active, r.is_promo, r.is_founder, r.created_at,
      s.plan, s.status AS subscription_status, s.current_period_end, s.trial_ends_at,
      (SELECT json_agg(json_build_object('email', p.email, 'full_name', p.full_name, 'phone', p.phone))
         FROM public.profiles p WHERE p.restaurant_id = r.id AND p.role = 'admin') AS contacts
    FROM public.restaurants r
    LEFT JOIN public.subscriptions s ON s.restaurant_id = r.id
    ORDER BY r.created_at
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END; $function$;
REVOKE ALL ON FUNCTION public.get_platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated, service_role;

-- Trigger que crea el perfil al registrarse un usuario en Auth. Existe en produccion pero no estaba en git: una base
-- reconstruida desde las migraciones se quedaba sin perfiles. (handle_new_user ya no confia en la metadata del cliente.)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- check_rate_limit solo la usan las edge functions (service_role).
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
