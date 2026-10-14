-- Reversa de 20261014183035_revocar_anon_tablas_nuevas.sql (devuelve el permiso de tabla a anon; RLS sigue protegiendo)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_tv_tokens, public.restaurant_onboarding, public.restaurant_fiscal, public.platform_audit_log TO anon;
