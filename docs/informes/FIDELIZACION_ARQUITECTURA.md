# Fidelización, ARM y base para el bot de WhatsApp — arquitectura

Fecha: 2026-11-07. Estado: **diseño + 3 migraciones escritas, SIN aplicar en ninguna base**. No se tocó código de la app.

## 1. Lo que encontré (auditoría)
- **No existía tabla de clientes del restaurante.** Solo `orders.customer_name` (texto suelto). El `restaurant_crm` es del dueño de la plataforma (seguimiento de restaurantes), no sirve para esto. Nada que duplicar.
- No había puntos, niveles, recompensas, campañas ni tarjeta digital.
- WhatsApp: solo el número de contacto guardado (`restaurant_config.whatsapp_numero`) y enlaces. Sin envío ni recepción.
- Domicilios: existe el tipo de pedido `DOMICILIO`, sin dirección, mapa, repartidor ni estados.
- El cobro guarda los pagos en `order_payments`; `orders.paid_at` solo se llena cuando el pedido queda **pagado por completo** y vuelve a `NULL` si se anula un pago. Eso permite acreditar y revertir puntos sin tocar `cobrar_orden`.
- Los roles reales en la base son `admin`, `cashier`, `waiter`, `kitchen` (no "cajero/mesero").

## 2. Migraciones (en orden)
| Archivo | Contenido |
|---|---|
| `20261107120000_fidelizacion_clientes_puntos.sql` | `clientes`, `fid_programas`, `fid_reglas`, `fid_niveles`, `fid_recompensas`, `fid_cuentas`, `fid_acreditaciones`, `fid_movimientos` (libro), `fid_redenciones`, `fid_auditoria`; columna `orders.cliente_id`; trigger de acreditación; funciones `fid_*`; tarjeta pública por QR |
| `20261107120100_whatsapp_domicilios_base.sql` | `wa_config`, `wa_plantillas`, `wa_conversaciones`, `wa_mensajes` (entrantes + cola de salientes), `repartidores`, `domicilios`, `domicilio_eventos`, `domicilio_ubicaciones`; funciones `dom_*` y `wa_enviar_manual`; seguimiento público |
| `20261107120200_campanas_arm_interacciones.sql` | `cliente_interacciones`, `fid_campanas`, `fid_campana_destinatarios`, `arm_acciones` (propuestas de la IA); funciones de aprobación y de segmentos (inactivos, mejores clientes, cumpleaños) |

## 3. Cómo funciona
**Puntos.** El cajero o mesero asocia el pedido a un cliente (`fid_asociar_orden`). Cuando el pedido queda pagado por completo, un trigger acredita puntos y/o sellos. Una sola acreditación activa por pedido (índice único), así que repetir el cobro no duplica. Si el pago se anula, se revierte; si se vuelve a cobrar, se acredita de nuevo. Cada acreditación guarda cómo se calculó, así que cambiar las reglas no altera el historial. Un fallo al acreditar **nunca** frena el cobro: queda en `fid_auditoria`. No acredita pedidos Rappi.

**Libro de movimientos.** Solo se agrega; no se edita. El saldo y el nivel se actualizan solos en la misma transacción. Los canjes validan vigencia, nivel, límite por cliente y saldo, y repetir la misma clave no duplica.

**Tarjeta digital.** Cada cliente tiene un código largo (64 caracteres) para su QR y enlace. `fid_tarjeta_publica` devuelve solo primer nombre, saldos, nivel, progreso y los últimos 10 movimientos. Nunca teléfono, correo ni gasto.

**Domicilio por WhatsApp (flujo previsto).**
1. El cliente escribe al WhatsApp del negocio → el bot (futuro) arma el pedido y pide dirección y ubicación.
2. Se crea el pedido tipo `DOMICILIO` y su registro en `domicilios` (`recibido`).
3. El restaurante lo confirma, prepara y marca listo (`dom_cambiar_estado`).
4. Se asigna repartidor (`dom_asignar_repartidor`): el bot le escribe por WhatsApp con dirección y ubicación.
5. El repartidor responde y comparte su ubicación → `domicilio_eventos` y `domicilio_ubicaciones`.
6. El cliente ve el estado y el mapa en un enlace público (`dom_seguimiento_publico`) y recibe avisos por WhatsApp.

**ARM (CRM manejado por IA).** Es Resti trabajando como gestor de relaciones con clientes, no otro chatbot. **Propone, no ejecuta:** cada propuesta queda en `arm_acciones` con su razón y la evidencia (datos reales). El administrador la aprueba o rechaza (`arm_decidir`). Solo entonces un proceso con rol de servicio la ejecuta usando las funciones oficiales. Las propuestas expiran a los 7 días para no ejecutar con datos viejos.

## 4. Qué ya queda listo para el bot (sin conectar nada)
- WhatsApp arranca **desactivado**. Mientras esté así no se encola ni se "simula" ningún envío.
- Una **cola única** de salientes (`wa_mensajes` en estado `en_cola`) para avisos de pedido, repartidores, campañas y ARM.
- Entrantes idempotentes: `wa_message_id` único evita procesar dos veces el mismo webhook.
- Regla de las 24 horas: texto libre solo dentro de 24 h desde el último mensaje del cliente; fuera de eso, plantilla aprobada.
- Los avisos de estado salen solo si existe una plantilla **aprobada por Meta** llamada `dom_<estado>` (por ejemplo `dom_en_camino`). Sin plantilla, no se envía nada.
- Los mensajes de promoción exigen **consentimiento** del cliente.
- Los secretos de la API **no** van en tablas: solo el nombre del secreto en Supabase.

## 5. Permisos
| | Admin | Cajero | Mesero | Cocina |
|---|:-:|:-:|:-:|:-:|
| Ver clientes, saldos, movimientos | ✔ | ✔ | solo buscar (teléfono tapado) | ✖ |
| Registrar / editar cliente | ✔ | ✔ | ✖ | ✖ |
| Asociar pedido a cliente | ✔ | ✔ | ✔ | ✖ |
| Canjear recompensa | ✔ | ✔ | ✖ | ✖ |
| Anular canje, ajustar saldo, reglas, niveles, recompensas | ✔ | ✖ | ✖ | ✖ |
| Campañas, propuestas del ARM, informes de segmentos | ✔ | ✖ | ✖ | ✖ |
| Crear domicilio | ✔ | ✔ | ✔ | ✖ |
| Estado del domicilio y repartidor | ✔ | ✔ | ✖ | ✖ |
| Configurar WhatsApp y repartidores | ✔ | ✖ | ✖ | ✖ |

Todo se valida en la base (RLS y funciones), no solo ocultando botones. Los movimientos y la auditoría no se pueden editar.

## 6. Lo que falta cuando elijas la API de WhatsApp
1. Elegir proveedor (Meta Cloud directo u otro) y crear el número de negocio. Costo por conversación y plantillas aprobadas por Meta.
2. Edge Function **webhook** de entrada (verifica firma, guarda en `wa_mensajes`, avisa al bot).
3. Edge Function **worker** de salida (lee `en_cola`, envía, marca enviado/fallido con reintentos).
4. Registrar y enviar a aprobación las plantillas (`dom_*`, `dom_asignado`, bienvenida, promoción).
5. Pantalla en Configuración: número del negocio, empresa y número de repartidores, plantillas, prueba de conexión.
6. El bot (Resti) con su máquina de estados en `wa_conversaciones.contexto`.

## 7. Decisión abierta (no la resolví)
**¿Cómo crea el bot un pedido?** `crear_orden_completa` depende del usuario con sesión (`current_restaurant_id()`), y un proceso de servicio no tiene sesión. Opciones:
- **A (recomendada):** un usuario técnico por restaurante (rol `cashier`) cuyo acceso solo usa el bot. No se duplica la lógica de caja.
- **B:** una función nueva solo para rol de servicio que replique la creación del pedido. Duplica lógica sensible.

## 8. Pendientes y límites conocidos
- **Probado solo en el proyecto de prueba** (`restaurantos-prueba`), con todo deshecho al terminar. Producción NO tiene estas tablas todavía: se aplica de noche, tras el servicio, con copia previa y "apruebo, aplica".
- Prueba que dio error y se corrigió: el seguimiento público del domicilio fallaba si el pedido no estaba "en camino" (ya corregido en la migración 2).
- Sin probar aún: teléfono tapado del mesero, campañas, aprobación de propuestas del ARM e informes de segmentos.
- Teléfonos de cualquier país: con "+" o "00" se respeta el país; sin ellos, un celular colombiano de 10 dígitos recibe el 57. El formulario trae selector de país.
- Reglas de puntos soportadas hoy: base por monto, multiplicador temporal y bono fijo. **No** hay todavía puntos por producto, cumpleaños o frecuencia (no se muestran como si existieran).
- El canje descuenta puntos y el cajero entrega el beneficio. **Aplicar el descuento al total del pedido no está hecho**: toca Caja, que solo admite cambios visuales.
- Sin vencimiento de puntos ni reglas de permanencia de nivel.
- Teléfonos: se normaliza el celular colombiano de 10 dígitos agregando el 57. Otros países quedan para cuando se haga multi-moneda/multi-país.
- La tarjeta pública y el seguimiento no tienen límite de intentos propio; el código de 64 caracteres hace inviable adivinarlo. Conviene un límite por IP en la Edge Function que los sirva.
- El plan comercial (Base/Pro/Premium) que incluye Fidelización queda por definir.
- Corte mensual con otros meses: tarea aparte, no incluida aquí.

## 9. Siguiente paso
Hecho en la rama `feat/fidelizacion`: pantallas de Resumen y Clientes (administrador y cajero), tarjeta pública `/tarjeta/<código>` y búsqueda en Inventario. Sigue: aplicar migraciones en producción (de noche), pantalla de reglas/niveles/recompensas, campañas sin envío real, corte mensual con selector de mes, asistente ARM, WhatsApp/domicilios y mesero (asociar pedido a cliente desde Pedidos).
