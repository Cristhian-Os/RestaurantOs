# Fidelización: corte mensual, premios y asistente ARM

Migración: `supabase/migrations/20261108150000_fidelizacion_premios_corte_arm.sql` (aplicada solo en el proyecto de prueba; producción NO).

## Qué es el corte mensual (interpretación elegida)
El documento de arquitectura solo dice "corte mensual con otros meses: tarea aparte". Se tomó la lectura más simple:
cerrar un mes que **ya terminó**, una sola vez por mes y restaurante, en una sola transacción:
1. Vence los puntos de quien lleva N meses sin comprar (solo si el administrador puso `meses_vencimiento` y el programa está activo; por defecto NO vence nada).
2. Vuelve a calcular el nivel de todos los clientes.
3. Guarda la foto del mes (puntos dados/canjeados/vencidos, compras, ventas, clientes activos y nuevos, niveles) en `fid_cortes`.

- `fid_corte_mensual(p_mes date DEFAULT NULL)`: solo administrador. Sin fecha = último mes terminado. Rechaza el mes en curso y meses de hace más de 24 meses. Repetir el mismo mes devuelve lo guardado y no cambia nada.
- `fid_corte_mensual_todos(p_mes)`: solo rol de servicio (`service_role`); recorre los restaurantes con programa activo. No lo puede llamar ningún usuario.
- Los meses usan hora de Colombia (`hoy_local()` y `America/Bogota`).

## Programar el corte automático (NO activado)
`pg_cron` está disponible en el proyecto de prueba pero no instalado; no se programó nada. Cuando Cristhian lo apruebe (el día 1 de cada mes, 03:00 hora Colombia = 08:00 UTC):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('fid-corte-mensual', '0 8 1 * *', $$SELECT public.fid_corte_mensual_todos()$$);
-- Para quitarlo: SELECT cron.unschedule('fid-corte-mensual');
```
En producción solo con "apruebo, aplica" y copia previa.

## Premios
- Nuevas columnas: `fid_programas.nombre_club`, `fid_programas.meses_vencimiento`, `fid_recompensas.stock` (NULL = sin límite).
- `fid_canjear` (misma firma) ahora valida y descuenta existencias; `fid_anular_canje` las devuelve.
- `fid_recompensas_disponibles(cliente)`: admin y cajero; dice qué puede canjear ya el cliente y por qué no los demás, sin mostrar historial ni gasto.
- `fid_canjes_historial()`: solo administrador; quién, cuándo, estado.
- La tarjeta pública devuelve además `club` (nombre del club).

## ARM
`arm_generar_sugerencias()` (solo administrador, reglas fijas, sin IA, no envía nada): clientes con 45+ días sin venir (3 o más), cumpleaños de los próximos 7 días, 5 mejores clientes de 90 días. No repite una sugerencia pendiente ni una decidida en los últimos 14 días (`arm_acciones.clave`). Guarda `payload` con la acción `crear_campana_borrador` para que un módulo de campañas lo use más adelante.

## Pantallas (para cablear)
- `FidelidadConfig` (`src/components/fidelizacion/FidelidadConfig.tsx`): solo administrador. Sugerido: entrada "Programa de fidelidad" en Configuración.
- `ArmPanel` (`src/components/fidelizacion/ArmPanel.tsx`): solo administrador. Sugerido: entrada "Asistente de clientes" junto a Fidelización.
- Pruebas visuales en el simulador: `/.claude/qa-mock/fid-harness.html?v=config|arm|mostrador[&theme=dark]` con `localStorage.mockRole`.
