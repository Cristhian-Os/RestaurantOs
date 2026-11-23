/**
 * pedidosDuplicados.ts — detecta pedidos que parecen el mismo enviado dos veces
 * (misma mesa o cliente, mismo tipo, mismos productos, con pocos minutos de diferencia).
 * Solo avisa: nunca borra ni cancela nada. Dos pedidos iguales pueden ser legítimos.
 */
import { parseItems } from './salesHistory'

export interface PedidoComparable {
  id: string
  order_number_today?: number | null
  table_num?: number | null
  customer_name?: string | null
  tipo_pedido?: string | null
  items: unknown
  created_at: string
  status?: string | null
}

export const VENTANA_DUPLICADO_MIN = 10

/** Lo que hace "igual" a un pedido: tipo, mesa, cliente y productos (nombre, cantidad y nota). Vacío si no hay productos. */
export function firmaPedido(p: PedidoComparable): string {
  const lineas = parseItems(p.items).map(i => `${i.name.trim().toLowerCase()}×${i.quantity}|${(i.notes ?? '').trim().toLowerCase()}`).sort()
  if (lineas.length === 0) return ''
  return [p.tipo_pedido ?? '', p.table_num ?? '', (p.customer_name ?? '').trim().toLowerCase(), ...lineas].join('¦')
}

/** Grupos de 2 o más pedidos iguales creados con menos de `ventanaMin` minutos entre uno y el siguiente. Ignora cancelados. */
export function agruparPosiblesDuplicados<T extends PedidoComparable>(pedidos: T[], ventanaMin = VENTANA_DUPLICADO_MIN): T[][] {
  const porFirma = new Map<string, T[]>()
  for (const p of pedidos) {
    if (p.status === 'cancelled') continue
    const f = firmaPedido(p)
    if (!f) continue
    const arr = porFirma.get(f) ?? []
    arr.push(p)
    porFirma.set(f, arr)
  }
  const ms = ventanaMin * 60_000
  const grupos: T[][] = []
  for (const arr of porFirma.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    let actual: T[] = [arr[0]]
    for (let i = 1; i < arr.length; i++) {
      const dt = new Date(arr[i].created_at).getTime() - new Date(arr[i - 1].created_at).getTime()
      if (dt <= ms) actual.push(arr[i])
      else { if (actual.length > 1) grupos.push(actual); actual = [arr[i]] }
    }
    if (actual.length > 1) grupos.push(actual)
  }
  return grupos
}

/** id del pedido → números de los otros pedidos con los que parece repetido. */
export function detectarPosiblesDuplicados(pedidos: PedidoComparable[], ventanaMin = VENTANA_DUPLICADO_MIN): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const g of agruparPosiblesDuplicados(pedidos, ventanaMin)) {
    for (const p of g) {
      out.set(p.id, g.filter(o => o.id !== p.id).map(o => (o.order_number_today ? `#${o.order_number_today}` : `#${o.id.slice(0, 6)}`)))
    }
  }
  return out
}
