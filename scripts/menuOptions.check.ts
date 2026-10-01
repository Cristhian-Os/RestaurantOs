// Chequeo rápido de menuOptions (sin framework):
//   node --experimental-strip-types scripts/menuOptions.check.ts
import assert from 'node:assert/strict'
import type { Dish } from '../src/types'
import { groupUnits, orderCategories, unitPriceFor, selIsValid, describeSel, visibleOptions, parseMenuConfig } from '../src/services/menuOptions.ts'

// Orden de categorías: el de la config; las no configuradas al final, en su orden.
assert.deepEqual(
  orderCategories(['helados', 'x', 'principal', 'y', 'cholao'], [{ value: 'principal' }, { value: 'cholao' }, { value: 'helados' }]),
  ['principal', 'cholao', 'helados', 'x', 'y'],
)

const cholao: Dish = {
  id: 'd1', name: 'Cholao con helado', description: '', price: 12000, category: 'cholao', available: true,
  has_sizes: true, sizes: [{ nombre: 'Pequeño', precio: 12000 }, { nombre: 'Grande', precio: 14000 }],
  options: [
    { tipo: 'helado', nombre: 'Elige el sabor del helado', cantidad: 1 },
    { tipo: 'opcion', nombre: '¿Con qué lo quieres?', multiple: true, opciones: [{ label: 'Con queso' }, { label: 'Con helado', helado: 1 }] },
  ],
  toppings: [{ nombre: 'Leche condensada', precio: 1500 }, { nombre: 'Limón', precio: 0 }],
}

// Precio: tamaño + toppings (igual que el servidor).
assert.equal(unitPriceFor(cholao, { size: 'Grande', toppings: ['Leche condensada', 'Limón'] }), 15500)
assert.equal(unitPriceFor(cholao, {}), 12000)

// Validación: el sabor es obligatorio; "Con helado" pide su sabor.
assert.equal(selIsValid(cholao, { helado: { 0: ['Oreo'] }, opcionMulti: { 1: ['Con queso'] } }), true)
assert.equal(selIsValid(cholao, { opcionMulti: { 1: ['Con queso'] } }), false)
assert.equal(selIsValid(cholao, { helado: { 0: ['Oreo'] }, opcionMulti: { 1: ['Con queso', 'Con helado'] } }), false)
assert.equal(selIsValid(cholao, { helado: { 0: ['Oreo'], 1: ['Fresa'] }, opcionMulti: { 1: ['Con queso', 'Con helado'] } }), true)

assert.equal(
  describeSel(cholao, { size: 'Grande', helado: { 0: ['Oreo'], 1: ['Fresa'] }, opcionMulti: { 1: ['Con queso', 'Con helado'] }, toppings: ['Limón'] }),
  'Grande · Oreo · Con queso + Con helado (Fresa) · Limón',
)

// Agotados: se ocultan, salvo si ya venían elegidos en el pedido que se edita.
assert.deepEqual(visibleOptions(['Oreo', 'Fresa', 'Vainilla'], ['Oreo', 'Fresa'], ['Fresa']), ['Fresa', 'Vainilla'])

assert.deepEqual(parseMenuConfig({ helado_flavors: ['Oreo', '', 3], toppings_off: ['Limón'] }).heladoFlavors, ['Oreo'])

// Unidades por separado: iguales se juntan, distintas quedan aparte (en orden)
{
  const A = { size: 'Grande', helado: { '0': ['Oreo'] }, toppings: ['Limón', 'Sal'] }
  const A2 = { size: 'Grande', helado: { '0': ['Oreo'] }, toppings: ['Sal', 'Limón'] }   // mismo, distinto orden de toque
  const B = { size: 'Grande', helado: { '0': ['Fresa'] }, toppings: ['Limón', 'Sal'] }  // otro sabor
  assert.deepEqual(groupUnits([A, A2]).map(g => g.qty), [2])
  assert.deepEqual(groupUnits([A, B]).map(g => g.qty), [1, 1])
  assert.deepEqual(groupUnits([A, B, A2]).map(g => g.qty), [2, 1])        // A y A2 se juntan; B conserva su lugar
  assert.equal(groupUnits([A, B, A2])[1].sel, B)
  // un grupo vacío equivale a no haberlo tocado
  assert.deepEqual(groupUnits([{ size: 'Grande' }, { size: 'Grande', helado: { '0': [] }, toppings: [] }]).map(g => g.qty), [2])
  // el comentario distingue unidades (espacios sobrantes no)
  assert.deepEqual(groupUnits([{ comment: 'sin azúcar' }, { comment: ' sin azúcar ' }, { comment: 'poco hielo' }]).map(g => g.qty), [2, 1])
  assert.deepEqual(groupUnits([{ comment: '' }, {}]).map(g => g.qty), [2])
  // distinto tamaño o distintos extras/cambios = unidades distintas
  assert.equal(groupUnits([{ size: 'Grande' }, { size: 'Pequeño' }]).length, 2)
  assert.equal(groupUnits([{ extras: ['Queso'] }, {}]).length, 2)
  assert.equal(groupUnits([{ swaps: ['i1'] }, {}]).length, 2)
  assert.deepEqual(groupUnits([]), [])
}

console.log('menuOptions OK')
