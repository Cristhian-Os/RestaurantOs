# Copia previa a la migración 20261124120000_central_runtime_trabajos (producción, solo lectura, 2026-11-23)

Estado de producción justo antes de aplicar (lo único que la migración toca de lo existente):

- Disparadores de `growth_autorizaciones` (se agrega uno más; estos no cambian):
  - `growth_autorizaciones_auditar` — AFTER INSERT OR DELETE OR UPDATE → `central_auditar('')`
  - `growth_autorizaciones_detiene_mensajes` — AFTER UPDATE OF estado → `growth_mensajes_por_campana()`
  - `growth_autorizaciones_reglas` — BEFORE INSERT OR UPDATE → `growth_autorizacion_reglas()`
- `central_config` (no se modifican): `ia_encendida = true`, `ia_tope_mensual_usd = 5`. Se agregan 3 filas: `agentes_activos=false`, `pausa_agentes=[]`, `pausa_tipos=[]`.
- Autorizaciones de campaña existentes: 0. Ni `central_trabajos` ni `central_trabajos_log` ni sus funciones existen todavía (sin choques).

Reversa: `supabase/rollback/20261124120000_central_runtime_trabajos_down.sql`.

## Resultado (2026-11-23)
Aplicada en producción por la API de Supabase con autorización escrita del dueño ("Salta la prueba en el proyecto de prueba y aplica en producción"). Versión registrada en `schema_migrations`: `20261123152309` (el archivo del repositorio se llama `20261124120000`; mismo contenido).
Verificado después: 2 tablas, 9 funciones, 3 interruptores apagados, disparador de campañas, seguridad de filas activa, sin permisos para `anon`, `tomar` solo para el servidor, 0 trabajos, 5 restaurantes intactos.
No se corrió la prueba SQL en producción (crea y deshace datos); sí pasó 16/16 en la base local.
