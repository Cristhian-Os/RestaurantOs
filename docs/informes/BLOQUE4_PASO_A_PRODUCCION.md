# Bloque 4: paso a producción (Opciones y plantillas)

Estado: todo probado en el proyecto de prueba. **Nada aplicado en producción.** Cristhian aprobó las 17 plantillas (2026-10-19).
Regla: nada en producción sin copia manual reciente (Cristhian) y su confirmación explícita.

## Verificado en producción (solo lectura, 2026-10-19)
- Existen las columnas, tablas y funciones que las migraciones usan (`restaurant_config.business_type`, `platform_audit_log`, `is_admin`, `is_super_admin`, `_exigir_aal2`, `reservar_stock_receta`, etc.).
- Las 4 líneas que la migración 2 parcha existen tal cual en `crear_orden_completa`, `create_public_order` y `editar_items_pedido`.
- Producción tiene 991 pedidos; la última copia (2026-10-16) tiene 792. **Hace falta copia nueva.**

## Orden (cada paso se verifica antes del siguiente)
0. **Copia nueva** hecha por Cristhian (bloque PowerShell con Docker). Yo comparo conteos con la base real.
1. **Migraciones, en este orden** (todas aditivas: no cambian lo que ve nadie hoy):
   | # | Archivo (versión local) | Qué hace | Reversa |
   |---|---|---|---|
   | 1 | `20261017000001_opciones_v2_listas_y_plantillas` | tablas `option_lists`, `restaurant_templates`, `restaurant_template_versions`; `aplicar_plantilla`; lectura pública de listas | `rollback/20261017000001_*` |
   | 2 | `20261017000002_servidor_opciones_v2` | el servidor valida y cobra las opciones nuevas y descuenta inventario por ítem. Platos con opciones heredadas: sin cambio | `rollback/20261017000002_*` |
   | 3 | `20261017000003_opciones_v2_migrar_listas_e_interruptor` | tiempo real de listas; `plataforma_activar_opciones_v2` | `rollback/20261017000003_*` |
   | 4 | `20261017000004_editor_plantillas` | editor del panel (versiones, activar, restaurar). La tabla de plantillas queda de solo lectura para la API | `rollback/20261017000004_*` |
   | 5 | `20261017000005_respuestas_plantilla` | tabla de respuestas del asistente | `rollback/20261017000005_*` |
   | 6 | `20261017000006_panel_opciones_restaurantes` | datos de la pestaña "Opciones por restaurante" | `rollback/20261017000006_*` |
   Al aplicar, Supabase asigna su propia versión: renombrar los archivos del repo a las versiones reales.
2. **Pruebas con reversión automática en producción** (no dejan datos): `supabase/tests/opciones_v2_plantillas.sql`, `opciones_v2_servidor.sql`; y comprobar que cobrar un pedido sigue funcionando (prueba del Bloque 3).
3. **Publicar la app** (push a `main`, Vercel). Va DESPUÉS de las migraciones: el código nuevo consulta tablas que antes no existían.
4. **Cargar las 17 plantillas** (`supabase/seeds/plantillas_borrador.sql`, idempotente) y **activarlas** (aprobadas). Solo las ven los restaurantes que pasen por el asistente o a los que Cristhian aplique una.
5. **Encender las opciones nuevas en Sabor encantado** desde el panel (pestaña "Opciones por restaurante"). Probar: Listas y opciones, tomar un pedido, menú público, cocina.
6. Cholaos Dany y Bremantia **siguen apagados** hasta orden de Cristhian (Cholaos: fuera de operación).

## Riesgos y cómo se cubren
- `ALTER TABLE detalles_pedidos ADD COLUMN ... DEFAULT '[]'` toma un bloqueo de milisegundos (en PG17 no reescribe la tabla). Hacerlo en un momento de poco tráfico.
- Si algo del cobro o de la toma de pedidos falla después: aplicar las reversas 2 y 1 (dejan las funciones como estaban) y avisar.
- El interruptor por restaurante empieza **apagado** en todos: apagarlo devuelve todo al modelo anterior (si ningún plato usa opciones nuevas).

## Pendiente después de producción
- Menú por voz y comandos de voz: usar las listas del restaurante.
- Migración de platos heredados a opciones nuevas (Cholaos Dany) con su copia y reversa.
- Limpieza del formato heredado cuando ningún restaurante lo use.
