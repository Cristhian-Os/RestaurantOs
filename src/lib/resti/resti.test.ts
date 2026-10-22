// Prueba de la lista blanca, el validador y el router local. Correr con:  node src/lib/resti/resti.test.ts
import assert from 'node:assert/strict'
import { RESTI_TARGETS, isRestiTarget } from './targets.ts'
import { parseBrainResponse, recortarHabla } from './brain.ts'
import { intencionLocal } from './intents.ts'

// Lista blanca: exactamente los nueve
assert.equal(RESTI_TARGETS.length, 9)
assert.ok(isRestiTarget('card-listas')); assert.ok(!isRestiTarget('btn-cobrar')); assert.ok(!isRestiTarget(undefined))

// Validador: lo que no cumple el esquema se descarta
assert.deepEqual(parseBrainResponse({ speech: 'Hola.', action: 'NONE' }), { speech: 'Hola.', action: 'NONE' })
assert.equal(parseBrainResponse({ speech: 'x', action: 'COBRAR' }), null)
assert.equal(parseBrainResponse({ speech: 'x', action: 'WALK_AND_POINT', targetId: 'btn-cobrar' }), null)
assert.equal(parseBrainResponse({ speech: 'x', action: 'WALK_AND_POINT' }), null)
assert.equal(parseBrainResponse({ speech: 'x', action: 'NONE', targetId: 'card-listas' }), null)
assert.equal(parseBrainResponse({ speech: '', action: 'NONE' }), null)
assert.equal(parseBrainResponse('texto'), null)
assert.equal(parseBrainResponse({ speech: 'Mira aquí.', action: 'WALK_AND_POINT', targetId: 'tab-mesas' })?.targetId, 'tab-mesas')
assert.equal(recortarHabla('Uno. Dos. Tres. Cuatro.'), 'Uno. Dos.')

// Router local
const t = (s: string) => intencionLocal(s)
assert.equal(t('muéstrame la cocina')?.targetId, 'card-en-cocina')
assert.equal(t('abre nueva orden')?.targetId, 'tab-nueva-orden')
assert.equal(t('ver mesas')?.targetId, 'tab-mesas')
assert.equal(t('mesas activas')?.targetId, 'card-mesas-activas')
assert.equal(t('cómo van las ventas')?.targetId, 'card-ventas-hoy')
assert.equal(t('descansa')?.action, 'SLEEP')
assert.equal(t('quiero cambiar el precio de la pizza')?.action, 'OPEN_VOICE_COMMANDS')
assert.equal(t('cuéntame un chiste'), null)
assert.equal(t(''), null)
console.log('resti.test OK')
