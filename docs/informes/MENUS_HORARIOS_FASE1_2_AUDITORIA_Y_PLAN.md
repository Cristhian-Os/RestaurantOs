# Menús por franjas horarias — Fase 1 (auditoría) y Fase 2 (diseño técnico)

Fecha: 2026-11-17 · Rama: `ccr-b6eb9fd7-4n8tkc` · Estado: **PROPUESTA, sin código ni migraciones aplicadas.**

---

## 0. Lo que hay que decidir antes de empezar

1. **Esta función toca el cálculo de dinero de todos los pedidos.** `CLAUDE.md` dice que en Caja (`CashierPanel`) y Pedidos (`OrderFlow`) solo se cambia la capa visual. Los precios por menú obligan a cambiar las funciones del servidor que calculan el total (`_precio_plato` y las que la llaman). En pantalla los cambios siguen siendo visuales; el cambio de dinero ocurre en la base de datos. Hace falta permiso explícito de Cristhian para tocar esa parte.
2. **No hay base de pruebas en este entorno.** El simulador `.claude/qa-mock` no existe en esta copia del repositorio y no sé cuál es el proyecto Supabase de prueba. Sin él, las pruebas de base de datos de la Fase 5 no se pueden ejecutar de verdad.
3. **Las funciones del repositorio pueden no ser idénticas a las de producción.** El historial real vive en Supabase (`docs/informes/RESPALDO_FUNCIONES_PRODUCCION_2026-11-08.sql` es la última copia). Antes de reescribir cualquier función hay que leer su versión actual en el proyecto de prueba con `pg_get_functiondef`, no copiarla del repo.
4. **El alcance es grande.** Recomiendo entregarlo en dos partes (ver §6): primero lo que hace funcionar los menús solos, y después excepciones avanzadas, festivos y copiar entre sedes.

---

## 1. Auditoría (Fase 1)

### 1.1 Productos y categorías
- Tabla `dishes` (`00000000000000_baseline_tables_snapshot.sql:47`): `price`, `category` (texto libre), `available`, `availability_status` (`available | out_of_stock | discontinued`), `has_sizes` + `sizes` (precio por tamaño), `toppings`, `options` y `restaurant_id`.
- Las categorías no son una tabla: viven en `restaurant_config` y se leen con `useMenuConfig` / `orderCategories`.
- Administración: `src/components/menu/MenuManager.tsx` (1605 líneas). Para marcar algo como agotado: `MenuAvailability.tsx` (vista `menu_gestion`) mediante `set_plato_disponible`.
- RLS de `dishes`: el admin gestiona; el personal lee; el público (anon) lee los platos disponibles.

### 1.2 Menú QR público
- `src/pages/PublicMenu.tsx` lee **directo** `dishes` (`.eq('available', true)`, línea 1210) y `restaurant_config`, y escucha cambios en vivo por un canal realtime (línea 1259).
- Ya existe un horario de apertura del restaurante (`restaurant_config.horario_activo/apertura/cierre`, `cerrado_manual`), con manejo de horarios que cruzan la medianoche y **zona horaria fija `America/Bogota`**.
- Pedido desde el QR: `create_public_order` (sin mesa) y `mesa_pedir_publico` (con mesa; queda pendiente y el mesero lo acepta).

### 1.3 Pedidos y precios: dónde se calcula el dinero
El precio **siempre lo calcula el servidor**; el navegador nunca lo impone. Hay una función central:

| Función | Usa `_precio_plato` | Nota |
|---|---|---|
| `_precio_plato(dish, size, toppings, sel)` | — | Calcula precio base o por tamaño, más toppings y opciones v2. `whatsapp_bot_cerebro.sql:39` |
| `crear_orden_completa` (mesero/caja) | Sí | `whatsapp_bot_cerebro.sql` |
| `create_public_order` (QR sin mesa) | Sí | ídem |
| `mesa_pedir_publico` (QR con mesa) | Sí | `mesas_qr_pedidos.sql` |
| `mesa_pedido_aceptar` | Llama a `crear_orden_completa` | **Vuelve a calcular el precio al aceptar, hasta 30 min después** |
| `wa_crear_pedido_bot` (WhatsApp) | Sí | `seguridad_fidelizacion_2.sql` |
| `editar_items_pedido` | **No**: tiene su propia copia del cálculo | `comensal_en_items_pedido.sql:76-102`. Conserva el precio de las líneas viejas y les pone precio actual a las nuevas |
| `editar_pedido_cliente` | No | Solo usa los precios ya guardados |

**Copia histórica: ya existe.** Cada línea guarda su precio en `orders.items[].price` y en `detalles_pedidos.precio_unit`. Un cambio de franja no toca pedidos existentes, porque nada vuelve a calcular pedidos ya creados (salvo el caso de `mesa_pedido_aceptar`, ver §3.4).

### 1.4 Cocina e inventario
- `KitchenBoard.tsx` lee `orders.items` y no recalcula precios: si se añade un campo nuevo a cada línea, simplemente lo ignora.
- El inventario se descuenta con `reservar_stock_receta(dish_id, qty)` y `_consumo_opciones`, que solo dependen del plato y no del precio. **No hay que tocarlos.**

### 1.5 Sedes
- Cada sede es una fila de `restaurants` (`20261022004544_multi_sede.sql`). La sede activa del usuario es `profiles.restaurant_id`, y toda la RLS usa `current_restaurant_id()`.
- Conclusión: si las tablas nuevas tienen `restaurant_id` y la misma RLS, cada sede queda aislada sin trabajo adicional.

### 1.6 Otros lugares que muestran platos (se integrarían en la Fase 4)
`OrderFlow.tsx`, `EditOrderModal.tsx`, `ClientMenuSection.tsx`, `restiMenu.ts`, `voiceCommandsApi.ts`, el bot de WhatsApp y las funciones `resti-*` / `menu-asistente`. Si alguno no se filtra, va a ofrecer platos fuera de horario, y el servidor los rechazará al pedirlos.

---

## 2. Arquitectura propuesta (Fase 2)

### 2.1 Principio
- **Interruptor por restaurante** `restaurant_config.menus_horario_activo` (por defecto `false`). Con el interruptor apagado no cambia **nada**: mismas consultas, mismos precios y mismo menú. Esto cubre la regla "los restaurantes que no lo usen siguen igual".
- **El servidor decide** qué está disponible y a qué precio. El navegador solo muestra lo que el servidor le dice. No se confía en la hora del celular.

### 2.2 Tablas nuevas (solo se agrega; no se borra nada)

```
menus_horario
  id, restaurant_id → restaurants, nombre, descripcion,
  estado ('activo'|'pausado'|'inactivo'), mostrar_en_qr bool,
  fecha_inicio date null, fecha_fin date null,
  prioridad int (desempate si dos menús coinciden), sort_order,
  created_by, created_at, updated_at

menu_horario_franjas
  id, menu_id → menus_horario ON DELETE CASCADE, restaurant_id,
  dias smallint[] (0=domingo … 6=sábado), hora_inicio time, hora_fin time
  -- hora_fin <= hora_inicio  ⇒ cruza la medianoche; el día que cuenta es el de inicio

menu_horario_productos
  menu_id → menus_horario ON DELETE CASCADE, dish_id → dishes, restaurant_id,
  precio_especial numeric null CHECK (>= 0),
  PRIMARY KEY (menu_id, dish_id)
  -- un mismo plato puede estar en varios menús: no se duplican productos

menu_horario_excepciones
  id, restaurant_id, tipo ('forzar'|'suspender'|'extender'|'dia_especial'),
  menu_id null, desde timestamptz, hasta timestamptz null (null = hasta volver a automático),
  franjas_especiales jsonb null (solo para 'dia_especial'), nota,
  created_by, created_at, cerrada_at, cerrada_by

menu_horario_auditoria
  id, restaurant_id, actor_id, accion, detalle jsonb, created_at
  -- se llena con un trigger: quién, cuándo y qué cambió (antes/después)
```

Columnas nuevas en tablas existentes (aditivas, con valor por defecto y sin reescribir filas):
- `dishes.todo_el_dia boolean NOT NULL DEFAULT false`: bebidas, postres, etc.
- `restaurant_config.menus_horario_activo boolean NOT NULL DEFAULT false`
- `restaurant_config.zona_horaria text NOT NULL DEFAULT 'America/Bogota'` (se valida contra `pg_timezone_names`). **La caja sigue con `hoy_local()`**: esta zona solo la usan los menús.
- `restaurant_config.menus_gracia_min int NOT NULL DEFAULT 10` (ver §3.3).

RLS en las 5 tablas: el admin gestiona lo de su `current_restaurant_id()` (más `is_super_admin()`); el personal (mesero, caja, cocina) solo lee. El público **no lee las tablas**: usa una función `SECURITY DEFINER` que devuelve únicamente lo necesario del restaurante pedido.

### 2.3 Funciones nuevas
- `_menus_vigentes(p_rid uuid, p_at timestamptz)` → menús que aplican en ese momento. Orden de evaluación: excepción `suspender` > `forzar` > `dia_especial` > franjas normales. Respeta días, fechas de inicio y fin, `estado` y la zona horaria del restaurante.
- `_menu_plato(p_rid, p_dish_id, p_at)` → `{permitido, precio_base, menu_id, menu_nombre}`. Si el plato está en varios menús vigentes, gana la `prioridad` más baja. Si no tiene `precio_especial`, usa el precio general.
- `menu_horario_estado(p_restaurant_id)` (pública, para QR y personal) → `{activo, menus:[{id,nombre,descripcion}], platos_visibles:[ids], precios:{dish_id: precio}, siguiente:{nombre, desde}, cambia_en, hora_servidor}`. Es una sola llamada por carga, sin consultas repetidas.
- Funciones del admin: `menu_horario_guardar`, `menu_horario_duplicar`, `menu_horario_cambiar_estado`, `menu_horario_forzar`, `menu_horario_extender`, `menu_horario_suspender` y `menu_horario_volver_automatico`. Todas validan `is_admin()` y escriben en la auditoría.

### 2.4 Cambio en el cálculo de dinero (la parte delicada)
- `_precio_plato` **conserva la misma firma** (así no se crea una sobrecarga duplicada). Por dentro, si el restaurante tiene el interruptor encendido:
  - consulta `_menu_plato` usando el momento del pedido, que se lee de `current_setting('app.menu_momento', true)` y, si no existe, de `now()`;
  - si el plato no está permitido y quien pide no es admin → `RAISE EXCEPTION '«X» no está disponible en este horario'`;
  - si está permitido → el precio base pasa a ser `precio_especial` (los toppings y las opciones se suman igual que hoy);
  - devuelve además `menu_nombre`.
- Con el interruptor apagado, el resultado es **idéntico al actual**.
- `crear_orden_completa`, `create_public_order`, `mesa_pedir_publico` y `wa_crear_pedido_bot`: se cambia una sola cosa, que es agregar `'menu', v_pp->>'menu_nombre'` a cada línea guardada. Así el pedido conserva el nombre del menú.
- `editar_items_pedido`: se reemplaza su copia del cálculo por `_precio_plato` (las líneas viejas siguen con su precio original).
- `mesa_pedido_aceptar`: antes de llamar a `crear_orden_completa`, fija `app.menu_momento = r.created_at`. Así el pedido se cobra con el menú y el precio de **cuando el cliente pidió**, no de cuando el mesero aceptó.
- **Precios por tamaño:** propongo que en la v1 el precio especial solo aplique a platos **sin tamaños**. En platos con tamaños, la pantalla no ofrece precio especial (se avisa). Ver decisión 3 en §7.

### 2.5 Cambio automático sin recargar la página
- El navegador llama a `menu_horario_estado`, recibe `cambia_en` (hora del servidor) y programa un temporizador para ese momento, ajustado por la diferencia entre el reloj del servidor y el del dispositivo. Así no depende de la hora del celular.
- También vuelve a consultar cuando: la pestaña vuelve a primer plano (los celulares duermen pestañas), llega un cambio realtime en las tablas de menús, o como respaldo cada 5 minutos.
- No se agregan librerías nuevas ni servicios pagos.

---

## 3. Riesgos y protecciones

| # | Riesgo | Protección |
|---|---|---|
| 3.1 | Romper el cobro de todos los restaurantes | Interruptor apagado por defecto. Con él apagado, `_precio_plato` sigue el mismo camino de hoy. Prueba de regresión: el mismo pedido da el mismo total antes y después. |
| 3.2 | Reescribir funciones a partir de una versión vieja del repo | Leer cada función viva en el proyecto de prueba antes de editarla y comparar. Respaldo previo a producción. |
| 3.3 | Cliente con carrito armado a las 10:59 que paga a las 11:01 | Gracia configurable (10 min por defecto): se acepta un plato que estuvo permitido hace ≤ N min, con el precio que tenía en ese momento. |
| 3.4 | QR aceptado por el mesero después del cambio de franja | Se fija `app.menu_momento` con la hora del pedido (§2.4). |
| 3.5 | Dos menús que se solapan | Se muestra la unión de sus platos. Si un precio choca, gana la prioridad. La pantalla avisa del solapamiento. |
| 3.6 | Activar el interruptor sin haber asignado platos → menú QR vacío | No se permite activarlo si en el momento actual quedarían 0 platos visibles. Aviso previo con la lista de platos que dejarían de verse. |
| 3.7 | Lugares secundarios (Resti, WhatsApp, voz) ofrecen platos fuera de horario | El servidor los rechaza igualmente. Se filtran en la Fase 4 o quedan en pendientes. |
| 3.8 | Rendimiento del QR | Una sola llamada a la función, índices por `restaurant_id` y `(menu_id, dish_id)`. Sin consultas por plato. |
| 3.9 | Producción (Cholaos Dany) | Nada en producción sin "apruebo, aplica" y copia previa. En producción el interruptor queda apagado hasta que Cristhian lo encienda. |

Ninguna migración borra datos. La reversa consiste en apagar el interruptor (al instante) y, si hiciera falta, ejecutar un script `rollback/` que restaura las versiones previas de las funciones y deja las tablas nuevas sin uso.

---

## 4. Archivos que se tocarían

**Migraciones nuevas** (`supabase/migrations/`):
1. `2026111712xxxx_menus_horario_tablas.sql`: tablas, columnas, RLS, índices y trigger de auditoría.
2. `2026111713xxxx_menus_horario_funciones.sql`: `_menus_vigentes`, `_menu_plato`, `menu_horario_estado` y las funciones del admin.
3. `2026111714xxxx_menus_horario_precio_pedidos.sql`: `_precio_plato` (misma firma) y las 6 funciones de pedidos. **Esta es la sensible.**
4. `supabase/rollback/…_menus_horario_down.sql`.

**Front nuevo:**
- `src/components/menu/horarios/MenusHorarioManager.tsx` (tarjetas, estado, acciones)
- `src/components/menu/horarios/MenuHorarioEditor.tsx` (nombre, productos, franjas, días, fechas, precios)
- `src/components/menu/horarios/ProgramacionSemanal.tsx` (vista de la semana)
- `src/components/menu/horarios/ControlManual.tsx` (forzar, extender, suspender, volver a automático, historial)
- `src/hooks/useMenuHorario.ts` (estado + temporizador + realtime)
- `src/lib/menuHorario.ts` (+ `.test.ts`: lógica de franjas, medianoche y días, espejo de la del servidor para la vista semanal)

**Front que se modifica (solo filtro y precio mostrado):**
- `src/pages/Dashboard.tsx`: nueva vista `menu_horarios` solo para admin
- `src/pages/PublicMenu.tsx`: filtro, precio, nombre del menú y aviso de "siguiente menú"
- `src/components/orders/OrderFlow.tsx`, `EditOrderModal.tsx`: filtro y precio mostrado (capa visual)
- `src/components/menu/MenuManager.tsx`: casilla "Disponible todo el día" en el plato
- `src/types/index.ts`: `todo_el_dia?` en `Dish`
- Fase 4: `ClientMenuSection.tsx`, `restiMenu.ts`, `voiceCommandsApi.ts` y el bot de WhatsApp

**No se tocan:** `CashierPanel.tsx` (cobra lo que el pedido ya tiene guardado), `SplitPayModal`, `KitchenBoard.tsx`, recetas, inventario y corte de caja.

---

## 5. Plan de pruebas (Fase 5)
- **Lógica pura** (`src/lib/menuHorario.test.ts`): cambio de desayuno a almuerzo y de almuerzo a brunch, días distintos, cruce de medianoche (el domingo 23:00 → lunes 02:00 cuenta como domingo), fechas de inicio y fin, prioridad y diferencia de zona horaria.
- **SQL en el proyecto de prueba**, llamando a `_menus_vigentes` / `_menu_plato` con `p_at` fijo: los 14 casos pedidos, más:
  - el mismo pedido con el interruptor apagado da un total idéntico al de hoy (regresión de dinero);
  - un QR pedido a las 10:55 y aceptado a las 11:05 conserva el precio de desayuno;
  - un admin de la sede A no ve ni edita menús de la sede B; anon no lee las tablas.
- **Navegador** (Playwright, celular y escritorio): el QR cambia solo al cruzar la franja (con hora del servidor simulada) y aparece el aviso del siguiente menú.

---

## 6. Entrega propuesta en dos partes

**Parte A (núcleo):** tablas, interruptor, menús con franjas, días y fechas, productos y precio especial, todo el día, QR automático, filtro para el mesero, cálculo en el servidor, nombre del menú en el pedido, duplicar menú, activar/pausar, auditoría y vista semanal de solo lectura.

**Parte B (control fino):** forzar, extender y suspender menús, días especiales y festivos, volver a automático con historial visible, copiar menús entre sedes (los platos de cada sede tienen IDs distintos, así que hay que emparejarlos por nombre, lo cual es delicado), y filtro en Resti, voz y WhatsApp.

---

## 7. Decisiones que necesito de Cristhian
1. ¿Autoriza tocar las funciones de precio del servidor (§2.4), sabiendo que es el camino del dinero?
2. ¿Cuál es el proyecto Supabase de prueba, o dónde está el simulador `qa-mock`?
3. Precio especial en platos con tamaños: ¿basta en la v1 con "solo platos sin tamaños"?
4. ¿Hay restaurantes fuera de Colombia? Si no los hay, la zona horaria por restaurante se deja preparada pero oculta.
5. ¿Parte A primero y después Parte B?
