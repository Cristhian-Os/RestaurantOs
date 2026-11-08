# Informe de seguridad · Fidelización, WhatsApp, Domicilios, Mesas QR y Campañas

Fecha: 2026-11-08 · Método: skill `security-check` (6 fases), solo lectura sobre producción.
Todo lo probado se probó en el proyecto de PRUEBA (`restaurantos-prueba`), con datos temporales dentro de bloques que se deshacen solos. No se tocó producción. No se hizo commit.

## Veredicto en una línea

Hay **1 problema crítico** (cualquiera en internet podía marcar un pedido como pagado y, de paso, regalar puntos); ya está **arreglado y probado en la base de prueba**, falta aplicarlo en producción con tu "apruebo, aplica". Lo nuevo (fidelización, WhatsApp, mesas QR, domicilios) está bien construido: cero fugas entre restaurantes, cero acceso anónimo a clientes, teléfonos o pedidos pendientes. El resto son puntos medios para decidir.

Conteo: 🔴 1 · 🟡 12 · 🟢 (lo que está bien) 14.
**Ronda 2:** M1, M2, M6, M7 y M8 (puntos 1-2) quedaron arreglados y probados en la base de prueba con `20261108190000_seguridad_fidelizacion_2.sql`. Ambas migraciones (180000 y 190000) esperan tu "apruebo, aplica" para producción. Decisiones pendientes: tope de IA por restaurante (M5), aviso de privacidad en el bot y borrado de clientes (M8).

---

## 🔴 Crítico

### C1. `mark_order_paid` la puede ejecutar cualquiera (marca pedidos como pagados sin pagar)
- **Qué es:** una función vieja de la base (viene de `00000000000001_baseline_functions_snapshot.sql:1219`) que marca un pedido como "pagado con tarjeta". No revisa quién la llama y tenía permiso para el público anónimo.
- **Por qué importa:** quien conozca el código interno (id) de un pedido —por ejemplo el comensal con el suyo, o el cliente de un domicilio— lo marca como pagado sin pagar. En caja aparece "pagado". Además, el disparador nuevo de fidelización le **regala los puntos** de esa compra (probado: pedido de $50.000 → 50 puntos regalados). También se salta la confirmación de transferencia de los domicilios.
- **Dónde:** función `public.mark_order_paid(uuid, text, text)`. Solo la usa la función `wompi-webhook`, que entra con la llave de servicio (`supabase/functions/wompi-webhook/index.ts:109`), así que quitarle el permiso al público no rompe nada.
- **Cómo se arregla:** `supabase/migrations/20261108180000_seguridad_fidelizacion_whatsapp.sql` (2 líneas: quita el permiso a público/anónimos/logueados y lo deja solo para el servicio).
- **Estado:** ✅ Aplicado en la base de PRUEBA. Re-probado: anónimo y cajero reciben "permission denied"; el servicio sí puede (el cobro online sigue funcionando). ⏳ **Falta aplicar en producción** (la función existe en el esquema base, así que producción casi seguro tiene el mismo hueco; no lo pude verificar porque no se toca producción).

---

## 🟡 Importante (decidir / arreglar esta semana)

### M1. El cajero puede leer el teléfono COMPLETO de las conversaciones de WhatsApp (salta tu regla de privacidad)
- **Qué:** la regla es "cajero y mesero solo ven nombre, nivel, puntos y últimos 4 dígitos". Las funciones respetan eso (`fid_buscar_cliente`, `wa_conversaciones_lista` devuelven `******4567`). Pero la tabla `wa_conversaciones` tiene una política que deja al cajero leerla directo, y ahí está el teléfono entero (probado: el cajero obtuvo `573001234567`).
- **Dónde:** política "wa_conversaciones: admin y cajero leen" (`20261107120500_whatsapp_bot.sql`). La pantalla no usa esa lectura directa (solo funciones), así que se puede cerrar sin romper nada.
- **Arreglo:** cambiar esa política a solo administrador (1 línea, nueva migración).
- **Relacionado, decisión tuya:** `domicilios` también lo leen cajero y mesero directo, con `contacto_telefono` completo, `seguimiento_token` y código de entrega. La pantalla de Domicilios usa el teléfono del cliente (para llamarlo). Si quieres tapar ese también hay que cambiar la pantalla.
- **Estado:** ✅ Arreglado en la base de PRUEBA (migración `20261108190000_seguridad_fidelizacion_2.sql`): la política de `wa_conversaciones` ahora es solo administrador. Re-probado: el cajero lee 0 filas directo, la pantalla Conversaciones (función `wa_conversaciones_lista`) le sigue funcionando y le muestra `******2233`; el admin ve el teléfono completo. ⏳ Falta producción. **Decisión pendiente:** el teléfono completo en `domicilios` (cajero/mesero) sigue igual porque la pantalla lo usa para llamar.

### M2. El cajero puede confirmar una transferencia SIN comprobante
- **Qué:** el mismo cajero crea el domicilio, y `dom_confirmar_pago` acepta confirmar aunque nunca se haya subido ningún comprobante (probado: confirmó con `comprobante_path` vacío; el pedido pasó a pagado y a cocina). No hay segunda persona que valide.
- **Por qué importa:** un cajero deshonesto puede marcar "pagó por transferencia" un pedido que no pagó. Queda anotado (quién y cuándo), pero no se evita.
- **Dónde:** `dom_confirmar_pago` en `20261107120400_domicilios_pago_codigos.sql:118`.
- **Opciones:** (a) exigir comprobante adjunto para confirmar; (b) que lo confirme solo el admin cuando pasa de cierto monto; (c) dejarlo así y revisar el reporte. Decisión tuya.
- **Bien hecho:** confirmar dos veces da error (no cobra doble); un cajero de otro restaurante no puede tocarlo; el mesero no puede confirmar pagos.
- **Estado:** ✅ Arreglado en PRUEBA (opción a): `dom_confirmar_pago` exige comprobante adjunto ("Falta el comprobante...") y un disparador en `domicilios` impide dejar una transferencia en "confirmado" sin comprobante por cualquier otro camino. Re-probado: sin comprobante bloqueado (función y disparador); con comprobante confirma, el pedido queda pagado con 1 solo pago. ⏳ Falta producción.

### M3. Cualquiera puede llenar la bandeja de pedidos por QR en mesas libres
- **Qué:** en una mesa libre no se pide código; el comensal anónimo manda el pedido y el mesero lo acepta o rechaza. Límites que sí funcionan (probados): 5 por mesa, 2 por celular, 1 cada 10 segundos, 40 por restaurante. Pero un anónimo con varios "celulares" (ids falsos) puede ocupar los 5 cupos de cada mesa libre y bloquear a los clientes reales por 30 minutos.
- **Dónde:** `mesa_pedir_publico`, `20261108130000_mesas_qr_pedidos.sql:178`.
- **Arreglo posible:** aviso en pantalla del mesero con "rechazar todo de esta mesa"; o limitar por dirección de internet desde una función de servidor (la base sola no ve la IP). Riesgo real: bajo-medio (molestia, no pérdida de dinero: nada entra a cocina sin aprobación).

### M4. Código de mesa de 4 dígitos: seguro contra fuerza bruta, pero bloqueable por malicia
- **Probado:** 5 intentos malos → mesa bloqueada 5 minutos; con la mesa bloqueada ni el código correcto sirve. Adivinar 4 dígitos a 5 intentos cada 5 minutos da ~0,6 % de acierto por hora. Aceptable.
- **Pero:** quien lo hace a propósito puede mantener bloqueada la mesa y un comensal nuevo no puede entrar (los celulares ya autorizados sí). Y el código usa `random()` normal (no criptográfico); para 4 dígitos con bloqueo no es problema práctico.
- **Arreglo opcional:** que el mesero pueda "autorizar" un celular desde su pantalla (ya aprueba pedidos, ahí se autoriza el celular).

### M5. El tope de gasto de IA es COMPARTIDO entre todos los restaurantes, y las notas de voz no tienen tope propio
- **Qué:** `wa_bot_cupo` suma el gasto de IA de TODA la plataforma contra un tope mensual global (20 USD por defecto). Un restaurante con mucho tráfico (o un abusador con muchos números) puede dejar a todos los demás sin bot. Además tiene tope diario por restaurante (200 respuestas), pero una persona puede llenar esas 200 con mensajes basura.
- **Notas de voz:** el límite de 20 mensajes cada 10 minutos por teléfono se aplica después de descargar y transcribir el audio (Gemini). Alguien puede mandar muchos audios y gastar transcripción sin freno (costo bajo por audio, pero sin techo).
- **Dónde:** `wa_bot_cupo` (`20261108120000_whatsapp_bot_cerebro.sql`), `supabase/functions/_shared/whatsapp_nucleo.ts:conCerebro`.
- **Arreglo:** tope por restaurante además del global; contar el audio en el límite por teléfono antes de transcribir.
- **Estado:** 🕓 **Decisión pendiente** (no se construyó; Cristhian pidió dejarlo para después).

### M6. El bot puede crear pedidos "contra entrega" falsos sin límite por teléfono
- **Qué:** un teléfono cualquiera pide por WhatsApp, confirma con "sí" y se crea el pedido (precios y total siempre del servidor, bien). No hay límite de pedidos abiertos por número; contra entrega pasa directo a cocina y el máximo por pedido es $1.500.000.
- **Dónde:** `wa_crear_pedido_bot` (`20261108120000_whatsapp_bot_cerebro.sql`).
- **Arreglo:** máximo 1-2 pedidos abiertos por teléfono y/o exigir pago anticipado a números nuevos (la migración `...170000_domicilio_contra_entrega_pago_previo` ya apunta en esa dirección; revisar si cubre esto).
- **Estado:** ✅ Arreglado en PRUEBA: máximo 2 pedidos del bot abiertos (sin pagar ni entregar, últimas 24 h) por teléfono y 30 por restaurante por hora (cambiables en `platform_settings`: `wa_bot_pedidos_abiertos_max`, `wa_bot_pedidos_hora_max`). Al pasarse, la base responde `LIMITE_PEDIDOS: ...` y el cerebro del bot (`bot_cerebro.ts`, cambio mínimo) pasa la conversación a una persona (motivo `limite_pedidos`). Re-probado: 3er pedido bloqueado, repetir el mismo pedido sigue devolviendo el anterior, tope por hora bloqueado; tests del cerebro pasan. ⏳ Falta producción **y volver a publicar la función `whatsapp-webhook`** (usa el cerebro).

### M7. El saldo de puntos puede quedar negativo
- **Probado:** cliente gana 30 puntos, canjea 2 premios (24 puntos), luego se anula el pago de la compra → saldo **-24**. No existe un "no menos de cero" en `fid_cuentas`. El corte mensual también podría dejar negativo si coincide con un canje (muy poco probable).
- **Bien hecho:** volver a pagar el mismo pedido NO duplica puntos (probado con 2 ciclos); repetir un canje con la misma clave devuelve el mismo canje; canjear sin saldo da error; canjear con claves distintas sí descuenta cada vez (correcto).
- **Arreglo:** decidir la regla (permitir negativo con aviso, o bloquear la anulación del pago si ya hubo canje).
- **Estado:** ✅ Arreglado en PRUEBA con la regla "nunca menos de cero": al anular un pago se quita solo lo que el cliente aún tiene; lo que ya canjeó queda anotado en el motivo del movimiento y en la auditoría (`reversa_limitada`). Además `fid_cuentas` tiene ahora una restricción de saldo >= 0. Re-probado: ganó 100 puntos/3 sellos, canjeó 80/2, anulación → saldo 0/0 (no -80), segunda anulación no hace nada, un ajuste negativo directo es rechazado; pagar-anular-pagar de nuevo deja 10 puntos (no 20). ⏳ Falta producción (si en producción hubiera saldos negativos viejos, la restricción queda sin validar y se avisa).
- **Pendiente menor:** el corte mensual con un canje exactamente al mismo tiempo (casi imposible) se frena ahora con la restricción, no queda negativo.

### M8. Consentimiento y Ley 1581 (WhatsApp)
- Lo bueno: campañas solo a quien tiene consentimiento de WhatsApp, excluyen BAJAS, tope de frecuencia y plantilla "marketing" aprobada por Meta; BAJA siempre se registra (también en modo manual) y quita el consentimiento; ALTA solo devuelve avisos de pedido, nunca promociones.
- Fallos:
  1. `wa_enviar_manual` con plantilla de promoción solo mira "consentimiento" y no la lista de BAJAS (`...120100_whatsapp_domicilios_base.sql:377`). Si alguien reactiva el consentimiento a mano, se le puede escribir aunque haya pedido BAJA.
  2. `fid_editar_cliente` deja al cajero poner consentimiento = sí sin dejar constancia de quién ni por qué canal real (la auditoría guarda `{}`).
  3. El bot crea la ficha del cliente (nombre, teléfono, dirección) la primera vez que pide, sin avisar la política de tratamiento de datos.
  4. No hay función para suprimir/anonimizar un cliente a petición, ni plazo de borrado de conversaciones.
- **Arreglo:** revisar BAJAS en el envío manual, guardar la constancia del consentimiento, mensaje de aviso de privacidad en el primer contacto, y un procedimiento de supresión.
- **Estado:** 
  - Puntos 1 y 2: ✅ Arreglados en PRUEBA. Cada vez que cambia el consentimiento de un cliente (por cualquier camino) queda una fila en `wa_consent_log` con quién (usuario y rol), cuándo y fuente (`app_cashier`, `app_admin`, `whatsapp_baja`, `sistema`); BAJA y ALTA también guardan fuente. Un teléfono en BAJA no se puede reactivar por ningún camino (ni cajero, ni admin, ni SQL directo): solo el cliente escribiendo ALTA quita la BAJA, y recién ahí se puede volver a pedir su consentimiento. `wa_enviar_manual` bloquea cualquier mensaje a un teléfono en BAJA y las plantillas de promoción exigen consentimiento + canal WhatsApp. Re-probado: activación del cajero registrada, BAJA registrada, cajero y UPDATE directo bloqueados con BAJA, envío manual bloqueado, tras ALTA se puede reactivar. Nota: un cliente sin teléfono válido no genera fila de constancia (no podría recibir WhatsApp).
  - Punto 3 (aviso de privacidad en el bot) y punto 4 (borrado/anonimización de un cliente): 🕓 **Decisión pendiente**, no se construyeron.
  - ⏳ Falta producción.

### M9. Permisos "de fábrica" demasiado amplios en funciones viejas (fuera del alcance nuevo)
- El asesor de Supabase marca **52 funciones** ejecutables por anónimos. Las NUEVAS están bien (solo 9 públicas a propósito: `create_public_order`, `dom_seguimiento_publico`, `fid_tarjeta_publica`, 5 de mesa QR + `_fid_tel`/`_fid_no_editar` inofensivas). Las viejas que probé (12) validan rol por dentro, salvo `mark_order_paid` (C1) y `enforce_subscription_lifecycle()` (cualquiera puede ejecutar el ciclo de suscripciones; solo actúa si ya venció algo, pero no debería ser público).
- **Arreglo:** una migración que quite el permiso a `PUBLIC` por defecto y devuelva solo lo necesario; hacerla con calma, función por función, probando el menú público.

### M10. Enlaces secretos que nunca caducan
- `dom_seguimiento_publico` (seguimiento del domicilio) y `fid_tarjeta_publica` (tarjeta del cliente) usan un código de 64 caracteres (≈244 bits: adivinarlo es imposible). Pero no caduca: el seguimiento sigue mostrando la dirección completa después de entregado, y la tarjeta muestra el "motivo" escrito a mano en los últimos 10 movimientos (puede traer notas internas del admin).
- **Arreglo:** el seguimiento deja de responder ~48 h después de entregado; la tarjeta muestra textos genéricos en lugar del motivo libre.

### M11. Despliegue de las funciones de servidor depende de una bandera manual
- No existe `supabase/config.toml`; si `verify_jwt` no se pasa bien al desplegar, falla o queda abierta. Deben ir **sin** verificación de sesión (con firma/secreto propio): `whatsapp-webhook`, `whatsapp-enviar`, `wallet-pass`; **con** sesión: `whatsapp-bot-probar` (además revisa rol admin por dentro).
- Bien: el webhook rechaza (401) todo lo que no tenga la firma de Meta válida; compara en tiempo constante; el token de verificación del GET también; `whatsapp-enviar` exige secreto de cron o llave de servicio, en tiempo constante. Ninguna escribe tokens ni mensajes en los logs (`recortarError` limpia Bearer/tokens).
- Detalle menor: al descargar un archivo de Meta, el código envía el token a la dirección que Meta devuelve (solo exige que sea `https`). Conviene limitarlo a dominios de Meta (`whatsapp_nucleo.ts: descargarMedia`).
- **Arreglo:** guardar las banderas de despliegue en el documento de paso a producción; limitar el dominio de descarga.
- **Estado:** ✅ Banderas documentadas en `docs/informes/WHATSAPP_PASO_A_PRODUCCION.md` (tabla "Cómo se publica cada función"). 🕓 Limitar el dominio de descarga: sin hacer (recomendado).

### M12. Dependencias
- `npm audit --omit=dev`: **dompurify** (crítico, viene dentro de `jspdf`; la app no lo usa directamente) y **zod** (alto, desbordamiento de memoria con listas enormes). Ninguno está en un camino expuesto a internet que yo haya visto.
- `jsqr@1.4.0` (lector de QR de la caja): sin avisos de seguridad, se ejecuta en el navegador del cajero.
- **Arreglo:** `npm audit fix` (dompurify) y probar; zod pide cambio mayor, dejarlo para una limpieza.

### (menor) Permisos de tabla sobrantes
- Los usuarios logueados tienen `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre las tablas nuevas (valor por defecto de Supabase). No se pueden usar desde la app (la API no expone esas operaciones), pero conviene revocarlos en la misma migración de limpieza.

---

## 🟢 Lo que está bien (no tocar)

1. **RLS activo en todas las tablas**, incluidas las nuevas; ninguna tabla nueva da permisos al anónimo (probado: clientes, domicilios, pedidos de mesa → "permission denied").
2. **Aislamiento entre restaurantes probado de verdad:** el cajero del restaurante B no ve ni toca clientes, fichas, conversaciones, domicilios ni pedidos de mesa del restaurante A (todas las pruebas cruzadas dieron vacío o error).
3. **Todas las funciones nuevas con `SECURITY DEFINER` tienen `SET search_path`**, revisan rol y restaurante, y las internas (`_*`, `wa_bot_*`, `wa_leer_*`, `wa_reclamar_cola`…) NO son ejecutables por anónimos ni logueados (solo servicio). Sin funciones duplicadas (overloads) en `public`.
4. **Secretos:** `wa_plataforma`, `wa_credenciales` y el Vault no se pueden leer desde el navegador (cero políticas, cero permisos); `wa_plataforma_guardar` y `wa_credenciales_*` solo super_admin y nunca devuelven el valor, solo "tiene/no tiene".
5. **Llave anon únicamente en el paquete** (`dist/`): se decodificó, es `role: anon`; ninguna llave de servicio ni secretos en `src/` ni `dist/`. `.env*` en `.gitignore`.
6. **Precios:** el servidor calcula todo en los pedidos por QR y por WhatsApp; mandar `price: 1` se ignora (probado, total real $20.000); cantidades 0, negativas o >20, platos de otro restaurante → error.
7. **Fuerza bruta de códigos:** mesa (5 intentos y bloqueo), entrega de domicilio (5 intentos, luego solo "sin código" con motivo anotado), repartidor por WhatsApp (5 intentos por entrega).
8. **Comprobantes:** bucket privado, solo imágenes ≤5 MB, solo admin/cajero del mismo restaurante leen/suben, URL firmada de 5 minutos.
9. **Dinero de domicilios:** no avanza de estado sin pago confirmado; confirmar es una sola vez; cancelar libera el pedido; el cierre "entregado" exige código o motivo.
10. **Puntos:** sin doble acreditación al repagar, canje idempotente por clave, stock de premios se descuenta y se devuelve al anular.
11. **Tarjeta pública:** solo primer nombre, restaurante, nivel, puntos; nunca teléfono ni gasto. Wallet con límite de 10 usos/minuto por tarjeta.
12. **Bot:** el modelo solo redacta; el pedido solo se crea con un "sí" explícito al resumen, con huella que cambia si algo cambia; contexto aislado por restaurante y por conversación; herramientas validadas en el servidor; 20 mensajes/10 min por teléfono; tope diario y global.
13. **Pantallas:** sin `dangerouslySetInnerHTML`, sin `console.log` en lo nuevo, sin tokens en la URL salvo los códigos largos propios de tarjeta/seguimiento; el service worker no guarda respuestas de Supabase; cabeceras de seguridad y CSP en `vercel.json`.
14. **BAJA/ALTA:** BAJA se procesa antes que cualquier otra cosa y en cualquier modo; ALTA no reactiva promociones.

---

## Plan de acción (orden)

1. **Aplicar en producción** `20261108180000_seguridad_fidelizacion_whatsapp.sql` (con copia previa y tu "apruebo, aplica"). Es la única urgente.
2. ✅ Hecho en PRUEBA, falta producción: `20261108190000_seguridad_fidelizacion_2.sql` (M1, M2, M6, M7, M8 puntos 1-2). Después de aplicarla, volver a publicar `whatsapp-webhook`. Pendiente de decidir sobre `domicilios` (teléfono completo para cajero/mesero).
3. 🕓 Decisiones pendientes: tope de IA por restaurante (M5), texto del aviso de privacidad en el bot y flujo de borrado de clientes (M8 puntos 3-4).
5. Dejar por escrito las banderas de despliegue de las 4 funciones (M11) y limitar el dominio de descarga de archivos.
6. Limpieza: M9 (quitar `PUBLIC` por defecto), M10 (caducidad de enlaces), M12 (`npm audit fix`), revocar TRUNCATE/REFERENCES/TRIGGER.

---

## Lo que NO pude verificar

- **Producción:** no se consultó. No sé si `mark_order_paid` ya está cerrada allá (casi seguro no). Tampoco el estado real de `verify_jwt` de las funciones desplegadas, los secretos cargados ni el cron de la cola de WhatsApp.
- **Probado solo por lectura de código (no ejecutado):** la firma de Meta en vivo, descarga de comprobantes/audios desde Meta, subida real de archivos al bucket (solo se revisaron sus políticas), generación de pases Apple/Google Wallet, y el comportamiento del bot frente a intentos de manipulación con un modelo real (la lógica de validación en servidor sí se revisó).
- **Mesero:** no hay mesero en los datos de prueba; sus permisos se revisaron en las políticas y en las funciones (no se simuló con sesión de mesero).
- El cron de la cola (`pg_cron`) no existe en la base de prueba, así que el manejo del secreto de cron se auditó leyendo `whatsapp-enviar` y `wa_leer_plataforma`, no ejecutándolo.
- `pg_cron` / pagos Wompi en vivo, y la pantalla visual (no se abrió la app).
