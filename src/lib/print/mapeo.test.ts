// Prueba del mapeo de datos. Correr con:  node src/lib/print/mapeo.test.ts
import assert from 'node:assert/strict'
import { pagosDesdeFilas, parseItems, pedidoDesdeFila, type FilaPedido } from './mapeo.ts'
import { buildTicket } from './tickets.ts'
import { aTexto } from './modelo.ts'

const fila: FilaPedido = { id: 'p1', order_number_today: 7, table_num: 4, tipo_pedido: 'LOCAL', customer_name: '  Laura  ', created_at: '2026-10-21T15:00:00Z',
  paid_at: '2026-10-21T15:40:00Z', total: '31000', propina: '3000', payment_method: 'efectivo', amount_paid: '40000',
  items: JSON.stringify([
    { id: 'd1', name: 'Cholao con helado', price: '14000', quantity: '2', size: 'Grande', notes: 'Sabor: Oreo', toppings: ['Jengibre', { nombre: 'Sal' }] },
    { name: '', price: 3000, quantity: 0, cancelled: true },
    'basura',
  ]) }

// 1) Items: texto JSON o arreglo, con valores raros
const items = parseItems(fila.items)
assert.equal(items.length, 3)
assert.deepEqual([items[0].name, items[0].price, items[0].quantity, items[0].size, items[0].toppings], ['Cholao con helado', 14000, 2, 'Grande', ['Jengibre', 'Sal']])
assert.equal(items[1].name, 'Producto'); assert.equal(items[1].quantity, 1, 'cantidad mínima 1'); assert.equal(items[1].cancelled, true)
assert.deepEqual(parseItems('no es json'), []); assert.deepEqual(parseItems(null), []); assert.equal(parseItems(Array.from({ length: 500 }, () => ({}))).length, 200)

// 2) Pedido
const p = pedidoDesdeFila(fila, ' Daniela ')
assert.equal(p.cliente, 'Laura'); assert.equal(p.mesero, 'Daniela'); assert.equal(p.mesa, 4); assert.equal(p.numero, 7)

// 3) Pagos: divididos desde order_payments, o uno armado si el pedido no tiene
const dividido = pagosDesdeFilas([{ payment_method: 'efectivo', monto: '20000', monto_recibido: '20000', comensal: 'Ana' }, { payment_method: 'tarjeta', monto: 11000, propina: 3000 }], fila)
assert.equal(dividido.length, 2); assert.equal(dividido[0].comensal, 'Ana'); assert.equal(dividido[1].propina, 3000)
const viejo = pagosDesdeFilas([], fila)
assert.deepEqual(viejo, [{ metodo: 'efectivo', monto: 31000, propina: 3000, recibido: 40000, cambio: 6000 }])
assert.equal(pagosDesdeFilas([], { ...fila, payment_method: 'tarjeta' })[0].cambio, null, 'sin cambio en tarjeta')

// 4) De punta a punta: el recibo cuadra con el pedido (subtotal 28.000 + propina 3.000 = 31.000)
const r = aTexto(buildTicket('recibo', { encabezado: { nombre: 'Cholaos' }, pedido: p, pagos: viejo, numeroRecibo: 3, pagadoEn: fila.paid_at! }, 58)).join('\n')
assert.ok(r.includes('$28.000') && r.includes('$3.000') && r.includes('$31.000') && r.includes('Cambio') && r.includes('$6.000'))
assert.ok(r.includes('Recibo N.º 000003'))

console.log('mapeo.test.ts: todo OK')
