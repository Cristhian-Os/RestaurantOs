# Fase 0 — Brechas del rediseño (Guía Maestra v2)

Fecha: 2026-11-06. Solo lectura: no se modificó código. Complementa `FASE0_AUDITORIA.md` (arquitectura, duplicaciones, riesgos), que sigue vigente salvo donde se indica abajo.

**Autoridad:** la Guía Maestra (`Rediseño RestaurantOS/RestaurantOS_Documento_Unico_Maestro_Claude_Code_v2.docx`) manda sobre la dirección visual. Reemplaza el sistema cálido (terracota) y la fuente Fraunces anteriores. Orden de conflicto de la guía: seguridad/RLS → SPEC_MAESTRO → código real → decisiones APROBADO → referencias conceptuales.

## 1. Estado técnico base (verificado)

| Chequeo | Resultado |
|---|---|
| Repo / rama | `restaurantos-local`, rama `feat/resti-sprites-hd`, remoto `Cristhian-Os/restaurantos` |
| `npm run typecheck` | **Pasa sin errores.** El hallazgo anterior sobre `TS2307 voiceMatch` ya no aplica |
| `npm run build` | **Pasa** (exit 0, tardó ~15 min en esta máquina). Avisos de tamaño: `Dashboard` 1,17 MB, `vendor-antd` 916 KB, `xlsx` 486 KB |
| Pruebas | Sin Jest/Vitest; 18 archivos `*.test.ts` / `*.check.ts` sueltos |
| Tipografía actual | Outfit + Plus Jakarta Sans + Nunito + DM Sans (4 familias). **Inter no está cargada.** Fraunces nunca llegó al código |
| `src/components/ui/` | **No existe** (estaba planeado, no creado). El rediseño anterior solo llegó a los tokens `--w-*` |
| Pantalla actual (capturada, admin claro, simulador) | Cabecera superior + barra lateral de 84 px + tarjetas cálidas. No hay píldora flotante, ni panel Más, ni buscador global |

Costo de cambiar de dirección: bajo, porque casi no hay componentes nuevos construidos todavía. Sí hay ~688 usos de `--w-*` y ~375 de tokens viejos que migrar.

## 2. Matriz rol → módulos (de `NAV_BY_ROLE`, `Dashboard.tsx:109`)

| Módulo | Admin | Cajero | Mesero | Cocina | Cliente | Super admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Inicio (dashboard) | ✔ | | | | | |
| Pedidos | ✔ | ✔ | ✔ | | | |
| Mesas | ✔ | | ✔ | | | |
| Cocina | ✔ | | | ✔ | | |
| Caja | ✔ | ✔ | | | | |
| Tareas | ✔ | ✔ | ✔ | | | |
| Mis turnos | | ✔ | ✔ | ✔ | | |
| Inventario / Analytics / Equipo / Menú | ✔ | | | | | |
| Gestión menú | ✔ | ✔ | | | | |
| Listas y opciones | ✔ | | | | | |
| Proveedores | ✔ (edita) | ✔ (solo pide) | | | | |
| Facturas | ✔ | ✔ | | | | |
| Opinión | ✔ | ✔ | ✔ | ✔ | | |
| Impresión / Config. guiada / Marca / Suscripción | ✔ | | | | | |
| Menú público | | | | | ✔ | |
| Panel de plataforma (2FA) | | | | | | ✔ |

Coincide con la guía: 4 roles operativos, sin Gerente (`super_admin` y `client` son roles técnicos, no operativos).

**Riesgo de permisos:** solo `facturas`, `opinion`, `impresion`, `setup`, `platform`, `dashboard` y `proveedores (canEdit)` revalidan el rol dentro del `switch`. El resto depende de que el menú no los ofrezca. La seguridad real está en RLS. Con enrutamiento real (URL por pantalla) hay que agregar guardia por ruta.

## 3. Referencias recibidas (36 imágenes + 1 documento)

Todas vistas. Cubren: Dashboard (escritorio, móvil, panel Más), Ventas, Pedidos, Mesas, Cocina (PC/TV/móvil), Caja, Menú, agregar/editar plato, Equipo, Tareas, Proveedores (lista, detalle, solicitar insumos), Facturas (ventas, gastos, escáner IA), Analytics, Auditoría antifraude, y Configuración completa (Datos del restaurante, Operación, Turnos y jornadas, Propinas y servicios, Notificaciones ×4, Dispositivos e impresión ×3).

**Sin referencia:** Inventario, Integraciones, QR, Ayuda, Opinión, Mis turnos del personal, Landing (solo storyboard textual), estados vacío/error/offline, flujo de login.

**Incoherencias dentro de las referencias** (por eso mandan el documento y el código, no el pixel):
- Dos logos: unas láminas usan el logo oficial (gorro negro + cubiertos + engranaje); otras (Configuración, Notificaciones, Turnos, Pedidos, Mesas, Ventas) un gorro naranja simplificado. El segundo **no** es el oficial: no copiarlo.
- Barra lateral con ítems distintos entre láminas ("Reportes", "Ventas", "Personalidad" en el primer nivel). La guía dice: navegación flotante; Personalidad dentro de Configuración.
- Una lámina de Mesas/Pedidos muestra "TU LOGO AQUÍ" en el sidebar: es placeholder de personalización por restaurante.
- Datos de ejemplo (Ana Torres, $8.540.000, Hamburguesa Clásica, etc.): no copiar.

## 4. Matriz de brechas por módulo

Leyenda: ✅ existe y cubre · 🟡 existe, falta rediseño o parte · 🔴 ausente · ⚠️ verificar antes de diseñar.

| Módulo (referencia) | Código actual | Estado | Notas / decisión |
|---|---|---|---|
| Shell: píldora flotante + panel Más + buscador | Cabecera + barra lateral 84 px + drawer móvil | 🔴 | Fase 1–2. Panel Más agrupa: Operación, Administración, Menú y productos, Análisis y servicio, Configuración, Herramientas |
| Resti flotante | `resti/Resti`, apagado por defecto | 🟡 | Ya es botón flotante (último commit). Solo ajustar a nuevo shell |
| Dashboard + widgets por usuario/rol | `AdminDashboard` fijo, 6 tarjetas | 🔴 | Catálogo de widgets, plantillas por rol y guardado de layout no existen. Backend nuevo (tablas) → pedir autorización |
| Ventas (módulo propio) | No existe. Hay `SalesHistory` en Caja y `analytics` | 🔴 ⚠️ | Decidir si es módulo nuevo o vista dentro de Analytics/Caja |
| Pedidos | `orders/OrderFlow` (1.045 l.) | 🟡 | Solo capa visual; la referencia añade "prioridad" (Alta/Media/Baja): ⚠️ no existe en el flujo, no inventar |
| Mesas | `tables/TableMap` | ⚠️ | La guía exige plano real (zonas, posición, forma, tamaño). Verificar si el modelo guarda posición/forma |
| Cocina PC/TV/móvil | `KitchenBoard` + `public/kitchen-tv.html` (CSS aparte) | 🟡 | Ticker inferior sólido sin degradado; sin navegación global. La referencia añade columna "En espera": ⚠️ verificar estados reales |
| Caja | `CashierPanel` (1.843 l.) | 🟡 | Riesgo alto: solo capa visual. ⚠️ Verificar transferir/dividir/unir cuentas para Cajero |
| Menú / agregar-editar plato | `MenuManager` (1.649 l.), `MenuAvailability` | 🟡 | Confirmar campos reales |
| Equipo (perfil, roles y permisos) | `TeamManager`, `ScheduleCalendar`, `MyShifts` | 🟡 ⚠️ | La referencia muestra editor de permisos por rol con casillas: ⚠️ verificar si existe o es propuesta |
| Facturas (ventas + gastos con IA) | `Facturas`, `cashier/GastosDesglose`, foto + IA | 🟡 | Registro interno; no DIAN. Impresión se consolida aquí sin duplicar motor |
| Auditoría antifraude | No encontrada como módulo | 🔴 ⚠️ | Verificar si hay eventos/trazabilidad en backend antes de diseñar |
| Analytics | `BusinessAssistant`, `ResumenIA` | 🟡 | Duplicación ya registrada |
| Tareas | `tasks/*` | ✅ → 🟡 | Rediseño visual |
| Proveedores + solicitar insumos (5 pasos) | `cashier/Proveedores` | 🟡 ⚠️ | Verificar flujo de pedido a proveedor real |
| Inventario | `inventory/*` | 🟡 | Sin referencia: diseñar tras auditar |
| Configuración (hub + submódulos) | Dispersa: `branding`, `billing`, `setup`, `print`, `menu_listas` | 🔴 | Hub nuevo: Datos del restaurante, Operación, Notificaciones, Dispositivos e impresión, Integraciones, Personalidad |
| Datos del restaurante | `BrandingManager` + `SetupWizard` | 🟡 | Campos razón social, NIT, dirección: ⚠️ verificar |
| Turnos y jornadas | `ScheduleCalendar`, `MyShifts`, `ShiftCheckinsReview` | 🟡 | Calendario mes/semana/día y "cobertura": ⚠️ verificar |
| Propinas y servicios | Lógica de propina en `CashierPanel`, `SplitPayModal`, `SalesHistory`; config en `BrandingManager` | 🟡 ⚠️ | Distribución por empleado, cargos adicionales y reglas automáticas: probablemente **no existen**. Propuesta pendiente hasta confirmar reglas legales |
| Notificaciones (canales/eventos/plantillas/avanzadas) | Solo push, sonidos, `WaiterNotifications` | 🔴 ⚠️ | Email/WhatsApp/SMS **no confirmados** como integraciones. No mostrarlos como activos |
| Dispositivos e impresión | `print/ImpresionConfig`, `EstacionImpresion`, `lib/print/*` | 🟡 | Reutilizar; sin probar con impresora real |
| Integraciones | No existe | 🔴 | Sin referencia |
| Llamar mesero por QR + escalar a TV | ⚠️ No verificado | ⚠️ | Revisar menú público y realtime |
| Satisfacción del cliente | `feedback/OpinionSection`, función `feedback-resumen` | 🟡 | Existe parcial |
| Landing | `pages/Landing` | 🟡 | Al final, con capturas reales |
| Inter + tokens claro/oscuro nativos | 4 fuentes, 2 sistemas de tokens, 881 hex sueltos, 30+ parches `!important` oscuro | 🔴 | Fase 1 |

## 5. Pendientes que necesito de ti (bloquean partes concretas)

1. **Logo oficial:** confirmar cuál archivo es (`public/logo.png`, `public/logo.jpg` o `Escritorio/Logo RestaurantOS.jpg`). La guía prohíbe redibujarlo y las referencias traen dos versiones.
2. **Paleta neutra** (#101010, #171717, #FAFAF8, #F1F1EF, #777777): propuesta, sin aprobar. La validaré con contraste AA en la Fase 1 y te mostraré una muestra del Design System antes de extenderla.
3. **Color de marca por restaurante** (`applyBranding`): la guía protege la identidad central. Definir qué sí puede personalizar un restaurante (¿solo logo y portada del menú QR?).
4. **Módulo Ventas:** ¿nuevo o vista de Analytics/Caja?
5. **Notificaciones, Propinas y Auditoría antifraude:** son las referencias más lejos del producto real. Propongo diseñar solo lo que el código ya soporta y dejar el resto documentado como propuesta.

## 6. Capturas

Hecha una captura de baseline (admin, claro, escritorio, simulador). Faltan las del resto de módulos. Siguiendo el protocolo por módulo de la guía (§18), cada módulo se captura antes de tocarlo, en escritorio/móvil y claro/oscuro, y Cocina además en TV.
