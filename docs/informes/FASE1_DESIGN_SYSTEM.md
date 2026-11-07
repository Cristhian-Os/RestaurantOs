# Fase 1 — Design System (entregable para aprobación)

Fecha: 2026-11-06. Base: Guía Maestra v2. Sin commit todavía.

## Qué se hizo
- **Inter local** (`@fontsource-variable/inter`, solo latín y latín extendido), sin Google Fonts: funciona sin internet. `src/styles/fonts.css`. Las fuentes viejas (Nunito, Plus Jakarta Sans, Outfit, DM Sans) quedaron como alias temporales que apuntan a Inter, para que las pantallas sin migrar no cambien de fuente a medias. Se borran al migrar cada módulo.
- **Tokens únicos** en `src/styles/tokens.css`: color claro/oscuro, texto, bordes, estados, sombras, vidrio, tipografía, espaciado 4 px, radios, tamaño táctil 44 px, movimiento, capas, foco visible y `prefers-reduced-motion`. Los nombres viejos (`--w-ink`, `--w-terra`, `--bg`, `--accent`…) ahora son alias de los nuevos.
- **Componentes base** en `src/components/ui/`: `Button`, `Badge`, `Card` + `GlassPanel`, `Input`/`Textarea`/`Select`, `Toggle`, `Tabs`, `Modal` (hoja inferior en móvil), `StatePanel` (cargando, vacío, error, sin permiso, sin conexión, sincronizando, guardado).
- **Muestra** en `/design-system` (solo en desarrollo; no existe en producción).
- **Validación de contraste** con `npm run check:contrast`: 38 pares (claro y oscuro) cumplen WCAG AA.
- Ajustes: antd usa #FF5A00 e Inter; `index.html` y `manifest.json` ya no fuerzan el beige ni el verde viejos.

## Hallazgos de contraste (decisiones tomadas)
| Tema | Guía | Resultado | Lo adoptado |
|---|---|---|---|
| Gris medio #777777 | texto tenue | 4,3:1 sobre #FAFAF8 → no cumple AA | `--w-text-3` = #6B6B66 (5,1:1) |
| Texto blanco sobre #FF5A00 | referencias | 3,1:1 → no cumple AA | Texto **oscuro** #101010 (6,1:1). **Pendiente tu decisión** |
| Naranja como texto sobre claro | enlaces | #FF5A00 = 3,0:1 | `--w-accent-text` = #B83F00 (5,4:1) |

## Decidido
Botón naranja con texto blanco, igual que las láminas. Riesgo conocido: contraste 3,1:1 (bajo AA para texto normal); por eso el texto del botón va siempre en negrita.

## Pendientes conocidos (no son de esta fase)
- ~881 colores hex y ~2.100 estilos inline siguen en las pantallas: se migran módulo por módulo.
- `applyBranding` aún pisa `--accent` con el color del restaurante; falta decidir qué personaliza cada restaurante.
- Landing conserva manchas difusas decorativas (la guía las descarta); se rehace al final.
- `public/kitchen-tv.html` tiene CSS propio: Fase 3.
- La PWA cachea con `ros-v22`: subir la versión al desplegar el rediseño.

## Verificación
- `npm run typecheck` ✔ · `npm run check:contrast` ✔ · muestra revisada en claro y oscuro, diálogo cierra con Esc, Inter carga en local, Landing sigue renderizando.
- No verificado: build completo (la máquina tiene 3,4 GB de RAM y el build tarda ~15 min), móvil (375 px) de la muestra, simulador QA (falla por bloqueo de archivos de Windows en su caché).
