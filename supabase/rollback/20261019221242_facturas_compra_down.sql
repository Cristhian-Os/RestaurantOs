-- Rollback Bloque 5A. OJO: borra las facturas guardadas; las fotos del bucket 'facturas' hay que vaciarlas desde la API de Storage, no por SQL.
DROP FUNCTION IF EXISTS public.editar_factura_compra(uuid, date, uuid, numeric, text);
DROP FUNCTION IF EXISTS public.registrar_factura_compra(uuid, date, uuid, numeric, text, text[], boolean);
DROP POLICY IF EXISTS "Facturas: solo admin borra de su carpeta" ON storage.objects;
DROP POLICY IF EXISTS "Facturas: admin y cajero leen su carpeta" ON storage.objects;
DROP POLICY IF EXISTS "Facturas: admin y cajero suben a su carpeta" ON storage.objects;
DROP TABLE IF EXISTS public.facturas_compra;
DELETE FROM storage.buckets WHERE id = 'facturas';
