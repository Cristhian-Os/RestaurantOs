/**
 * Degradados por restaurante. Por defecto la app es PLANA (sin degradados);
 * si el restaurante lo enciende en Marca (restaurant_config.modules_enabled.degradados = true)
 * se marca <html data-degradados> y el CSS devuelve los degradados.
 */
export const aplicarDegradados = (on: boolean) => document.documentElement.toggleAttribute('data-degradados', on)

/** Para estilos en línea de componentes (el CSS no puede cambiar un style="" sin !important). */
export const hayDegradados = () => document.documentElement.hasAttribute('data-degradados')

/** Lee la clave de un modules_enabled (jsonb) sin asumir su forma. */
export const degradadosDe = (mods: unknown): boolean => (mods as { degradados?: unknown } | null)?.degradados === true
