# Auditoría de RestaurantOS — 22 de octubre de 2026

Alcance: código de `main` (2530a17), base de **producción viva** (exportada en solo lectura), 16 Edge Functions desplegadas y proyecto de Vercel.
Método: 11 agentes de solo lectura (seguridad: datos/RLS, funciones SQL ×2, edge functions y secretos, frontend; QA funcional: páginas, caja, menú, plataforma, Resti/IA, lógica SQL). Los hallazgos marcados **[Probado]** se reprodujeron con SQL real en una réplica local del esquema de producción.

Etiquetas: **[Probado]** reproducido · **[Seguro]** verificado leyendo código/esquema · **[Probable]** depende de algo no visible (configuración de Auth, ejecución real) · **[Suposición]** inferencia.

> Ninguna auditoría puede *garantizar* aislamiento entre restaurantes. Este informe lo trata como una propiedad que se **demuestra con pruebas** (ver `supabase/tests/aislamiento_multitenant.sql`) y que debe volver a probarse antes de cada despliegue.

---

## 1. Resumen ejecutivo

La app **no estaba lista para clientes reales**. Los ocho hallazgos críticos/altos de la auditoría del 15-oct seguían abiertos en producción, y desde entonces se añadieron funciones nuevas (Resti, multi-sede, comisiones, impresión, reportes de IA) sobre la misma base sin corregir.

Lo que sí estaba bien: RLS activo en las 64 tablas; precios recalculados en el servidor; las acciones de Resti no escriben sin confirmación del usuario; `mark_order_paid` no es invocable desde la API; `npm audit` sin vulnerabilidades en dependencias de producción; no hay secretos en el repo ni en su historial.

### Hallazgos críticos reproducidos (esquema actual de producción)

| ID | Hallazgo | Estado |
|---|---|---|
| C1 | **[Probado]** Un mesero ejecuta `UPDATE profiles SET role='super_admin'` y funciona. El trigger `prevent_self_role_escalation` es `SECURITY DEFINER` y comprueba `current_user` (siempre el dueño de la función): nunca bloquea. El 2FA no lo frena **[Probable]**: solo exige `aal2` en el JWT y cualquier usuario puede inscribir su propio TOTP | |
| C2 | **[Seguro]** `handle_new_user` toma rol y restaurante de `raw_user_meta_data` (mismo defecto). Explotable si el registro público de Auth está abierto **[Probable]**: no se pudo consultar | |
| C3 | **[Probado]** Cocina del restaurante B canceló un pedido del restaurante A (`cancelar_orden`: rama "anónimo" sin validar restaurante) | |
| C4 | **[Probado]** Un mesero de A consumió stock del restaurante B y bajó el total de su pedido con cantidad negativa (`crear_plato_custom`/`crear_orden_con_custom`) | |
| C5 | **[Probado]** Un mesero reabrió un pedido completado y pagado, le puso total $1 y le quitó el pago (UPDATE directo a `orders`) | |
| C6 | **[Probado]** Un admin secundario cambió la contraseña del admin dueño de su restaurante (`admin_update_employee`) | |
| C7 | **[Probado]** `cancelar_item_orden` resta solo el precio unitario y permite cancelar el mismo ítem repetidamente: 3×$10.000 → $0 en tres llamadas | |
| C8 | **[Probado]** Empleado desactivado conserva su rol y puede reactivarse solo (`profiles.active` no se aplica; hay 3 en vivo) | |

### Dinero ya afectado en datos reales
- 6 pedidos cancelados conservan pagos vigentes (~$131.000 COP en efectivo); 19 cancelados con `paid_at`.
- 14 días con cortes de caja duplicados (45 filas; p. ej. 7 cortes idénticos el 15-oct).
- 2 pedidos con total erróneo por `cancelar_item_orden` (en uno se cobró lo cancelado).

### Latente: explota al activar Wompi (hoy `wompi_public_key` vacío, 0 filas en `payments`)
`purge_restaurant` no puede borrar nada por FKs y su fallo aborta todo `enforce_subscription_lifecycle`; el webhook no verifica monto ni es idempotente; sedes 3+ no se cobran; el monto guardado (680.000) no coincide con el precio de lista (325.000); el ciclo de vida reactiva restaurantes suspendidos a mano; `mark_order_paid` no registra el cobro en caja.

---

## 2. Estado de los hallazgos de la auditoría del 15-oct

| Hallazgo | 22-oct |
|---|---|
| Escalada propia de `profiles.role` | Abierto (C1) |
| `handle_new_user` confía en la metadata | Abierto (C2) |
| `profiles.active` no se aplica | Abierto (C8) |
| `restaurant_config` legible por anon (todos los restaurantes) | Abierto |
| `payments`/`subscriptions` legibles por cualquier empleado | Abierto |
| `cortes_caja` sin único por día | Abierto (14 duplicados) |
| `task-evidence` público | Abierto |
| `orders` UPDATE sobre cualquier columna | Abierto, peor de lo previsto |
| Vista `ingredientes_menu_publico` | Cerrado por otra persona |
| `change_my_password` pide contraseña actual | Cerrado |
| Funciones internas/trigger sin acceso por API | Cerrado (parcial) |
| 2FA en RPC de plataforma | Cerrado solo en funciones (no en RLS) |
| Webhook Wompi sin monto/idempotencia | Abierto |
| `send-push` sin rol ni URL relativa | Abierto |
| Llave de Gemini en URL | Abierto solo en `voice-parse` desplegada (v14 ≠ main) |

---

## 3. Seguridad — hallazgos por área

### 3.1 Datos, RLS y permisos
- **S-01** `profiles`: UPDATE de `role/active/email` concedido a `authenticated`; política "Own profile update" no restringe `role`; "Admin manages profiles" permite fijar `super_admin`. (C1, C8)
- **S-02** `orders`: UPDATE/INSERT de todas las columnas a personal; "Staff update order status" sin filtro de estado previo (resucita cancelados/completados). (C5)
- **S-03** `payments.raw` (cuerpo firmado de Wompi), `subscriptions.wompi_payment_source_id` y `restaurant_payment_config` (llaves privadas de Wompi) legibles por roles no admin / por el admin desde el navegador.
- **S-04** `restaurant_config` y `dishes` legibles por anon para todos los restaurantes (enumeración de clientes).
- **S-05** 2FA (`aal2`) solo en funciones `plataforma_*`; ~20–40 políticas `OR is_super_admin()` leen/escriben con aal1.
- **S-06** `cortes_caja`, `gastos`, `bases_caja`: cajero con `FOR ALL` (edita/borra cierres).
- **S-07** `tasks`: el empleado puede mover su tarea a otro restaurante y completarla sin evidencia; `complete_task_with_evidence` no valida ruta/URL.
- **S-08** `ai_report_feedback`: política con condición tautológica (`r.restaurant_id = r.restaurant_id`).
- **S-09** `profiles` visible (email, teléfono, `recovery_email`) a todo el equipo; políticas "Staff …" aceptan cualquier rol autenticado.
- **S-10** Privilegios de tabla excesivos: `anon` con INSERT/UPDATE/DELETE/TRUNCATE en ~25 tablas (solo la RLS lo contiene); vistas con grants de escritura.
- **S-11** Storage: `task-evidence` público; `branding` sin límite de tamaño ni MIME; `restaurant-assets` con listado anónimo; `contentType`/extensión decididos por el cliente.
- **S-12** Cron `wompi-charge-daily` con el secreto `x-cron-secret` **en texto plano** dentro de `cron.job`. *El valor apareció en una salida de esta auditoría: rotarlo.*

### 3.2 Funciones SQL (`SECURITY DEFINER`)
- **F-01** `cancelar_orden` (anon): staff cancela pedidos pagados (el dinero sale del corte); rama anónima/`kitchen`/`client` sin validar restaurante; sin `FOR UPDATE`.
- **F-02** `cancelar_item_orden`: precio sin cantidad, cancelable dos veces, sin bloqueo, sin comprobar pagos, no repone stock.
- **F-03** `crear_plato_custom`/`crear_orden_con_custom`: ingrediente sin filtrar restaurante (IDOR + fuga por mensajes de error), `quantity` sin validar (negativa), stock descontado una vez aunque `quantity>1`, mesa no validada.
- **F-04** `crear_orden_completa`: `p_mesa_id` sin validar contra el restaurante; cualquier mesero crea pedidos `RAPPI` ya pagados; sin idempotencia.
- **F-05** `on_order_status_change` (trigger definer) actualiza mesas sin filtrar restaurante.
- **F-06** `_cobrar_base`: efectivo vacío o corto aceptado; sin tope de propina.
- **F-07** `editar_items_pedido` (anon): edita pedidos con pagos parciales; no repone stock ni actualiza `detalles_pedidos`.
- **F-08** `hacer_corte_caja`: varios cortes por día, sin `UNIQUE`; `_dia_con_corte` congela correcciones.
- **F-09** `admin_update_employee`/`create_employee_profile`: un admin toma cuentas de otros admins y del dueño; contraseña mínima 6; no revoca sesiones.
- **F-10** `get_user_role/current_restaurant_id/is_admin/is_super_admin` ignoran `active`.
- **F-11** `tv_cocina_cancelar` cancela pedidos pagados con solo la clave de TV; sin límite por IP.
- **F-12** `order_total_cents` ejecutable por anon; `obtener_items_pedido_cliente`, `obtener_interacciones_platos` (`total_vendido` de cualquier restaurante), `verificar_cliente_pidio_plato` (oráculo por nombre).
- **F-13** `elegir_plan` cambia plan/monto sin pago y quita el tope de mesas; `registrar_compra_proveedor` sin validar signos; segregación de funciones en caja (`marcar_transferencia`, `corregir_pago`, `registrar_base_caja` tras el corte).
- **F-14** `registrar_factura_compra` es `SECURITY INVOKER` con comprobación de rol que no falla con rol NULL; `plataforma_*` sin rangos (`recurrente_pct>100`).

### 3.3 Edge Functions
- **E-01** `wompi-webhook`: sin idempotencia (replay extiende la suscripción), sin verificar monto/moneda, `reference` no firmada **[Seguro por código]**, comparación no constante.
- **E-02** `wompi-charge`/`wompi-subscribe`: cobro diario mientras el webhook falle; doble cobro por doble clic o ejecución repetida.
- **E-03** `wompi-init`: acepta pedidos pagados/cancelados; `redirect_url` y email sin validar; errores con detalle interno.
- **E-04** `send-push`: cualquier usuario del restaurante (incl. `client`) envía título/texto/URL arbitrarios; el service worker abre cualquier URL.
- **E-05** IA: limitadores que **fallan abiertos** (`=== false`), sin tope global ni por restaurante, `ai_usage` solo en `ai-report`; filtro anti-promesas de la landing evadible; `chat-support` en modo soporte sin filtro.
- **E-06** Despliegue ≠ repo: `voice-parse` v14 (llave en URL), `resti-brain` v7 (línea anómala en `cargarProveedor`), `diag-push` solo desplegada (inerte, `410`).
- **E-07** `platform_chat_logs` guarda IP y texto sin retención; hash de IP usa la service key como sal.

### 3.4 Frontend
- **W-01** Logout no limpia caché de React Query, IndexedDB (pedidos/pagos/facturas offline) ni push: otro usuario puede enviar pedidos/pagos del anterior.
- **W-02** `instagram_url`/`facebook_url` sin validar en `href` + CSP `script-src 'unsafe-inline'` ⇒ `javascript:` ejecuta código **[Seguro]**. `color_primario` sin validar.
- **W-03** Cuenta demo con contraseña en el bundle; error del login ignorado.
- **W-04** `PublicMenu` cae a un restaurante fijo (Cholaos) si el slug no existe o está inactivo.
- **W-05** CSP: `unsafe-inline`, `connect-src *.supabase.co` (cualquier proyecto), `img-src https:`; `frame-ancestors 'none'` rompe la vista previa propia.
- **W-06** `must_change_password` solo en UI; `updateUser({password})` sin contraseña actual en `TeamManager`/`ResetPassword`; mínimo 6 vs 8.
- **W-07** `Dashboard` intenta insertar un perfil con rol de `user_metadata` (muerto y peligroso); `getUser()` offline cierra la sesión.
- **W-08** Resti: confirmación por voz débil ("claro que no" = sí), sin idempotencia al aplicar, micrófono que no se libera en 3 rutas; `resti_agent` solo en UI.

---

## 4. Lógica de negocio y QA funcional

### Dinero y caja
- Pagos en línea no entran a `order_payments` (el corte no los ve) ni validan monto; cobros posteriores al corte quedan fuera; `get_admin_metrics` (created_at) vs cortes (paid_at); fecha UTC en facturas; `orders.change_amount` ignora propina; gastos de compras siempre salen de caja; monto "85.000" se lee como 85.
- Cola offline de pedidos: sin idempotencia, pierde mesa/nombre, regex de error no coincide con el real, sin pantalla de conflictos; no atada a usuario/sede.
- Stock: dos modelos incompatibles (descuento al crear vs al pagar), sin reposición al cancelar/editar, sin reserva real; ítems cancelados igual descuentan.

### Suscripciones, planes y comisiones
- Sin cobro real: suscripciones sin `current_period_end` (nada obliga al primer pago); `amount_in_cents` congelado; `sede_cargos` nunca leída; `precio_especial_cop` sin efecto; extender prueba no tiene efecto; `plataforma_activar_plan` reactiva a medias.
- `purge_restaurant` falla por FKs NO ACTION (y borraría `payments`/comisiones por cascada).
- Comisiones: doble comisión al reasignar vendedor, términos sin rango, vendedor inactivo cobra liquidaciones en borrador, MRR inflado con ciclo anual, devoluciones sin ajuste automático.

### Menú, inventario, equipo
- Precio mostrado ≠ cobrado en sub-opciones v2; recetas sin control de unidades; compra/edición de stock con datos viejos; mesas sin reactivar ni respetar tope del plan; errores de Supabase ignorados que muestran éxito; importadores con "1.250"→1250, CSV sin escape de fórmulas; botón "+ Nuevo proveedor" visible para cajero (RLS lo rechaza).
- Turnos nocturnos imposibles; `due_date` desplazado 5 h; cuentas "eliminadas" conservan email/auth; contraseña pública `Temporal1234!` por espacios; cámara en negro al repetir foto.
- Impresión: comanda fallida no se reintenta; "impreso" sin confirmación; ediciones/cancelaciones no llegan a la comanda.

### Páginas públicas
- Pedido pagado en Wompi pierde seguimiento al volver; "Pagar" visible con `isPaid`; mesa de URL sin validar; textos que contradicen el producto ("propio dominio", plan sin límite de usuarios); `Legal` con fecha dinámica.

---

## 5. Código muerto confirmado
`src/hooks/useRestiVoice.ts` · `public/service-worker.ts` · `hasAccess`, `copToCents` (`config/billing.ts`) · `inventoryService.registrarDetallePedido` (descontaría stock doble) y otros 3 métodos · ruta de voz sin streaming (`sintetizarVoz`, `reproducir`, `leerAudio`, `pcmDeWav`) · `partirFrases` · `btn-notificaciones` (target de Resti inexistente) · `plataforma_guardar_plan`, `plataforma_auditoria`, `ajustar_por_devolucion` (sin pantalla) · `precio_especial_cop` · `sede_cargos` · `useOfflineSync`, prop `onSelectMesa`, `handleApproveTask`, `|| 'Temporal1234!'`, `Dashboard` auto-insert de perfil · ~20 tipos/exports sin uso · tests `*.test.ts` sin script en `package.json`.

---

## 6. Infraestructura y la alerta de Node.js

- El proyecto de Vercel es una SPA Vite estática (Node 24.x **solo para el build**); no hay `api/` ni funciones serverless. El backend es Supabase (Postgres + Edge Functions en **Deno**).
- Una vulnerabilidad en el decodificador Brotli de Node afecta a procesos Node que decodifican contenido no confiable; esta app no ejecuta Node en producción. Exposición **[Suposición]: baja**. No se pudo verificar el aviso en fuentes oficiales.
- `npm audit` (prod): 0 vulnerabilidades. `xlsx` viene del CDN de SheetJS (0.20.3, versión corregida; `npm audit` no lo cubre).
- Acción: mantener el build en la versión parcheada de Node cuando se publique; no hay nada que parchear en tiempo de ejecución.

---

## 7. Plan de corrección (ver `docs/PLAN_CORRECCION_2026-10-22.md`)

Orden de despliegue obligatorio: migraciones compatibles → frontend y Edge Functions → migraciones que cierran lecturas/escrituras → rotar secretos → activar Wompi (último).
