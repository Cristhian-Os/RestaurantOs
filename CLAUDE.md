# RestaurantOS (restaurantos-local)

Fuente de reglas: `docs/SPEC_MAESTRO_COMPLETO.md` (manda sobre este archivo si hay contradicción). Estado y decisiones: `docs/AUDITORIA.md`, `docs/informes/`.

## Usuario
Cristhian, emprendedor sin formación en programación. Reportar en español sencillo, corto y sin jerga. Si pides una prueba manual, di qué abrir, qué tocar y qué debe pasar.

## Reglas duras
- Trabajar SOLO en `restaurantos-local`. No tocar la carpeta vieja `restaurantos`.
- Cholaos Dany es producción real (`admin@heladeria.com` es su admin real). Probar en Demo o con el simulador (`.claude/qa-mock`, config `restaurantos-qa-mock`).
- Base de datos: solo migraciones versionadas en `supabase/migrations/`, probadas antes en el proyecto de prueba. Nada en producción sin "apruebo, aplica" de Cristhian y copia previa. Nunca SQL destructivo sin permiso.
- `CREATE OR REPLACE FUNCTION` con parámetros nuevos crea un overload duplicado: borrar el viejo explícitamente.
- "Hoy" de caja siempre con `hoy_local()` (America/Bogota), nunca `CURRENT_DATE`.
- Secretos: nunca en código, commits ni informes. `.env.local` no se versiona.
- Un commit por paso; no commitear código que no compile. No dejar `console.log`.
- No tocar lo que el paso no pide; lo extra va a "Pendientes descubiertos".

## Rediseño de UI (en curso)
- Fuente de dirección visual: Guía Maestra v2 (`Escritorio/Rediseño RestaurantOS/RestaurantOS_Documento_Unico_Maestro_Claude_Code_v2.docx` + 36 láminas). Manda sobre el diseño cálido/Fraunces/terracota anterior, que queda descartado. Brechas en `docs/informes/FASE0_BRECHAS_REDISENO.md`.
- **Las 36 láminas son el diseño EXACTO que Cristhian quiere ver (decisión suya, 2026-11-06).** Replicarlas fielmente (composición, color, textos, botón naranja con texto blanco). Solo se adapta lo que contradiga una función real del código, y se avisa. Datos de ejemplo de las láminas no se copian.
- Dirección: "Premium equilibrado", fuente Inter, naranja #FF5A00 con moderación, claro y oscuro nativos, navegación flotante inferior (píldora + panel Más de vidrio), Resti como botón flotante. Logo oficial: nunca redibujarlo. Sin DIAN, sin rol Gerente, sin módulo Impresión aparte.
- Trabajo por fases con aprobación de Cristhian entre fases; por módulo: capturar antes, cambios pequeños, capturar después. No inventar funciones, datos ni integraciones que el código no tenga.
- Sistema único de tokens: `--w-*` (valores nuevos según la guía). Los tokens viejos (`--bg`, `--text-*`, `--accent`, `--shadow-*`) se migran y no se usan en código nuevo.
- Componentes base nuevos en `src/components/ui/` (`Button`, `Badge`, `Modal`, `Sheet`) y formato de moneda en `src/lib/format.ts` (`formatCOP`). No definir `fmt` locales nuevos.
- Se migra pantalla por pantalla, completa, claro y oscuro, celular primero. Orden: cimientos → cáscara del Dashboard → enrutamiento real (URL por pantalla) → superficies de baja criticidad → menú → operación en vivo → caja → plataforma → limpieza.
- Caja (`CashierPanel`, `SplitPayModal`) y pedidos (`OrderFlow`): solo capa visual; el dinero y el corte no cambian.

## Comandos
- `npm run dev` · `npm run typecheck` · `npm run build`
