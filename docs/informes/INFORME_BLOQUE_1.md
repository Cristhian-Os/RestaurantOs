# Informe Bloque 1 — La plata del restaurante piloto

Fecha: 2026-10-14. Estado: **listo para tu revisión. Nada está aplicado en producción.**

## 1. Qué se hizo (en palabras sencillas)

El problema: una mesa de 5 donde 3 pagan en efectivo y 2 por transferencia dejaba el corte de caja mal repartido, porque el sistema guardaba **un solo método de pago por pedido**.

La solución: un pedido ahora puede tener **varios pagos**. Cada pago dice quién pagó, con qué método y cuánto. El corte suma pagos, no pedidos.

| Parte | Qué hace ahora |
|---|---|
| **Dividir cuenta** (caja) | Botón en cada pedido. Tres modos: montos libres, partes iguales y por persona. Cada persona paga con su método, con su propina, su cambio y su referencia. Se cobra persona por persona; si falta una, el pedido queda "Cobrado $67.000 · falta $20.000". |
| **Tomar el pedido por persona** (mesero/caja) | Opcional. En "Confirmar" aparece "Cuenta por persona": cada plato se marca "Para: Persona 2". Si no se usa, la cuenta igual se puede dividir en partes iguales o a mano. |
| **Corte de caja** | Suma pagos por método (efectivo, transferencia, **tarjeta**). Muestra de dónde sale el efectivo esperado: base + aportes + efectivo + propinas en efectivo − gastos de la caja − reembolsos. Lista las **transferencias del día** para marcarlas una por una contra el banco, y las **mesas con pagos mixtos** (donde suele estar un descuadre). El Excel trae una hoja nueva con cada pago. |
| **Pagos de hoy** | Cada pago de hoy. El cajero o el admin puede **cambiar el método** ("dijo efectivo y pagó por transferencia") con motivo. Solo el admin puede **anular** un pago (con motivo). Después del corte del día, nada se edita. |
| **Gastos con origen del dinero** | Al registrar un gasto se elige: efectivo de la caja, dinero propio de quien lo pagó (ej. Angela), transferencia o tarjeta. Lo de Angela **no resta del cajón** y queda en **"Por reembolsar"**, con botones para devolverle con efectivo de la caja o por transferencia. Hay **"Aporte a la caja"** si la base no alcanzó. |
| **Sin internet** | Si se cae el internet al cobrar una parte, el pago se guarda en el equipo y **se envía solo** al volver la conexión, sin duplicarse. Si el servidor lo rechaza, queda visible en rojo. |
| **Voz** | "Gasto de 50 mil en gas, lo pagó Angela" propone el gasto como dinero propio. **Ojo: la función de voz del servidor NO está publicada** (ver sección 5). |

## 2. Qué se probó y qué resultó

**En el proyecto de prueba (copia exacta de la estructura de producción, datos ficticios):**
- **Mesa de 5 del spec:** efectivo 60.000, transferencias 27.000, total 87.000, propinas en efectivo 1.800, efectivo esperado = base + 61.800. El gasto de 50.000 de Angela no cambió el cajón; el aporte de 30.000 sumó. Coincide exactamente con el spec.
- **Doble toque** de la persona 3: no duplicó el pago.
- **16 casos difíciles:** pago parcial, sobrepago (rechazado), efectivo que no alcanza (rechazado), cajero de otro restaurante (rechazado, y no ve los pagos ajenos), corregir método, cajero intentando anular (rechazado), admin anulando (el pedido vuelve a caja), cobro de siempre (`cobrar_orden_inicial` + `cobrar_orden`) crea un solo pago, Rappi se entrega sin pagos y no acepta pagos en caja, pedido gratis, y corrección después del corte (rechazada).
- **Punto 1.1 (el pedido no sale de caja hasta cobrarse):** probado en mesa, llevar, domicilio y Rappi. Cocina **no puede** dar un pedido por completado sin cobrar (la base de datos lo rechaza).
- **Tomar el pedido por persona** en el servidor: guarda la marca, ignora nombres en blanco, la edición la conserva y no se duplicaron funciones.
- **Reversas:** ensayada la de pagos (quita lo nuevo, deja los pagos guardados, devuelve las funciones viejas).

**Sobre datos reales de producción (sin cambiar nada; transacción que se revierte):**
- La migración de datos crea un pago por cada pedido ya cobrado y **comprueba día por día** que efectivo, transferencia y propinas no cambian. Resultado: **0 días con diferencia, 23 días, 589 pagos, $13.819.017**. Si algún día no cuadrara, la migración se cancela sola.

**En la pantalla (simulador local, sin tocar producción):**
- Dividir cuenta con la mesa de 5, pago por partes con cierre a medias ("Seguir cobrando"), gastos de Angela, aporte, reembolso, corte, transferencias, mesas mixtas, bloqueo de corrección tras el corte, sin internet → envío automático, y celular de 390 px (sin scroll horizontal, todos los controles de 44 px o más).
- Compila, el build de producción termina, y pasan las 4 pruebas automáticas del proyecto (`salesHistory`, `voiceCommands`, `menuOptions`, `notifyOrder`).

**Lo que NO pude probar:** la pantalla contra la base real (no se puede iniciar sesión por mí), con una impresora o un celular real, ni la caída real de internet (la simulé).

## 3. Qué cambia para quien ya usa la app (importante)

1. **El efectivo esperado en el cajón ahora resta los gastos pagados con la caja y los reembolsos.** Antes no los restaba. Es lo que pidió el spec, pero cambia el número que ves en el corte.
2. **El corte cuenta el dinero que de verdad entró hoy**, aunque el pedido todavía esté en cocina. Antes solo contaba pedidos ya completados. Para los días pasados no cambia nada (lo comprueba la migración).
3. El historial de ventas de hoy y el resumen de arriba ya usan pagos, así que un pedido mixto se reparte bien entre efectivo y transferencia.

## 4. Riesgos que veo

- **Orden de publicación:** primero la base de datos, **después** la pantalla. Si se publica la pantalla antes, caja falla. La base nueva sí funciona con la pantalla vieja (compatible), por eso el orden seguro es ese.
- **Sin copias automáticas** (plan Free): la copia manual de esta mañana es de las 00:10. Hay que repetirla justo antes de aplicar.
- Los pagos sin internet se guardan **en ese equipo**: si se borra el navegador antes de reconectar, se pierden. El aviso amarillo de caja lo recuerda.
- La migración hace bloqueos de milisegundos sobre `orders`, `gastos` y `cortes_caja`: conviene aplicarla con el restaurante tranquilo (no en hora pico).

## 5. Plan para producción (cuando tú digas)

1. **Copia de seguridad nueva** (el mismo comando de antes) y anotar en `REGISTRO_COPIAS.txt`.
2. Aplicar `20261014154959_pagos_divididos_y_gastos_origen` (incluye la verificación día por día).
3. Aplicar `20261014155051_comensal_en_items_pedido`.
4. Comprobar con consultas que todo quedó (conteos y la mesa de prueba en Demo).
5. Publicar la pantalla (subir los commits `edd235c`, `a6005ee`, `0b2a8fb` y el resto de esta rama).
6. *(Opcional, aparte)* Publicar la función de voz `voice-parse` para "lo pagó Angela". Cambia una función que usa IA, así que va solo con tu aprobación.

**Reversa si algo falla:** `supabase/rollback/20261014154959_…_down.sql` y `20261014155051_…_down.sql` (cada una explica qué hace y qué no borra).

## 6. Prueba manual guiada para ti

Recomiendo hacerla **primero en el restaurante Demo** y, si todo va bien, repetir la mesa real en Cholaos Dany con Angela.

1. **Abre Caja** con el usuario cajero. Toma un pedido de mesa con 5 platos. En "Confirmar" toca **Cuenta por persona**, pon 5 personas y asigna un plato a cada una.
2. En Caja, en ese pedido, toca **Dividir cuenta → Por persona**. Debe mostrar 5 filas con el valor de cada una.
3. Cobra: personas 1, 3 y 5 en **Efectivo** (en la 1 pon propina y "Entrega" más grande para ver el **cambio**), personas 2 y 4 en **Transferencia** con una referencia. Debe ir mostrando "Cobrado $… · falta $…" y al final "Cuenta cobrada por completo".
4. Toca **Pagos de hoy**: deben verse los 5 pagos. En una transferencia toca **Marcar verificada**.
5. Registra un **gasto** de 50.000 "Se pagó con: Dinero propio" ("Angela"). Debe aparecer **Por reembolsar**. Registra un **Aporte a la caja** de 30.000.
6. Toca **Hacer corte de caja**. Debe dar **efectivo 60.000, transferencias 27.000, total 87.000**, propina en efectivo 1.800, y el efectivo esperado = base + aportes + efectivo + propinas − gastos de caja − reembolsos. Abajo deben salir las 2 transferencias y la mesa mixta. Descarga el Excel: trae la hoja **Pagos**.

Si algo no coincide, dime qué número viste y cuál esperabas.

## 7. Pendientes descubiertos (no son parte de este bloque)

- `offlineService.ts` (pedidos sin internet) **no envía el nombre del comensal** al sincronizar (`p_customer_name`), y hoy el nombre es obligatorio. Es anterior a este bloque.
- El modal de cobro de siempre solo ofrece Efectivo y Transferencia; **Tarjeta** solo está en "Dividir cuenta". Habría que decidir si se agrega allí también.
- El Excel mensual no trae columna de Tarjeta por día (sí en el total).
- La función de voz y el aviso de "gasto de Angela" necesitan el despliegue de `voice-parse` (sección 5, paso 6).
- La migración suelta `20260928195300_fix_cancelar_orden_editar_pedido_cliente_security.sql` sigue sin commit; hay que revisar si ya está aplicada.
- Producción tenía dos políticas "Kitchen TV" que ya se cerraron (Bloque 3, arreglo crítico); el resto de seguridad del Bloque 3 sigue pendiente.

## 8. Checklist del plan de acción (Anexo G)

- [x] 1.1 Prueba automática: pedido no sale de caja hasta cobrarse (`supabase/tests/pedido_no_sale_de_caja.sql`).
- [x] 1.6 Pruebas de caracterización y reproducción del descuadre (antes: el corte sumaba el pedido entero; ahora: pagos).
- [x] 1.6 `order_payments` + migración de datos con verificación día por día.
- [x] 1.6 `registrar_pago`, ajuste de `cobrar_orden`, `cobrar_orden_inicial`, `hacer_corte_caja`, `get_corte_productos` (y `get_corte_mensual`).
- [x] 1.6 Modal "Dividir cuenta".
- [x] 1.6 Platos por comensal al tomar el pedido.
- [x] 1.6 Corte con transferencias del día, ayuda para diferencias y hoja de pagos en el Excel.
- [x] 1.6 Corregir el método de un pago o anularlo (antes del corte, con motivo).
- [x] 1.6 Gastos con origen del dinero, "Por reembolsar", reembolsos, aportes y efectivo esperado; tarjeta en los totales.
- [ ] **Pendiente de ti:** aplicar en producción y la prueba de la mesa de 5 en Cholaos Dany.
