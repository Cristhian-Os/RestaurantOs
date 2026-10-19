# Bloque 5A: Facturas de compra con foto

Estado: construido y probado en el proyecto de prueba. **No está en producción.**

## Qué hace
- Menú "Facturas" para administrador y cajero (mesero y cocina no la ven).
- Subir: foto con la cámara o de la galería (hasta 10 páginas), fecha, proveedor (con "+ Nuevo"), monto y nota. Casilla "Registrar también como gasto de caja" (marcada). Factura y gasto se guardan juntos o ninguno.
- Consultar: cuadrícula con miniatura, filtros por fecha, proveedor y monto, total del periodo, foto grande con zoom, descarga de cada foto y quién la subió.
- Administrador: edita fecha, proveedor, monto y nota (si hay gasto de caja, este cambia igual) y elimina con confirmación (el gasto se conserva).
- Exporta el listado filtrado a Excel.
- Sin internet: la factura queda en el dispositivo con aviso "Pendiente de subir" y se sube sola al volver la señal.
- Las fotos nunca se borran solas. Solo el administrador puede eliminar una factura.

## Seguridad
- Bucket privado `facturas`; carpeta raíz = id del restaurante; fotos con enlaces temporales de 1 hora.
- Tabla con RLS: admin y cajero leen y suben; solo admin edita y elimina.
- Prueba `supabase/tests/facturas_compra.sql` (proyecto de prueba): FALLAS=0. Cubre aislamiento entre dos restaurantes (tabla y fotos), cocina sin acceso, cajero sin editar/borrar, proveedor y foto de otro restaurante rechazados, reintento sin duplicar, gasto que sigue la edición.

## Para pasar a producción (necesita backup reciente y tu confirmación)
1. Backup manual nuevo.
2. Aplicar `supabase/migrations/20261019220000_facturas_compra.sql` (solo agrega: tabla, bucket, 2 funciones; no toca nada existente).
3. Subir el código (push a main) y esperar Vercel READY.
4. Verificar con la prueba (cambiando los ids) y subir una factura real de prueba.

Deshacer: `supabase/rollback/20261019220000_facturas_compra_down.sql`.

## Pendiente
- Lectura automática con IA (Anexo E 3.5): anotada en el spec para después.
- Política de conservación de las fotos: por definir con el contador (no se borra nada automáticamente).
