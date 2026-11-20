// Prueba de la conversión de unidades. Correr con:  node src/lib/unidades.test.ts
import assert from 'node:assert/strict'
import { convertir, unidadesCompatibles, cantidadAmigable, etiquetaUnidad } from './unidades.ts'

assert.equal(convertir(200, 'gramo', 'kg'), 0.2)
assert.equal(convertir(2, 'kg', 'gramo'), 2000)
assert.equal(convertir(1, 'libra', 'gramo'), 453.59237)
assert.equal(convertir(2, 'libra', 'kg'), 0.907185)
assert.equal(convertir(500, 'ml', 'litro'), 0.5)
assert.equal(convertir(3, 'pieza', 'pieza'), 3)
assert.equal(convertir(1, 'kg', 'litro'), null)
assert.equal(convertir(1, 'pieza', 'paquete'), null)

assert.deepEqual(unidadesCompatibles('kg'), ['kg', 'gramo', 'libra'])
assert.deepEqual(unidadesCompatibles('ml'), ['litro', 'ml'])
assert.deepEqual(unidadesCompatibles('pieza'), ['pieza'])
assert.equal(unidadesCompatibles(null).length, 7)

assert.deepEqual(cantidadAmigable(0.2, 'kg'), { cantidad: 200, unidad: 'gramo' })
assert.deepEqual(cantidadAmigable(0.25, 'litro'), { cantidad: 250, unidad: 'ml' })
assert.deepEqual(cantidadAmigable(2, 'kg'), { cantidad: 2, unidad: 'kg' })
assert.equal(etiquetaUnidad('gramo'), 'g')
assert.equal(etiquetaUnidad('libra'), 'lb')
console.log('unidades OK')
