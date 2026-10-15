// Chequeo rápido de voiceText (sin framework):
//   node --experimental-strip-types scripts/voiceText.check.ts
import assert from 'node:assert/strict'
import { limpiarTranscripcion, reemplazarGrupo } from '../src/services/voiceText.ts'

// Con o sin punto final, el nombre queda completo (antes se perdía la última letra: "Frutas Pére").
assert.equal(limpiarTranscripcion('Frutas Pérez'), 'Frutas Pérez')
assert.equal(limpiarTranscripcion('Frutas Pérez.'), 'Frutas Pérez')
assert.equal(limpiarTranscripcion('  Frutas Pérez .  '), 'Frutas Pérez')
assert.equal(limpiarTranscripcion('Coca-Cola'), 'Coca-Cola')
assert.equal(limpiarTranscripcion(''), '')

// Editar el dictado 2 no toca los cambios de los dictados 1 y 3.
type It = { id: number; group: number }
const items: It[] = [{ id: 1, group: 1 }, { id: 2, group: 2 }, { id: 3, group: 2 }, { id: 4, group: 3 }]
assert.deepEqual(reemplazarGrupo(items, 2, [{ id: 9, group: 2 }]).map(i => i.id), [1, 9, 4])
assert.deepEqual(reemplazarGrupo(items, 2, []).map(i => i.id), [1, 4])
// Grupo que ya no tiene elementos (el usuario los quitó todos): lo nuevo va al final.
assert.deepEqual(reemplazarGrupo([{ id: 1, group: 1 }], 5, [{ id: 8, group: 5 }]).map(i => i.id), [1, 8])

console.log('voiceText: OK')
