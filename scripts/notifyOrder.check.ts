// Chequeo de la lógica pura de notify-order (sin red ni framework):
//   node --experimental-strip-types scripts/notifyOrder.check.ts
import assert from 'node:assert/strict'
import { WINDOW_MS, buildMessage, cutoffIso, evaluateOrder, type OrderRow } from '../supabase/functions/notify-order/logic.ts'

const NOW = Date.parse('2026-10-02T15:00:00Z')
const base: OrderRow = {
  user_id: null, tipo_pedido: 'LOCAL', status: 'pending', push_notified_at: null,
  table_num: 4, customer_name: null, created_at: new Date(NOW - 10_000).toISOString(),
}
const at = (ms: number) => new Date(NOW - ms).toISOString()

// Pedido QR recién creado: se puede notificar
assert.equal(evaluateOrder(base, NOW), 'ok')

// Ventana de 2 minutos: justo dentro sí, en el límite y fuera no
assert.equal(evaluateOrder({ ...base, created_at: at(WINDOW_MS - 1) }, NOW), 'ok')
assert.equal(evaluateOrder({ ...base, created_at: at(WINDOW_MS) }, NOW), 'too_old')
assert.equal(evaluateOrder({ ...base, created_at: at(10 * 60_000) }, NOW), 'too_old')
assert.equal(evaluateOrder({ ...base, created_at: 'no es fecha' }, NOW), 'too_old')
assert.equal(evaluateOrder({ ...base, created_at: at(-60_000) }, NOW), 'too_old') // futuro

// Idempotencia: ya notificado no vuelve a pasar
assert.equal(evaluateOrder({ ...base, push_notified_at: at(5_000) }, NOW), 'already_notified')

// Solo pedidos del QR: los del personal (user_id), de otro tipo o ya avanzados se rechazan
assert.equal(evaluateOrder({ ...base, user_id: 'u1' }, NOW), 'not_public')
assert.equal(evaluateOrder({ ...base, tipo_pedido: 'RAPPI' }, NOW), 'not_public')
assert.equal(evaluateOrder({ ...base, status: 'preparing' }, NOW), 'not_public')

// El corte del UPDATE atómico coincide con la ventana
assert.equal(cutoffIso(NOW), new Date(NOW - WINDOW_MS).toISOString())

// Mensaje: lo arma el servidor
assert.deepEqual(buildMessage({ table_num: 7, customer_name: 'Ana' }), { title: 'Nuevo pedido', body: 'Mesa 7 hizo un pedido' })
assert.equal(buildMessage({ table_num: null, customer_name: 'Ana' }).body, 'Ana hizo un pedido')
assert.equal(buildMessage({ table_num: null, customer_name: null }).body, 'Un cliente hizo un pedido')
assert.equal(buildMessage({ table_num: null, customer_name: '   ' }).body, 'Un cliente hizo un pedido')
// Texto del cliente: sin saltos de línea y acotado
assert.equal(buildMessage({ table_num: null, customer_name: 'A\nB\r\nC' }).body, 'A B C hizo un pedido')
assert.ok(buildMessage({ table_num: null, customer_name: 'x'.repeat(500) }).body.length < 60)

