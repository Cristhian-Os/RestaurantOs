-- Cierra el permiso de tabla para el visitante sin sesion en las tablas nuevas (ya las protegia RLS; doble seguridad).
REVOKE ALL ON public.kitchen_tv_tokens, public.restaurant_onboarding, public.restaurant_fiscal, public.platform_audit_log FROM PUBLIC, anon;
