-- Bloque 3 (seguridad): cierra la lectura directa de ingredientes_menu_publico (alerta ROJA del asesor de Supabase).
-- Aplicar DESPUÉS de publicar la app que lee ingredientes con la función ingredientes_publicos(restaurante).
-- La vista pasa a security_invoker y nadie con sesión de API la lee; create_public_order y ingredientes_publicos
-- (funciones del servidor, dueñas de la base) siguen usándola.
ALTER VIEW public.ingredientes_menu_publico SET (security_invoker = true);
REVOKE ALL ON public.ingredientes_menu_publico FROM anon, authenticated;
