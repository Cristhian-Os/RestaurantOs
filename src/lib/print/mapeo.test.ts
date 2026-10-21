// Prueba del mapeo de datos. Correr con:  node src/lib/print/mapeo.test.ts
import assert from 'node:assert/strict'
import { datosCierre, pagosDesdeFilas, parseItems, pedidoDesdeFila, planearComandas, type FilaPedido } from './mapeo.ts'
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

// 5) Qué comandas faltan: nueva, adición, nada repetido, y no se reimprime lo anterior a encender la estación
const ahora = Date.parse('2026-10-21T15:00:00Z'), hace = (s: number) => new Date(ahora - s * 1000).toISOString(), dos = [{ name: 'A' }, { name: 'B' }]
const plan = planearComandas([
  { id: 'nuevo', created_at: hace(5), items: dos }, { id: 'crecio', created_at: hace(600), items: [...dos, { name: 'C' }] },
  { id: 'igual', created_at: hace(600), items: dos }, { id: 'viejo', created_at: hace(3600), items: dos },
], new Map([['crecio', 2], ['igual', 2]]), ahora)
assert.deepEqual(plan, [{ orderId: 'nuevo', desde: 0, hasta: 2, modo: 'nueva' }, { orderId: 'crecio', desde: 2, hasta: 3, modo: 'adicion' }])

// 6) Cierre de caja: mismas cifras del corte, y el conteo físico marca la diferencia
const corte = { fecha: '2026-10-21', total_efectivo: '100000', total_transferencia: 50000, total_tarjeta: null, total_general: 150000, total_ordenes: 12, total_propinas: 5000,
  total_gastos: 20000, total_neto: 130000, base_caja: 30000, aportes_a_caja: 10000, gastos_pagados_de_caja: 15000, gastos_adelantados: 5000, reembolsos_de_caja: 0, efectivo_esperado_cajon: 125000 }
const dc = datosCierre(corte, 124000)
assert.equal(dc.ventas.tarjeta, 0); assert.equal(dc.efectivoEsperado, 125000); assert.equal(dc.neto, 130000)
const cierreTxt = aTexto(buildTicket('cierre', { encabezado: { nombre: 'Cholaos' }, ...dc }, 58)).join('\n')
assert.ok(cierreTxt.includes('$150.000') && cierreTxt.includes('$125.000') && cierreTxt.includes('Falta') && cierreTxt.includes('$1.000'), cierreTxt)
assert.equal(datosCierre({ total_efectivo: 7 }, null).efectivoEsperado, 7, 'sin efectivo_esperado_cajon usa el efectivo')

console.log('mapeo.test.ts: todo OK')
