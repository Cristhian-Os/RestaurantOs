-- Reversa de 20261022004511_planes_sin_prueba: vuelve a los valores de 20261020205231_planes_precios.
UPDATE public.planes SET precio_mensual_cop = 160000, max_mesas = 15, max_usuarios = 5, updated_at = now() WHERE id = 'emprende';
UPDATE public.planes SET precio_mensual_cop = 260000, max_mesas = NULL, max_usuarios = NULL, updated_at = now() WHERE id = 'pro';
UPDATE public.planes SET precio_mensual_cop = 375000, precio_sede_extra_cop = 70000, max_mesas = NULL, max_usuarios = NULL, updated_at = now() WHERE id = 'premium';
