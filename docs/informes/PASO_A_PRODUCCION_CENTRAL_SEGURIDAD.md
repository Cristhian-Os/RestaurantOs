# Paso a producción — arreglo del hueco de roles y acceso a Central (guía)

Todo lo de esta guía está **hecho y probado solo en una base local**. **Nada se ha aplicado** ni en el proyecto de prueba ni en producción. Preparada el 2026-11-14 con lecturas de solo lectura a producción (`ifypeslrcdebvdqglywt`).

## 1. De dónde partimos (leído hoy de producción)

- La función que debía impedir que alguien se cambie el rol (`prevent_self_role_escalation`) está en producción como **SECURITY DEFINER**: ese es el defecto. Por eso no bloquea nada. **El hueco sigue abierto.**
- **Señales de uso del hueco: ninguna.** Hay 21 perfiles y **un solo superadministrador: tu cuenta** (creada el 2026-09-26, correo `ho***`). 20 cuentas traen un rol en los datos de registro (admin, mesero, cocina, cajero): es el flujo normal de la app al crear empleados. Ninguna pidió `super_admin`.
- Las funciones de Central (`central_autorizado`, `central_verificar_acceso`) **no están instaladas**.
- La política de la tabla `profiles` no deja que alguien cree su propio perfil: solo un administrador (de su restaurante) o el superadministrador. Eso no cambia.
- **Última copia de producción: 2026-10-22 02:09.** Tiene 23 días y desde entonces hay más pedidos y cuentas (21 perfiles hoy, 18 entonces). Recomiendo copia nueva.

## 2. Qué cambia para los restaurantes al aplicar (esperado, aún no probado en producción)

| Qué | Efecto |
|---|---|
| Cholaos, Demo y demás restaurantes | **Ninguno visible.** Los empleados se siguen creando y editando con las funciones del servidor, que no se tocan. |
| Cuentas nuevas | Nacen siempre como **mesero sin restaurante** (no ven nada). `crear_restaurante` y `create_employee_profile` les ponen después el rol y el restaurante, ya validados (verificado leyendo producción el 2026-11-14). |
| Cambiarse el rol o el restaurante con una sentencia directa | Queda **bloqueado de verdad** (antes la regla existía pero no funcionaba). |
| Crear otro superadministrador | Solo con SQL directo en el panel de Supabase (tú). Desde la app, por ningún camino. |
| Tu cuenta | Sigue siendo superadministradora; no se toca. |

## 3. Pasos, en orden

### Cholaos Dany (decisión de Cristhian, 2026-11-14)
Cholaos es producción real y comparte la misma base de datos con los demás restaurantes, así que **no se puede dejar en una "rama" aparte**: lo que se aplica a la base le llega a todos a la vez. Para protegerlos, **todo se aplica cuando Cholaos termine su servicio**:
- Cristhian me avisa "cerraron". Antes de tocar nada reviso en solo lectura que Cholaos no tenga pedidos abiertos ni actividad en los últimos 15 minutos.
- Los cambios de base son funciones y un disparador (no tocan sus datos). Al recrear el disparador de `profiles` la tabla queda bloqueada para escribir menos de un segundo.
- La app **no se publica** en este paso: Cholaos sigue con la misma app de hoy. Lo único compartido es la base.

### Paso 0 — Dónde se prueba primero (decidido: B)
La regla del proyecto es probar antes en el proyecto de prueba (`restaurantos-prueba`, `qdhafwnwrvsqunnnecky`), pero **desde aquí su contraseña de base de datos falla**. Dos caminos:
- **A (recomendado):** restableces la contraseña de la base del proyecto de prueba (Supabase → Project Settings → Database → Reset database password) y me avisas "listo". Pruebo las dos migraciones ahí con las pruebas completas.
- **B (ELEGIDO por Cristhian el 2026-11-14):** como en los bloques anteriores, aplico en producción con **prueba revertida** (usuarios temporales que se borran solos, sin dejar datos). Antes de correrla reviso que la prueba sea 100 % revertida.

### Paso 1 — Copia nueva (la haces tú)
Ejecuta `scripts/copia_produccion.ps1` (pide la cadena de conexión con casilla oculta; genera `esquema_`, `datos_` y `auth_` en `Backups-RestaurantOS`) y escribe **"listo"**. Yo comparo los conteos contra producción (perfiles, restaurantes, pedidos, usuarios) y lo anoto en `REGISTRO_COPIAS.txt`.

### Paso 2 — Migración 1 (la urgente), la aplico yo
**Antes** de aplicarla corro una vez la prueba revertida `seguridad_escalada_rol.sql` sobre producción tal como está: debe mostrar las 8 líneas FALLA (confirma el hueco directamente). Es un solo bloque que termina con error a propósito, así que todo se deshace solo (mismo método que `tope_mesas_plan.sql`).
| Archivo | Qué hace | Reversa |
|---|---|---|
| `20261114120000_cerrar_escalada_de_rol` | Cambia 2 funciones y 1 disparador (`prevent_self_role_escalation`, `handle_new_user`, `trg_prevent_self_role_escalation`). No toca tablas, políticas ni datos. | `supabase/rollback/20261114120000_cerrar_escalada_de_rol_down.sql` (deja las definiciones de producción de hoy; **vuelve a abrir el hueco**: solo en emergencia) |

Después compruebo, leyendo: la función ya no es SECURITY DEFINER, el disparador cubre INSERT y UPDATE, y `handle_new_user` ya no lee el rol de los datos de registro. Luego la prueba revertida `supabase/tests/seguridad_escalada_rol.sql` (17 comprobaciones).
**Prueba manual tuya, en Demo RestaurantOS (no en Cholaos):** entra como administrador de Demo → Empleados → crea un empleado de prueba y cámbiale el rol → debe funcionar igual que siempre; bórralo al terminar.
**Si algo da distinto a lo esperado: paro, aplico la reversa y te aviso.**

### Paso 3 — Migración 2 (Central), la aplico yo, después de la 1
| Archivo | Qué hace | Reversa |
|---|---|---|
| `20261114130000_central_acceso_auditoria` | Solo objetos nuevos: `central_autorizado()`, tabla `central_auditoria` (solo se puede añadir) y `central_verificar_acceso()`. No toca datos existentes. | `supabase/rollback/20261114130000_central_acceso_auditoria_down.sql` |

Prueba revertida: `supabase/tests/central_acceso.sql` (20 comprobaciones). Si no la quieres aún, la 1 se aplica sola; la 2 puede esperar.

### Paso 3b — Migración 3 (la oficina completa), solo si dices que la quieres en producción
| Archivo | Qué hace | Reversa |
|---|---|---|
| `20261114140000_central_nucleo` | Solo objetos nuevos `central_*`: 16 tablas (departamentos, agentes, tareas, aprobaciones, proyectos, conversaciones, mensajes, reuniones, notificaciones, documentos, memoria, integraciones, consumo, ubicaciones, configuración, versiones), sus reglas de seguridad (RLS: solo tú con 2 pasos), el motor de niveles N0–N3, las funciones `central_decidir_aprobacion()` y `central_restaurantes()` (solo lectura agregada de restaurantes) y los datos fijos aprobados (19 espacios, 11 agentes, 6 integraciones, configuración inicial). **No toca ninguna tabla, función ni dato de los restaurantes.** | `supabase/rollback/20261114140000_central_nucleo_down.sql` (borra las 16 tablas de Central y sus funciones; deja el registro de auditoría y el acceso de la Fase 1) |

- Orden obligatorio: **1 → 2 → 3**. La 3 necesita lo que crea la 2 (`central_autorizado()` y `central_auditoria`).
- Pruebas locales ya hechas (PGlite): `supabase/tests/central_nucleo.sql` (unas 70 comprobaciones, TODO OK) y `central_nucleo_reversa.sql` (TODO OK). En producción corro la primera revertida antes de dar por buena la migración.
- Todos los agentes nacen **diseñados, sin conexión y en N0 (solo lectura)**. Ninguno se activa solo.
- Si no se aplica la 3, la app muestra "Central aún no está activado en este servidor" y nada más: no rompe nada.
- Reversa de las tres: primero `…140000_down`, luego `…130000_down`, luego `…120000_down`.

### Paso 4 — App (aparte, con tu autorización de commit y publicación)
`/central` (la oficina completa: panel, oficina 3D y plano 2D, globo, departamentos, agentes, conversaciones, tareas, reuniones, biblioteca, memoria, integraciones, presupuestos, auditoría, configuración) vive en código nuevo en `src/central/`, que **no está commiteado**. Es un paquete aparte que solo descarga quien entra a `/central`; si falla, el resto de RestaurantOS sigue igual. Publicarlo es otra decisión tuya, y **conviene aplicar las migraciones 2 y 3 antes** (sin ellas Central avisa que no está activado).
Ojo: **`npm run build` falla en mi computador** (Windows bloquea un archivo temporal de esbuild, también con el código limpio; la revisión de tipos `tsc` sí pasa y las 2599 piezas se transforman bien). Hay que confirmar que Vercel compila antes de dar por publicado.

### Paso 5 — Después (decisiones tuyas; nada se hace solo)
- **Cerrar el registro público** de Supabase Auth. Con el arreglo ya no sirve para volverse superadministrador, pero cerrarlo reduce el ruido. Antes compruebo que crear empleados y restaurantes no dependan de él.
- **Conectar de verdad** Telegram, Google Workspace, modelos de IA, etc.: hoy todo eso está "No conectado" y los agentes responden "Simulación local". Cada conexión se decide y autoriza por separado.
- **Ubicar los restaurantes en el globo:** eliges la ciudad de cada uno desde la pantalla Mundo (no se inventa ninguna ubicación).

## 4. Si algo sale mal
- **Empleados o restaurantes dejan de crearse tras la migración 1:** aplico `20261114120000_…_down.sql` de inmediato y te aviso (reabre el hueco hasta corregirlo).
- **Migración 3:** su `_down.sql` primero. **Migración 2:** su `_down.sql` (se aplica antes que la de la 1).
- **App:** redesplegar el despliegue anterior en Vercel.

## 5. Cuándo das tú el apruebo
1. Haces la copia (Paso 1) y yo te confirmo que los conteos coinciden. Cuando Cholaos termine su servicio me avisas "cerraron".
2. Me escribes **"apruebo, aplica"**. Eso autoriza exactamente: la migración 1 (y la 2 y la 3 si lo dices), en ese orden, con sus pruebas y el paro automático si algo falla.
3. **No autoriza:** commit, publicar la app, cerrar el registro público, tocar datos de Cholaos Dany ni crear otro superadministrador.

Tiempo estimado: 20 a 30 minutos después de la copia.
