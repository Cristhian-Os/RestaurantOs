# Baseline schema snapshot — 2026-09-26

Estos 5 archivos (`00000000000000` a `00000000000004`) son un **snapshot fiel del estado real de producción** (proyecto Supabase `RestaurantOs`, `ifypeslrcdebvdqglywt`) al 2026-09-26, sacado directamente de la base de datos viva vía consultas de solo lectura. No se tocó ni se modificó nada en producción para generarlos.

## Por qué un snapshot y no las 108 migraciones históricas

Supabase ya trackea internamente **108 migraciones** aplicadas desde mayo 2026 (visibles con `list_migrations`), pero ese historial vive solo en la base de datos — nunca se guardó como archivos `.sql` en este repo. Reconstruir cada una de las 108 una por una habría sido más lento y con más riesgo de error de transcripción que tomar una sola "foto" del estado actual. Este snapshot cumple el mismo objetivo (tener el schema real versionado en git) con menos superficie de error.

**Consecuencia práctica:** de aquí en adelante, cualquier cambio de base de datos (CRM, planes, notificaciones, etc.) se agrega como una migración *nueva* con timestamp posterior a estas 5 — nunca edites estos 5 archivos a mano.

## Contenido

| Archivo | Contiene |
|---|---|
| `00000000000000_baseline_tables_snapshot.sql` | Las 27 tablas de `public` (columnas, tipos, defaults, checks, PKs, FKs, estado de RLS) |
| `00000000000001_baseline_functions_snapshot.sql` | 52 funciones (`SECURITY DEFINER` incluidas) |
| `00000000000002_baseline_rls_policies_snapshot.sql` | Todas las políticas RLS |
| `00000000000003_baseline_triggers_snapshot.sql` | 16 triggers |
| `00000000000004_baseline_views_snapshot.sql` | 8 vistas |

## Lo que este snapshot NO reemplaza

Los archivos `schema_*.sql` en la raíz del repo (`schema_complete.sql`, `schema_v2_updates.sql`, etc.) quedan como quedaron — **no se borraron**. Ya no son la fuente de verdad del schema (este snapshot lo es), pero pueden conservar contexto histórico útil. Se puede decidir más adelante si vale la pena archivarlos o borrarlos.

## Hallazgos relevantes descubiertos al generar este snapshot

- `profiles.role` ya acepta `'super_admin'` en su `CHECK` constraint, y ya existen `is_super_admin()` y varias políticas RLS que lo reconocen (`OR is_super_admin()`) — la base de datos ya está preparada para un rol de super-administrador de plataforma. Hoy: **0 perfiles** tienen ese rol asignado, y el frontend (`src/types/index.ts`, `Dashboard.tsx`) no lo conoce.
- `restaurants` no tiene columna `country`/`pais`.
- No existe ninguna tabla para registrar conversaciones o quejas del chatbot de soporte (`chat-support` no persiste nada hoy).
- 4 restaurantes en producción, los 4 con `plan = 'premium'` y `is_promo = true` (1 es la cuenta demo interna).
