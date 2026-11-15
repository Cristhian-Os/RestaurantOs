// Prueba de las rutas de Central. Correr con:  node src/central/rutas.test.ts
import assert from 'node:assert/strict'
import { parseRuta, rutaAPath, SECCIONES } from './rutas.ts'

assert.deepEqual(parseRuta('/central'), { seccion: 'inicio', id: null })
assert.deepEqual(parseRuta('/central/'), { seccion: 'inicio', id: null })
assert.deepEqual(parseRuta('/central/tareas'), { seccion: 'tareas', id: null })
assert.deepEqual(parseRuta('/central/agentes/sofia'), { seccion: 'agentes', id: 'sofia' })
assert.deepEqual(parseRuta('/central/agentes/sofia?x=1#y'), { seccion: 'agentes', id: 'sofia' })
// Lo desconocido o raro cae en inicio, nunca en una pantalla en blanco ni en un id peligroso
assert.deepEqual(parseRuta('/central/inventada'), { seccion: 'inicio', id: null })
assert.deepEqual(parseRuta('/otra/cosa'), { seccion: 'inicio', id: null })
assert.deepEqual(parseRuta('/central/agentes/<script>'), { seccion: 'agentes', id: null })
assert.deepEqual(parseRuta('/central/agentes/' + 'a'.repeat(65)), { seccion: 'agentes', id: null })
// Ida y vuelta para todas las secciones
for (const s of SECCIONES) {
  assert.deepEqual(parseRuta(rutaAPath(s.id)), { seccion: s.id, id: null }, `ida y vuelta de ${s.id}`)
  assert.deepEqual(parseRuta(rutaAPath(s.id, 'x-1')), { seccion: s.id, id: s.id === 'inicio' ? null : 'x-1' }, `ida y vuelta con id de ${s.id}`)
}
assert.equal(rutaAPath('inicio'), '/central')
assert.equal(rutaAPath('tareas', 'no valido!'), '/central/tareas')
assert.equal(new Set(SECCIONES.map(s => s.id)).size, SECCIONES.length, 'sin secciones repetidas')

console.log('rutas: todo OK')
