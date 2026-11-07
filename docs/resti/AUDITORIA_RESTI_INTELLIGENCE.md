# Resti Intelligence — Fase 1: auditoría

Fecha: 2026-10-22 · Rama: `claude/new-session-0vekub` · Base: commit `50165cd`.
Prompt de origen: `docs/resti/PROMPT_MAESTRO_RESTI_INTELLIGENCE.md`. Referencias visuales: `docs/resti/reference/`.

Etiquetas: **[Verificado]** lo comprobé en el repo o ejecutándolo; **[Inferido]** deducción; **[Pendiente]** no comprobado.

## 1. Lo que el prompt asume y no es cierto

| Supuesto del prompt | Realidad |
|---|---|
| "Audita si existe DeepSeek" | **[Verificado]** No existe. Todo el stack de IA usa **Gemini** (`gemini-2.5-flash`) vía clave en `platform_secrets`: `resti-brain`, `chat-support`, `menu-asistente`, `ai-report`, `voice-parse`, `feedback-resumen`. |
| "Audita si existe Chatterbox" | **[Verificado]** No existe. La voz es `SpeechRecognition` + `speechSynthesis` del navegador (`src/hooks/useRestiVoice.ts`). |
| Modelo 3D / three.js | **[Verificado]** No hay modelo GLB ni `three` en `package.json`. Resti es un **sprite 2.5D** (5 `.webp` en `public/assets/resti/`: gorro + 4 poses) animado con CSS/transform. |
| Imágenes en `public/resti/reference/` | **[Verificado]** No existían. Las guardé en `docs/resti/reference/` (no en `public/`, porque `public/` se despliega: ~5 MB de PNG de referencia viajarían a producción). |
| "Empezar de cero" | **[Verificado]** Ya hay un Resti funcional (módulos B–F del informe `docs/informes/RESTI_IA_ENTREGA.md`). Hay que **extenderlo**, no sustituirlo. |

## 2. Qué existe hoy (reutilizable)

- **Presencia/UI**: `src/components/resti/Resti.tsx` (225 líneas) + `RestiSprite.tsx`. Estados `HAT → SUMMONING → IDLE/LISTENING/THINKING/WALKING/POINTING/SPEAKING`. Respeta `prefers-reduced-motion`. No corre nada en reposo. Montado en `Dashboard.tsx:714`, oculto en caja/cocina/orders/billing/plataforma.
- **Interruptor por restaurante**: `modules_enabled.resti_agent` (apagado por defecto) — migración `20261022004716_interruptor_resti`.
- **Lista blanca de objetivos**: 9 `data-resti-target` (`src/lib/resti/targets.ts`, copia en `supabase/functions/resti-brain/brain.ts`; `npm run check:resti` forma parte del build y verifica que ninguno sea un botón destructivo). 8 existen en el DOM; `btn-notificaciones` no (documentado).
- **Cerebro**: Edge Function `resti-brain`. Seguridad ya buena **[Verificado]**: usuario/rol/restaurante salen del JWT (no del cliente), solo rol `admin`, `check_rate_limit` (20/10 min, 80/día), métricas leídas con el JWT del usuario (RLS decide), salida JSON con esquema y enum, validador que descarta respuestas inválidas, el texto del usuario se trata como dato, timeout 9 s, fallos → mensaje amable sin romper la app.
- **Acciones**: Resti **solo navega**. Los cambios de datos pasan por el modal de comandos de voz (`voice-parse`, antes → después + aprobación humana).
- **Sugerencias**: guarda ideas en `feedback_items` con restaurante/usuario de la sesión.
- **Pruebas**: `node src/lib/resti/*.test.ts` (OK), `supabase/functions/resti-brain/*.test.ts` (Deno), `supabase/tests/interruptor_resti.sql`.
- **Seguridad de plataforma**: RLS + funciones `SECURITY DEFINER` con validación de rol/restaurante, 2FA para superadmin (`SECURITY.md`).

## 3. Brechas frente al prompt maestro

| Área del prompt | Estado | Brecha |
|---|---|---|
| Herramientas con permisos/tenant/confirmación (§5B, §7) | **Parcial** | Solo existe "navegar" + "abrir comandos de voz". No hay catálogo de herramientas de lectura (ventas, inventario, gastos, clientes…) ni motor de políticas generalizado. El único dato que ve el modelo es `get_admin_metrics` (ventas/pedidos de hoy). |
| Niveles de autonomía (§7) | **Ausente** | Hoy es un único nivel equivalente a "Asistente". |
| Confirmación ligada a parámetros | **Delegada** | La hace el modal de `voice-parse`; Resti no la gestiona. |
| Auditoría de acciones | **Ausente** para Resti | Solo `feedback_items`. |
| Proactividad (§8) | **Ausente** | No hay alertas (inventario bajo, pedidos retrasados…). |
| Configuración por restaurante (§9) | **Mínima** | Solo el interruptor on/off. Sin tono, voz, umbrales, horarios. |
| Voz (§6) | **Básica** | Voz del navegador. Sin Chatterbox. |
| Personaje 3D (§11) | **Ausente** | Sprites 2.5D de 4 poses. Sin GLB, sin skeleton, sin animaciones reales. Sin poses "explicar/ejecutar/escuchar" dedicadas. |
| Estados por color (§10) | **Ausente** | Hoja de personaje define verde/amarillo/rojo/azul; el código no los usa. |
| Observabilidad (§13) | **Ausente** | Sin métricas de Resti en el panel de plataforma. |
| Panel de texto (§12, §15) | **Parcial** | Hay caja de texto + globo de 2 líneas, sin historial de conversación ni panel. |
| Contexto conversacional (§6) | **Ausente** | Cada pregunta es independiente (sin historial enviado). |

## 4. Fidelidad visual: hallazgos sobre las referencias

- **[Verificado]** El prompt habla de "la imagen original del personaje", pero entre las imágenes recibidas hay: una fila de 6 poses (render 3D de arcilla blanca, emblema con icono power-engranaje), el gorro con anillo naranja luminoso, la lámina completa (poses, expresiones, estados, vistas frente/lado/espalda, detalles) y el emblema (gorro + tenedor/cuchillo cruzados + engranaje-power). No hay una imagen "original" única; tomo la **fila de poses + lámina** como fuente de verdad.
- **[Verificado]** El emblema del pecho en las referencias es un **engranaje con icono de encendido** (≠ el emblema gorro+cubiertos, que es el logo de marca). Hay que confirmar cuál debe ir en el pecho antes de integrar. No redibujaré ninguno.
- **[Inferido]** Los 5 `.webp` actuales vienen de una versión anterior del personaje; no verifiqué si coinciden con estas referencias. Revisión visual pendiente.
- El logo disponible es un JPG de ~720 px con fondo: sirve de referencia, no como asset final de calidad.

## 5. Línea base medida (antes de cambiar nada)

- `node src/lib/resti/resti.test.ts` → OK · `motivos.test.ts` → OK · `npm run check:resti` → OK.
- `tsc --noEmit`: únicos errores = módulo `xlsx` no instalable aquí (el CDN `cdn.sheetjs.com` devuelve 403 desde este proxy). **Es del entorno, no del código**; instalé el resto con `--no-package-lock` y restauré `package.json` y el lockfile (árbol limpio). `npm run build` completo **no pude ejecutarlo** por eso mismo.
- Deno/Supabase CLI no instalados: **las pruebas de Edge Functions y SQL no las ejecuté**. **[Pendiente]**

## 6. Riesgos

1. **Cambiar de proveedor a DeepSeek** reescribe 6 funciones y rompe lo ya probado/en producción; además DeepSeek implica enviar datos del restaurante a otro tercero (privacidad, política de datos). Ver decisión D1.
2. **Producción**: nada de la rama `feature/resti-ia` está confirmado como aplicado; cualquier migración nueva exige copia manual previa y el "apruebo" del dueño (informe de entrega).
3. **3D real**: ningún modelo con licencia clara y fiel a la referencia existe; generarlo cuesta créditos y la fidelidad no está garantizada (el modelo generado puede deformar el logo del pecho).
4. **Chatterbox** requiere GPU/servidor propio: coste e infraestructura nueva, sin equivalente en Vercel/Supabase Edge.

## 7. Plan propuesto (por valor/riesgo; reutiliza lo existente)

| Fase | Contenido | Riesgo | Depende de |
|---|---|---|---|
| 2a | Catálogo de herramientas **de solo lectura** (ventas, inventario bajo, gastos, pedidos retrasados) como RPC/consultas con JWT del usuario + registro de uso; el modelo solo elige herramienta + parámetros validados con zod | Bajo | — |
| 2b | Niveles de autonomía + tabla `resti_config` por restaurante (RLS por tenant) + auditoría | Medio (migración) | Aprobación para migrar |
| 3 | Panel de chat con historial acotado, estados por color, accesibilidad, ayuda de formularios sobre targets reales | Bajo | — |
| 4 | Capa de proveedor de IA intercambiable (Gemini hoy, DeepSeek opcional) + voz con interfaz para Chatterbox opcional | Medio | D1, D3 |
| 5 | Personaje: refrescar sprites a la referencia y/o GLB real con carga diferida | Alto | D2 |
| 6 | Alertas proactivas con `pg_cron`/eventos, deduplicación y límites | Medio | 2b |
| 7 | Métricas de Resti en panel de plataforma + pruebas | Bajo | 2a |

## 8. Decisiones que necesito del dueño

- **D1 — Proveedor de IA:** ¿mantener Gemini (recomendado, ya probado) o añadir DeepSeek? Nota: aún no hay `gemini_api_key` en el proyecto de prueba, así que ninguna respuesta real del modelo se ha probado.
- **D2 — Personaje:** ¿(a) refrescar los sprites 2.5D a la referencia nueva, o (b) generar un GLB 3D con herramienta de pago (Higgsfield `generate_3d`, consume créditos) y aceptar que el resultado se valide visualmente?
- **D3 — Voz:** ¿mantener voz del navegador o desplegar Chatterbox (requiere servidor con GPU y costo mensual)?
- **D4 — Emblema del pecho:** ¿engranaje-power (hoja de personaje) o gorro+cubiertos (logo de marca)? ¿Hay archivo vectorial/alta resolución?
