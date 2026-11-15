# Guía paso a paso: conectar RestaurantOS Central

Para Cristhian. Todo está **apagado de fábrica**. Nada gasta dinero ni publica hasta que tú lo enciendas.

## Reglas de oro (léelas una vez)

1. **Las llaves NUNCA se pegan en el chat, en la app, ni en archivos.** Solo se pegan en un lugar: *Supabase → Edge Functions → Secrets*. Si una llave se te escapa (la pegaste en un chat, la viste en pantalla), bórrala en el sitio de origen y crea otra.
2. **Los agentes solo conversan y proponen.** No tocan datos, no publican, no gastan. Tú apruebas.
3. **Tienes un interruptor de emergencia:** Integraciones → "IA encendida". Apagado = ningún agente llama a ningún modelo, al instante.
4. **Tope de gasto en dólares.** En 0 no se gasta nada. Empieza con algo pequeño (por ejemplo 5 USD).

## Orden recomendado (no te saltes pasos)

| Paso | Qué | Quién |
|---|---|---|
| 1 | Aplicar las 4 migraciones de Central en la base | Tú das "apruebo, aplica"; yo las aplico con copia previa |
| 2 | Instalar las 2 funciones del servidor (`central-agente`, `central-telegram`) | Yo, cuando me autorices |
| 3 | Guardar tus llaves como secretos en Supabase | **Tú** |
| 4 | Entrar a Central → Integraciones y pulsar **Probar** | Tú |
| 5 | Fijar tope de gasto, elegir modelo, encender IA | Tú |
| 6 | Poner a un agente en "Conectado" y escribirle | Tú |

Las 4 migraciones, en este orden: `20261114120000_cerrar_escalada_de_rol` → `20261114130000_central_acceso_auditoria` → `20261114140000_central_nucleo` → `20261114150000_central_conexiones`. La 4.ª solo agrega filas apagadas y se deshace con `supabase/rollback/20261114150000_central_conexiones_down.sql`.

---

## A. Modelos de IA

### A1. Claude (Anthropic) — el principal
1. Entra a **console.anthropic.com** e inicia sesión.
2. Ve a **Billing** y carga un saldo pequeño (por ejemplo 5 USD). Sin saldo no responde.
3. Ve a **API Keys → Create Key**, ponle nombre "RestaurantOS Central" y copia la llave (empieza por `sk-ant-`). Solo se muestra una vez.
4. En Supabase: **Project → Edge Functions → Secrets → Add new secret**
   - Nombre: `CENTRAL_CLAVE_CLAUDE`
   - Valor: la llave.

### A2. NVIDIA (para usar DeepSeek y otros) — tu llave de NVIDIA
Sí, **tu llave de NVIDIA sirve** para modelos DeepSeek: NVIDIA los ofrece en su catálogo con un formato compatible, y Central ya sabe hablarle. Lo confirmas tú con el botón **Probar** (yo no puedo probarla sin ver la llave, y no debo verla).
1. Entra a **build.nvidia.com**, busca el modelo DeepSeek que quieras y mira su nombre exacto (por ejemplo `deepseek-ai/deepseek-v3.1`).
2. Tu llave empieza por `nvapi-`. Si no la tienes: en esa página, **Get API Key**.
3. En Supabase → Secrets: nombre `CENTRAL_CLAVE_NVIDIA`, valor la llave.
4. Si quieres otro modelo distinto al de fábrica, dímelo y lo dejo en la configuración (`ia_modelos`).

Ojo: algunos modelos del catálogo de NVIDIA tienen límite de uso gratis y no cobran por token igual que Claude. El tope de gasto de Central usa una **estimación prudente y alta**, así que nunca subestima.

### A3. DeepSeek directo (alternativa)
1. **platform.deepseek.com** → crea cuenta, carga saldo, **API keys → Create**.
2. Supabase → Secrets: `CENTRAL_CLAVE_DEEPSEEK`.

---

## B. Telegram (solo avisos hacia ti)

1. En Telegram busca **@BotFather** → escribe `/newbot` → pon nombre y usuario. Te da un **token** (`123456:ABC...`).
2. Abre tu bot nuevo y escríbele cualquier mensaje ("hola"). Esto es obligatorio: un bot no puede escribirte primero.
3. Para saber tu `chat_id`: escríbele a **@userinfobot** y te responde tu número de usuario.
4. Supabase → Secrets:
   - `CENTRAL_TELEGRAM_TOKEN` = el token
   - `CENTRAL_TELEGRAM_CHAT_ID` = tu número
5. En Central → Integraciones → **Enviar prueba**. Debe llegarte un mensaje.

Hoy Telegram es solo de salida: Central te avisa, no recibe órdenes por ahí (a propósito: un mensaje de Telegram no puede mandar a un agente).
Avisos automáticos (cuando haya una aprobación pendiente) quedan para una fase siguiente.

---

## C. Google Workspace (Gmail, Calendar, Drive)

**No está conectado todavía.** Requiere crear un proyecto en Google Cloud, pantalla de consentimiento y OAuth, y un adaptador en el servidor. Es una fase aparte; no te pido nada ahora. Cuando lo hagamos, los permisos serán de solo lectura primero.

---

## D. Redes sociales

Principio: **los agentes solo preparan borradores; publicar lo decide una persona.** Las tarjetas ya aparecen en Integraciones como "No conectada".

| Red | Qué exige | Dónde |
|---|---|---|
| Instagram / Facebook | Crear una app en Meta, cuenta de Instagram profesional enlazada a una página de Facebook, y pasar la **revisión de Meta** para poder publicar | developers.facebook.com |
| TikTok | Registrar una app de desarrollador y esperar aprobación para publicar | developers.tiktok.com |
| YouTube | Proyecto en Google Cloud con "YouTube Data API v3" y OAuth | console.cloud.google.com |
| X (Twitter) | La API es de **pago**; crear app en el portal de desarrolladores | developer.x.com |

Estado honesto: hoy **ninguna** está conectada y no existe aún el adaptador que publique. Lo que sí funciona hoy: pedirle a Nico (marca) que redacte borradores en el chat, y tú los copias. Los adaptadores reales (con tu aprobación en cada publicación) son una fase siguiente; cada red tarda días en aprobar la app, así que conviene **empezar los trámites ya** aunque el adaptador llegue después.

---

## E. Encender la IA (paso final)

1. Central → **Integraciones → Panel de IA**.
2. Verifica que el modelo muestre **Llave guardada** y que **Probar** diga "Funciona".
3. **Tope mensual (USD):** escribe un número (ej. 5) → *Guardar tope*.
4. **Modelo principal:** Claude (o el que quieras).
5. Interruptor **IA encendida** (solo te deja encenderlo si hay tope > 0 y llave guardada).
6. Central → **Presupuestos:** ponle un presupuesto mensual (USD) al agente con el que vas a hablar (ej. 1).
7. Central → **Agentes** → el agente → *Permisos* → **Proveedor de IA = Conectado** → Guardar.
8. Abre el chat con ese agente y escríbele. La respuesta dirá **"IA real"** (las de práctica dicen "Simulación local").

## Qué protege tu dinero

- Interruptor general + tope mensual general + presupuesto por agente: el servidor revisa los tres **antes** de llamar al modelo.
- Máximo 8 respuestas por minuto.
- Cada respuesta está limitada en tamaño.
- El costo se anota **antes** de guardar la respuesta; si algo falla a medias, queda registrado de más y no de menos.
- Si no hay precios configurados, se asume un precio alto (peor caso).

## Si algo sale mal

- **Parar todo ya:** Integraciones → apaga "IA encendida".
- **Llave expuesta:** bórrala en Anthropic/NVIDIA/DeepSeek, crea otra y cámbiala en Secrets.
- **Deshacer la migración 4:** `supabase/rollback/20261114150000_central_conexiones_down.sql` (con copia previa y tu aprobación).
- Mensaje "¿Ya está instalada la función en Supabase?": falta el paso 2 (instalar funciones).

## Qué NO está hecho (para que no haya sorpresas)

- Nada está instalado ni aplicado en producción: todo vive en tu computador.
- Avisos automáticos a Telegram, Google Workspace y publicación en redes sociales: fases siguientes.
- Los agentes no ejecutan tareas por sí solos todavía: conversan y proponen.
- Nunca he visto ninguna de tus llaves ni llamado a un proveedor real; la prueba de verdad la haces tú con **Probar**.
