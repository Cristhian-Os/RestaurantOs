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

/** Nombres personalizados del restaurante: clave → nombre (de la tabla categorias_gasto). Tienen prioridad. */
export type Etiquetas = Record<string, string>

/** Categorías sugeridas: las que se ofrecen mientras el restaurante no haya creado las suyas. */
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

/** Texto para mostrar: primero el nombre que puso el restaurante, luego el de las sugeridas.
 *  Una categoría desconocida se muestra tal cual (primera letra en mayúscula). */
export function categoriaLabel(c: string | null | undefined, etiquetas?: Etiquetas): string {
  const k = categoriaKey(c)
  const propia = etiquetas?.[k]?.trim()
  if (propia) return propia
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
export function resumirPorCategoria(gastos: GastoLite[], etiquetas?: Etiquetas): ResumenCategoria[] {
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
      label: categoriaLabel(key === SIN_CATEGORIA ? null : key, etiquetas),
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

const CLAVES_RESERVADAS = new Set(['proveedor', SIN_CATEGORIA])

/** Clave estable para una categoría nueva: minúsculas, sin tildes, solo letras/números/guion bajo (máx. 40). */
export function claveDesdeNombre(nombre: string): string {
  const base = nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36)
    .replace(/_+$/g, '')
  return base || 'categoria'
}

/** Como claveDesdeNombre, pero que no choque con las claves ya usadas (incluidas las desactivadas) ni con las del sistema. */
export function claveUnica(nombre: string, existentes: Iterable<string>): string {
  const usadas = new Set(existentes)
  const base = claveDesdeNombre(nombre)
  if (!usadas.has(base) && !CLAVES_RESERVADAS.has(base)) return base
  for (let i = 2; ; i++) {
    const k = `${base}_${i}`
    if (!usadas.has(k) && !CLAVES_RESERVADAS.has(k)) return k
  }
}

/** Mismo nombre sin importar mayúsculas ni espacios de los bordes (la base de datos lo exige único). */
export const nombreIgual = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()
