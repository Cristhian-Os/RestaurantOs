# AUDITORIA.md — Bloque 0 (solo lectura, no se cambió código)

Fecha: 2026-10-13. Proyecto Supabase: `RestaurantOs` (`ifypeslrcdebvdqglywt`, sa-east-1, activo). Código: `restaurantos-local`, rama `main`.
Estados: ✅ funciona · 🟡 parcial · ❌ no existe.

## Resumen para Cristhian

1. **El mayor riesgo hoy es la seguridad.** Los pedidos están aislados por restaurante, pero un usuario sin sesión puede leer la configuración de **todos** los restaurantes, y hay 48 funciones sensibles que cualquier persona sin sesión puede intentar ejecutar. Esto es el Bloque 3.
2. **Reportes con IA: no están conectados.** Existe una pantalla de análisis (matriz BCG) pero no se ve en la app, y no hay IA que escriba reportes.
3. **Hay base buena para el modo sin internet** (guarda pedidos en el teléfono y la app abre sin conexión). Falta probar que cubra todo.
4. **No hay impresión de comandas ni recibos, ni copias de seguridad documentadas.**
5. **Los textos legales existen pero son una plantilla** (dicen "revisar con abogado") y no coinciden con los planes y precios del spec.

## Estado de cada punto de la Fase 0

| Punto | Estado | Evidencia |
|---|---|---|
| Reportes con IA | ❌ (hay una pantalla sin conectar) | `src/pages/BusinessAssistant.tsx` y `src/hooks/useBusinessMetrics.ts` calculan la matriz BCG de platos. **No está en `src/App.tsx`** (no hay ruta), por eso no se ve. No existe Edge Function `ai-report`: las funciones son `chat-support`, `notify-order`, `send-push`, `voice-parse`, `wompi-*`. Solo `voice-parse` y `chat-support` usan IA (Gemini). |
| Multi-tenant (columna `restaurant_id`) | 🟡 | 27 de 30 tablas tienen `restaurant_id`. Sin ella: `platform_secrets` (correcto, es interna), `order_rate_limit` (interna) y `comentario_likes` (se aísla por el comentario; revisar). Fuente: `supabase/migrations/00000000000000_baseline_tables_snapshot.sql`. |
| RLS | ✅ activo en las 30 tablas, 🟡 en la calidad | `list_tables` de Supabase: `rls_enabled: true` en las 30. Políticas aíslan por `restaurant_id = current_restaurant_id()`. Pero: `restaurant_config` tiene la política **"Public read config"** (`USING (auth.role()='anon')`, sin filtro de restaurante) y `dishes` tiene "Public can read available dishes" para todos los restaurantes (`00000000000002_baseline_rls_policies_snapshot.sql`). Tres tablas con RLS pero sin ninguna política: `order_rate_limit`, `platform_secrets`, `restaurants` (a propósito, se leen por funciones; confirmar). |
| Roles y permisos | ✅ | `src/types/index.ts:117`: `super_admin`, `admin`, `waiter`, `kitchen`, `cashier`, `client`. Políticas por rol en el snapshot de RLS. Existe `prevent_self_role_escalation` (evita que alguien se suba el rol). |
| Modo sin internet y service worker | 🟡 | `public/sw.js` (v22, cachea la app, estrategia caché primero) y `src/services/offlineService.ts` (pedidos guardados en IndexedDB y sincronizados al volver la red). Falta: pagos parciales sin red (Anexo A, B5.8) y una prueba real sin internet. |
| Impresión térmica / recibos / comandas | ❌ | No hay `window.print`, ESC/POS ni módulo de impresión en `src/`. Lo único parecido es el PDF de QR (`src/lib/qrPdf.ts`). |
| Copias de seguridad | ❌ (no verificable desde el código) | No hay scripts ni documentación de respaldo. Que haya copias automáticas depende del plan de Supabase, que no pude ver. **Cristhian: confirmar en el panel de Supabase (Database → Backups) si hay copia diaria o recuperación a un punto en el tiempo.** Necesario antes de migrar producción (regla 4 del spec). |
| Política de privacidad, términos y aviso de datos | 🟡 | `src/pages/Legal.tsx` (rutas `/terminos` y `/privacidad` en `App.tsx:21,102`). Es plantilla internacional, el propio archivo dice que un abogado debe revisarla. Desactualizada: habla de "plan Premium gratis de por vida" y de prueba de `TRIAL_DAYS = 7` (el spec manda 14 días, `src/config/plans.ts:27`), y no menciona Ley 1581. |
| Las 8 mejoras del "Fixture 1" de Cholaos Dany | 🟡 7 hechas en código, 1 parcial | Ver la sección "Fixture 1" más abajo. Revisado solo leyendo el código, no probado en pantalla. |

## Alertas del asesor de seguridad de Supabase

Consultado hoy (solo lectura).

**🔴 ERROR (3) — Vistas con permisos del creador (`security_definer_view`)**
`pedido_estado_publico`, `restaurants_public`, `ingredientes_menu_publico`. Las tres son para el menú público y el seguimiento del pedido, así que hay que reescribirlas con cuidado y no solo apagarlas (Anexo J).

**🟡 WARN (cuatro grupos)**
- `anon_security_definer_function_executable` (**48 funciones**): gente sin sesión puede intentar ejecutarlas, incluidas `cobrar_orden`, `cobrar_orden_inicial`, `hacer_corte_caja`, `get_corte_productos`, `crear_restaurante`, `delete_dish`, `cancelar_orden`, `get_admin_metrics`, `change_my_password`. Muchas validan el rol por dentro, pero hay que revisar una por una. Algunas sí deben ser públicas (menú y pedidos de cliente). `editar_items_pedido` se dio permiso a `anon` a propósito (`supabase/migrations/20260928190200_editar_items_pedido_con_opciones.sql:428`).
- `authenticated_security_definer_function_executable` (56): cualquier usuario con sesión, de cualquier restaurante, puede llamarlas; el aislamiento depende de que cada función verifique restaurante y rol.
- `function_search_path_mutable` (1): `cancelar_item_orden` sin `search_path` fijo (incumple la regla 6 del spec).
- `extension_in_public` (1): `pg_net` instalada en el esquema público.
- `auth_leaked_password_protection`: protección contra contraseñas filtradas apagada.

**🔵 INFO (3)**: RLS sin políticas en `order_rate_limit`, `platform_secrets`, `restaurants` (ver arriba).

El Bloque 3 (Anexo J) empieza con un diagnóstico más profundo antes de corregir nada.

## Otras observaciones útiles

- **Tablas que el spec crea y hoy no existen:** `order_payments`, `aportes_caja`, `option_lists`, `restaurant_templates`, `vendedores`, `auditoria_plataforma`, `platform_settings`. Es lo esperado: se crean en los bloques 1, 4, 7 y 8.
- `supabase/migrations/` tiene 5 archivos "baseline" más 16 migraciones. Hay además 12 archivos `schema_*.sql` sueltos en la raíz del proyecto que parecen de antes de las migraciones; no tocar, solo confirmar luego si quedan obsoletos.
- Hay 4 archivos con cambios sin guardar en git, de la tarea de colores por categoría (`DishCard.tsx`, `KitchenBoard.tsx`, `ClientMenuSection.tsx`, `MenuManager.tsx`). No los toqué.
- `plans.ts` usa `emprende | pro | premium` (correcto, el spec pide conservarlos) pero precios y textos son los viejos.

## Fixture 1 de Cholaos Dany (revisado en el código, 2026-10-13)

"Hecha en código" = encontré la función y está conectada a la pantalla. **Ninguna fue probada en ejecución.**

| # | Mejora | Estado | Evidencia |
|---|---|---|---|
| 1 | Editar productos dentro de un pedido (cantidad, toppings, queso, comentarios) | ✅ en código | `src/components/orders/EditOrderModal.tsx`, función `editar_items_pedido` (`supabase/migrations/20260928190200_editar_items_pedido_con_opciones.sql`), usada en `CashierPanel.tsx` y `PublicMenu.tsx`. "Queso" aparece como opción en `OrderFlow.tsx`, `EditOrderModal.tsx` y `MenuManager.tsx`. |
| 2 | Mensaje de pago corto: "haz tu pago en caja para que se procese tu pedido" | 🟡 parcial | `src/pages/PublicMenu.tsx:1516` dice "Acércate a caja y paga para que se procese tu pedido." Es corto pero no es la frase pedida. |
| 3 | Gestión del menú y Proveedores en caja | ✅ en código | `src/pages/Dashboard.tsx:424-425` (`MenuAvailability`, `Proveedores`); migración `20260928190100_proveedores_y_disponibilidad_menu.sql`. |
| 4 | Ventas mensuales en el corte y Rappi fuera de los totales | ✅ en el corte | `get_corte_mensual` (`CashierPanel.tsx:447`) y migración `20260927233635_rappi_no_cuenta_como_ganancia_en_corte.sql`. **No revisé** si otros reportes (por ejemplo `useBusinessMetrics`) también excluyen Rappi. |
| 5 | Categorías reordenables con orden fijo | ✅ en código | `MenuManager.tsx:628` `handleMoveCategory` (botones Subir/Bajar); el menú público lee ese orden (`PublicMenu.tsx:1195`). |
| 6 | Letra más grande, uniforme | ✅ en código (global) | `src/index.css:131`: `html { font-size: 112.5% }`. No revisé tamaños fijos en píxeles, que no escalan con eso. |
| 7 | Sonidos distintos por tipo de pedido | ✅ en código | `src/services/orderSounds.ts` (patrones para Mesa, Llevar, Domicilio y Rappi), usado en `OrderSoundAlerts.tsx` y `WaiterNotifications.tsx`. |
| 8 | Saldo de apertura al comenzar el día | ✅ en código | Tabla `bases_caja`, función `registrar_base_caja`, `CashierPanel.tsx:432-544`. |

## Decisiones que le tocan a Cristhian

1. Pasar la lista de las 8 mejoras del Fixture 1.
2. Confirmar en Supabase si hay copias de seguridad automáticas.
3. Confirmar el orden: ¿se sigue con el Bloque 1 (plata del piloto) o se adelanta el Bloque 3 (seguridad) dado el hallazgo de lectura anónima de configuración?
