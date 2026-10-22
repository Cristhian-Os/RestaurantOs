-- Reversa de 20261016000002: la vista vuelve a ser SECURITY DEFINER y legible por anon y authenticated.
ALTER VIEW public.ingredientes_menu_publico SET (security_invoker = false);
GRANT SELECT ON public.ingredientes_menu_publico TO anon, authenticated;
