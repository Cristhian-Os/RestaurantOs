/**
 * Degradados por restaurante. Por defecto la app es PLANA (sin degradados);
 * si el restaurante lo enciende en Marca (restaurant_config.modules_enabled.degradados = true)
 * se marca <html data-degradados> y el CSS devuelve los degradados.
 * Los colores (modules_enabled.degradados_colores = [color1, color2]) se aplican como --w-deg-1 / --w-deg-2.
 */
export type ParColores = [string, string]

const HEX = /^#[0-9a-f]{6}$/i

/** Colores de ejemplo para elegir con un toque. El primero es el naranja de la marca. */
export const COLORES_BASE: { nombre: string; c: ParColores }[] = [
  { nombre: 'Naranja', c: ['#FF5A00', '#FF8C3C'] },
  { nombre: 'Verde',   c: ['#1F8A4C', '#7CC47F'] },
  { nombre: 'Vino',    c: ['#8E1B3A', '#D45A7A'] },
  { nombre: 'Azul',    c: ['#1E5FD6', '#6FA8FF'] },
  { nombre: 'Morado',  c: ['#6B3FC9', '#B493FF'] },
  { nombre: 'Rosado',  c: ['#E0338A', '#FF8CC0'] },
]

export const esColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)

/** Lee la clave de un modules_enabled (jsonb) sin asumir su forma. */
export const degradadosDe = (mods: unknown): boolean => (mods as { degradados?: unknown } | null)?.degradados === true

/** Par de colores guardado, o null si no hay (se usan los de la marca). */
export const coloresDe = (mods: unknown): ParColores | null => {
  const c = (mods as { degradados_colores?: unknown } | null)?.degradados_colores
  return Array.isArray(c) && esColor(c[0]) && esColor(c[1]) ? [c[0], c[1]] : null
}

export const aplicarColores = (c: ParColores | null) => {
  const s = document.documentElement.style
  if (c) { s.setProperty('--w-deg-1', c[0]); s.setProperty('--w-deg-2', c[1]) }
  else { s.removeProperty('--w-deg-1'); s.removeProperty('--w-deg-2') }
}

export const aplicarDegradados = (on: boolean, colores: ParColores | null = null) => {
  document.documentElement.toggleAttribute('data-degradados', on)
  aplicarColores(on ? colores : null)
}

/** Para estilos en línea de componentes (el CSS no puede cambiar un style="" sin !important). */
export const hayDegradados = () => document.documentElement.hasAttribute('data-degradados')
