/**
 * unidades.ts — unidades de medida de inventario y recetas, y conversión entre ellas.
 * Lógica pura. Masa: gramo, kg, libra. Volumen: ml, litro. Conteo: pieza, paquete.
 * El inventario descuenta SIEMPRE en la unidad del ingrediente, por eso la receta
 * convierte lo que escribe el usuario (ej. 200 gramo) a esa unidad (0.2 kg) al guardar.
 */
export type Unidad = 'kg' | 'gramo' | 'libra' | 'litro' | 'ml' | 'pieza' | 'paquete'

type Familia = 'masa' | 'volumen' | 'conteo'

// Cuántas unidades base (gramo / ml / 1) vale cada unidad.
const INFO: Record<Unidad, { familia: Familia; base: number; etiqueta: string }> = {
  kg:      { familia: 'masa',    base: 1000,       etiqueta: 'kg' },
  gramo:   { familia: 'masa',    base: 1,          etiqueta: 'g' },
  libra:   { familia: 'masa',    base: 453.59237,  etiqueta: 'lb' },
  litro:   { familia: 'volumen', base: 1000,       etiqueta: 'litro' },
  ml:      { familia: 'volumen', base: 1,          etiqueta: 'ml' },
  pieza:   { familia: 'conteo',  base: 1,          etiqueta: 'pieza' },
  paquete: { familia: 'conteo',  base: 1,          etiqueta: 'paquete' },
}

/** Unidades que acepta el inventario (lista cerrada en la base de datos). */
export const UNIDADES: readonly Unidad[] = ['kg', 'gramo', 'libra', 'litro', 'ml', 'pieza', 'paquete']

export const esUnidad = (u: unknown): u is Unidad => typeof u === 'string' && u in INFO

/** Texto corto para mostrar: gramo → g, libra → lb. */
export const etiquetaUnidad = (u: string | null | undefined): string =>
  u && esUnidad(u) ? INFO[u].etiqueta : (u ?? '')

/** Unidades en las que se puede escribir una cantidad de un ingrediente que se maneja en `destino`. */
export function unidadesCompatibles(destino: string | null | undefined): Unidad[] {
  if (!destino || !esUnidad(destino)) return [...UNIDADES]
  const fam = INFO[destino].familia
  if (fam === 'conteo') return [destino]
  return UNIDADES.filter(u => INFO[u].familia === fam)
}

/** Pasa `cantidad` de `desde` a `hacia`. null si las unidades no son compatibles (ej. kg → litro). */
export function convertir(cantidad: number, desde: string | null | undefined, hacia: string | null | undefined): number | null {
  if (!desde || !hacia || desde === hacia) return cantidad
  if (!esUnidad(desde) || !esUnidad(hacia)) return null
  const a = INFO[desde], b = INFO[hacia]
  if (a.familia !== b.familia || a.familia === 'conteo') return null
  return Math.round((cantidad * a.base / b.base) * 1e6) / 1e6
}

/** Para mostrar una cantidad guardada en `unidad` de forma natural: 0.2 kg → 200 g, 0.25 litro → 250 ml. */
export function cantidadAmigable(cantidad: number, unidad: string | null | undefined): { cantidad: number; unidad: string } {
  const u = unidad ?? ''
  if (cantidad > 0 && cantidad < 1) {
    if (u === 'kg') return { cantidad: Math.round(cantidad * 1000 * 1e3) / 1e3, unidad: 'gramo' }
    if (u === 'litro') return { cantidad: Math.round(cantidad * 1000 * 1e3) / 1e3, unidad: 'ml' }
  }
  return { cantidad, unidad: u }
}
