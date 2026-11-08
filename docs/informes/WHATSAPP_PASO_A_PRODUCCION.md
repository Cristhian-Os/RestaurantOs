# WhatsApp (bot + cola de envío): paso a producción

Lista para Cristhian. Todo esto está probado en el proyecto de PRUEBA. En producción no se ha aplicado nada.
Lo único que no se pudo probar sin Meta real: enviar y recibir mensajes de verdad (ver "Qué falta probar").

## 1. Qué se instala
- Migración `supabase/migrations/20261107120500_whatsapp_bot.sql` (guarda las llaves cifradas y crea las funciones del bot).
- Dos funciones en la nube: `whatsapp-webhook` (recibe lo que Meta manda) y `whatsapp-enviar` (manda los mensajes que están en cola).
- Las dos se publican **sin pedir sesión de usuario** (`verify_jwt = false`), porque Meta y el programador no tienen sesión. Se protegen con la firma de Meta y con un secreto propio. No hay `config.toml` en el proyecto, así que esa opción se marca al publicar (`--no-verify-jwt`).

### Cómo se publica cada función (con o sin verificación de sesión)
No hay `supabase/config.toml`: la bandera se pone al publicar. Equivocarse rompe la función (401 permanente) o la deja abierta a quien no debe.

| Función | Publicar | Quién la llama | Cómo se protege |
|---|---|---|---|
| `whatsapp-webhook` | `supabase functions deploy whatsapp-webhook --no-verify-jwt` | Meta (sin sesión) | Firma de Meta; sin firma válida responde 401 |
| `whatsapp-enviar` | `supabase functions deploy whatsapp-enviar --no-verify-jwt` | El programador (cron) cada minuto | Secreto de cron o llave de servicio |
| `wallet-pass` | `supabase functions deploy wallet-pass --no-verify-jwt` | El cliente (celular, sin sesión) | Código largo de la tarjeta + 10 usos/minuto |
| `whatsapp-bot-probar` | `supabase functions deploy whatsapp-bot-probar` (CON verificación, la de por defecto) | El administrador desde la app | Sesión + revisa por dentro que sea admin/super_admin |

Después de publicar: sin firma, `whatsapp-webhook` debe responder 401; sin sesión, `whatsapp-bot-probar` debe responder 401. Si `whatsapp-webhook` o `whatsapp-enviar` piden sesión (401 con la firma buena), faltó `--no-verify-jwt`.

## 2. De dónde sale cada llave
Hay UNA sola app de Meta para toda la plataforma.

| Llave | Qué es | De dónde sale | Dónde se guarda |
|---|---|---|---|
| **App secret** | Para comprobar que los mensajes vienen de Meta | Meta for Developers → tu app → Configuración → Básica → "Clave secreta de la app" | Sección superadmin (plataforma) |
| **Verify token** | Una frase que TÚ inventas (larga, al azar). Meta la pide al conectar el webhook | La inventas tú | Sección superadmin (plataforma) |
| **Token de acceso (plataforma)** | Permiso para enviar mensajes. **Un solo token cubre todos los números** de tu negocio en Meta | Meta Business → Configuración → Usuarios del sistema → crear "usuario del sistema" (administrador) → Generar token, con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin vencimiento | Sección superadmin (plataforma) |
| **Token propio de un restaurante** | Solo es una EXCEPCIÓN: si un restaurante tiene su número en OTRO negocio de Meta | Igual que el anterior, pero desde el negocio de ese restaurante | Sección superadmin → ese restaurante |

Reglas del sistema con el token: si el restaurante tiene token propio, se usa ese; si no, se usa el de la plataforma; si no hay ninguno, los mensajes se quedan esperando (no se pierden).
Las llaves solo se pueden ESCRIBIR desde la pantalla; nadie las puede volver a ver (ni tú). Si se pierde una, se carga otra.

## 3. Conectar el webhook en Meta
1. Meta for Developers → tu app → WhatsApp → Configuración → Webhook → Editar.
2. **URL de devolución de llamada**: `https://<ref-del-proyecto>.supabase.co/functions/v1/whatsapp-webhook` (en producción el ref es `ifypeslrcdebvdqglywt`; en pruebas `qdhafwnwrvsqunnnecky`).
3. **Token de verificación**: la misma frase del "Verify token" que cargaste en la plataforma.
4. Pulsa "Verificar y guardar". Si sale error, falta cargar el verify token o publicar la función.
5. En "Campos del webhook" suscribe **`messages`** (con eso llegan mensajes entrantes y estados de envío: enviado/entregado/leído/fallido).

## 4. Programar el envío (cada minuto)
La cola no se envía sola: alguien debe "tocar" `whatsapp-enviar` cada minuto. Se hace una sola vez, en el editor SQL de Supabase de producción, DESPUÉS de cargar las llaves. No lleva secretos escritos (los lee de la base al ejecutarse):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('wa-enviar', '* * * * *', $$
  select net.http_post(
    url     := 'https://<ref-del-proyecto>.supabase.co/functions/v1/whatsapp-enviar',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', (public.wa_leer_plataforma()->>'cron_secret')),
    body    := '{}'::jsonb) $$);
```
Antes de programarlo, comprueba que la llave del programador existe (debe decir `true`; la crea la migración `20261107120500`, no se escribe a mano): `select (public.wa_leer_plataforma()->>'cron_secret') is not null;`. Si dijera `false`, el envío saldría sin llave y la función respondería 401.
La llave NO está escrita en el programador: se lee de la base cada vez que corre (por eso `select cron.schedule` es seguro de pegar). En Supabase, `pg_cron` y `pg_net` también se pueden activar desde Base de datos → Extensiones; el SQL de arriba hace lo mismo.
Para comprobar que funciona (a los 2 minutos): `select status_code, created from net._http_response order by created desc limit 3;` (debe salir `200`; `401` = falta la llave o la función no está publicada con `--no-verify-jwt`) y `select status, return_message from cron.job_run_details order by start_time desc limit 3;`.
Para apagarlo: `select cron.unschedule('wa-enviar');`
En el proyecto de PRUEBA (`qdhafwnwrvsqunnnecky`) `pg_net` ya está activo y `pg_cron` está disponible pero sin activar; no se programó nada allí porque enviaría mensajes a Meta de verdad sin tener todavía una app conectada.
Cada vuelta también manda los recordatorios a repartidores (punto 7) y reintenta los fallos (a 1 y 5 minutos; a los 3 intentos queda "fallido").
El bot responde al instante por su cuenta (no espera al minuto).

## 5. Orden para ir a producción
1. **Copia de seguridad** de producción (la de siempre, antes de tocar la base).
2. Hacerlo **de noche** o con el restaurante cerrado.
3. Tú dices: **"apruebo, aplica"**. Solo entonces: aplicar la migración, publicar las dos funciones, (después de aplicar) cargar las llaves desde la sección superadmin.
4. Crear/aprobar las plantillas en Meta (punto 6) y registrarlas en cada restaurante.
5. Conectar el webhook en Meta (punto 3) y programar el envío (punto 4).
6. Prueba con un número tuyo: modo **manual** primero (solo guarda lo que llega), luego modo **bot**.
7. Dejar a Cholaos Dany en "desactivado" hasta que tú decidas. Su admin real no se usa para probar.

## 6. Plantillas que hay que crear y aprobar en Meta
Categoría **Utility**, idioma Español. Las dos variables de las del cliente son **{{1}} = nombre** y **{{2}} = tiempo estimado (minutos)**. En cada restaurante, la plantilla se registra con el mismo nombre técnico y la lista de variables en este orden: `nombre`, `eta_min`.
Los nombres deben ser exactamente `dom_<estado>` (el sistema los busca así):

| Nombre | Cuándo se manda | Texto sugerido |
|---|---|---|
| `dom_recibido` | Se recibe el pedido | Hola {{1}}, recibimos tu pedido a domicilio. Te avisamos cuando lo confirmemos. |
| `dom_confirmado` | Se confirma (y el pago, si fue transferencia) | Hola {{1}}, tu pedido está confirmado. Tiempo estimado: {{2}} min. |
| `dom_preparando` | Entra a cocina | Hola {{1}}, estamos preparando tu pedido. |
| `dom_listo` | Listo en el local | Hola {{1}}, tu pedido está listo y estamos asignando quién lo lleve. |
| `dom_asignado` | Tiene repartidor | Hola {{1}}, tu pedido ya tiene repartidor asignado. Tiempo estimado: {{2}} min. |
| `dom_en_camino` | Sale hacia el cliente | Hola {{1}}, tu pedido va en camino. Llega en unos {{2}} min. Ten a mano tu código de entrega. |
| `dom_entregado` | Se cierra la entrega | Hola {{1}}, tu pedido fue entregado. ¡Gracias por elegirnos! |

Opcionales (si no existen, ese aviso simplemente no se manda): `dom_recogido`, `dom_cancelado`, `dom_fallido`, `dom_buscando_repartidor`.
Para el repartidor, aviso de pedido asignado: `dom_repartidor_asignado` (uso "repartidor", variables en este orden: `direccion`, `referencia`, `cliente`, `costo_envio`): "Nuevo domicilio para {{3}}: {{1}} ({{2}}). Domicilio: {{4}}." (Sugerencia: añadir al final "Si es contra entrega, paga el pedido en caja antes de llevártelo.") No se llama `dom_asignado` porque ese nombre es el del aviso al cliente.
Para el repartidor: `dom_recordar_entrega` (uso "repartidor", variable `numero`): "¿Ya entregaste el pedido #{{1}}? Escribe el código de 4 números del cliente." Si no existe, el recordatorio sale como texto normal (solo llega si el repartidor te escribió en las últimas 24 horas).

Qué pasa fuera de las 24 horas: WhatsApp solo deja mandar texto libre dentro de las 24 h desde el último mensaje del cliente. Fuera de ese tiempo solo salen plantillas aprobadas; si no hay plantilla, el mensaje queda "fallido" con el motivo escrito (no se manda nada).

## 7. Qué hace el bot (solo en modo "bot")
- **BAJA / STOP** (con o sin tildes o mayúsculas), de cualquier persona: queda sin avisos ni promociones, se quita el consentimiento de promociones y se cancelan sus campañas en cola. Esto se registra también en modo "manual" (ahí no responde nada).
- **Repartidor** (su número está en Repartidores y activo): escribe el código de 4 números del cliente → se cierra la entrega ("Entrega cerrada ✅"). Código malo: "Código incorrecto". Con 5 fallos se bloquea y el cajero cierra "sin código". Cuando la entrega se cierra (por el bot o por el cajero), el pedido, si ya está pagado, pasa a "completado" (migración `20261108160000_domicilios_pulido.sql`); si la entrega falla o se cancela, no. Si solo escribe "entregado" o "listo", el bot le pide el código (no cierra).
- **Contra entrega: el repartidor paga en caja ANTES de llevarse el pedido** (migración `20261108170000_domicilio_contra_entrega_pago_previo.sql`). Mientras no pague, el sistema no deja pasar el domicilio a "recogido" ni "en camino" y el panel avisa que use "Cobro al repartidor". El bot no le dice al repartidor cuánto pagar (ese texto, hecho para el cliente, dice "le pagas al repartidor" y sigue siendo correcto).
- **Recordatorio al repartidor**: si pasan N minutos (por defecto 20, ajustable en la configuración de WhatsApp) desde que salió con el pedido y nadie cierra la entrega, el bot le pide UNA vez el código.
- **Cliente con transferencia pendiente**: si manda una foto, se guarda como comprobante y el pedido queda "comprobante enviado" para que el cajero lo confirme. Si escribe antes de pagar, el bot le explica que el pedido pasa a cocina cuando el cajero confirme. (Solo fotos JPG/PNG/WebP de hasta 5 MB; un PDF se le pide de nuevo como foto.)
- **"Estado" / "mi pedido"**: le dice en qué va su pedido más reciente.
- **ALTA**: la persona que se dio de baja vuelve a recibir avisos de sus pedidos (las promociones NO vuelven solas).
- **Cualquier otra cosa**: la atiende el cerebro de IA (punto 8). Si el restaurante no tiene proveedor de IA configurado, vale lo de antes: una respuesta corta cada 30 minutos y la conversación queda "esperando humano".
- Tomar pedidos nuevos por chat **SÍ** está construido (punto 8), probado en el proyecto de prueba con un modelo simulado. Falta probarlo con el modelo de IA real.

## 8. El cerebro del bot (IA que toma pedidos)
**Cómo funciona.** El bot sabe de qué restaurante le escriben por el número de WhatsApp que recibió el mensaje (nunca por lo que diga el cliente). Lee la carta, horario, domicilio y datos de pago de ESE restaurante y conversa en español colombiano. La IA solo conversa: los precios, totales, el domicilio y la creación del pedido los hace el sistema, que revisa todo (platos disponibles, tamaños, cantidades, mínimo, restaurante abierto). El pedido se crea solo si el cliente respondió SÍ después de ver el resumen completo.
- **Transferencia**: el pedido queda "esperando pago" y NO llega a cocina hasta que el cajero confirme el comprobante.
- **Contra entrega**: pasa directo a cocina y el cliente recibe su código de entrega.
- **Recoger**: se paga en el local y pasa a cocina. (Recoger + transferencia no existe.)
- Los pedidos de WhatsApp llevan en las notas "Pedido por WhatsApp" (no hay columna de canal).
- Si no sabe, hay queja, el cliente pide una persona, falla la IA o se pasa de los topes, avisa y se **calla**: la conversación queda "esperando humano" hasta que el cajero la devuelva al bot o la cierre desde la bandeja.
- Audios: los transcribe (hasta ~1 minuto). Otros archivos: pide que escriba.

**Qué debe llenar cada administrador** (WhatsApp → configuración): activar "tomar pedidos por chat", nombre del bot, tono, mensaje de bienvenida, información extra (promos, políticas), horario, cobertura, tarifa de domicilio, pedido mínimo, datos de transferencia.

**Control de gasto (todo automático)**
- 200 conversaciones con IA por día por restaurante (ajustable en la plataforma: `wa_bot_tope_diario`).
- 20 mensajes por teléfono cada 10 minutos; al pasarse, lo atiende una persona.
- Tope mensual de toda la plataforma (`wa_bot_total_max`, por defecto 1.500.000).
- Todo uso queda registrado con su costo.

**Probar sin WhatsApp**: en el panel del administrador, el chat "Probar el bot" (función `whatsapp-bot-probar`). Usa el mismo cerebro, no crea pedidos reales y no aparece en la bandeja. Botón "Reiniciar" para empezar de cero.

**Para producción además**: variable `APP_URL` en las funciones (para el enlace al menú digital) y la migración `20261108120000_whatsapp_bot_cerebro.sql` (cambia también `create_public_order`, `crear_orden_completa` y `dom_crear`, así que va con copia de seguridad y tu "apruebo, aplica"). Las funciones `whatsapp-webhook` y `whatsapp-bot-probar` (esta última CON sesión) se publican nuevas.

## 9. Qué falta probar con Meta real
Enviar mensajes de verdad, recibir uno real, descargar una foto real y el formato exacto de las plantillas. Con tu primer número hacer: (1) verificar webhook, (2) escribirle al número "hola" y ver la conversación, (3) cambiar un domicilio de estado con plantilla aprobada, (4) mandar una foto de comprobante.
