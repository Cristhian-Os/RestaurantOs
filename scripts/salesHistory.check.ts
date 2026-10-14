// Chequeo rápido de salesHistory (sin framework):
//   node --experimental-strip-types scripts/salesHistory.check.ts
import assert from 'node:assert/strict'
import {
  dayBoundsBogota, parseItems, forWhom, itemsSummary, summarize, productTotals, filterOrders, esRappi, type SaleOrder,
} from '../src/services/salesHistory.ts'

// Día en hora de Colombia: 00:00 -05:00 = 05:00 UTC; dura 24 h
assert.deepEqual(dayBoundsBogota('2026-10-01'), { from: '2026-10-01T05:00:00.000Z', to: '2026-10-02T05:00:00.000Z' })
assert.deepEqual(dayBoundsBogota('2026-12-31'), { from: '2026-12-31T05:00:00.000Z', to: '2027-01-01T05:00:00.000Z' })
assert.throws(() => dayBoundsBogota('no-es-fecha'), /Fecha inválida/)

// items: arreglo, texto con arreglo, roto, cancelados
const raw = [{ name: 'Cholao', quantity: 2, price: 14000, notes: ' Oreo · Limón ' }, { name: 'Limonada', quantity: 1, price: 5000, cancelled: true }, { quantity: 1, price: 1000 }]
assert.deepEqual(parseItems(raw), [
  { name: 'Cholao', quantity: 2, price: 14000, notes: 'Oreo · Limón' },
  { name: 'Sin nombre', quantity: 1, price: 1000, notes: null },
])
assert.deepEqual(parseItems(JSON.stringify(raw)).length, 2)
assert.deepEqual(parseItems('{roto'), [])
assert.deepEqual(parseItems(null), [])
assert.deepEqual(parseItems({ a: 1 }), [])
assert.deepEqual(parseItems([null, 5, 'x']), [])
assert.equal(parseItems([{ name: 'A', quantity: 'tres', price: 'x' }])[0].quantity, 0) // dato sucio no rompe

// Para quién
assert.equal(forWhom({ customer_name: 'María', table_num: 4, tipo_pedido: 'LOCAL' }), 'María · Mesa 4')
assert.equal(forWhom({ customer_name: null, table_num: 4, tipo_pedido: 'LOCAL' }), 'Mesa 4')
assert.equal(forWhom({ customer_name: '  Juan  ', table_num: null, tipo_pedido: 'LLEVAR' }), 'Juan · Para llevar')
assert.equal(forWhom({ customer_name: null, table_num: null, tipo_pedido: 'DOMICILIO' }), 'Domicilio')
assert.equal(forWhom({ customer_name: 'Ana', table_num: null, tipo_pedido: 'LOCAL' }), 'Ana')
assert.equal(forWhom({ customer_name: '', table_num: null, tipo_pedido: 'LOCAL' }), 'Sin nombre')
assert.equal(forWhom({ customer_name: null, table_num: null, tipo_pedido: 'RAPPI' }), 'Rappi')

assert.equal(itemsSummary([{ name: 'Cholao', quantity: 2, price: 1, notes: null }, { name: 'Limonada', quantity: 1, price: 1, notes: null }]), '2× Cholao, 1× Limonada')

const mk = (o: Partial<SaleOrder>): SaleOrder => ({
  id: 'x', user_id: null, table_num: null, customer_name: null, items: [], total: 0, tipo_pedido: 'LOCAL',
  payment_method: 'efectivo', propina: 0, paid_at: '2026-10-01T15:00:00Z', created_at: '2026-10-01T14:00:00Z', notes: null, ...o,
})
const orders: SaleOrder[] = [
  mk({ id: '1', total: 28000, propina: 2000, payment_method: 'efectivo', items: [{ name: 'Cholao', quantity: 2, price: 14000, notes: null }] }),
  mk({ id: '2', total: 19000, payment_method: 'transferencia', items: [{ name: 'Cholao', quantity: 1, price: 14000, notes: null }, { name: 'Limonada', quantity: 1, price: 5000, notes: null }] }),
  mk({ id: '3', total: 50000, payment_method: 'rappi', tipo_pedido: 'RAPPI', items: [{ name: 'Cholao', quantity: 9, price: 5000, notes: null }] }),
  mk({ id: '4', total: 5000, propina: 500, payment_method: 'efectivo', items: [{ name: 'Limonada', quantity: 1, price: 5000, notes: null }] }),
]

// Mismo criterio del corte: Rappi no suma
assert.deepEqual(summarize(orders), { count: 3, efectivo: 33000, transferencia: 19000, tarjeta: 0, total: 52000, propinas: 2500, rappi: 1 })
assert.deepEqual(summarize([]), { count: 0, efectivo: 0, transferencia: 0, tarjeta: 0, total: 0, propinas: 0, rappi: 0 })
assert.equal(esRappi({ tipo_pedido: 'LOCAL', payment_method: 'rappi' }), true)

// Por producto: sin Rappi, ordenado por cantidad
assert.deepEqual(productTotals(orders), [
  { producto: 'Cholao', cantidad: 3, subtotal: 42000 },
  { producto: 'Limonada', cantidad: 2, subtotal: 10000 },
])
assert.deepEqual(productTotals([]), [])

// Filtros
assert.deepEqual(filterOrders(orders, 'todas').map(o => o.id), ['1', '2', '3', '4'])
assert.deepEqual(filterOrders(orders, 'efectivo').map(o => o.id), ['1', '4'])
assert.deepEqual(filterOrders(orders, 'transferencia').map(o => o.id), ['2'])
assert.deepEqual(filterOrders(orders, 'rappi').map(o => o.id), ['3'])

// Cuenta dividida (mesa de 5: 3 en efectivo, 2 por transferencia): cada método suma lo que se pagó con él,
// no el total del pedido. Es el descuadre que reportó Cholaos Dany.
const mesa5 = mk({
  id: '5', total: 87000, propina: 1800, payment_method: 'mixto',
  pagos: [
    { payment_method: 'efectivo', monto: 18000 }, { payment_method: 'transferencia', monto: 15000 },
    { payment_method: 'efectivo', monto: 22000 }, { payment_method: 'transferencia', monto: 12000 },
    { payment_method: 'efectivo', monto: 20000 },
  ],
})
assert.deepEqual(summarize([mesa5]), { count: 1, efectivo: 60000, transferencia: 27000, tarjeta: 0, total: 87000, propinas: 1800, rappi: 0 })
// Mezclado con pedidos de un solo pago, y un pedido con tarjeta
const conTarjeta = mk({ id: '6', total: 10000, payment_method: 'tarjeta' })
assert.deepEqual(summarize([...orders, mesa5, conTarjeta]), { count: 5, efectivo: 93000, transferencia: 46000, tarjeta: 10000, total: 149000, propinas: 4300, rappi: 1 })
// Filtros con cuentas divididas
const todos = [...orders, mesa5, conTarjeta]
assert.deepEqual(filterOrders(todos, 'mixto').map(o => o.id), ['5'])
assert.deepEqual(filterOrders(todos, 'efectivo').map(o => o.id), ['1', '4', '5'])
assert.deepEqual(filterOrders(todos, 'transferencia').map(o => o.id), ['2', '5'])
assert.deepEqual(filterOrders(todos, 'tarjeta').map(o => o.id), ['6'])

process.stdout.write('salesHistory: todo OK\n')
