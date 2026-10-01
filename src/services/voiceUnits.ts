/**
 * voiceUnits.ts — conversión de unidades para lo dictado ("200 gramos" de un
 * ingrediente que se maneja en kg). Solo masa (g/kg) y volumen (ml/litro);
 * piezas y paquetes no se convierten. Lógica pura.
 */
type Family = 'mass' | 'volume' | 'count'
interface Canon { family: Family; factor: number; key: string }

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim()

const TABLE: Record<string, Canon> = {
  g: { family: 'mass', factor: 1, key: 'g' }, gr: { family: 'mass', factor: 1, key: 'g' },
  gramo: { family: 'mass', factor: 1, key: 'g' }, gramos: { family: 'mass', factor: 1, key: 'g' },
  kg: { family: 'mass', factor: 1000, key: 'kg' }, kilo: { family: 'mass', factor: 1000, key: 'kg' },
  kilos: { family: 'mass', factor: 1000, key: 'kg' }, kilogramo: { family: 'mass', factor: 1000, key: 'kg' },
  kilogramos: { family: 'mass', factor: 1000, key: 'kg' },
  ml: { family: 'volume', factor: 1, key: 'ml' }, mililitro: { family: 'volume', factor: 1, key: 'ml' },
  mililitros: { family: 'volume', factor: 1, key: 'ml' },
  l: { family: 'volume', factor: 1000, key: 'l' }, lt: { family: 'volume', factor: 1000, key: 'l' },
  litro: { family: 'volume', factor: 1000, key: 'l' }, litros: { family: 'volume', factor: 1000, key: 'l' },
  pieza: { family: 'count', factor: 1, key: 'pieza' }, piezas: { family: 'count', factor: 1, key: 'pieza' },
  unidad: { family: 'count', factor: 1, key: 'pieza' }, unidades: { family: 'count', factor: 1, key: 'pieza' },
  paquete: { family: 'count', factor: 1, key: 'paquete' }, paquetes: { family: 'count', factor: 1, key: 'paquete' },
}

export const canonUnit = (u: string | null | undefined): Canon | null => TABLE[norm(u ?? '')] ?? null

export type Conversion =
  | { ok: true; qty: number; converted: boolean }
  | { ok: false; reason: string }

/** Pasa `qty` de la unidad dictada a la del ingrediente. Sin unidad dictada se asume la del ingrediente. */
export function convertQty(qty: number, spoken: string | null | undefined, target: string): Conversion {
  if (!(spoken ?? '').trim()) return { ok: true, qty, converted: false }
  const from = canonUnit(spoken), to = canonUnit(target)
  if (!from) return { ok: false, reason: `No sé qué es "${spoken}" como unidad.` }
  if (!to) return { ok: true, qty, converted: false } // unidad del inventario desconocida: no tocar
  if (from.family !== to.family || from.family === 'count') {
    if (from.key === to.key) return { ok: true, qty, converted: false }
    return { ok: false, reason: `No puedo pasar "${spoken}" a ${target}.` }
  }
  if (from.factor === to.factor) return { ok: true, qty, converted: false }
  return { ok: true, qty: Math.round((qty * from.factor / to.factor) * 1e6) / 1e6, converted: true }
}
