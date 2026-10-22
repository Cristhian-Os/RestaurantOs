// Prueba de los datos de consulta de Resti. Correr con:  node supabase/functions/resti-brain/datos.test.ts
import assert from 'node:assert/strict'
import { resumirDatos, leerItems, diaBogota } from './datos.ts'

assert.equal(diaBogota('2026-10-22T03:00:00Z'), '2026-10-21', '03:00 UTC es la noche anterior en Colombia')
assert.deepEqual(leerItems('[{"name":"Cholao","quantity":2},{"name":" ","quantity":1}]'), [{ name: 'Cholao', quantity: 2 }])
assert.deepEqual(leerItems([{ name: 'Brownie' }]), [{ name: 'Brownie', quantity: 1 }]); assert.deepEqual(leerItems('no json'), []); assert.deepEqual(leerItems(null), [])

const ahora = new Date('2026-10-22T15:00:00Z')   // 10:00 en Colombia
const r = resumirDatos({
  ahora,
  ordenes: [
    { total: 30000, created_at: '2026-10-21T18:00:00Z', items: '[{"name":"Cholao","quantity":2},{"name":"Limonada","quantity":1}]' },
    { total: 12000, created_at: '2026-10-21T20:00:00Z', items: [{ name: 'Cholao', quantity: 1 }] },
    { total: 50000, created_at: '2026-10-19T20:00:00Z', items: '[{"name":"Brownie","quantity":5}]' },
    { total: 99999, created_at: '2026-10-21T20:00:00Z', items: '[]', tipo_pedido: 'RAPPI' },
  ],
  ingredientes: [{ nombre: 'Fresa', unidad_medida: 'kg', stock_actual: 1, stock_minimo: 5 }, { nombre: 'Leche', stock_actual: 10, stock_minimo: 2 }, { nombre: 'Sal', stock_actual: 0, stock_minimo: 0 }],
  mesas: [{ estado: 'ocupada' }, { estado: 'libre' }, { estado: 'ocupada' }], tareasPendientes: 3,
})
assert.equal(r.ventas_ayer, 42000); assert.equal(r.pedidos_ayer, 2); assert.equal(r.ventas_ultimos_7_dias, 92000); assert.equal(r.pedidos_ultimos_7_dias, 3, 'Rappi no cuenta')
assert.deepEqual(r.platos_mas_vendidos_7_dias[0], { plato: 'Brownie', unidades: 5 }); assert.equal(r.platos_mas_vendidos_7_dias[1].plato, 'Cholao'); assert.equal(r.platos_mas_vendidos_7_dias[1].unidades, 3)
assert.deepEqual(r.stock_bajo, [{ ingrediente: 'Fresa', stock: 1, minimo: 5, unidad: 'kg' }], 'solo lo que está en o bajo el mínimo (y con mínimo definido)')
assert.deepEqual(r.mesas, { ocupadas: 2, total: 3 }); assert.equal(r.tareas_pendientes, 3)
assert.deepEqual(r.ventas_por_dia.map(d => d.dia), ['2026-10-19', '2026-10-21'])
console.log('datos.test OK')
