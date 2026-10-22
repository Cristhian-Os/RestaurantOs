// Prueba del asistente de la carta. Correr con:  node supabase/functions/menu-asistente/carta.test.ts
import assert from 'node:assert/strict'
import { armarCarta, agotadosDeConfig, pareceAlergia, cerrarRespuesta, validarPregunta, mesaValida, sesionValida, diaBogota, SYSTEM, NOTA_ALERGIA, SIN_SERVICIO } from './carta.ts'

const platos = [
  { id: 'a', name: 'Cholado clásico', description: 'Fruta, helado y leche condensada', price: 14000, category: 'Cholados', availability_status: 'available', tags: ['popular'], sizes: [{ nombre: 'Grande', precio: 18000 }] },
  { id: 'b', name: 'Brownie', description: null, price: '9000', category: 'Postres', availability_status: 'out_of_stock', tags: null, sizes: [] },
  { id: 'c', name: 'Jugo del día', description: 'Natural', price: 7000, category: 'Bebidas', availability_status: 'available', tags: [], sizes: null },
]
const carta = armarCarta(platos, new Map([['a', ['Fruta', 'Helado de vainilla', 'Leche condensada', 'Fruta']], ['b', []]]))

// Disponibilidad real y datos de la carta
assert.equal(carta[0].agotado, false); assert.equal(carta[1].agotado, true); assert.equal(carta[1].precio, 9000)
assert.deepEqual(carta[0].ingredientes, ['Fruta', 'Helado de vainilla', 'Leche condensada'])   // sin repetidos
assert.equal(carta[1].ingredientes, null); assert.equal(carta[2].ingredientes, null)             // sin receta = NO se sabe qué lleva
assert.deepEqual(carta[0].tamanos, [{ nombre: 'Grande', precio: 18000 }]); assert.deepEqual(carta[2].tamanos, [])
assert.deepEqual(agotadosDeConfig({ helado_flavors_off: ['Fresa'], toppings_off: ['Maní'], otro: 1 }), ['Fresa', 'Maní']); assert.deepEqual(agotadosDeConfig(null), [])

// Alergias: siempre termina pidiendo confirmar con el personal
for (const q of ['¿tiene maní?', 'soy celíaco, ¿tiene gluten?', 'tengo alergia a los mariscos', '¿es vegano el cholado?', '¿lleva huevo?']) assert.ok(pareceAlergia(q), q)
for (const q of ['¿cuánto vale el brownie?', '¿qué me recomiendas?', '¿hay jugo?']) assert.ok(!pareceAlergia(q), q)
assert.equal(cerrarRespuesta('¿tiene maní?', 'No tengo registrado ese dato en el cholado'), 'No tengo registrado ese dato en el cholado. ' + NOTA_ALERGIA)
assert.equal(cerrarRespuesta('¿tiene maní?', 'No lo sé. Confirma con el personal si tienes alergia.'), 'No lo sé. Confirma con el personal si tienes alergia.')   // no se repite
assert.equal(cerrarRespuesta('¿cuánto vale?', 'Vale $14.000.'), 'Vale $14.000.')
assert.equal(cerrarRespuesta('hola', '   '), SIN_SERVICIO); assert.equal(cerrarRespuesta('hola', 'x'.repeat(2000)).length, 700)

// Entradas
assert.equal(validarPregunta('  ¿tiene  maní? '), '¿tiene maní?'); assert.equal(validarPregunta('a'), null); assert.equal(validarPregunta('x'.repeat(301)), null); assert.equal(validarPregunta(5), null)
assert.equal(mesaValida('12'), '12'); assert.equal(mesaValida(7), '7'); assert.equal(mesaValida('12; drop'), 'sin'); assert.equal(mesaValida(undefined), 'sin')
assert.equal(sesionValida('abcdef123456'), 'abcdef123456'); assert.equal(sesionValida('x'), null)
assert.equal(diaBogota(new Date('2026-10-22T03:00:00Z')), '20261021')   // 22:00 del 21 en Colombia

// El prompt trae las reglas y la carta
const s = SYSTEM('Cholaos', JSON.stringify(carta), ['Fresa'])
assert.match(s, /SOLO los datos de la carta/); assert.match(s, /Agotado por el cajero.*Fresa/); assert.match(s, /Cholado clásico/); assert.match(s, /tema "fuera"/)
console.log('carta.test OK')
