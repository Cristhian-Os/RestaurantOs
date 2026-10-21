// Prueba del validador de resti-brain. Correr con:  node supabase/functions/resti-brain/brain.test.ts
import assert from 'node:assert/strict'
import { validar, TARGETS } from './brain.ts'

assert.equal(TARGETS.length, 9)
assert.deepEqual(validar({ speech: 'Vas bien hoy.', action: 'NONE' }), { speech: 'Vas bien hoy.', action: 'NONE' })
assert.deepEqual(validar({ speech: 'Mira.', action: 'WALK_AND_POINT', targetId: 'card-listas' }), { speech: 'Mira.', action: 'WALK_AND_POINT', targetId: 'card-listas' })
assert.equal(validar({ speech: 'x', action: 'WALK_AND_POINT', targetId: 'btn-cobrar' }), null)   // fuera de la lista blanca
assert.equal(validar({ speech: 'x', action: 'WALK_AND_POINT' }), null)
assert.equal(validar({ speech: 'x', action: 'COBRAR' }), null)
assert.equal(validar({ speech: '  ', action: 'NONE' }), null)
assert.equal(validar(null), null)
assert.equal(validar({ speech: 'Hola.', action: 'NONE', targetId: 'card-listas' })?.targetId, undefined)   // targetId de más se descarta
assert.equal(validar({ speech: 'Uno. Dos. Tres.', action: 'NONE' })?.speech, 'Uno. Dos.')
console.log('brain.test OK')
