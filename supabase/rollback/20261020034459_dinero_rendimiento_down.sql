-- Rollback Bloque 8, paso 9 (Dinero y Rendimiento). No toca datos. plataforma_atencion vuelve a la versión del Bloque 7
-- (sin avisos de liquidaciones ni contratos): reaplicar el final de 20261019225215_panel_restaurantes_ficha.sql si se necesita.
DROP FUNCTION IF EXISTS public.plataforma_rendimiento(date, date);
DROP FUNCTION IF EXISTS public.plataforma_dinero();
DROP FUNCTION IF EXISTS public._base_pago(payments);
