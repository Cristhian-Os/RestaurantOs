# Resti: pruebas y puesta en marcha

Estado al 2026-10-22. Rama `claude/new-session-0vekub`. **Las funciones de Resti ya están desplegadas en producción** (`RestaurantOs`; ver «Estado de producción» al final). Lo que sigue pendiente: `voice-parse` (no desplegada), el front con las correcciones de esta auditoría y encender Resti por restaurante. Las secciones siguientes describen el proyecto de prueba `restaurantos-prueba`, que fue donde se probó primero.

## Qué hay desplegado (solo en el proyecto de prueba `restaurantos-prueba`)

| Pieza | Estado |
|---|---|
| `resti-brain` v3 (cerebro: adaptador de IA + memoria de 6 turnos) | desplegada |
| `resti-voz` v2 (Gemini oye y habla) | desplegada, con `gemini_api_key` cargada. Modelos: oír `gemini-3.5-flash-lite` → `gemini-3.6-flash`; hablar `gemini-3.8-flash-tts` → `gemini-3.1-flash-tts-preview` (respaldo automático) |
| `platform_secrets`: `ai_proveedor=compatible`, `ai_url_base=https://api.deepseek.com`, `ai_modelo=deepseek-flash`, `ai_api_key` | cargado |
| Resti encendido (`resti_agent`) | solo para "Prueba A" (admin `admin-a@prueba.test`) |
| `pg_net` (esquema `extensions`) | instalado en el proyecto de prueba para poder llamar funciones desde SQL |
| `ai-diag` | retirada: ahora responde 410 |

En esta etapa producción (`RestaurantOs`) no se había tocado; después se desplegó (ver «Estado de producción»).

## Funciones de texto migradas al adaptador (desplegadas en producción el 2026-10-22, salvo `voice-parse`)

`resti-brain`, `chat-support` (soporte, ventas y opiniones, con llamadas a herramientas), `menu-asistente` y `feedback-resumen` leen el proveedor de `platform_secrets`; `ai-report` ya lo hacía. **Mientras `ai_proveedor` no sea `compatible`, siguen usando Gemini como siempre**, así que desplegarlas no cambia el comportamiento hasta que se configure DeepSeek. `voice-parse` (comandos de voz) se queda en Gemini a propósito.
Probado solo con respuestas simuladas (adaptador, incluidas las llamadas a herramientas en ambos formatos); falta probarlo contra DeepSeek con saldo.

## Entorno web de prueba (pendiente: lo crea el dueño)

La conexión de Vercel de esta sesión no tiene permiso para crear proyectos (403) ni para leer variables. Pasos manuales (3 minutos):
1. Vercel → Add New → Project → importar `Cristhian-Os/RestaurantOs`; nombre `restaurantos-prueba`; framework Vite.
2. Variables de entorno (todos los entornos): `VITE_SUPABASE_URL=https://qdhafwnwrvsqunnnecky.supabase.co` y `VITE_SUPABASE_ANON_KEY` = la clave *anon* del proyecto de **prueba** (Supabase → Project Settings → API).
3. Settings → Git → Production Branch = `claude/new-session-0vekub` (o abrir la URL de vista previa de la rama).
4. Entrar con `admin-a@prueba.test` (restablecer la clave en Supabase → Authentication → Users del proyecto de prueba).
Ojo: el proyecto `restaurantos` ya crea una vista previa por cada push de la rama; **no se sabe contra qué base apuntan**, no las uses con cuentas reales.

## Qué se probó de verdad

- **DeepSeek, desde el servidor**: la clave es válida (la lista de modelos respondió 200; modelos de la cuenta: `deepseek-flash`, `deepseek-v4-pro`). **Todas las llamadas de chat devuelven `402 Insufficient Balance`: la cuenta no tiene saldo.** El alias antiguo `deepseek-chat` ya no es el modelo recomendado.
- **Conversación por voz en un navegador real** (micrófono falso, cerebro y voz simulados): calibra el ruido, detecta la frase, transcribe, piensa, camina y señala hasta la tarjeta, responde, vuelve a escuchar; el panel recibe el clic; "sube el precio…" llega al modal de comandos con tu texto; **la interrupción funciona** (callada 0,9 s después de hablarle encima).
- **Modelo 3D**: 9 poses en 4 ángulos, sin romper la malla (medición con skinning en CPU + acercamientos), 4 fases de la caminata, luz del collar verde/azul/amarilla/roja.
- **Respaldo sin 3D**: 30 imágenes capturadas del mismo modelo; se usan si no hay WebGL, si la GPU es por software, con ahorro de datos o 2G, si el modelo no carga o si va a menos de ~12 cuadros/s.
- Pruebas automáticas: `node` sobre `src/components/resti/rig/*.test.ts`, `src/components/resti/sprites.test.ts`, `src/lib/resti/**/*.test.ts`, `supabase/functions/**/*.test.ts` y `npm run check:resti`.

## Qué NO se ha probado (no declares éxito sin esto)

1. **Respuesta real de DeepSeek en Resti**: bloqueada por el saldo.
2. **Voz de Gemini de punta a punta en la app**: la clave y los modelos se probaron directo contra Google (la clave nueva recibe 404 con `gemini-2.5-flash`; el TTS leía en voz alta la instrucción de tono, ya quitada; `gemini-3.8-flash-tts` devuelve WAV, ya soportado). Falta oírla en el navegador con el front de prueba. Modelos configurables sin código: `voz_modelo_stt`, `voz_modelo_tts` (lista separada por comas) y `voz_nombre`. **Producción (`voice-parse` y otras) sigue usando `gemini-2.5-flash`: con claves nuevas daría 404; hay que migrarlo antes de depender de él.**
3. **Resti dentro de la app real** con sesión de administrador (hace falta un despliegue del front apuntando a la base de prueba).
4. **FPS y fluidez en dispositivos reales**: todo se midió con renderizado por software.
5. **Navegadores**: Safari/iOS y Firefox (el reconocimiento de voz del navegador no existe en Firefox; la voz de Gemini sí funciona allí).
6. **Latencia**: medida, el audio no se transmite (el streaming no devolvió audio en la prueba); cada frase tarda ≈ 2–4 s en generarse. Por eso el cliente parte la respuesta en frases, las pide a la vez y las reproduce en orden. Espera ≈ 5–7 s por turno.
7. **Landing pública**: pendiente (ver abajo).

## Configuración (`platform_secrets`)

| Clave | Para qué |
|---|---|
| `ai_proveedor` | `compatible` = DeepSeek u otro estilo OpenAI; otro valor = Gemini |
| `ai_url_base`, `ai_modelo`, `ai_api_key` | proveedor de texto (cerebro de Resti) |
| `gemini_api_key` | voz (oír y hablar) y, mientras `voice-parse` siga en Gemini, comandos de voz |
| `voz_modelo_stt`, `voz_modelo_tts`, `voz_nombre` | opcionales: modelos y voz de Gemini |

Volver a Gemini para el cerebro: borrar `ai_proveedor` (o ponerlo distinto de `compatible`). No hace falta redesplegar.

## Para llevarlo a producción (hecho en lo que toca a funciones; queda el front y encender Resti)

1. Copia manual de la base (`Backups-RestaurantOS`), como siempre.
2. Cargar `ai_*` en `platform_secrets` de producción (DeepSeek con saldo) y confirmar que ya existe `gemini_api_key`.
3. Desplegar las funciones `resti-brain` y `resti-voz`. `resti-brain` importa `../_shared/modelo.ts`: con la CLI de Supabase se despliega tal cual; con el panel hay que incluir ese archivo junto a la función.
4. Publicar el front: incluye `public/assets/resti/resti.glb` (1,9 MB), los 30 sprites y el cambio de CSP (`connect-src` admite `blob:` para que three.js cargue las texturas del modelo).
5. Encender Resti por restaurante con `modules_enabled.resti_agent = true` (apagado por defecto).
6. No se requiere ninguna migración nueva.

## Seguridad

- La clave de DeepSeek se pegó en una conversación: **conviene rotarla** en el panel de DeepSeek cuando termine esta fase de pruebas y poner un límite de gasto.
- El audio y el texto no se guardan ni se registran; los errores solo registran el mensaje. Topes por usuario: cerebro 20/10 min y 80/día; voz 40/10 min y 400/día.
- Resti no cambia datos por sí mismo: abre el modal de comandos con lo que dijiste y **tú apruebas** cada cambio.

## Resti absorbe el chatbot y vive en la landing (funciones desplegadas en producción; front en el PR #6)

- **Panel (administrador con Resti encendido):** Resti hace lo del chatbot de soporte (el cerebro lleva el conocimiento de la app) y lo de opinión: con `START_FEEDBACK` abre un hilo que usa `chat-support` modo opinión (mismas reglas, topes y tabla `feedback_items`); los botones "Opinión y sugerencias" ahora abren a Resti. Cancela con "cancelar" / "ya no". El personal (cajero, mesero, cocina) sigue con el chat de opinión de siempre porque Resti es solo del administrador.
- **Landing:** el botón del chat es Resti (capturas del mismo modelo, no 3D, para no cargar three.js a visitantes). Habla con `chat-support` modo landing (ventas, planes desde la base, `guardar_lead`). Voz solo del navegador: "Activar voz" lee las respuestas y el micrófono dicta con el reconocimiento del navegador (si no existe, no aparece). Sin Gemini para visitantes anónimos.
- Probado: el cerebro con un modelo real (7 frases: datos, navegar, reportar fallo, dudas de uso, saludo, cambio de precio, intento de saltarse las reglas) y el panel de la landing en Chromium (abrir, escribir, respuesta, voz). Falta: DeepSeek real, `chat-support` desplegada con el modelo real, y probar el hilo de opinión de punta a punta con sesión.

## Migración de modelos y claves de Gemini

- Los modelos de Google cambian: con claves nuevas `gemini-2.5-flash` da 404. El adaptador (`_shared/modelo.ts`) y `voice-parse` ahora prueban en orden `gemini-3.5-flash-lite` → `gemini-3.6-flash` → `gemini-2.5-flash` y pasan al siguiente ante 404/429/5xx; `ai_modelo` (admite lista con comas) se prueba primero. `gemini-3.5-flash-lite` rechaza `thinkingBudget` (400): se repite sin él y se recuerda. `gemini-3.6-flash` "piensa" y tardó ~8 s en un comando de voz, por eso lite va primero (≈1 s, mismo resultado en la prueba).
- La clave de `voice-parse` ya no va en la URL sino en la cabecera `x-goog-api-key`.
- No hay claves en el código: siguen en `platform_secrets` (`gemini_api_key`, `ai_*`). Nada que migrar en la base.
- **Antes de desplegar a producción** comprueba que la clave de producción acepta los modelos 3.x (si no, el respaldo cae a 2.5 y sigue funcionando mientras Google no lo retire): `curl -s -o /dev/null -w "%{http_code}" -H "x-goog-api-key: $CLAVE" -H 'Content-Type: application/json' -d '{"contents":[{"parts":[{"text":"hola"}]}]}' https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` debe dar 200.
- Funciones de esto en producción: `resti-brain`, `resti-voz`, `chat-support`, `menu-asistente`, `feedback-resumen` y `ai-report` ya están desplegadas; falta `voice-parse` (las que importan `_shared/modelo.ts` necesitan ese archivo incluido).

## Estado de producción (2026-10-22, tras la copia manual)

Desplegadas en `RestaurantOs` (versión del adaptador con respaldo de modelos de Gemini): `chat-support` (v19), `resti-brain` (v5), `menu-asistente` (v5), `feedback-resumen` (v5), `ai-report` (v5) y `resti-voz` (v1, nueva). Se desplegaron con la herramienta MCP (código pegado en cada función, con el adaptador como `modelo.ts` al lado, sin comentarios largos); el código de referencia sigue siendo el del repo.
- Verificado con llamadas reales: `chat-support` modo landing (precio de la tabla de planes y el filtro frena "plan gratis") y `menu-asistente` con el restaurante demo. `resti-brain`, `resti-voz`, `ai-report` y `feedback-resumen` exigen sesión de administrador/dueño: no se probaron de punta a punta.
- **No desplegada: `voice-parse`** (sigue con `gemini-2.5-flash`, que hoy funciona con la clave de producción). El cambio del repo se despliega con la CLI: `npx supabase functions deploy voice-parse --project-ref ifypeslrcdebvdqglywt` desde la rama.
- Quedaron 2 filas de prueba en `platform_chat_logs` (mensajes "Tengo una heladería con 12 mesas…" y "Dame el plan gratis…"); el borrado desde aquí dio timeout.
- Front: PR #6; Resti sigue apagado por restaurante (`modules_enabled.resti_agent`).
- Auditoría 2026-10-22: el despliegue de producción no coincide con el repo en `resti-brain` (v7 con una línea anómala en `cargarProveedor`) y `voice-parse` (v14 con la llave en la URL). Hay que volver a desplegar desde el repo. El objetivo `btn-notificaciones` se quitó de la lista blanca del front (no existe en la interfaz); la copia del servidor (`supabase/functions/resti-brain/brain.ts`) debe quitarlo también.
