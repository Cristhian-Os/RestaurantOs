-- Reversa de 20261014182937_asistente_configuracion.sql
-- Quita las funciones y la tabla de progreso. Las columnas nuevas se QUITAN tambien (se pierde business_type,
-- ciudad, razon_social, nit, onboarding_completed_at e ingredientes.proveedor_id; los platos, mesas,
-- ingredientes y proveedores ya cargados NO se borran).
DROP FUNCTION IF EXISTS public.importar_menu(jsonb);
DROP FUNCTION IF EXISTS public.importar_ingredientes(jsonb);
DROP FUNCTION IF EXISTS public.importar_proveedores(jsonb);
DROP FUNCTION IF EXISTS public.crear_mesas(integer);
DROP FUNCTION IF EXISTS public._onb_admin();
DROP TABLE IF EXISTS public.restaurant_onboarding;
DROP TABLE IF EXISTS public.restaurant_fiscal;
ALTER TABLE public.ingredientes DROP COLUMN IF EXISTS proveedor_id;
ALTER TABLE public.restaurant_config
  DROP COLUMN IF EXISTS business_type, DROP COLUMN IF EXISTS ciudad, DROP COLUMN IF EXISTS onboarding_completed_at;
