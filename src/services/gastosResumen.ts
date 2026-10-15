/**
 * gastosResumen.ts — lógica pura para saber EN QUÉ se gastó (por día o por mes).
 * Sin supabase ni React para poder probarla sola (scripts/gastosResumen.check.ts).
 * La columna `gastos.categoria` ya existía; las compras a proveedor la guardan como
 * 'proveedor' y los gastos viejos quedan en null ("Sin categoría").
 */
import { dayBoundsBogota } from './salesHistory.ts'

export interface GastoLite {
  concepto:   string
  monto:      number | string
  categoria?: string | null
}

export interface CategoriaGasto { key: string; label: string }

/** Categorías que el cajero puede elegir al registrar un gasto simple. */
export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  { key: 'insumos',       label: 'Insumos y mercado' },
  { key: 'nomina',        label: 'Nómina y pagos al equipo' },
  { key: 'servicios',     label: 'Servicios (luz, agua, gas, internet)' },
  { key: 'arriendo',      label: 'Arriendo' },
  { key: 'transporte',    label: 'Transporte y domicilios' },
  { key: 'mantenimiento', label: 'Mantenimiento y reparaciones' },
  { key: 'otros',         label: 'Otros' },
]

export const CATEGORIA_DEFECTO = 'otros'
export const SIN_CATEGORIA = 'sin_categoria'

const LABELS: Record<string, string> = {
  ...Object.fromEntries(CATEGORIAS_GASTO.map(c => [c.key, c.label])),
  proveedor:     'Compras a proveedor',
  [SIN_CATEGORIA]: 'Sin categoría',
}

/** Llave estable de la categoría: vacía/null → 'sin_categoria'. */
export const categoriaKey = (c: string | null | undefined): string => {
  const k = (c ?? '').trim().toLowerCase()
  return k === '' ? SIN_CATEGORIA : k
}

/** Texto para mostrar. Una categoría desconocida se muestra tal cual (primera letra en mayúscula). */
export function categoriaLabel(c: string | null | undefined): string {
  const k = categoriaKey(c)
  if (LABELS[k]) return LABELS[k]
  const raw = (c ?? '').trim()
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export interface ResumenCategoria {
  key:        string
  label:      string
  total:      number
  cantidad:   number
  /** 0–100 sobre el total de gastos. */
  porcentaje: number
}

/** Total gastado por categoría, de más a menos. "Sin categoría" siempre al final si empata. */
export function resumirPorCategoria(gastos: GastoLite[]): ResumenCategoria[] {
  const map = new Map<string, { total: number; cantidad: number }>()
  let granTotal = 0
  for (const g of gastos) {
    const monto = Number(g.monto) || 0
    if (monto <= 0) continue
    const k = categoriaKey(g.categoria)
    const cur = map.get(k) ?? { total: 0, cantidad: 0 }
    cur.total += monto
    cur.cantidad += 1
    map.set(k, cur)
    granTotal += monto
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: categoriaLabel(key === SIN_CATEGORIA ? null : key),
      total: v.total,
      cantidad: v.cantidad,
      porcentaje: granTotal > 0 ? (v.total / granTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || (a.key === SIN_CATEGORIA ? 1 : b.key === SIN_CATEGORIA ? -1 : a.label.localeCompare(b.label, 'es')))
}

export const totalGastos = (gastos: GastoLite[]): number =>
  gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0)

/** Rango [from, to) en UTC que cubre del día `desde` al día `hasta` (ambos incluidos, YYYY-MM-DD, hora de Colombia). */
export function rangoGastosBogota(desde: string, hasta: string): { from: string; to: string } {
  return { from: dayBoundsBogota(desde).from, to: dayBoundsBogota(hasta).to }
}
