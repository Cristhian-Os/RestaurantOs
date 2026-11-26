# Copia previa · central-vigia versión 1 (producción) · 2026-11-26

Código que estaba desplegado en el proyecto `RestaurantOs` antes de actualizar `central-vigia` con el detector de errores.
Es el código original que devolvió Supabase (`get_edge_function`). Se guardan solo los dos archivos que cambian
(`index.ts` y `logica.ts`); los auxiliares de `_shared/` no cambian de comportamiento.

Nota: la versión desplegada era **más antigua y compacta** que la del repositorio (`supabase/functions/central-vigia/`).

## Cómo volver atrás
Volver a desplegar `central-vigia` con estos dos archivos (`index.ts` y `logica.ts` dentro de `central-vigia/`), junto con
`_shared/central_acceso.ts`, `_shared/central_llaves.ts` y `central-agente/logica.ts` del repositorio, con `verify_jwt` activo.

Otras versiones desplegadas antes del cambio: `central-vigia` v1, `central-agente` v4 (su código coincide con el del repositorio en `main`, comparado a ojo).

## Lo aplicado en producción el 2026-11-26 (con aprobación del dueño)
1. Migración `20261126150000_app_errores`. Estado previo: la tabla `app_errores` y la función `registrar_error_app` **no existían**. Reversa: `supabase/rollback/20261126150000_app_errores_down.sql`.
2. `central-vigia`: v1 → **v2** (lee los errores de la app y crea tareas para Tomi).
3. `central-agente`: v4 → **v5** (el error de un proveedor que contesta con texto plano ahora dice el estado HTTP real).
Comprobación: ambas contestan 401 "sin sesión" a quien no es el dueño (arrancan sin errores).
