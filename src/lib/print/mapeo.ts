/**
 * mapeo.ts — de las filas de la base (pedido y pagos) a los datos que usan los tickets. Parte pura, con prueba.
 * Los pagos salen de order_payments (incluye pagos divididos o mixtos); si un pedido viejo no tiene, se arma uno con lo guardado en el pedido.
 */
import type { ItemPedido, PagoRecibo, Pedido } from './tickets.ts'

export interface FilaPedido {
  id: string; order_number_today?: number | null; table_num: number | null; tipo_pedido: string; customer_name: string | null
  items: unknown; created_at: string; paid_at: string | null; total: number | string
  propina?: number | string | null; payment_method?: string | null; amount_paid?: number | string | null
}
export interface FilaPago {
  payment_method: string; monto: number | string; propina?: number | string | null
  monto_recibido?: number | string | null; cambio?: number | string | null; comensal?: string | null
}

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const t = (v: unknown, max = 200): string | null => { const s = String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max); return s || null }

/** `items` puede venir como arreglo o como texto JSON; cada plato se limpia y se acota. */
export function parseItems(raw: unknown): ItemPedido[] {
  let lista: unknown = raw
  if (typeof raw === 'string') { try { lista = JSON.parse(raw) } catch { lista = [] } }
  if (!Array.isArray(lista)) return []
  return lista.slice(0, 200).map((x): ItemPedido => {
    const i = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const toppings = (Array.isArray(i.toppings) ? i.toppings : []).map(p => (typeof p === 'string' ? p : t((p as { nombre?: string } | null)?.nombre, 60) ?? '')).filter(Boolean)
    return {
      id: t(i.id, 80), name: t(i.name, 120) ?? 'Producto', price: n(i.price), quantity: Math.max(1, Math.round(n(i.quantity) || 1)),
      notes: t(i.notes, 300), size: t(i.size, 40), toppings: toppings.length ? toppings : null, cancelled: i.cancelled === true,
      comensal: t(i.comensal, 60),
    }
  })
}

export interface TrabajoComanda { orderId: string; desde: number; hasta: number; modo: 'nueva' | 'adicion' }

/**
 * Qué comandas faltan por imprimir. `hechos` = cuántos platos de cada pedido ya salieron en comanda (el pedido solo crece:
 * lo nuevo es una ADICIÓN). Un pedido que nunca imprimió y es anterior a que se encendiera la estación se ignora
 * (no se reimprime todo el tablero al abrir): para esos está el botón manual.
 */
export function planearComandas(ordenes: { id: string; created_at: string; items: unknown }[], hechos: Map<string, number>, inicioMs: number): TrabajoComanda[] {
  const out: TrabajoComanda[] = []
  for (const o of ordenes) {
    const hecho = hechos.get(o.id) ?? 0
    if (hecho === 0 && Date.parse(o.created_at) < inicioMs - 60_000) continue
    const total = parseItems(o.items).length
    if (total > hecho) out.push({ orderId: o.id, desde: hecho, hasta: total, modo: hecho === 0 ? 'nueva' : 'adicion' })
  }
  return out
}

export function pedidoDesdeFila(f: FilaPedido, mesero?: string | null): Pedido {
  return {
    numero: f.order_number_today ?? null, mesa: f.table_num ?? null, tipo: f.tipo_pedido, cliente: t(f.customer_name, 60),
    mesero: t(mesero, 60), creado: f.created_at, items: parseItems(f.items), propina: n(f.propina),
  }
}

export function pagosDesdeFilas(filas: FilaPago[], p: FilaPedido): PagoRecibo[] {
  if (filas.length > 0) {
    return filas.map(x => ({
      metodo: x.payment_method, monto: n(x.monto), propina: n(x.propina),
      recibido: x.monto_recibido == null ? null : n(x.monto_recibido), cambio: x.cambio == null ? null : n(x.cambio), comensal: t(x.comensal, 60),
    }))
  }
  // Pedido sin pagos registrados (cobrado antes de los pagos divididos): se arma uno con lo guardado en el pedido.
  const metodo = p.payment_method || 'efectivo'
  const total = n(p.total), propina = n(p.propina), recibido = p.amount_paid == null ? null : n(p.amount_paid)
  const cambio = metodo === 'efectivo' && recibido != null ? Math.max(recibido - total - propina, 0) : null
  return [{ metodo, monto: total, propina, recibido, cambio }]
}
