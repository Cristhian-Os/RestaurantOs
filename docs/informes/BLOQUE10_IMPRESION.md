# Bloque 10: impresión de comandas, pre-cuenta, recibo y cierre de caja (informe)

Estado: **construido y probado en el proyecto de prueba y en el simulador. Nada en producción.** Commits locales 53976b7, 03c68ec, ef3bf22, 28751f1, 827da91 y 3f9576e.

## Qué cambia para el restaurante

Todo se imprime con **la impresora que el equipo ya tenga instalada** (térmica de 58 u 80 mm, o una normal) usando el diálogo de impresión del navegador. Siempre hay plan B sin impresora: **guardar PDF** o **enviar por WhatsApp**.

1. **Pantalla "Impresión" (administrador).** Lista de impresoras (nombre, ancho 58/80 mm, copias, qué categorías imprime: por ejemplo "Barra" = bebidas y "Cocina" = todo lo demás), cuándo imprimir (comanda automática sí/no, recibo al cobrar: preguntar / siempre / nunca), ancho del recibo, propina sugerida en la pre-cuenta, mensaje y pie del recibo, y página de prueba con tildes y ñ para revisar la impresora.
2. **Comandas** (sin precios).
   - Botón **🖨 COMANDA** en cada tarjeta del tablero de cocina: reimprime el pedido marcado **REIMPRESIÓN**.
   - **Estación de impresión** (marcas un equipo, por ejemplo el de cocina o caja): imprime solo cada pedido nuevo, las **ADICIONES** cuando se agregan platos y un **ANULADO** si el pedido se cancela después de haber salido a cocina.
   - Un pedido con bebidas y comidas sale en **dos comandas** (una por impresora). Si dos equipos están como estación, **solo uno imprime** cada comanda (cada una se reserva con una clave única).
   - Al encender la estación **no reimprime** los pedidos que ya estaban en el tablero.
3. **Pre-cuenta** (botón en la tarjeta del pedido sin pagar): detalle, subtotal, propina sugerida opcional y "Esta no es su factura".
4. **Recibo** (botón en la tarjeta del pedido pagado, en el historial de ventas y, según la configuración, al terminar el cobro). Lleva **número consecutivo del restaurante** (000001, 000002…), los pagos (incluye cuentas divididas o mixtas), el cambio y el pie "Recibo de pago, no es factura electrónica".
5. **Cierre de caja impreso**, con las mismas cifras de la pantalla del corte y, si hiciste el conteo, el **contado, la diferencia y si sobra o falta**.
6. Si imprimir falla, el cobro o el pedido **nunca se bloquean**: sale el aviso "No se pudo imprimir" con **Reintentar**, y siempre quedan PDF y WhatsApp.

## Base de datos (migración `20261021180000_impresion`, reversa en `supabase/rollback/`)

Solo agrega, no cambia nada existente. **No toca `cobrar_orden` ni `crear_orden_completa`** (las funciones más delicadas): el número de recibo se asigna al imprimir el recibo.

- `orders.receipt_number` con índice único por restaurante; tabla `receipt_counters`.
- `numero_recibo_orden(uuid)`: solo administrador o cajero, exige que el pedido esté pagado, y es idempotente (reimprimir da el mismo número).
- `datos_recibo()`: encabezado fiscal para el recibo.
- `restaurant_printing`: configuración (el personal lee, el administrador escribe).
- `print_jobs`: registro de impresiones con clave única; se borran solas a los 30 días (pg_cron).

## Pruebas hechas

- **Base de prueba (revertidas solas):** consecutivo 1 a 25 sin saltos; idempotente; pedido sin pagar bloqueado; otro restaurante, cocina y anónimo bloqueados; clave única de impresión; aislamiento entre restaurantes; y **concurrencia real con dos sesiones en paralelo: 60 números distintos de 1 a 60, sin repetir**.
- **Pruebas de código** (`node src/lib/print/*.test.ts`): ancho de 58 mm (32 columnas) y 80 mm (48), tildes, textos largos, PDF, WhatsApp, reparto por impresora, qué comandas faltan, y cifras del recibo y del cierre contra el pedido y el corte.
- **Simulador:** recibo con número y pagos, cierre idéntico a la pantalla del corte ($47.000 ventas, $8.000 gastos, $39.000 neto), comanda nueva, ADICIÓN dividida entre Barra y Cocina, ANULADO, ninguna comanda repetida y reimpresión manual.

## Lo que NO está probado

- **Ninguna impresora real** (ni 58 ni 80 mm): se probó la vista y el diálogo del navegador, no el papel. Falta confirmar márgenes y que no se corte el texto en tus impresoras.
- Para que la estación imprima **sin que salga el diálogo cada vez**, el navegador de ese equipo debe abrirse en modo impresión silenciosa (Chrome con `--kiosk-printing`) y tener la impresora como predeterminada. Sin eso funciona, pero pide confirmar cada comanda.
- Impresión rápida directa a la térmica por USB/Bluetooth (ESC/POS): **pospuesta** hasta tener una impresora real. Impresión por red: fuera.
- Las copias de una comanda (más de 1) abren el diálogo una vez por copia.
- La pre-cuenta solo está en las tarjetas "listas" de Caja; los pedidos aún por cobrar antes de cocina no la muestran.

## Para pasar a producción (con tu "apruebo, aplica")

1. **Respaldo reciente** (el del 19-oct sirve: la migración solo agrega).
2. Aplicar la migración `20261021180000_impresion` (renombrándola a la versión real que asigne Supabase).
3. Publicar la app (despliegue manual en Vercel).
4. Prueba en producción sin tocar Cholaos Dany: restaurante Demo, un cobro, un recibo y una página de prueba.

## Decisiones tomadas por defecto

- Número de recibo al imprimir el recibo (no al cobrar), para no tocar las funciones de pago.
- Primero impresión por navegador + PDF + WhatsApp; ESC/POS cuando haya impresora.
- El recibo dice expresamente que **no es factura electrónica**.
