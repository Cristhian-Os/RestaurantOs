# Central Crecimiento V2 — Auditoría de lo nuevo (solo lectura)

Fecha: 2026-11-23. No se cambió código, base ni producción. Complementa `CRECIMIENTO_FASE0_AUDITORIA.md` (19-nov).

## Lo que la V2 agrega y cómo está hoy

| Requisito V2 | Estado real | Evidencia |
|---|---|---|
| Autorización de campaña (alcance, vencimiento, revocable) | Existe en base | `growth_autorizaciones` (Fase 1) |
| Lista de no contactar | Existe | `growth_supresion` |
| Prospectos, expedientes, historial, citas, misión diaria, bandeja de borradores | Existen (0 prospectos reales) | `growth_*`, pantallas Prospectos/Agenda/Mision/Mensajes |
| Vigía y misión programados | Funcionan sin app abierta | `pg_cron`: vigía cada hora, misión mañana y cierre; 72 corridas OK en 3 días |
| Agentes que investigan y actúan solos | **No existe.** Los 11 agentes están en ciclo "diseñado"; solo responden cuando se les escribe | `central_agentes.ciclo`, `central_consumo` = 0 |
| Cola de tareas, workers, estado durable por flujo | **No existe** (solo `central_tareas` como lista de propuestas) | tablas actuales |
| Reintentos con backoff, dead-letter, circuit breaker | **No existe** | sin tablas ni código |
| Claves de idempotencia en envíos de Central | **No existe** (sí en pedidos de restaurante) | migraciones |
| Interruptor global de emergencia por agente/canal/campaña | **Parcial:** solo `ia_encendida` (apaga toda la IA) y revocar una campaña | `central_config` |
| Motor de políticas antes de cada acción externa | **Parcial:** reglas en base para campañas y supresión; no hay un guardián único que chequee horario, volumen, presupuesto y duplicado | `growth_*` |
| Descubrir restaurantes (fuente pública) | **No existe**; sin proveedor decidido | — |
| Canal de envío real (correo/WhatsApp oficial) | **No conectado** | `central_integraciones`: 0 activas |
| Indicador de autonomía, informe diario/semanal verificado | **No existe** | — |
| Content & Brand Studio | **No existe** (solo borradores en ideas) | — |

## Qué corre hoy sin que abras la app
Solo tres tareas programadas: vigía de plataforma, misión de la mañana y misión de cierre.

## Riesgos nuevos que veo
1. Construir los agentes "solos" antes de la cola, idempotencia e interruptor es el orden equivocado: un error duplicaría envíos.
2. El tope de IA es 5 USD/mes. Un agente investigando a diario lo consume rápido; hay que medir costo por prospecto antes de subirlo.
3. Sin canal oficial conectado, todo termina en borrador (correcto según la política).

## Orden recomendado (ventas reales primero)
1. **Runtime mínimo:** tabla de trabajos con estado, intentos, idempotencia, interruptor global y por campaña. Un solo worker (Edge Function + pg_cron).
2. **Mateo en modo sombra:** investiga y crea prospectos + expedientes + borradores, dentro de una campaña autorizada. No envía.
3. **Informe diario** con solo acciones verificadas.
4. **Canal de envío** (correo dedicado) tras tu decisión; piloto pequeño.
5. Contenido (Nico) en borradores.

## Decisiones tuyas pendientes
1. Ciudad inicial (recomendado: Armenia y alrededores).
2. Fuente de restaurantes: lista que pegues tú, o IA con búsqueda web con tope.
3. Presupuesto mensual de IA para ventas (hoy 5 USD).
4. Correo de envío (buzón dedicado, no el principal).
5. Aprobar la migración del runtime (se prueba antes en el proyecto de prueba, con reversa).

## Pruebas para declarar listo el piloto
Las 25 del §14 de la V2; las primeras a cubrir son 17 (revocar detiene tareas), 20 (recuperar sin duplicar), 21 (fallos repetidos pausan) y 22 (interruptor global).
