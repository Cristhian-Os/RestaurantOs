-- Módulo A (prompt maestro Resti): planes vigentes, sin prueba gratis.
-- Solo ajusta filas de `planes` (precios COP con IVA incluido y límites). No toca restaurantes ni suscripciones existentes.
-- La prueba de 7 días ya no existe en la base: crear_restaurante (20261015040529) crea el plan 'emprende' en 'active', sin trial.
-- Premium sigue NO disponible hasta que multi-sede (Módulo G) esté en producción.
-- Reversa: supabase/rollback/20261022004511_planes_sin_prueba_down.sql

UPDATE public.planes SET
  precio_mensual_cop = 160000, max_mesas = 22, max_usuarios = NULL, updated_at = now()
WHERE id = 'emprende';

UPDATE public.planes SET
  precio_mensual_cop = 260000, max_mesas = NULL, max_usuarios = NULL, updated_at = now()
WHERE id = 'pro';

UPDATE public.planes SET
  precio_mensual_cop = 325000, precio_sede_extra_cop = 65000, max_mesas = NULL, max_usuarios = NULL, updated_at = now()
WHERE id = 'premium';
