/**
 * salesHistory.ts — lógica pura del historial de ventas (caja).
 * Sin supabase ni React para poder probarla sola (scripts/salesHistory.check.ts).
 * Las reglas de totales son las mismas del corte de caja (hacer_corte_caja /
 * get_corte_productos): solo pedidos completados y pagados ese día en hora de
 * Colombia, y Rappi no cuenta como venta.
 */

export interface SaleItem {
  name:     string
  quantity: number
  price:    number
  notes:    string | null
}

export interface SaleOrder {
  id:                  string
  order_number_today?: number | null
  user_id:             string | null
  table_num:           number | null
  customer_name:       string | null
  items:               SaleItem[]
  total:               number
  tipo_pedido:         string
  payment_method:      string | null
  propina:             number | null
  paid_at:             string | null
  created_at:          string
  notes:               string | null
}

export interface SalesSummary {
  count:         number   // ventas que cuentan (sin Rappi)
  efectivo:      number
  transferencia: number
  total:         number
  propinas:      number
  rappi:         number   // solo conteo: la plata la paga Rappi por fuera
}

export interface ProductTotal { producto: string; cantidad: number; subtotal: number }

export const esRappi = (o: { tipo_pedido?: string | null; payment_method?: string | null }) =>
  o.tipo_pedido === 'RAPPI' || o.payment_method === 'rappi'

/** Rango [desde, hasta) de un día calendario (YYYY-MM-DD) en hora de Colombia (UTC-5, sin horario de verano). */
export function dayBoundsBogota(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00-05:00`)
  if (Number.isNaN(from.getTime())) throw new Error('Fecha inválida')
  return { from: from.toISOString(), to: new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString() }
}

/** items viene como jsonb: a veces arreglo, a veces texto con un arreglo, a veces roto. Los cancelados no cuentan. */
export function parseItems(raw: unknown): SaleItem[] {
  let v: unknown = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return [] } }
  if (!Array.isArray(v)) return []
  return v
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object' && !(it as { cancelled?: unknown }).cancelled)
    .map(it => ({
      name:     typeof it.name === 'string' && it.name.trim() ? it.name : 'Sin nombre',
      quantity: Number(it.quantity) || 0,
      price:    Number(it.price) || 0,
      notes:    typeof it.notes === 'string' && it.notes.trim() ? it.notes.trim() : null,
    }))
}

const TIPO_LABEL: Record<string, string> = { LLEVAR: 'Para llevar', DOMICILIO: 'Domicilio', RAPPI: 'Rappi' }

/** Para quién fue la venta: nombre del cliente y/o mesa o tipo de pedido. */
export function forWhom(o: Pick<SaleOrder, 'customer_name' | 'table_num' | 'tipo_pedido'>): string {
  const parts: string[] = []
  const name = o.customer_name?.trim()
  if (name) parts.push(name)
  if (o.table_num) parts.push(`Mesa ${o.table_num}`)
  else if (TIPO_LABEL[o.tipo_pedido]) parts.push(TIPO_LABEL[o.tipo_pedido])
  return parts.length ? parts.join(' · ') : 'Sin nombre'
}

/** Resumen de qué se vendió en una línea: "2× Cholao, 1× Limonada". */
export const itemsSummary = (items: SaleItem[]) =>
  items.map(i => `${i.quantity}× ${i.name}`).join(', ')

export function summarize(orders: SaleOrder[]): SalesSummary {
  const s: SalesSummary = { count: 0, efectivo: 0, transferencia: 0, total: 0, propinas: 0, rappi: 0 }
  for (const o of orders) {
    if (esRappi(o)) { s.rappi += 1; continue }
    s.count += 1
    s.propinas += Number(o.propina) || 0
    if (o.payment_method === 'efectivo') s.efectivo += Number(o.total) || 0
    else if (o.payment_method === 'transferencia') s.transferencia += Number(o.total) || 0
  }
  s.total = s.efectivo + s.transferencia
  return s
}

/** Totales por producto (sin Rappi ni ítems cancelados), de más a menos vendido. */
export function productTotals(orders: SaleOrder[]): ProductTotal[] {
  const map = new Map<string, ProductTotal>()
  for (const o of orders) {
    if (esRappi(o)) continue
    for (const it of o.items) {
      const t = map.get(it.name) ?? { producto: it.name, cantidad: 0, subtotal: 0 }
      t.cantidad += it.quantity
      t.subtotal += it.quantity * it.price
      map.set(it.name, t)
    }
  }
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad || a.producto.localeCompare(b.producto, 'es'))
}

export type PayFilter = 'todas' | 'efectivo' | 'transferencia' | 'rappi'

export function filterOrders(orders: SaleOrder[], f: PayFilter): SaleOrder[] {
  if (f === 'todas') return orders
  if (f === 'rappi') return orders.filter(esRappi)
  return orders.filter(o => !esRappi(o) && o.payment_method === f)
}
