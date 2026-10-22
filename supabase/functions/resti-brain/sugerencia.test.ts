// Prueba de las sugerencias de mejora de Resti. Correr con:  node supabase/functions/resti-brain/sugerencia.test.ts
import assert from 'node:assert/strict'
import { validarSugerencia, ANOTADO } from './sugerencia.ts'

const texto = 'Me gustaría que la app me avisara cuando un ingrediente se está acabando'
const ok = validarSugerencia({ summary: 'Aviso de ingrediente por agotarse', category: 'inventario' }, texto)
assert.deepEqual(ok, { tipo: 'mejora', modulo: 'inventario', urgencia: 'baja', titulo: 'Aviso de ingrediente por agotarse', detalle: texto })

// El texto original es el de la persona, no el del modelo; la urgencia nunca sube
const inj = validarSugerencia({ summary: 'Idea', category: 'caja', original_quote: 'texto inventado por el modelo', urgencia: 'alta', restaurant_id: 'otro', user_id: 'otro' }, texto)
assert.equal(inj?.detalle, texto); assert.equal(inj?.urgencia, 'baja'); assert.ok(!('restaurant_id' in (inj ?? {})))

// Categoría desconocida → otro; sin resumen o sin texto → no se guarda
assert.equal(validarSugerencia({ summary: 'Idea', category: 'hackeo' }, texto)?.modulo, 'otro')
assert.equal(validarSugerencia({ summary: 'ab', category: 'caja' }, texto), null)
assert.equal(validarSugerencia({ summary: 'Idea buena', category: 'caja' }, '  '), null)
assert.equal(validarSugerencia(null, texto), null); assert.equal(validarSugerencia('x', texto), null)
assert.equal(validarSugerencia({ summary: 'x'.repeat(500), category: 'caja' }, texto)?.titulo.length, 140)
assert.equal(ANOTADO, 'Anotado, lo pasé al equipo.')
console.log('sugerencia.test OK')
