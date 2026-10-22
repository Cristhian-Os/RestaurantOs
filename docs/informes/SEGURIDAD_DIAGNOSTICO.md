# Bloque 3: Diagnóstico de seguridad (solo lectura)

Fecha: 2026-10-16. Producción `ifypeslrcdebvdqglywt`. No se cambió nada para escribir este informe.

## Ya resuelto en los bloques anteriores
| Punto del Anexo J | Estado |
|---|---|
| P1 pedidos legibles por anon (TV de cocina) | Resuelto: la TV usa clave por restaurante y funciones `tv_cocina_*`. Lista de pedidos de `orders` ya no es pública. |
| P2 `restaurant_config` con datos sensibles | Resuelto: razón social y NIT están en `restaurant_fiscal` (privada). Claves de pago en `restaurant_payment_config` (solo personal). |
| P3 funciones de personal abiertas a anon | Resuelto para 17 funciones; `anon` ya no puede ejecutar cobro, cancelación de ítems, ajuste de stock, empleados, etc. |
| P4 `check_rate_limit` con clave del cliente | Resuelto: nadie con sesión de API puede llamarla (solo la función de servidor). Pedidos QR limitan 8 por minuto por IP y restaurante. |
| P6 vistas públicas de pedidos y restaurantes | Resuelto: `pedido_estado_publico` y `restaurants_public` ya no se leen; se usan funciones de un solo registro. |
| Registro público | Cerrado. Solo el super admin crea restaurantes. |

## Alertas del asesor de Supabase (hoy)
| Nivel | Alerta | Detalle |
|---|---|---|
| ERROR | Vista con SECURITY DEFINER | `ingredientes_menu_publico` |
| WARN | Contraseñas filtradas desactivado | Solo se activa en plan Pro de Supabase |
| WARN | `pg_net` en esquema `public` | Menor; mover a `extensions` |
| WARN | 34 funciones ejecutables por anon / 75 por authenticated | Ver abajo: la mayoría son esperadas |
| INFO | RLS sin políticas | `order_rate_limit`, `platform_secrets`, `restaurants`: intencional (solo funciones del servidor las tocan) |

## Hallazgos reales (a corregir)
**Alto**
1. `cancelar_item_orden` verifica el rol pero **no que el pedido sea de tu restaurante**. Un cajero/cocina/admin del restaurante A puede tachar ítems de un pedido en cocina del restaurante B si conoce su UUID (difícil de adivinar, pero la regla de aislamiento exige impedirlo).

**Medio**
2. Vista `ingredientes_menu_publico` (definer): `anon` ve nombre, unidad y precio de venta (= costo / 0.65) de ingredientes de **todos** los restaurantes, de donde se deduce el costo. Solo se usa en `PublicMenu.tsx:477` ("plato personalizado").
3. `calcular_costo_receta(p_dish_id)`: cualquier usuario con sesión puede pedir el costo de la receta de un plato de otro restaurante.
4. `registrar_venta_stock(p_order_id)`: cualquier usuario con sesión puede disparar el registro de ventas de un pedido de otro restaurante (la función es idempotente, pero escribe en otro restaurante).
5. `change_my_password`: no pide la contraseña actual y acepta 6 caracteres (al crear restaurantes ya exigimos 8). Quien robe una sesión abierta puede cambiar la clave.
6. `crear_plato_custom`: no valida que el pedido ni los ingredientes sean del restaurante de quien llama.

**Bajo / limpieza**
7. 8 funciones de trigger figuran como ejecutables por anon (`handle_new_user`, `on_order_status_change`, `set_order_number_today`, `prevent_self_role_escalation`, `descontar_ingredientes`, `order_total_cents`, `platform_billing_active`, `online_payments_enabled`). Postgres no permite llamar un trigger a mano, así que no es explotable; se revoca por higiene. `get_user_role`, `is_admin`, `is_super_admin`, `current_restaurant_id` deben seguir abiertas (las usan las políticas).
8. `pg_net` en `public`.

## Pendiente por diseño (no son errores)
- **Contraseñas filtradas (P5):** requiere plan Pro de Supabase (USD 25/mes). Hoy el proyecto es Free.
- **2FA (TOTP) para admin y super admin (P5):** no existe nada en el código. Hay que construir enrolamiento y verificación (`supabase.auth.mfa`) y exigirlo en el panel de plataforma.
- **Cabeceras de seguridad (P7):** `vercel.json` no tiene CSP, `X-Content-Type-Options`, `Referrer-Policy` ni `frame-ancestors`.
- **Frontend (P7):** no hay `dangerouslySetInnerHTML` en `src/`; ninguna variable `VITE_` con secretos ni `service_role` en el código. `public/kitchen-tv.html` usa `innerHTML` con datos de pedidos: hay que confirmar que todo texto del cliente se escapa antes de insertarlo.
- Comentarios/reseñas públicos (clase A): usan token de edición; sin límite de ritmo propio. Se propone limitar.

## Propuesta de correcciones (en este orden, una migración por tema, con reversa)
1. Aislamiento: `cancelar_item_orden`, `calcular_costo_receta`, `registrar_venta_stock`, `crear_plato_custom` validan restaurante.
2. `ingredientes_menu_publico` → función por restaurante, sin costo; se quita el acceso de anon a la vista. (Requiere cambio en `PublicMenu.tsx`: migración compatible → frontend → cierre.)
3. `change_my_password`: contraseña actual + mínimo 8. (Cambio en la pantalla de cambio de clave.)
4. Revocar EXECUTE a anon en funciones de trigger y mover `pg_net`.
5. Límite de ritmo en comentarios, reseñas y reacciones públicas.
6. Cabeceras de seguridad en `vercel.json` (probando que PWA, Supabase y fotos sigan funcionando).
7. 2FA para admin y super admin.
8. Pruebas SQL de los 5 puntos de la Fase 3 y `SECURITY.md`.
