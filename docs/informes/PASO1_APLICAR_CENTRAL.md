# Paso 1 — Poner Central en producción (lista para tu aprobación)

Preparado el 2026-11-15. **Nada de esto está hecho.** Solo hice lecturas (sin cambiar nada) para decirte con datos cómo está todo.

## ACTUALIZACIÓN 2026-11-15 — Ya probado en el proyecto de prueba (producción sigue sin tocar)

El proyecto de prueba (`restaurantos-prueba`) volvió a dejarme entrar y apliqué las 4 migraciones allí, en orden, una por una.

| Comprobación (en prueba) | Resultado |
|---|---|
| Migraciones 1, 2, 3 y 4 | Aplicadas sin errores |
| 17 tablas `central_*` | Todas con seguridad de filas activa; 0 permisos a "anon" o público |
| Datos de fábrica | 11 agentes, 19 departamentos, 13 integraciones (0 conectadas), 12 conversaciones; IA apagada y tope 0 |
| Restaurantes y perfiles existentes | Intactos (2 y 5, igual que antes) |
| Nadie puede subirse a super_admin (por función del servidor o insertando un perfil) | Bloqueado |
| Un alta nueva que pide ser super_admin de un restaurante ajeno | Nace como mesero sin restaurante |
| Super admin **sin** 2 pasos | No ve nada de Central; `central_restaurantes()` bloqueada |
| Usuario normal con 2 pasos / usuario anónimo | No ve nada |
| Dueño con 2 pasos | Ve todo; acceso concedido y registrado; lista sus restaurantes |
| Agente guardando un mensaje "real" desde la app | Bloqueado (solo el servidor puede) |
| Marcar una integración como "activa" desde la app | Bloqueado |
| Borrar la auditoría | Bloqueado |
| Avisos de Supabase | 1 aviso esperado: las 3 funciones de Central son ejecutables por usuarios con sesión y cada una se protege por dentro |

Las pruebas se hicieron dentro de transacciones que se deshacen solas: no quedó ningún dato de prueba.

**Diferencia que encontré:** el proyecto de prueba NO tiene el disparador `on_auth_user_created` que sí tiene producción. Para probar el alta de usuarios lo recreé solo dentro de una prueba que se deshace. En producción ya existe, así que ahí el arreglo se aplica directo.

**Lo que sigue pendiente:** nada de esto está en producción. Faltan la copia de seguridad tuya, que Cholaos no esté en servicio y tus frases de aprobación (abajo).

## Qué encontré (solo lectura)

| Revisión | Resultado |
|---|---|
| Migraciones de Central en producción | **Ninguna aplicada** (producción llega hasta `20261108170644`) |
| Tablas `central_*` en producción | 0 (limpio, nada que choque) |
| Funciones que Central necesita (`is_super_admin`, `_auditoria_inmutable`, etc.) | Existen las 4 |
| Super administradores | 1, y tiene el código de 2 pasos verificado (puede entrar a Central) |
| Hueco de seguridad (cambiarse el rol a super_admin) | **Sigue abierto en producción** (la función vulnerable sigue como `SECURITY DEFINER`) |
| Funciones del servidor de Central en producción | Ninguna instalada (`central-agente`, `central-telegram`) |
| Proyecto de **prueba** (`restaurantos-prueba`) | **No pude leerlo:** la contraseña de su base falla (error de autenticación) |

## Bloqueo que necesito que sepas

Nuestra regla es probar toda migración en el proyecto de prueba antes que en producción. Las 4 migraciones solo se probaron en el Postgres local de mi computador (PGlite), no en un Supabase real. Y hoy no puedo entrar al proyecto de prueba.

**Opciones (tú eliges):**
1. **Recomendada:** en Supabase → proyecto `restaurantos-prueba` → Settings → Database → *Reset database password*, y me dices "listo". Yo no necesito ver la contraseña. Luego aplico las 4 en prueba, las verifico, y recién entonces vamos a producción.
2. Saltarnos la prueba real y aplicar directo en producción. **No lo recomiendo:** la migración 1 toca cómo se crean los perfiles de todos los restaurantes.

## Las 4 migraciones, en este orden

| # | Archivo | Qué hace | Riesgo |
|---|---|---|---|
| 1 | `20261114120000_cerrar_escalada_de_rol` | Cierra el hueco: nadie puede subirse a super_admin; los registros nuevos nacen como mesero sin restaurante | **Medio.** Toca el alta de usuarios. Aplicar fuera del servicio de Cholaos |
| 2 | `20261114130000_central_acceso_auditoria` | Regla de acceso (solo super admin con 2 pasos) y registro de auditoría | Bajo: tablas nuevas |
| 3 | `20261114140000_central_nucleo` | Tablas de Central (agentes, tareas, chat, etc.) | Bajo: tablas nuevas, no tocan restaurantes ni dinero |
| 4 | `20261114150000_central_conexiones` | Solo filas: IA apagada, tope 0, integraciones sin conectar | Mínimo |

Cada una tiene su reversa en `supabase/rollback/` (la de la 1 reabre el hueco: solo en emergencia). La migración suelta `20260928195300_fix_cancelar_orden_editar_pedido_cliente_security.sql` **NO se sube** (producción ya tiene su equivalente).

## Antes de aplicar (checklist)

- [ ] Copia de seguridad reciente de producción hecha por ti (Supabase → Database → Backups). Yo no puedo confirmarla desde aquí.
- [ ] Cholaos **no está en servicio** (sin pedidos activos). Comprobamos juntos con una consulta de solo lectura justo antes.
- [ ] Proyecto de prueba arreglado y las 4 aplicadas allí sin errores (opción 1 de arriba).
- [ ] Tú escribes la frase de aprobación (abajo).

## Frases de aprobación (para que no haya confusión)

- Migración 1 (seguridad): **"listo, cerraron, apruebo, aplica"** — solo después de que Cholaos cierre y yo haga la revisión de solo lectura.
- Migraciones 2, 3 y 4: **"apruebo, aplica"**.

## Qué haré yo, en orden, cuando apruebes

1. Revisión de solo lectura (pedidos activos de Cholaos = 0, super admin con 2 pasos).
2. Aplicar la 1 → comprobar: el registro de un usuario nuevo nace sin rol, y un mesero NO puede subirse el rol.
3. Aplicar la 2, 3, 4, **una por una**, comprobando cada una (tablas creadas, permisos cerrados al público, que ningún restaurante cambió).
4. Revisión de seguridad de Supabase (avisos) antes y después.
5. Reporte corto con lo que salió bien o mal.

## Funciones del servidor (se instalan DESPUÉS de las migraciones)

- `central-agente` y `central-telegram`, con verificación de sesión activada (igual que `resti-brain`). Cada una revisa por dentro que seas super admin con 2 pasos.
- Se instalan sin llaves: sin los secretos responden "falta la llave" y no hacen nada. Sirven para ver el panel y el botón Probar en rojo, sin riesgo.
- Frase: **"apruebo, instala las funciones"**.
- Las llaves las pegas tú en Supabase → Edge Functions → Secrets (ver `GUIA_CONEXIONES_CENTRAL.md`).

## Lo que NO se toca

Código de la app publicada, Cholaos, caja, pedidos, las funciones existentes (`resti-brain`, `wompi-*`, `whatsapp-*`, etc.) ni ninguna llave. Para ver Central en la web real todavía falta publicar el código (commit + despliegue), que es otra autorización aparte.
