# Seguridad de RestaurantOS (Bloque 3, Anexo J)

Estado al 2026-10-16. Diagnóstico completo: `docs/informes/SEGURIDAD_DIAGNOSTICO.md`.

## Qué se hizo (todo aplicado en producción y verificado)

| Migración (versión real) | Qué cierra | Reversa |
|---|---|---|
| `20261016205453_aislar_funciones_limites_y_clave` | `cancelar_item_orden` y `calcular_costo_receta` ya validan el restaurante; funciones internas y de triggers sin acceso desde la API; límite por IP en comentarios, reseñas y reacciones del menú público; `change_my_password` exige la contraseña actual (salvo clave temporal) y mínimo 8 caracteres; `ingredientes_publicos(restaurant_id)` | `supabase/rollback/20261016205453_*_down.sql` |
| `20261016210055_cerrar_vista_ingredientes_publica` | La vista `ingredientes_menu_publico` ya no se lee directo (era alerta ERROR del asesor); el menú usa la función | `supabase/rollback/20261016210055_*_down.sql` |
| `20261016211854_exigir_2fa_plataforma` | `get_platform_overview`, `plataforma_activar_plan`, `plataforma_restablecer_admin` y `crear_restaurante` exigen sesión con código de 2 pasos (`aal2`) | `supabase/rollback/20261016211854_*_down.sql` |

Frontend (commit 371c8ea): `MfaGate` (inscripción y código TOTP para el panel de plataforma), consulta del menú por `ingredientes_publicos`, contraseña mínima 8 en el cambio forzado.
Cabeceras en `vercel.json`: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (solo micrófono propio).

Orden obligatorio de publicación: migraciones compatibles → frontend → migración que cierra lecturas → 2FA inscrito → migración de exigencia de 2FA (última, para no perder acceso).

## Decisiones
- 2FA (TOTP) solo para el super administrador. No para administradores de restaurantes.
- Pruebas de aislamiento: `supabase/tests/seguridad_aislamiento.sql` y `supabase/tests/seguridad_2fa_plataforma.sql` (se revierten solas).

## Asesor de Supabase (seguridad), antes y después
| Alerta | Antes | Después |
|---|---|---|
| ERROR vista con SECURITY DEFINER (`ingredientes_menu_publico`) | 1 | 0 |
| WARN funciones SECURITY DEFINER ejecutables por `anon` | 34 | 30 |
| WARN funciones SECURITY DEFINER ejecutables por `authenticated` | 75 | 69 |
| WARN protección de contraseñas filtradas | 1 | 1 |
| WARN extensión `pg_net` en `public` | 1 | 1 |
| INFO tablas con RLS y sin políticas (a propósito, solo funciones) | 3 | 3 |

Las 30 y 69 restantes son funciones que la app llama a propósito (menú público, pedidos, cajas). Cada una valida rol y restaurante dentro de su código.

## Pendiente
- Protección de contraseñas filtradas: requiere plan Pro de Supabase (USD 25/mes). Decisión de Cristhian.
- `pg_net` en `public`: no se puede mover; riesgo aceptado.
- SMTP propio para correos de recuperación (el de Supabase limita envíos).
- Códigos de referido y comisión por restaurante: Bloques 7-8.
- Copias: el plan Free no tiene copias automáticas. Hacer copia manual (`Backups-RestaurantOS`, fuera del repo) antes de cada cambio en producción.
