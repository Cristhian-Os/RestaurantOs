# FASE 0: Auditoría de RestaurantOS (solo lectura)

Fecha: 2026-11-06. Proyecto: `restaurantos-local`. Esta auditoría no modificó código ni expuso credenciales. Solo se verificó que existen las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` y que `.env.local` no está en git.

**Nota sobre CLAUDE.md:** el proyecto no tenía `CLAUDE.md`. La fuente de reglas es `docs/SPEC_MAESTRO_COMPLETO.md` (1.899 líneas, anexos A–J) y `docs/AUDITORIA.md`. El `CLAUDE.md` global solo tiene la regla de graphify.

---

## 1. Arquitectura actual

| Capa | Tecnología |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript, ~29.000 líneas en `src/` |
| UI | Tailwind 3 + antd 5 (importado por componente) + framer-motion + **2.114 estilos inline** contra 1.460 `className` |
| Datos | Supabase: Postgres con RLS, Realtime (17 canales), Storage, 11 Edge Functions |
| Estado | `useState` local casi en todo; React Query solo en 6 archivos |
| PWA | `public/sw.js` (caché `ros-v22`, offline real), `offlineService` (IndexedDB), `paymentQueue`, `public/kitchen-tv.html` aparte (1.318 líneas) |
| Pagos | Wompi (`wompi-init`, `wompi-charge`, `wompi-subscribe`, `wompi-webhook`), cobro real apagado |
| IA | Gemini en `chat-support`, `voice-parse`, `ai-report`, `resti-brain`, `menu-asistente`, `feedback-resumen` |
| Deploy | Vercel; CSP y cabeceras de seguridad en `vercel.json` |
| Pruebas | 18 archivos `*.test.ts` / `*.check.ts` sueltos (no hay Jest ni Vitest) |

### Navegación actual
- `src/App.tsx` decide por `window.location.pathname` (sin react-router). Rutas: `/menu`, `/registro`, `/login`, `/terminos`, `/privacidad`, `/reset-password`. Con sesión siempre carga `Dashboard` (lazy).
- `src/pages/Dashboard.tsx` (728 líneas) es el centro de todo: un único estado `activeNav` y un `switch` de 21 vistas. **No hay URL por pantalla**, ni botón atrás, ni deep links.
- Drawer en celular; barra lateral de 84 px desde 1024 px de ancho.
- Tipos `Role` (`super_admin | admin | waiter | kitchen | cashier | client`) y `NavView` están declarados en `Dashboard.tsx`.

### Permisos
- `NAV_BY_ROLE` en `Dashboard.tsx:109` define el menú por rol.
- Algunas vistas verifican el rol de nuevo dentro del `switch` (`facturas`, `opinion`, `impresion`, `setup`, `platform`); otras no (`branding`, `billing`, `menu_gestion`, `proveedores`, `tasks`) y dependen de que el menú no las ofrezca.
- La seguridad real está en RLS y en funciones `SECURITY DEFINER` del servidor; el cliente solo oculta.
- Panel de plataforma detrás de `MfaGate` (2FA TOTP).

---

## 2. Inventario de módulos

| Módulo | Archivos clave | Roles |
|---|---|---|
| Pedidos | `orders/OrderFlow` (1.045 l.), `EditOrderModal`, `OptionGroupsV2`, `OrderSoundAlerts`, `WaiterNotifications` | admin, mesero, cajero |
| Mesas | `tables/TableMap` (473) | admin, mesero |
| Cocina y TV | `kitchen/KitchenBoard` (649, modo TV), `public/kitchen-tv.html` | admin, cocina |
| Caja | `cashier/CashierPanel` (**1.843**), `SplitPayModal`, `PagosDelDia`, `GastosDesglose`, `SalesHistory`, `Facturas`, `Proveedores`, `CategoriasGastoEditor` | admin, cajero |
| Menú | `menu/MenuManager` (**1.649**), `MenuAvailability`, `OptionListsManager/Section`, `DishGroupsEditor`, `VoiceMenuModal`, `CartaAsistente` | admin; cajero solo "Gestión menú" |
| Menú público | `pages/PublicMenu` (**1.993**): carrito, reseñas, comentarios, platos personalizados | cliente anónimo |
| Inventario | `inventory/IngredientesManager`, `ShoppingList`, `recipes/RecipeBuilder` | admin |
| Equipo | `team/TeamManager` (689), `ScheduleCalendar`, `MyShifts`, `ShiftCheckinsReview`, `CameraCapture` | admin; turnos para todos |
| Tareas | `tasks/AdminTasksView` (636), `EmployeeTasksView`, `EvidenceUpload`, `useRealtimeTasks` | admin y empleados |
| Analytics | `pages/BusinessAssistant` (matriz BCG), `analytics/ResumenIA` | admin |
| Marca y plan | `branding/BrandingManager`, `billing/SubscriptionPanel`, `SubscriptionBanner` | admin |
| Impresión | `print/ImpresionConfig`, `EstacionImpresion`, `TicketModal`, `lib/print/*` (con tests) | admin y cajero |
| Voz | `VoiceCommandModal`, `VoiceCommandFab`, `VoiceButton`, `TranscriptEditor`, `services/voice*` | admin y cajero |
| Resti (asistente IA) | `resti/Resti`, `RestiSprite`, `onboarding/RestiGuia`, `lib/resti/*` | admin; apagado por defecto |
| Opinión y soporte | `SupportChat`, `feedback/OpinionSection` | todos menos cliente |
| Onboarding | `onboarding/SetupWizard` (626), `ConfiguracionGuiada` | admin nuevo |
| Plataforma | 14 componentes en `components/platform/` (PlatformPanel, VendedoresPanel, PagosVendedores, DineroPanel, RendimientoPanel, PlantillasManager, OpcionesRestaurantes, etc.) | super_admin |
| Público | `Landing`, `Login`, `Signup`, `Legal`, `ResetPassword` | anónimo |
| PWA | `pwa/InstallPWA` (570), `QRPrintManager` | admin |

---

## 3. Funcionalidades que se deben conservar (todo lo que está en producción)

Orden de criticidad:
1. **Dinero:** `cobrar_orden`, pagos divididos (`order_payments`), gastos por origen, corte de caja con hora de Colombia, Rappi fuera de la ganancia, base de caja.
2. **Flujo de pedido:** crear, editar ítems con opciones, número secuencial del día, estado público del pedido.
3. **Cocina y TV:** flujo en vivo, clave de TV por restaurante.
4. **Sonidos por tipo de pedido, push y cola offline** (pedidos y pagos sin internet).
5. **Seguridad:** RLS por `restaurant_id`, 2FA del superadmin, cambio forzado de contraseña, CSP.
6. **Motor de opciones y 17 plantillas** (hoy encendido solo en Sabor encantado).
7. **Panel de plataforma:** vendedores, comisiones, pagos, Dinero y Rendimiento.
8. **Facturas con foto, impresión** (sin probar con impresora real) **y Resti** con sus módulos.
9. **Voz editable** (comandos y menú por voz).

**Cholaos Dany es producción real.** Cualquier cambio visual se prueba en Demo o con el simulador `.claude/qa-mock` (config `restaurantos-qa-mock`), nunca en su cuenta.

---

## 4. Componentes y piezas reutilizables

- `contexts/ThemeContext` (claro/oscuro sincronizado con `restaurant_config`) y `BrandingManager.applyBranding`.
- Clases CSS en `src/index.css`: `.lg` (liquid glass), `.ed-display`, `.ed-kicker`, `.ed-body`, `.w-lift`, `.w-press`, `.w-rise/.w-fade/.w-scale`, `.menu-grid`.
- `platform/platformUi.tsx`: `cop`, `fechaCorta`, `Modal`, `Campo`, estilos de campo/botón/tarjeta (usa tokens viejos mezclados).
- `lib/cn.ts`.
- `DishCard`, `CategoryIcon`, `ScrollReveal`, `VoiceButton`, `TranscriptEditor`.
- `lib/print/*` (modelo, render, PDF): bien separado y con tests.
- `lib/resti/*`, `services/*`, `hooks/useBusinessMetrics`.

---

## 5. Navegación, permisos, temas y responsive

### Temas (hallazgo principal)
Conviven **dos sistemas de tokens**:
- Viejos (`--bg`, `--bg-surface`, `--text-primary/secondary/muted`, `--accent`, `--shadow-out*`, `--shadow-in*`): ~375 usos. Alias en `tailwind.config.js` bajo `neo.*`.
- Nuevos (`--w-bg`, `--w-surface`, `--w-ink*`, `--w-terra*`, `--w-olive`, `--w-saffron`, `--w-wine`, `--w-line`, `--w-shadow-*`, fuentes `--w-display`/`--w-sans`): ~688 usos.
- Además: **881 colores hex escritos a mano**; la `safelist` de Tailwind aún lista colores y clases neumórficas (`neo-card`, `shadow-neo-*`); `index.css` (794 líneas) tiene más de 30 parches `[data-theme="dark"] … !important` que pisan clases de Tailwind y antd.
- El interruptor de modo oscuro solo aparece para el rol admin.
- `applyBranding` aplica el color primario del restaurante: puede chocar con tokens fijos del rediseño.

### Responsive
- Un breakpoint en JS (`innerWidth < 900` en `Dashboard`) más CSS en 640/1024 px.
- Cada módulo mide el ancho a su manera: `KitchenBoard` (`TV_MIN_WIDTH`), `MarcaConVistaPrevia`, `Dashboard`. No hay sistema único de breakpoints.
- Cocina tiene modo TV; `PublicMenu` y `Landing` están pensados para celular. `html { font-size: 112.5% }` agranda todo en rem; los px fijos no escalan.

---

## 6. Duplicaciones detectadas

| Duplicación | Evidencia |
|---|---|
| Formato de moneda COP | ≥10 definiciones locales (`fmt`, `fmtCOP`, `cop`) en `CashierPanel`, `GastosDesglose`, `PagosDelDia`, `SalesHistory`, `SplitPayModal`, `CustomDishBuilder`, `IngredientesManager`, `ShoppingList`, `ResumenIA`, `platformUi`, `PublicMenu` (`fmtCOP`); 28 archivos usan `toLocaleString('es-CO')`. Bloquea también el pendiente de moneda multi-país (~65 usos en 14 archivos). |
| `DishCard` y `CustomizeModal` | `components/DishCard.tsx` y un `DishCard` propio dentro de `PublicMenu.tsx`. |
| Modales/sheets | 21 archivos con `position: fixed` a mano, `Modal` de `platformUi`, `antd/Modal`. Sin componente común. |
| Navegación | Menú móvil y barra lateral repiten el bloque de insignias (3 veces cada uno). |
| Contadores | Stock, reseñas y opiniones se calculan en `Dashboard` con 3 `useEffect` casi idénticos. |
| Opciones de menú | Modelo viejo (`DishOptionGroup`, `buildOptions` con sabores de helado) y nuevo (`OptionLists`, `services/menuOptions.ts`) conviven por interruptor por restaurante. |
| Analytics | `BusinessAssistant` (BCG) y `ResumenIA` cubren zonas parecidas. |
| SQL | 12 `schema_*.sql` en la raíz más 67 migraciones en `supabase/migrations/`; los de la raíz son anteriores y probablemente obsoletos. |
| Copias del proyecto | Existen `restaurantos` (vieja, no tocar) y `restaurantos-local` (la buena, sincronizada con GitHub). |

---

## 7. Problemas técnicos y dependencias

- **Archivos monstruo:** `PublicMenu` (1.993), `CashierPanel` (1.843), `MenuManager` (1.649), `OrderFlow` (1.045). Difíciles de rediseñar sin tocar el flujo de dinero.
- **Estilos inline** (2.114) no responden a media queries; un rediseño por tokens toca miles de líneas.
- **Acoplamiento:** 52 componentes llaman a `supabase.from`/`rpc` directamente; no hay capa de datos.
- **Dashboard sin lazy interno a propósito** (evita el error de React #300): bundle del panel grande.
- **Sin rutas reales:** impide deep links, botón atrás y dividir el código por módulo.
- **Dependencias:** `xlsx` viene de un CDN (`cdn.sheetjs.com`), no de npm; `antd` pesa mucho y se usa en pocos componentes (`message` 44 veces, `Tabs`, `Modal`, `Table`, `Select`, etc.); no están instalados `class-variance-authority` ni `clsx` (el spec pide patrones CVA/Cult UI).
- **Calidad:** 18 usos de `any`; 29 `console.*` (`drop_console` en terser los elimina en build).
- **`npx tsc --noEmit` reporta errores `TS2307` por `voiceMatch`** en `CashierPanel`, `VoiceMenuModal`, `RecipeBuilder`, `AdminTasksView` y `voiceCommands.ts` (el archivo `src/services/voiceMatch.ts` sí existe; `voiceCommands.ts` lo importa con extensión `.ts`). No verifiqué si ya fallaba antes de mis archivos nuevos; esos archivos no los toqué. Falta revisar el resto de la lista de errores y si `npm run build` los ignora.
- **Seguridad (de `SECURITY.md`/`AUDITORIA.md`):** 30 funciones `SECURITY DEFINER` accesibles por `anon` y 69 por `authenticated` (validan rol y restaurante por dentro); protección de contraseñas filtradas apagada (requiere plan Pro); `pg_net` en `public`; sin copias automáticas (plan Free).
- **Higiene:** `.claude/` está en `.gitignore` (el simulador QA no va en el repo); hay 2 JPG modificados sin guardar en `docs/whatsapp/`; la migración `20260928195300_fix_cancelar_orden_editar_pedido_cliente_security.sql` solo existe en disco y no debe subirse.
- **Textos legales** (`Legal.tsx`) desactualizados (7 vs 14 días de prueba, planes viejos).

---

## 8. Riesgos de implementación

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Tocar `CashierPanel`/`OrderFlow` y alterar dinero o corte | 🔴 Alto | Cambiar solo la capa visual; mantener las pruebas de caracterización en verde |
| Probar en Cholaos Dany (producción real) | 🔴 Alto | Demo o `qa-mock` |
| Mezclar los dos sistemas de tokens a medias | 🟡 Medio | Migrar pantalla por pantalla, completa |
| `!important` del modo oscuro que pisan estilos nuevos | 🟡 Medio | Quitar parches al migrar cada pantalla |
| Colisión del color de marca del restaurante con el diseño | 🟡 Medio | Definir qué tokens son personalizables |
| Cocina/TV (`kitchen-tv.html`) tiene su propio CSS | 🟡 Medio | Etapa propia |
| PWA con caché agresivo (`ros-v22`) | 🟡 Medio | Subir versión de caché en cada despliegue visual |
| Sin pruebas automáticas de UI | 🟡 Medio | Verificación visual con el simulador |
| Falta de rutas | 🟢 Bajo | Etapa de enrutamiento |

---

## 9. Plan recomendado de rediseño por etapas

Decisiones ya tomadas por Cristhian: continuar con el sistema cálido/liquid glass con `--w-*` como único sistema de tokens, y **enrutamiento real (URL por pantalla)**.

| Etapa | Contenido | Riesgo |
|---|---|---|
| 0. Cimientos | Tokens `--w-*` únicos; `formatCOP` único; componentes base `Button`, `Badge`, `Modal`, `Sheet` en `components/ui/`; sin cambiar pantallas | Bajo |
| 1. Cáscara | Header, drawer y barra lateral de `Dashboard`; extraer `NavItem` con insignias | Medio |
| 2. Enrutamiento | URL por pantalla, botón atrás, deep links, división de código por módulo; las rutas respetan `NAV_BY_ROLE` | Medio |
| 3. Baja criticidad | Landing, Login, Signup, Legal, Inicio del admin, Equipo, Tareas, Marca, Suscripción | Bajo |
| 4. Menú y catálogo | `MenuManager` (partir en subcomponentes), listas y opciones, inventario, recetas, proveedores | Medio |
| 5. Operación en vivo | `OrderFlow`, `TableMap`, `KitchenBoard` + `kitchen-tv.html` (probar en Demo) | Alto |
| 6. Caja y dinero | `CashierPanel`, `SplitPayModal` (solo capa visual, con pruebas de caracterización) | Alto |
| 7. Plataforma | Panel super_admin (ya tiene `platformUi`) | Bajo |
| 8. Limpieza | Quitar parches `!important`, `safelist` neumórfica, `schema_*.sql` obsoletos y modelo viejo de opciones (tras migrar Cholaos) | Medio |

Cada etapa termina con un commit, verificación visual en celular y escritorio (claro y oscuro) y una parada para revisión de Cristhian.

---

## 10. Reglas del proyecto que cualquier IA debe respetar

- Trabajar solo en `restaurantos-local`.
- Base de datos: solo migraciones versionadas probadas antes en el proyecto de prueba; nada en producción sin aprobación y copia previa; nunca SQL destructivo sin permiso.
- `CREATE OR REPLACE FUNCTION` con parámetros nuevos crea un overload duplicado: borrar el viejo explícitamente.
- "Hoy" de caja con `hoy_local()` (America/Bogota), nunca `CURRENT_DATE`.
- Secretos nunca en código, commits ni informes.
- Un commit por paso; no commitear código que no compile; sin `console.log`.
- Reportar a Cristhian en español sencillo, corto y sin jerga.
