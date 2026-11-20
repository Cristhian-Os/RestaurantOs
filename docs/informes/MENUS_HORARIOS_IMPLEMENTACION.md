# Menús por horario — informe de implementación

Fecha: 2026-11-20 · Rama: `ccr-b6eb9fd7-4n8tkc` · Base probada: `restaurantos-prueba` (`qdhafwnwrvsqunnnecky`)
**Producción (`RestaurantOs`, `ifypeslrcdebvdqglywt`): NO se tocó.** Nada de esto está aplicado ahí.
Plan original: `MENUS_HORARIOS_FASE1_2_AUDITORIA_Y_PLAN.md` (este informe corrige lo que cambió: el precio especial ya funciona también **por tamaño**).

---

## 1. Qué hace (en sencillo)

Cada restaurante crea sus menús (Desayunos, Almuerzos, Brunch, Noche, los que quiera), cada uno con sus horarios, días, productos y precios propios. El sistema, solo, muestra el menú que toca según la hora **del restaurante** (no la del celular del cliente) y cobra con el precio de ese menú.

- **Interruptor por restaurante, apagado de fábrica.** Apagado, todo funciona exactamente como antes (probado, ver §5).
- El cliente del QR ve el menú de ahora, su descripción y cuándo llega el siguiente. Cambia solo, sin recargar.
- Meseros y caja ven y venden solo lo del menú vigente (el administrador puede autorizar vender fuera de horario).
- Un pedido ya hecho **nunca** cambia de precio ni de contenido cuando pasa la franja.
- El administrador puede forzar, extender o suspender un menú a mano, crear días especiales (festivos) y volver a automático. Todo queda registrado: quién, cuándo y qué.
- Zona horaria por restaurante (Colombia por defecto; ya se puede elegir México, Perú, Chile, España, etc.).

## 2. Cómo probarlo desde el celular (cuando esté desplegado en un entorno de prueba)

1. Entra como administrador de una sede **de prueba** → menú de navegación → **Menús por horario**.
2. Toca **+ Nuevo menú**: nombre "Desayunos", horario de 6:00 a. m. a 11:00 a. m., marca 2 productos y ponle precio especial a uno. Guarda.
3. Arriba, enciende el interruptor **Menús por horario**. Debe decir "Ahora rige: Desayunos" (si es de mañana) o "Ahora no rige ningún menú".
4. Abre el QR del restaurante en otro celular: debe verse la tarjeta "Menú de ahora", solo los productos de ese menú (más los de "todo el día") y el precio especial.
5. Pestaña **Control manual** → elige un menú → "Usar solo este menú ahora" → 30 minutos → Aplicar. El QR debe cambiar solo en menos de 2 minutos.
6. **Volver a automático**. Pestaña **Historial**: debe aparecer quién hizo cada cosa.
7. Apaga el interruptor: el menú vuelve a verse completo, como siempre.

## 3. Reglas de funcionamiento

- **Qué rige a una hora:** franjas del día (o, si ese día es "especial", solo las franjas de ese día) → controles manuales → quitar los suspendidos. *Forzar* reemplaza todo; *extender* suma; *suspender* quita.
- **Medianoche:** una franja de 6:00 p. m. a 2:00 a. m. cuenta para el día en que **empieza**; el sábado a la 1:00 a. m. rige el menú del viernes noche. Mismas horas de inicio y fin = 24 horas.
- **Producto en varios menús:** gana el menú de **prioridad más baja** (número menor). Sin precio especial se usa el general.
- **Todo el día:** el producto se ve en cualquier momento, aun sin menú vigente. Con el interruptor encendido, un producto que no está en ningún menú y no es "todo el día" **no se ve**: la pantalla avisa.
- **Gracia (10 min, configurable):** si un cliente armó su pedido justo antes del cambio, se le acepta hasta esos minutos después con el precio que tenía.
- **Pedido QR con mesa:** se cobra con el menú y precio del momento en que el cliente **pidió**, no de cuando el mesero lo acepta.
- **Editar un pedido:** cada línea conserva su menú y su precio de menú.
- **QR vs personal:** un menú marcado "no mostrar en QR" no se ve ni se puede pedir por QR/WhatsApp, pero sí lo usa el personal.
- **Personal fuera de horario:** solo si el administrador lo autoriza en Ajustes. Los clientes por QR, nunca.

## 4. Qué cambió

**Migraciones** (`supabase/migrations/`, todas aplicadas en `restaurantos-prueba`, en este orden):

| Archivo | Qué hace |
|---|---|
| `20261117120000_menus_horario_tablas` | 6 tablas nuevas (menús, franjas, productos, días especiales, controles manuales, auditoría), 5 columnas nuevas con valor por defecto, seguridad por restaurante, auditoría automática. Solo agrega. |
| `20261117130000_menus_horario_funciones` | Qué menú rige, estado para QR/personal, guardar, duplicar, controles, interruptor, copiar a otra sede. |
| `20261117131000_…_fix_coherencia` | Corrige un error hallado en pruebas (ver §6). |
| `20261117132000_…_precio_pedidos` | **La delicada:** `_precio_plato` (misma firma) valida horario y aplica precio de menú; parchea 6 funciones de pedidos con cambios de un solo punto. |
| `20261117133000_…_fix_parentesis_items` | Corrige un error hallado en pruebas (ver §6). |
| `20261117134000_…_whatsapp_carta` | La carta y los precios que el bot de WhatsApp dice al cliente salen del mismo cálculo que el cobro. |
| `20261117135000` y `20261117136000` | Cierra funciones internas al público (aviso de seguridad) y corrige el efecto que tuvo (ver §6). |

Los parches usan reemplazos exactos sobre la función **viva**: si en producción el texto no es el esperado, la migración se detiene sin cambiar nada (es transaccional).
**Reversa:** `supabase/rollback/20261117132000_menus_horario_down.sql` (probada en prueba). Paso 1 (apagar el interruptor) basta por sí solo para volver al comportamiento anterior al instante.

**Código** (`src/`): `lib/menuHorario.ts` (+ `.test.ts`), `hooks/useMenuHorario.ts`, `components/menu/horarios/*` (6 archivos), cambios mínimos en `pages/PublicMenu.tsx`, `components/orders/OrderFlow.tsx`, `pages/Dashboard.tsx`, `types/index.ts`. Edge function `supabase/functions/menu-asistente` (+ prueba).
**No se tocó:** `CashierPanel`, `SplitPayModal`, `KitchenBoard`, inventario, recetas, corte de caja. El dinero de caja cobra lo que el pedido ya trae guardado.

## 5. Resultados de las pruebas (reales, en `restaurantos-prueba`)

Las 14 pruebas obligatorias del encargo:

| # | Prueba | Resultado |
|---|---|---|
| 1 | Desayuno → almuerzo | ✅ 10:59:59 desayuno, 11:00:00 almuerzo |
| 2 | Almuerzo → brunch | ✅ 14:59:59 / 15:00 |
| 3 | Días distintos | ✅ domingo sin almuerzo, nocturno solo vie-sáb |
| 4 | Cruce de medianoche | ✅ sáb 01:00 y dom 01:00 siguen con el nocturno; 02:00 ya no; lunes 01:00 no |
| 5 | Todo el día | ✅ Gaseosa a cualquier hora, incluso sin menú vigente |
| 6 | Producto en varios menús | ✅ Huevos en 3 menús, un solo plato |
| 7 | Precio por menú | ✅ 12.000 / 14.000 (general) / 15.000; por tamaño 8.000 y 13.000; sin precio de tamaño → general |
| 8 | Pedido durante el cambio | ✅ pedido guardado no cambia; gracia de 10 min; QR aceptado tarde cobra desayuno; editar a otra hora conserva 12.000 |
| 9 | QR en distintos dispositivos | 🟡 pantallas vistas en celular (390 px) con datos simulados; **falta probar en celulares reales con sesión real** |
| 10 | Cambio manual | ✅ forzar, extender, suspender, volver a automático, con auditoría |
| 11 | Excepciones / festivos | ✅ día especial solo con sus franjas |
| 12 | Restaurante sin menús por horario | ✅ mismo total, mismas llaves, **sin** llave `menu`; sede B idéntica; interruptor apagado en A idéntico |
| 13 | Aislamiento entre sedes | ✅ caja de B ve 0 menús de A; no puede vender platos de A; no puede ver el estado de A; el admin no puede poner platos de otra sede; anónimo no lee tablas |
| 14 | Hora del dispositivo vs zona del restaurante | ✅ el mismo instante es 5:30 a. m. en México (sin menú) y 6:30 a. m. en Bogotá (Desayunos) |

Además: caja no puede crear menús; zona horaria inventada rechazada; copiar menú a otra sede (platos por nombre; sede ajena rechazada); interruptor avisa si el menú de clientes quedaría vacío; carta del bot a 4 horas; reversa; asistente de carta (prueba de código); lógica del navegador (`node src/lib/menuHorario.test.ts`, `node supabase/functions/menu-asistente/carta.test.ts`); `tsc` sin errores nuevos; `check:resti` y `check:contrast` pasan.

**No se probó:** rendimiento con carga real, pantallas contra el backend real con sesión, `npm run build` completo (esta máquina no puede descargar la dependencia `xlsx`; se verificó con `tsc` y servidor de desarrollo), modo oscuro de las pantallas nuevas, `EditOrderModal`.

## 6. Errores que aparecieron y se corrigieron (las pruebas sirvieron)

1. El disparador de coherencia leía un campo que no existe en otra tabla (no se pudo guardar ninguna franja).
2. En QR sin mesa y WhatsApp, el nombre del menú se guardaba **como un elemento suelto dentro de la lista de platos del pedido** (y un `{}` vacío aun en sedes sin menús). Era un problema de paréntesis; habría ensuciado todos los pedidos.
3. Al cerrar funciones internas por el aviso de seguridad, se rompió el cambio de zona horaria del administrador. Se corrigió y se probó como admin real.
4. La "próxima franja" de un menú ignoraba sus fechas de inicio/fin (mostraba "hoy" para un menú que empieza en diciembre).
5. Descubierto de fondo: el bot de WhatsApp decía el precio general y el pedido cobraba el de menú. Ya salen del mismo cálculo.

## 7. Seguridad

Las 6 tablas nuevas tienen seguridad por fila: el admin gestiona lo de su sede, el personal solo lee lo de su sede, el público no lee nada directo (usa la función del QR). Revisión de Supabase sobre la base de prueba: sin hallazgos nuevos en tablas; funciones internas cerradas. Es intencional que anónimo pueda ejecutar `menu_horario_estado` (es el QR) y que `authenticated` ejecute las de administración (validan `is_admin()` y la sede).

## 8. Para llevarlo a producción — necesita tu "apruebo, aplica"

No lo hago sin tu orden y sin copia previa. Pasos propuestos:
1. **Copia previa:** guardar las definiciones actuales de las 8 funciones que se parchean (`_precio_plato`, `crear_orden_completa`, `create_public_order`, `mesa_pedir_publico`, `mesa_pedido_aceptar`, `editar_items_pedido`, `wa_bot_cotizar`, `wa_bot_contexto`) en `docs/informes/` (como el respaldo del 2026-11-08) y confirmar copia diaria en Supabase (Database → Backups).
2. Aplicar las 8 migraciones en orden. Si alguna se detiene por "texto esperado", no cambió nada: se revisa esa función.
3. Publicar la función `menu-asistente` y la app.
4. Verificar que **un pedido normal** de Cholaos Dany sale al mismo precio (interruptor apagado).
5. Solo entonces, con un restaurante de prueba o Demo, encender el interruptor.

## 9. Pendientes descubiertos (no se hicieron; no los pedía este paso)

- **Moneda por país.** Existe `restaurant_config.currency_code`, pero la app formatea casi todo en pesos colombianos (`formatCOP` y `fmt` locales repetidos en ~10 archivos). Cambiarlo toca caja, reportes y cobros: proyecto aparte. Los menús guardan precios como números, sin moneda, para no estorbar.
- Resti (voz/acciones) toma nombres de platos sin filtrar por menú: solo afecta reconocimiento de voz; el servidor igual rechaza lo no vigente.
- La pantalla de cocina no muestra el nombre del menú (el pedido sí lo guarda en cada línea).
- En `OrderFlow`, una línea que ya estaba en el carrito conserva el precio mostrado hasta enviarse; el servidor cobra el real.
- "Volver a automático" también cierra controles programados a futuro (la pantalla solo crea controles que empiezan ya).
- Un plato editado en un pedido sin menú se reprecia con el precio **actual** del plato (comportamiento que ya existía).
- Modo oscuro y pruebas en celulares reales de las pantallas nuevas.
- Datos de ejemplo (menús, platos, pedidos de prueba) quedaron en `restaurantos-prueba`, sedes A y B.
