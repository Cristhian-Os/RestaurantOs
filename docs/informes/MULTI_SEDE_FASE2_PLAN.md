# Multi-sede, fase 2 — plan

Fecha: 2026-11-20. Rama: `feature/multi-sede-panel`. Nada de esto toca producción hasta el "apruebo, aplica" de Cristhian.

## De dónde partimos (leído hoy de producción, solo lectura)
- La multi-sede (fase 1: cuentas, `crear_sede`, `cambiar_sede`, `mis_sedes`, tope por plan) está aplicada en producción desde el 22-oct.
- Ningún restaurante tiene una segunda sede todavía. Cholaos es Premium activo, así que ya puede crear una.
- Premium sigue "no disponible" para la venta. El cobro de la sede 3 en adelante solo se registra; no está conectado a Wompi.
- Una sede nueva empieza vacía: no hay forma de copiar la carta (solo los menús por horario).

## Decisiones de Cristhian (20-nov)
- Copiar la carta completa de otra sede de forma sencilla.
- Inventario: al copiar se llevan ingredientes, recetas y proveedores, con el stock en 0. Cada sede cuenta lo suyo.
- Panel para el dueño con varias sedes: ventas juntas y por sede, pedidos en curso, inventario bajo y último corte de caja de cada sede.
- Traslados de ingredientes entre sedes desde ya.

Nombre: el panel se llama **"Mis sedes"**, no "superadministrador", para no confundirlo con el panel de plataforma de Cristhian.

## Fases (cada una se aprueba antes de la siguiente)

### Fase A — Copiar carta
Estado 20-nov: **hecha y probada en el proyecto de prueba** (migración `20261120140000_copiar_carta_de_sede`, prueba `tests/copiar_carta_de_sede.sql`, botón `CopiarCartaSede`). Falta producción (fase D).
- Lo copiado es independiente: editar, ocultar o borrar en una sede no toca la otra (probado).
- Las fotos se duplican desde la app; si alguna falla, el plato sigue mostrando la foto de la otra sede y se avisa.
- No se copian: mesas, stock, agotados del día, menús por horario (tienen su propio botón).
- Función del servidor `copiar_carta_de_sede(origen)`: copia a la sede actual platos (categoría, orden, tamaños, opciones, toppings, foto), listas de opciones, proveedores, ingredientes (stock 0, con sustituto y proveedor reconectados) y recetas (reconectadas a los platos e ingredientes nuevos).
- Solo el dueño de la cuenta, solo entre sedes de su cuenta, todo o nada.
- Solo a una sede con la carta vacía, para no duplicar platos. Después el dueño borra lo que sobre.
- Botón "Copiar carta de otra sede" en el menú, visible solo con 2 sedes o más.
- Prueba que se revierte sola: copia correcta, otra cuenta no puede copiar, sede con carta no acepta copia.

### Fase B — Panel "Mis sedes"
Estado 20-nov: **hecha y probada en el proyecto de prueba** (migración `20261120150000_resumen_sedes`, prueba `tests/resumen_sedes.sql`, pantalla `src/components/sedes/MisSedes.tsx`, entrada "Mis sedes" en el panel Más). Falta producción (fase D) y revisión visual en celular.
- Los números coinciden con el corte mensual de cada sede (la prueba lo compara con `get_corte_mensual()`).
- Solo el dueño de una cuenta con 2 sedes o más la ve; un administrador de una sola sede no.
- Stock bajo cuenta `stock_actual <= stock_minimo` como el inventario: una sede recién copiada (stock 0) saldrá con todo en bajo hasta que registre su inventario.
- Función del servidor `resumen_sedes()`: por sede y en total, ventas de hoy y del mes, pedidos en curso, ingredientes bajo el mínimo y último corte.
- Las ventas usan las mismas reglas del corte de caja (Rappi fuera, propinas aparte, "hoy" con `hoy_local()`), para que los números coincidan con lo que ve cada sede.
- Pantalla con selector "Todas / Sede 1 / Sede 2", celular primero, claro y oscuro, según la guía de diseño.

### Fase C — Traslados entre sedes
- Tabla de traslados con historial (quién, cuándo, de dónde, a dónde, ingrediente, cantidad).
- Función `trasladar_ingrediente`: resta en origen y suma en destino en un solo paso; no deja stock negativo; el ingrediente se empareja por nombre y unidad, y si no existe en destino se crea con stock 0.
- Riesgo: el stock alimenta el descuento automático al vender. Un error aquí deja mal el inventario de dos sedes a la vez. Por eso va de último y con pruebas propias.

### Fase D — Activación en Cholaos (producción)
- Copia de seguridad, "apruebo, aplica", migraciones en orden, pruebas que se revierten solas.
- Angela crea su segunda sede, copia la carta y borra lo que no aplica.
- Prueba de aislamiento real: un pedido en una sede no aparece en la otra.

### Después (fuera de este plan)
- Conectar el cobro de la sede extra a Wompi.
- Poner Premium a la venta después de dos semanas sin fallos en Cholaos.

## Pendientes descubiertos
- Las fotos copiadas apuntan al mismo archivo. Si una sede borra la foto, la otra la pierde. Revisar en la fase A.


## Estado fase C (traslados de ingredientes)
- Hecha en el proyecto de PRUEBA: migración `20261120160000_traslados_ingredientes.sql` (tabla de historial + `trasladar_ingrediente`), reversa y prueba `supabase/tests/traslados_ingredientes.sql` (T1 a T9 pasan).
- Pantalla: botón "Pasar a otra sede" en cada ingrediente y botón "Traslados" (historial) en Inventario → Ingredientes. Solo aparecen si la cuenta tiene otra sede.
- Pendiente: producción (copia previa + "apruebo, aplica") y revisión visual en el celular.
- Nota: al llegar a una sede, el costo del ingrediente existente no se promedia; solo se suma la cantidad.


## Estado fase D (producción, 2026-11-20)
- Con "apruebo, aplica" de Cristhian: aplicadas en producción `copiar_carta_de_sede`, `resumen_sedes` y `trasladar_ingrediente` (tabla `traslados_ingredientes`). Solo agregan; no tocaron datos. Verificado: `anon` y PUBLIC no pueden ejecutarlas, RLS activo en el historial.
- Premium habilitado (`planes.disponible = true`) con el precio y condiciones ya establecidos: 325.000 / sede extra 65.000. Reversa: `supabase/rollback/20261120170000_premium_disponible_down.sql` (deja `disponible = false`).
- Pendiente: revisión visual en celular; prueba real de aislamiento con la 2.ª sede de Angela; cobro automático de sede extra por Wompi.

- 2026-11-20: añadidos en producción (con "apruebo, aplica"): botón "Agregar sede" en Mis sedes y selector "Ver otro mes" (`resumen_sedes(p_mes date)`, sin límite hacia atrás; reversa `20261120180000_resumen_sedes_por_mes_down.sql`, prueba `tests/resumen_sedes_mes.sql`).
