# Bloque 8: Vendedores, comisiones y pagos (Fase 2 del panel)

Estado: construido y probado en el proyecto de prueba. **No está en producción.**

## Qué hace
- **Vendedores y aliados:** alta con contrato firmado adjunto (PDF o foto en bucket privado), versión, fecha de firma y vigencia; sin contrato no se crea ni se activa el código. Condiciones propias del contrato (bono, % recurrente, meses) o las generales. Código inmutable cuando ya trajo clientes. Activar/desactivar con motivo y causa (término normal: se conserva lo ganado; incumplimiento: se congela lo no pagado). Enlace de referido copiable (`/registro?v=CODIGO`). Prospectos por vendedor (gana el primer registro, vencen a los 60 días).
- **Condiciones generales** editables con motivo (bono, % recurrente, meses, % aliado, ventana de devolución, IVA, día de pago).
- **Cálculo de comisiones** (solo el servidor, sobre el precio sin IVA): bono 1 y bono 2 (mitad del precio base en cada uno de los dos primeros pagos) y recurrente 10% durante 12 meses desde el primer pago. Aliado: solo recurrente. No genera por pagos de monto cero ni rechazados. Repetir el cálculo no duplica. Cada restaurante conserva las condiciones del contrato con que quedó atribuido.
- **Devoluciones:** dentro de 30 días crean un ajuste negativo (una sola vez); fuera de la ventana se rechazan. Si el saldo del mes queda en cero o negativo, no se crea liquidación y se arrastra.
- **Pagos a vendedores:** cuánto se le debe a cada uno; preparar el mes; revisar líneas (quitar una con motivo); retención en la fuente (la fija tu contador, no se calcula); cuenta de cobro cargada (número + archivo); aprobar (exige cuenta de cobro); registrar el pago (medio, referencia, comprobante); número consecutivo `LIQ-AAAA-NNNN`; recibo en PDF (se guarda una sola vez); mensaje copiable para WhatsApp. Una liquidación pagada no se edita ni se paga dos veces.
- **Dinero:** ingreso mensual recurrente, pagos del mes sin IVA y el IVA, pruebas por convertir, cancelaciones, comisiones y liquidaciones por pagar, y barras de 6 meses.
- **Rendimiento (solo para ti):** ranking por comisión del periodo, acumulada, clientes activos, cerrados o prospectos; embudo por vendedor, retención al mes 3, gráficas de clientes nuevos y comisiones por mes, y Excel. Cada consulta queda en el registro de cambios. Sin metas, sin horas, sin asistencia.
- **Inicio:** nuevos avisos de liquidaciones por pagar (y vencidas) y contratos por vencer en 30 días.

## Seguridad
- Todas las tablas nuevas sin permisos directos; todo por funciones que exigen dueño + 2 pasos. Los buckets `contratos-vendedores` y `comprobantes-vendedores` son privados y solo los lee y sube el dueño con 2 pasos.
- Los datos de pago de los vendedores nunca se copian al registro de cambios.
- Pruebas (`supabase/tests/vendedores_comisiones.sql`): FALLAS=0. Más la prueba de Dinero, Rendimiento y avisos (FALLAS=0).
- No hay acceso de vendedores a la app: nunca ven datos de restaurantes.

## Decisiones tomadas
- El bono se calcula como la mitad del precio base de cada uno de los dos primeros pagos (equivale a "un mes del plan repartido en dos") para no depender de la lista de precios del Bloque 6.
- `payments` gana columnas `base_cop`, `iva_cop`, `total_cop` (las llenará el Bloque 6). Mientras tanto la base es total / (1 + IVA).
- Las pantallas de Vendedores, Pagos, Dinero y Rendimiento están dentro del panel de plataforma.

## Para pasar a producción (necesita backup reciente y tu confirmación)
Migraciones en orden: `20261020020000_vendedores_comisiones_tablas` (agrega columnas opcionales a `vendedores`, `restaurant_crm` y `payments`, más tablas y 2 buckets), `20261020020100_vendedores_funciones`, `20261020020200_comisiones_liquidaciones`, `20261020020300_dinero_rendimiento` (reemplaza `plataforma_atencion`, misma firma). Luego el código.
Reversas: `supabase/rollback/<versión>_*_down.sql`.
No correr la parte de pago de la prueba en producción: la numeración LIQ no se revierte.

## Pendiente fuera del código
- Contador: retención en la fuente y cómo documentar el pago (cuenta de cobro o factura).
- Abogado: texto del contrato de comisión o agencia comercial y efectos de desactivar un código.
- Wompi: preguntar por pagos a terceros (fase futura).
- RUT con responsabilidad de IVA y factura electrónica antes del primer cobro real (Bloque 6).
