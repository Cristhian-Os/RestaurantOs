// Chequeo rápido de menuOptions (sin framework):
//   node --experimental-strip-types scripts/menuOptions.check.ts
import assert from 'node:assert/strict'
import type { Dish } from '../src/types'
import {
  groupUnits, orderCategories, unitPriceFor, selIsValid, describeSel, visibleOptions, parseMenuConfig,
  mezclarListas, gruposDe, selAV2, describeSelV2, selIsValidV2, itemsVisibles, unitPriceForV2,
} from '../src/services/menuOptions.ts'

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

// ─── Modelo v2 ────────────────────────────────────────────────────────────────
{
  const menu = parseMenuConfig({ helado_flavors: ['Oreo', 'Fresa', 'Vainilla'], helado_flavors_off: ['Fresa'], jugo_flavors: ['Mora'] })
  const listas = mezclarListas([], menu)
  assert.deepEqual(listas.sabores_helado.map(i => [i.label, i.activo]), [['Oreo', true], ['Fresa', false], ['Vainilla', true]])

  // Adaptador: el cholao heredado se convierte en 2 grupos v2
  const gs = gruposDe(cholao)
  assert.equal(gs.length, 2)
  assert.deepEqual(gs[0], { v: 2, id: 'g_0', nombre: 'Elige el sabor del helado', modo: 'multi', min: 1, max: 1, requerido: true, fuente: { lista: 'sabores_helado' } })
  assert.equal(gs[1].modo, 'multi')
  assert.deepEqual((gs[1].fuente as { items: { label: string; sub?: unknown }[] }).items[1].sub, { lista: 'sabores_helado', cantidad: 1 })

  // Selección heredada -> v2 (pedidos viejos reabiertos en el constructor nuevo)
  const vieja = { size: 'Grande', helado: { 0: ['Oreo'], 1: ['Fresa'] }, opcionMulti: { 1: ['Con queso', 'Con helado'] }, toppings: ['Limón'] }
  const nueva = selAV2(cholao, vieja)
  assert.deepEqual(nueva.grupos, { g_0: ['Oreo'], g_1: ['Con queso', 'Con helado'], 'g_1>Con helado': ['Fresa'] })
  assert.equal(nueva.size, 'Grande')
  assert.equal(nueva.helado, undefined)
  assert.equal(selAV2(cholao, nueva), nueva)  // ya v2: no se toca
  // Mismo texto de cocina por la rama heredada y por la v2
  assert.equal(describeSelV2(cholao, nueva), describeSel(cholao, vieja))

  // Validación v2 equivale a la heredada en estos casos
  assert.equal(selIsValidV2(gs, listas, selAV2(cholao, { helado: { 0: ['Oreo'] }, opcionMulti: { 1: ['Con queso'] } })), true)
  assert.equal(selIsValidV2(gs, listas, selAV2(cholao, { opcionMulti: { 1: ['Con queso'] } })), false)
  assert.equal(selIsValidV2(gs, listas, selAV2(cholao, { helado: { 0: ['Oreo'] }, opcionMulti: { 1: ['Con queso', 'Con helado'] } })), false)
  assert.equal(selIsValidV2(gs, listas, nueva), true)

  // Agotados: se ocultan salvo que ya vinieran elegidos
  assert.deepEqual(itemsVisibles(gs[0], listas).map(i => i.label), ['Oreo', 'Vainilla'])
  assert.deepEqual(itemsVisibles(gs[0], listas, ['Fresa']).map(i => i.label), ['Oreo', 'Fresa', 'Vainilla'])

  // Grupo nativo v2 con precio extra, mínimo y máximo
  const cafe: Dish = {
    id: 'd2', name: 'Latte', description: '', price: 7000, category: 'cafes', available: true,
    options: [
      { v: 2, id: 'g_leche', nombre: 'Leche', modo: 'single', min: 1, max: 1, requerido: true,
        fuente: { items: [{ label: 'Entera' }, { label: 'Avena', precio_extra: 2000 }, { label: 'Almendra', precio_extra: 2500, activo: false }] } },
      { v: 2, id: 'g_extra', nombre: 'Extras', modo: 'multi', min: 0, max: 2, requerido: false, fuente: { lista: 'extras_cafe' } },
    ] as unknown as Dish['options'],
  }
  const lc = { extras_cafe: [{ label: 'Shot', precio_extra: 1500 }, { label: 'Jarabe', precio_extra: 1000 }, { label: 'Canela' }] }
  const gc = gruposDe(cafe)
  assert.equal(selIsValidV2(gc, lc, { grupos: {} }), false)                                   // falta la leche
  assert.equal(selIsValidV2(gc, lc, { grupos: { g_leche: ['Entera'] } }), true)               // extras opcionales
  assert.equal(selIsValidV2(gc, lc, { grupos: { g_leche: ['Entera', 'Avena'] } }), false)     // single
  assert.equal(selIsValidV2(gc, lc, { grupos: { g_leche: ['Entera'], g_extra: ['Shot', 'Jarabe', 'Canela'] } }), false) // max 2
  assert.equal(selIsValidV2(gc, lc, { grupos: { g_leche: ['Soya'] } }), false)                // ítem inexistente
  assert.equal(unitPriceForV2(cafe, lc, { grupos: { g_leche: ['Avena'], g_extra: ['Shot', 'Jarabe'] } }), 7000 + 2000 + 1500 + 1000)
  assert.equal(unitPriceForV2(cafe, lc, { grupos: { g_leche: ['Entera'] } }), 7000)
  assert.equal(describeSelV2(cafe, { grupos: { g_leche: ['Avena'], g_extra: ['Shot', 'Jarabe'] } }), 'Avena · Shot, Jarabe')
  // Sin cambios para el precio heredado
  assert.equal(unitPriceForV2(cholao, listas, selAV2(cholao, { size: 'Grande', toppings: ['Leche condensada'] })), unitPriceFor(cholao, { size: 'Grande', toppings: ['Leche condensada'] }))
}

console.log('menuOptions OK')
