// Prueba de los cambios del menú que propone Resti. Correr con:  node src/lib/resti/menuCambios.test.ts
import assert from 'node:assert/strict'
import { proponerCambiosMenu, buscarPlato, type PlatoMenu } from './menuCambios.ts'

const base = (o: Partial<PlatoMenu>): PlatoMenu => ({ id: 'x', name: 'x', description: null, price: 10000, category: 'cholao', tags: [], has_sizes: false, sizes: [], options: [], toppings: [], available: true, availability_status: 'available', ...o })
const platos: PlatoMenu[] = [
  base({ id: 'c1', name: 'Cholao tradicional', description: 'Con frutas', toppings: [{ nombre: 'Oreo', precio: 2000 }], options: [{ tipo: 'helado', nombre: 'Elige 2 sabores de helado', cantidad: 2 }] }),
  base({ id: 'c2', name: 'Copa de helado', category: 'helados', has_sizes: true, sizes: [{ nombre: 'Pequeña', precio: 8000 }, { nombre: 'Grande', precio: 14000 }], price: 8000 }),
  base({ id: 'c3', name: 'Cholao con queso', options: [{ tipo: 'opcion', nombre: '¿Con qué?', opciones: [{ label: 'Con queso' }, { label: 'Con helado', helado: 1 }] }] }),
  base({ id: 'c4', name: 'Salpicón' }),
]
const cats = [{ value: 'cholao', label: 'Cholao' }, { value: 'helados', label: 'Helados' }, { value: 'postre', label: 'Postres' }]
const una = (a: any) => proponerCambiosMenu([a], platos, cats)[0]

assert.equal(buscarPlato('el cholao tradicional', platos)?.id, 'c1'); assert.equal(buscarPlato('copa', platos)?.id, 'c2'); assert.equal(buscarPlato('hamburguesa', platos), null)
assert.equal(buscarPlato('cholao con queso grande', platos)?.id, 'c3', 'prefiere el nombre más largo que encaja')

// toppings
let r = una({ type: 'topping', dish: 'Cholao tradicional', op: 'add', topping: 'Brownie', price: 3000 })
assert.deepEqual((r.change as any).patch.toppings, [{ nombre: 'Oreo', precio: 2000 }, { nombre: 'Brownie', precio: 3000 }]); assert.match(r.detail, /Agregar «Brownie» \(\+\$3\.000\)/)
r = una({ type: 'topping', dish: 'Cholao tradicional', op: 'add', topping: 'oreo', price: 1000 }); assert.match(r.detail, /ya estaba/); assert.equal((r.change as any).patch.toppings.length, 1)
r = una({ type: 'topping', dish: 'Cholao tradicional', op: 'remove', topping: 'Oreo' }); assert.deepEqual((r.change as any).patch.toppings, [])
r = una({ type: 'topping', dish: 'Cholao tradicional', op: 'remove', topping: 'Chocolate' }); assert.equal(r.change, null); assert.match(r.problem!, /no tiene el topping/)
r = una({ type: 'topping', dish: 'Cholao tradicional', op: 'price', topping: 'Oreo', price: 2500 }); assert.match(r.detail, /\$2\.000 → \$2\.500/)
// bolas
r = una({ type: 'scoops', dish: 'Cholao tradicional', cantidad: 3 }); assert.equal((r.change as any).patch.options[0].cantidad, 3); assert.equal((r.change as any).patch.options[0].nombre, 'Elige 3 sabores de helado'); assert.equal(r.detail, '2 → 3')
r = una({ type: 'scoops', dish: 'Cholao tradicional', cantidad: 0 }); assert.deepEqual((r.change as any).patch.options, [])
r = una({ type: 'scoops', dish: 'Salpicón', cantidad: 1 }); assert.deepEqual((r.change as any).patch.options, [{ tipo: 'helado', nombre: 'Elige el sabor del helado', cantidad: 1 }])
r = una({ type: 'scoops', dish: 'Cholao tradicional', cantidad: 2 }); assert.equal(r.change, null); assert.match(r.problem!, /Ya elige 2/)
r = una({ type: 'scoops', dish: 'Cholao con queso', cantidad: 2 }); assert.equal(r.change, null); assert.match(r.problem!, /queso\/helado/)
r = proponerCambiosMenu([{ type: 'scoops', dish: 'Salpicón', cantidad: 1 }], [base({ id: 'v', name: 'Salpicón', options: [{ v: 2, id: 'g' }] })], cats)[0]; assert.match(r.problem!, /opciones nuevas/)
r = una({ type: 'juice', dish: 'Salpicón', cantidad: 2 }); assert.equal((r.change as any).patch.options[0].tipo, 'jugo')
// tamaños
r = una({ type: 'size', dish: 'Copa de helado', op: 'add', size: 'Gigante', price: 20000 }); assert.equal((r.change as any).patch.sizes.length, 3); assert.equal((r.change as any).patch.price, 8000)
r = una({ type: 'size', dish: 'Copa de helado', op: 'price', size: 'Pequeña', price: 6000 }); assert.equal((r.change as any).patch.price, 6000, 'el precio base es el menor')
r = una({ type: 'size', dish: 'Copa de helado', op: 'remove', size: 'Mediana' }); assert.equal(r.change, null)
r = una({ type: 'size', dish: 'Copa de helado', op: 'add', size: 'grande', price: 1 }); assert.match(r.problem!, /Ya existe/)
// textos
r = una({ type: 'text', dish: 'Salpicón', field: 'description', value: 'Frutas frescas con helado' }); assert.equal((r.change as any).patch.description, 'Frutas frescas con helado')
r = una({ type: 'text', dish: 'Salpicón', field: 'category', value: 'postres' }); assert.equal((r.change as any).patch.category, 'postre'); assert.match(r.detail, /Cholao → Postres/)
r = una({ type: 'text', dish: 'Salpicón', field: 'category', value: 'bebidas' }); assert.match(r.problem!, /no existe/)
r = una({ type: 'text', dish: 'Salpicón', field: 'name', value: 'Copa de helado' }); assert.match(r.problem!, /otro plato/)
r = una({ type: 'text', dish: 'Salpicón', field: 'tags', value: 'vegano, sin gluten' }); assert.deepEqual((r.change as any).patch.tags, ['vegano', 'sin gluten'])
// crear y quitar
r = una({ type: 'create', name: 'Brownie', price: 9000, category: 'Postres', description: '' }); assert.equal((r.change as any).row.category, 'postre'); assert.equal((r.change as any).op, 'dish_insert')
r = una({ type: 'create', name: 'Salpicón', price: 9000, category: 'Postres', description: '' }); assert.match(r.problem!, /Ya existe/)
r = una({ type: 'create', name: 'Brownie', price: 9000, category: '', description: '' }); assert.match(r.problem!, /categoría/)
r = una({ type: 'remove', dish: 'Salpicón' }); assert.deepEqual((r.change as any).patch, { available: false, availability_status: 'discontinued' })
assert.equal(una({ type: 'topping', dish: 'Hamburguesa', op: 'add', topping: 'x', price: 1 }).change, null)
// varias acciones sobre el mismo plato se acumulan
const dos = proponerCambiosMenu([{ type: 'topping', dish: 'Salpicón', op: 'add', topping: 'Oreo', price: 1000 }, { type: 'topping', dish: 'Salpicón', op: 'add', topping: 'Brownie', price: 2000 }], platos, cats)
assert.equal((dos[1].change as any).patch.toppings.length, 2, 'el segundo ve el primero'); assert.equal((dos[0].change as any).patch.toppings.length, 1)
// sabores de las listas
const sab = { helado: ['Vainilla', 'Oreo'], jugo: ['Lulo'], v2: false }
const sx = (a: any, s = sab) => proponerCambiosMenu([a], platos, cats, s)[0]
r = sx({ type: 'flavor', lista: 'helado', op: 'add', sabor: 'Mora' }); assert.deepEqual((r.change as any), { op: 'flavors_set', clave: 'helado_flavors', lista: ['Vainilla', 'Oreo', 'Mora'] }); assert.match(r.detail, /2 → 3/)
r = sx({ type: 'flavor', lista: 'helado', op: 'add', sabor: 'oreo' }); assert.match(r.problem!, /ya está/)
r = sx({ type: 'flavor', lista: 'jugo', op: 'remove', sabor: 'lulo' }); assert.deepEqual((r.change as any).lista, []); assert.equal((r.change as any).clave, 'jugo_flavors')
r = sx({ type: 'flavor', lista: 'jugo', op: 'remove', sabor: 'Mango' }); assert.match(r.problem!, /no está/)
r = sx({ type: 'flavor', lista: 'helado', op: 'add', sabor: 'Mora' }, { ...sab, v2: true }); assert.match(r.problem!, /listas de opciones nuevas/)
const dosS = proponerCambiosMenu([{ type: 'flavor', lista: 'helado', op: 'add', sabor: 'Mora' }, { type: 'flavor', lista: 'helado', op: 'add', sabor: 'Kiwi' }], platos, cats, sab); assert.deepEqual((dosS[1].change as any).lista, ['Vainilla', 'Oreo', 'Mora', 'Kiwi'])
console.log('menuCambios.test OK')
