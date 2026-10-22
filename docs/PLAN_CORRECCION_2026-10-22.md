# Plan de corrección — auditoría del 22-oct-2026

Referencia de hallazgos: `docs/AUDITORIA_2026-10-22.md` (IDs C*, S*, F*, E*, W*).

## Principios
1. El aislamiento entre restaurantes se **demuestra con pruebas** (`supabase/tests/aislamiento_multitenant.sql`) y es condición para desplegar.
2. La base manda: ningún permiso depende solo de la UI.
3. Orden de despliegue: **fase A** (migraciones compatibles con el frontend actual) → frontend + Edge Functions → **fase B** (migraciones que cierran accesos) → rotar secretos → activar Wompi (último).
4. Cada migración trae su reversa (`supabase/rollback/`) y su prueba (`supabase/tests/`).

## Contrato de base de datos (lo que el código puede asumir tras las migraciones)

| Área | Contrato |
|---|---|
| `profiles` | `authenticated` solo hace UPDATE directo de `full_name, phone, avatar_url, recovery_email` (y `active` solo hasta la fase B). Roles, restaurante, email y estado se cambian por RPC. **Nuevas RPC:** `set_employee_active(p_employee_id uuid, p_active boolean) → jsonb`, `eliminar_empleado(p_employee_id uuid) → jsonb` (admin del mismo restaurante; banean al usuario y cierran sus sesiones). No existe INSERT de perfiles desde el cliente. |
| Empleados | `admin_update_employee`/`create_employee_profile`: contraseña mínima 8; un admin no modifica a otro admin ni al dueño de la cuenta; revocan sesiones al cambiar credenciales. Errores en español. |
| Helpers RLS | `get_user_role()`, `current_restaurant_id()`, `is_admin()` ignoran perfiles inactivos (devuelven NULL/false). `is_super_admin()` exige además `aal2` en el JWT. |
| Registro | `handle_new_user` crea siempre un perfil `client`, inactivo y sin restaurante; ignora la metadata. |
| `orders` | `authenticated` solo puede UPDATE de `status, delivered_at, updated_at`, y solo sobre pedidos `pending/cooking/ready`. **Sin INSERT directo** (todo por RPC). |
| `crear_orden_completa` | Gana `p_idempotency_key text default null`; si la clave ya existe devuelve el pedido original con `duplicado: true`. Valida que la mesa sea del restaurante. `RAPPI` solo admin/cajero. |
| `crear_orden_con_custom` | Valida cantidad 1..50, mesa del restaurante e ingredientes del restaurante. |
| Cancelaciones | `cancelar_orden`: personal incluye `kitchen`; **error** si hay pagos vigentes: «Este pedido ya tiene pagos registrados. Anula los pagos en caja antes de cancelarlo.»; repone stock. `cancelar_item_orden`: resta precio×cantidad, no repite, rechaza si hay pagos. `tv_cocina_cancelar` devuelve `{status:'pagado'}` si hay pagos. |
| Cobro | `_cobrar_base`: el efectivo debe cubrir lo que falta más la propina («El efectivo recibido no alcanza…»). |
| Corte | `hacer_corte_caja`: un solo corte por día; repetirlo actualiza el existente y devuelve `actualizado: true`. El cajero no borra gastos de un día con corte. |
| Pagos en línea | `procesar_pago_wompi(...)` aplica cada evento de forma atómica e idempotente (monto/moneda verificados, APPROVED terminal, registra el cobro en `order_payments`). `mark_order_paid(...,p_amount_cents)` solo `service_role`. `suscripcion_puede_cobrar(uuid)` para el cron. |
| Lectura pública | **Nueva:** `config_publica(p_restaurant_id uuid) → jsonb` (anon): solo columnas públicas de `restaurant_config`. En la fase B se elimina la lectura anónima de la tabla. |
| Datos de pago | `payments`, `subscriptions`: solo admin/super_admin. Las llaves de Wompi de `restaurant_payment_config` no son seleccionables desde el cliente (la pantalla usa `restaurant_payment_config_status`). |
| Storage | `task-evidence` pasa a **privado** (URL firmada desde la ruta guardada). `branding`: 5 MB, jpeg/png/webp. `restaurant-assets` ya está aislado por `_asset_ok` (rutas permitidas: `avatars/<profileId>.ext`, `dishes/<dishId>.ext`, `<restaurant_id>/…`): **no cambiar esas rutas**. Se quita el listado anónimo de objetos (las URL públicas siguen funcionando). |
| URLs | `instagram_url`, `facebook_url`, `logo_url`, `portada_url`, `mascota_url` deben empezar por `https://` (CHECK; filas viejas permitidas). |
| Funciones | `order_total_cents`, `check_rate_limit` solo `service_role`. `check_rate_limit` devuelve boolean: **todo llamador debe tratar `!== true` como bloqueo (falla cerrado)**. |

## Reglas para el código
- Todo error de Supabase se revisa (`error`) y se muestra; nada de "guardado" optimista sin revertir.
- Todo botón que escribe tiene candado síncrono (`useRef`) y estado `disabled`.
- Fechas/horas de negocio en `America/Bogota`.
- Nada de `alert()` nuevo; `message`/`Modal` de antd.
- Cualquier URL que venga de datos (redes sociales, logos, enlaces de IA) pasa por `urlSegura()` (solo `https:`).
- No se añaden dependencias.

## Edge Functions: despliegue y variables (E-01..E-07)
- **Variables/secretos nuevos** (Supabase → Edge Functions → Secrets): `APP_ORIGINS` (orígenes https de la app, separados por coma, sin barra final; acota CORS y `redirect_url` de `wompi-init`; sin ella `redirect_url` solo acepta el Origin del request y CORS queda abierto) e `IP_HASH_SALT` (≥16 caracteres aleatorios; sal del hash de IP en `chat-support` y `menu-asistente`; sin ella se usa una sal derivada de la service key, que funciona pero conviene reemplazar). Al definir `IP_HASH_SALT` los hashes de IP cambian una vez (los contadores se reinician).
- **`diag-push` debe BORRARSE del panel de Supabase** (existe solo desplegada, inerte con `410`; no está en el repo y no se añade).
- Tras el despliegue, redesplegar las 14 funciones desde el repo (las versiones desplegadas `voice-parse` v14 y `resti-brain` v7 difieren del repo).
- `wompi-webhook` exige que la llave privada de Wompi (plataforma en `platform_secrets.wompi_private_key`, o la del restaurante) esté configurada: confirma cada evento con `GET /transactions/{id}`.
- Pendiente de base (no es de las funciones): `registrar_lead` sobrescribe nombre, interés y resumen de un lead existente (mismo WhatsApp en 24 h); debería conservar el original.
