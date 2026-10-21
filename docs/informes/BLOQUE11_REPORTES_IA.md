# Bloque 11: reportes con inteligencia artificial real (informe, pasos 1 a 5)

Estado: **en producción desde el 21-oct** (4 migraciones 20261021193600 a 20261021193732, función `ai-report` y app publicada, commit 9d18349). **La IA está encendida SOLO en Demo RestaurantOS; en los demás (incluido Cholaos) sigue apagada.** Lo verificado en producción: tablas con seguridad, funciones cerradas, reporte_datos y análisis corren con datos reales de Demo, y la función responde 401 sin sesión. Falta la primera llamada real a Gemini desde Demo. Pasos 6 a 8 (programación, pregunta libre, día flojo/promociones) sin empezar.

## Cómo queda (decisiones que pediste)

- **Solo dos reportes con IA:** el **semanal** (la semana pasada, lunes a domingo) y el **mensual** (el mes pasado). No hay reportes diarios. Quedan fuera del plan los reportes de "día flojo", alerta de inventario y promociones.
- **Antifraude:** no es un reporte. Es una revisión con reglas fijas (sin IA y sin costo) que solo debe avisar cuando encuentra algo. Hoy la pantalla "Para revisar" la muestra; **el aviso automático diario por notificación está pendiente (paso 6)**.
- **Tú ves cuánto consume cada restaurante:** pestaña **"Uso de IA"** del panel de plataforma (con el código de 2 pasos): gasto del mes, tope global, aviso desde el 80%, y por restaurante: llamadas, tokens, costo estimado y último uso, con el botón para **encender o apagar la IA** (pide un motivo y queda en el registro).

## Qué hace cada paso

1. **Cálculos base (en el servidor, sin suposiciones).** La matriz de rentabilidad ya no marca 100% de margen: un plato **sin receta no tiene margen** y se dice así. El costo de ingredientes se calcula en **una sola consulta** y sin "margen anterior" inventado. La predicción de demanda ya no inventa "Ingrediente A/B": con menos de 4 semanas de ventas dice **"faltan datos"**. Los umbrales del antifraude los ajusta el dueño en pantalla.
2. **`reporte_datos(desde, hasta)`**: todas las cifras de un reporte, calculadas por la base: ventas, pedidos, ticket promedio, por día, franja, método y canal, comparación con el periodo anterior y con las 4 semanas equivalentes, platos que más y menos se venden con su margen, platos sin receta, costo de insumos, gastos, insumos bajo mínimo, cierres de caja con diferencia, anulaciones y calidad del dato. **No trae nombres de personas.**
3. **Base de la IA:** historial de reportes (`ai_reports`), registro de consumo (`ai_usage`), interruptor por restaurante (apagado por defecto), tope global mensual (20 dólares por defecto, editable) y la capa **`callModel()`**: hoy Gemini, y con solo cambiar la configuración sirve cualquier proveedor tipo OpenAI (DeepSeek, Qwen, GLM, Kimi). Un reporte por restaurante y periodo: pedirlo otra vez devuelve el mismo, sin costo.
4. **Edge Function `ai-report`**: pide las cifras con la sesión de quien llama (la base exige ser administrador de ese restaurante), el servidor decide el periodo, la IA devuelve un JSON con "qué pasó" (cada hallazgo con su cifra y de qué dato sale) y "qué podrías hacer" (sugerencias marcadas Seguro / Probable / Suposición). **El servidor revisa cada cifra del texto contra los datos**: si hay una inventada, reintenta una vez; si falla otra vez, muestra solo las cifras sin redacción. Antes de enviar, quita cualquier campo de persona y rechaza correos.
5. **Pantalla** "Resumen con IA" arriba del Asistente de Negocio: botones de semana y mes, cada hallazgo con su cifra y fuente, **"Me sirvió / No me sirvió"**, lo que no se pudo analizar por falta de datos, "Ver detalle" con las cifras que lo respaldan, historial y el aviso permanente "Generado con IA a partir de tus cifras. Revísalo antes de decidir."

## Pruebas hechas

- **Base de prueba (revertidas solas), con datos calculados a mano:** margen, cuadrantes, platos sin receta, exclusión de Rappi y platos cancelados, food cost, alertas, demanda con y sin historial, y **toda una semana de reporte: cada cifra coincide** (ventas 118.000, ticket 39.333, +100% frente a la semana anterior, franjas, platos, gastos, caja con diferencia de -10.000, etc.). Un restaurante con mucho movimiento no se mezcla con otro. Cajero y anónimo quedan bloqueados; el administrador no puede encender la IA, ver el consumo ni llamar el control de cupo.
- **Cupo y topes:** IA apagada → no genera; mismo periodo → devuelve el existente; tope global agotado → no genera. Sin código de 2 pasos no se ve el consumo. Las opiniones "Me sirvió" solo valen sobre reportes del propio restaurante.
- **Código (`node supabase/functions/ai-report/ai-report.test.ts`):** cifras en formato colombiano; una cifra falsa se rechaza, reintenta y, si vuelve a fallar, queda sin redacción; **ningún nombre, teléfono ni correo llega a la IA**; Gemini y el proveedor compatible arman bien la petición y cuentan tokens y costo; periodo completo en hora de Colombia (incluye lunes de madrugada y cruce de año).
- **Simulador:** el Asistente de Negocio con todo lo nuevo, el resumen con sus cifras y botones, y la pestaña "Uso de IA".

## Lo que NO está probado

- **Ninguna llamada real a Gemini:** el proyecto de prueba no tiene clave y no se copia la de producción. Se probó con un modelo simulado. La primera prueba real será en un restaurante de prueba al pasar a producción, midiendo tokens y costo real.
- **Los precios por millón de tokens (0,30 y 2,50 dólares) son una suposición** para estimar el costo: hay que verificarlos con el proveedor y ajustarlos en Condiciones generales.
- **Comparación con una semana real de Cholaos Dany** (la parada del bloque): pendiente, depende de ti.
- Cholaos casi no tiene recetas (6 filas para 89 platos): su reporte dirá que el margen no se puede calcular hasta que las cargue.
- No se mide el consumo del chat de soporte ni de la voz (solo los reportes).
- Aviso de privacidad y revisión con abogado (Ley 1581): pendientes antes de encender la IA para clientes reales.

## Límite del antifraude

Hoy la base no guarda **quién anula ni a qué hora**, solo el estado del pedido y quién lo tomó. Por eso la regla por persona mide "a quién se le anularon pedidos que tomó". Si quieres medir de verdad a quien anula, hay que registrarlo en cada anulación (cambio pequeño en `cancelar_orden`, que se haría con cuidado).

## Para pasar a producción (con tu "apruebo, aplica")

1. **Respaldo reciente** (todo es aditivo).
2. Migraciones: `20261022100000_analisis_base`, `20261022110000_reporte_datos`, `20261022120000_ai_reports`, `20261022130000_ai_report_feedback` (cada una con su reversa en `supabase/rollback/`).
3. Desplegar la Edge Function `ai-report` y publicar la app.
4. Prueba controlada: encender la IA solo en Demo, generar un resumen, revisar tokens y costo en "Uso de IA", y volver a apagarla si no se va a usar.
