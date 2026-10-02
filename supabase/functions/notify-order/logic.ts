// Lógica pura de `notify-order` (sin red ni Deno): se prueba con scripts/notifyOrder.check.ts.

/** Un pedido del menú QR solo se puede notificar durante esta ventana desde que se creó. */
export const WINDOW_MS = 2 * 60 * 1000

export interface OrderRow {
  user_id: string | null
  tipo_pedido: string
  status: string
  created_at: string
  push_notified_at: string | null
  table_num: number | null
  customer_name: string | null
}

export type Verdict = 'ok' | 'not_public' | 'too_old' | 'already_notified'

/**
 * El pedido del QR lo crea `create_public_order`: sin usuario, LOCAL y pendiente. Los del
 * personal siempre llevan user_id, así que no pueden usar esta vía para disparar avisos.
 */
export function evaluateOrder(o: OrderRow, now: number): Verdict {
  if (o.user_id !== null || o.tipo_pedido !== 'LOCAL' || o.status !== 'pending') return 'not_public'
  const age = now - Date.parse(o.created_at)
  if (!(age >= -5_000 && age < WINDOW_MS)) return 'too_old' // fecha ilegible o futura también se rechaza
  if (o.push_notified_at !== null) return 'already_notified'
  return 'ok'
}

/** Instante mínimo de created_at que acepta el UPDATE atómico (misma ventana que evaluateOrder). */
export const cutoffIso = (now: number) => new Date(now - WINDOW_MS).toISOString()

// El nombre lo escribe el cliente: se limpia (sin saltos/control) y se acorta.
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 40)

export function buildMessage(o: Pick<OrderRow, 'table_num' | 'customer_name'>): { title: string; body: string } {
  const name = o.customer_name ? clean(o.customer_name) : ''
  return {
    title: 'Nuevo pedido',
    body: o.table_num ? `Mesa ${o.table_num} hizo un pedido` : `${name || 'Un cliente'} hizo un pedido`,
  }
}
