# Copia previa a la migración 20261124120000_central_runtime_trabajos (producción, solo lectura, 2026-11-23)

Estado de producción justo antes de aplicar (lo único que la migración toca de lo existente):

- Disparadores de `growth_autorizaciones` (se agrega uno más; estos no cambian):
  - `growth_autorizaciones_auditar` — AFTER INSERT OR DELETE OR UPDATE → `central_auditar('')`
  - `growth_autorizaciones_detiene_mensajes` — AFTER UPDATE OF estado → `growth_mensajes_por_campana()`
  - `growth_autorizaciones_reglas` — BEFORE INSERT OR UPDATE → `growth_autorizacion_reglas()`
- `central_config` (no se modifican): `ia_encendida = true`, `ia_tope_mensual_usd = 5`. Se agregan 3 filas: `agentes_activos=false`, `pausa_agentes=[]`, `pausa_tipos=[]`.
- Autorizaciones de campaña existentes: 0. Ni `central_trabajos` ni `central_trabajos_log` ni sus funciones existen todavía (sin choques).

Reversa: `supabase/rollback/20261124120000_central_runtime_trabajos_down.sql`.
