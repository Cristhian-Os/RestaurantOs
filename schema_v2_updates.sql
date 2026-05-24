-- ============================================================
-- RestaurantOS v2 — Actualizaciones de schema
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Nuevas columnas en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url     TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email TEXT;

-- 2. Storage: permitir subida a avatars/ y dishes/
CREATE POLICY "Upload avatars own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN ('avatars','dishes')
  );

CREATE POLICY "Read restaurant assets public" ON storage.objects
  FOR SELECT USING (bucket_id = 'restaurant-assets');

-- 3. Tabla restaurant_config si no existe
CREATE TABLE IF NOT EXISTS public.restaurant_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL DEFAULT 'RestaurantOS',
  modules_enabled JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS restaurant_config
ALTER TABLE public.restaurant_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read config" ON public.restaurant_config;
CREATE POLICY "Public read config" ON public.restaurant_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write config" ON public.restaurant_config;
CREATE POLICY "Admin write config" ON public.restaurant_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Insertar configuración inicial
INSERT INTO public.restaurant_config (display_name)
VALUES ('Heladería Doña María')
ON CONFLICT DO NOTHING;

-- 4. RPC crear empleado (versión mejorada)
CREATE OR REPLACE FUNCTION public.create_employee_profile(
  p_email          TEXT,
  p_full_name      TEXT,
  p_role           TEXT,
  p_password       TEXT DEFAULT NULL,
  p_recovery_email TEXT DEFAULT NULL,
  p_phone          TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Insertar perfil
  INSERT INTO public.profiles (email, full_name, role, active, phone, recovery_email)
  VALUES (p_email, p_full_name, p_role::text, true, p_phone, p_recovery_email)
  ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role      = EXCLUDED.role,
    phone     = EXCLUDED.phone,
    recovery_email = EXCLUDED.recovery_email
  RETURNING id INTO v_profile_id;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'status', 'created');
END;
$$;

-- 5. Columna recovery_email en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recovery_email TEXT;
