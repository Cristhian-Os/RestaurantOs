# Resti: pruebas y puesta en marcha

Estado al 2026-10-22. Rama `claude/new-session-0vekub`. **Nada de esto está en producción.**

## Qué hay desplegado (solo en el proyecto de prueba `restaurantos-prueba`)

| Pieza | Estado |
|---|---|
| `resti-brain` v3 (cerebro: adaptador de IA + memoria de 6 turnos) | desplegada |
| `resti-voz` v1 (Gemini oye y habla) | desplegada, **sin clave de Gemini** → el cliente usa la voz del navegador |
| `platform_secrets`: `ai_proveedor=compatible`, `ai_url_base=https://api.deepseek.com`, `ai_modelo=deepseek-flash`, `ai_api_key` | cargado |
| Resti encendido (`resti_agent`) | solo para "Prueba A" (admin `admin-a@prueba.test`) |
| `pg_net` (esquema `extensions`) | instalado en el proyecto de prueba para poder llamar funciones desde SQL |
| `ai-diag` | retirada: ahora responde 410 |

Producción (`RestaurantOs`) **no se tocó**.

## Funciones de texto migradas al adaptador (en el repo; **no desplegadas** en ningún proyecto)

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
2. **Voz real de Gemini** (transcribir y hablar): falta `gemini_api_key` en el proyecto de prueba. Los nombres de los modelos de voz (`gemini-2.5-flash`, `gemini-2.5-flash-preview-tts`) son los que conozco; se pueden cambiar sin código con `voz_modelo_stt`, `voz_modelo_tts` y `voz_nombre` en `platform_secrets`. Google indica que los modelos 2.5 se restringen para proyectos nuevos.
3. **Resti dentro de la app real** con sesión de administrador (hace falta un despliegue del front apuntando a la base de prueba).
4. **FPS y fluidez en dispositivos reales**: todo se midió con renderizado por software.
5. **Navegadores**: Safari/iOS y Firefox (el reconocimiento de voz del navegador no existe en Firefox; la voz de Gemini sí funciona allí).
6. **Latencia de la conversación**: estimada en 3–4 s por turno (oír ≈ 1 s + pensar ≈ 1 s + hablar ≈ 1,5 s). Sin streaming no es instantánea.

## Configuración (`platform_secrets`)

| Clave | Para qué |
|---|---|
| `ai_proveedor` | `compatible` = DeepSeek u otro estilo OpenAI; otro valor = Gemini |
| `ai_url_base`, `ai_modelo`, `ai_api_key` | proveedor de texto (cerebro de Resti) |
| `gemini_api_key` | voz (oír y hablar) y, mientras `voice-parse` siga en Gemini, comandos de voz |
| `voz_modelo_stt`, `voz_modelo_tts`, `voz_nombre` | opcionales: modelos y voz de Gemini |

Volver a Gemini para el cerebro: borrar `ai_proveedor` (o ponerlo distinto de `compatible`). No hace falta redesplegar.

## Para llevarlo a producción (cuando lo apruebes)

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
