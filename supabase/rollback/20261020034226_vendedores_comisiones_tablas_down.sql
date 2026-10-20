-- Rollback Bloque 8, paso 5. OJO: borra prospectos, comisiones, liquidaciones y condiciones generales. Las fotos/PDF de los buckets
-- 'contratos-vendedores' y 'comprobantes-vendedores' hay que vaciarlas desde la API de Storage, no por SQL.
DROP POLICY IF EXISTS "Vendedores: dueño sube contratos y comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Vendedores: dueño lee contratos y comprobantes" ON storage.objects;
DROP TABLE IF EXISTS public.comisiones;
DROP TABLE IF EXISTS public.liquidaciones_vendedor;
DROP SEQUENCE IF EXISTS public.liquidacion_numero_seq;
DROP TABLE IF EXISTS public.prospectos;
DROP TABLE IF EXISTS public.platform_settings;
ALTER TABLE public.payments DROP COLUMN IF EXISTS total_cop, DROP COLUMN IF EXISTS iva_cop, DROP COLUMN IF EXISTS base_cop;
ALTER TABLE public.restaurant_crm DROP COLUMN IF EXISTS terminos_vendedor;
ALTER TABLE public.vendedores DROP COLUMN IF EXISTS causa_estado, DROP COLUMN IF EXISTS documento;
DELETE FROM storage.buckets WHERE id IN ('contratos-vendedores', 'comprobantes-vendedores');
