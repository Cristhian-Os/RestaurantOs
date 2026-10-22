# Guía de despliegue — correcciones del 22-oct-2026

Todo lo de esta guía se validó **en una réplica local del esquema de producción** (no en Supabase real). Antes de producción, repetir el ensayo en un proyecto Supabase de prueba (rama de base de datos o proyecto aparte).

## Estado verificado (réplica local, desde el esquema original de producción)
| Prueba | Resultado |
|---|---|
| `supabase/tests/aislamiento_multitenant.sql` sobre el esquema ORIGINAL | 63 OK, **36 FALLA** (escalada de rol, UPDATE directo de pedidos, lectura anónima de configuración, TRUNCATE, super_admin sin 2FA…) |
| La misma prueba tras aplicar las 9 migraciones | **91 OK, 0 FALLA** |
| Pruebas por migración (`supabase/tests/*.sql`) | sin ninguna FALLA |
| Reversas aplicadas en orden inverso | dejan las funciones idénticas al original |
| `npm test` | 25/28 archivos (los 3 restantes necesitan el paquete `three`, que CI instala) |

La prueba de aislamiento demuestra el aislamiento **para los casos que cubre** (README en `supabase/tests/README_aislamiento.md`, incluye lo que NO cubre). No es una garantía absoluta: es una compuerta que debe dar `0 FALLA` antes de cada despliegue.

## Antes de empezar (obligatorio)
1. **Dueño de la plataforma: enrolar TOTP** (entrar una vez al panel de plataforma). `is_super_admin()` pasa a exigir 2FA; sin TOTP perdería acceso.
2. Copia de seguridad de la base (Supabase → Database → Backups) y anotar la versión actual de las Edge Functions.
3. Revisar en Authentication → Providers que el registro público esté **desactivado** y activar la protección de contraseñas filtradas si el plan lo permite.

## Orden
1. **Fase A** (compatible con el frontend anterior): aplicar en orden de nombre
   `20261022120000` perfiles_acceso_y_cuentas · `121000` cerrar_superficie_publica · `122000` pedidos_caja_integridad · `123000` pagos_en_linea_verificados · `124000` funciones_integridad_y_fugas · `125000` politicas_rls_y_aal2 · `126000` proteger_interruptor_resti · `127000` push_subscriptions_con_restaurante.
2. **Edge Functions** (todas las de `supabase/functions/`) y **frontend** (merge a `main` → Vercel). Definir antes en Supabase → Edge Functions → Secrets: `APP_ORIGINS` (orígenes https de la app, separados por coma) e `IP_HASH_SALT` (≥16 caracteres aleatorios). Borrar la función `diag-push` del panel.
3. **Fase B**: `20261023100000_fase_b_cierre_acceso_anonimo` (solo con el frontend nuevo publicado).
4. Correr `supabase/tests/aislamiento_multitenant.sql` en el proyecto de prueba y exigir `RESUMEN: N OK, 0 FALLA`.
5. **Rotar el secreto del cron** `wompi-charge-daily` (apareció en una salida de la auditoría) y moverlo a Vault.
6. **Activar Wompi al final** (ver riesgos).

## Reversa
`supabase/rollback/<mismo nombre>_down.sql`, en orden inverso. La limpieza de URLs de la fase B no es reversible (son datos). Las reversas no borran columnas con datos (`idempotency_key`, `cortes_caja_archivo`, `plan_pendiente`).

## Riesgos conocidos y decisiones pendientes del dueño
- **Activar Wompi** pone en marcha el ciclo de vida de suscripciones: el cron pasa a mora/cancelado a quien tenga el periodo vencido. Antes: revisar `subscriptions` (hoy `amount_in_cents` de 68.000.000 frente a un plan de 325.000 COP) y fechas de periodo. El borrado automático de restaurantes cancelados queda **apagado** salvo `platform_secrets.purga_automatica = 'true'`.
- **Datos a reparar a mano** (no se tocaron): 6 pedidos cancelados con pagos vigentes (~$131.000), 19 cancelados con `paid_at`, 2 pedidos con total incorrecto, 14 grupos de cortes duplicados (la migración 122000 los archiva en `cortes_caja_archivo`).
- **Cuenta demo** (`Landing.enterDemo`): sigue con credenciales en el cliente; decidir si se retira.
- **S-09**: los compañeros de equipo siguen viendo email/teléfono de los demás; requiere una vista o RPC de directorio y cambio de frontend.
- Pendientes funcionales: botón «Ajuste por devolución» (falta pantalla de pagos de suscripción) y `elegir_plan` aplica el plan al pagar (`plan_pendiente`); cualquier migración futura que redefina `procesar_pago_wompi` debe conservar ese bloque.
- Quien tenga el uuid de un pedido puede consultarlo/cancelarlo (diseño del seguimiento por QR): el uuid es el secreto del comensal.
- Funciones de Node/Vercel: la app es SPA estática (no ejecuta Node en producción); fijar la versión de Node del proyecto en Vercel a la última parcheada cuando se publique.
