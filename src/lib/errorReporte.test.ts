// Prueba de las reglas del detector de errores. Correr con:  node src/lib/errorReporte.test.ts
import assert from 'node:assert/strict'
import { crearLimitador, prepararReporte } from './errorReporte.ts'

// Un error normal se reporta con su mensaje y su pila
const real = new TypeError('Cannot read properties of undefined (reading "total")')
const r = prepararReporte('ventana', real)
assert.ok(r && r.origen === 'ventana' && r.mensaje.includes('reading "total"') && r.pila.length > 0)
// Un texto suelto (promesa rechazada con un string) también
assert.equal(prepararReporte('promesa', 'Algo salió mal')?.mensaje, 'Algo salió mal')
// Espacios y saltos de línea se limpian; el mensaje se corta a 300
assert.equal(prepararReporte('react', new Error('  uno \n  dos  '))?.mensaje, 'uno dos')
assert.equal(prepararReporte('react', new Error('x'.repeat(1000)))?.mensaje.length, 300)
assert.ok((prepararReporte('react', Object.assign(new Error('a'), { stack: 'y'.repeat(5000) }))?.pila.length ?? 0) <= 1500)
// Ruido y cosas vacías: no se reportan
for (const ruido of ['ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'The user aborted a request.']) {
  assert.equal(prepararReporte('ventana', new Error(ruido)), null, `ruido: ${ruido}`)
}
for (const vacio of [undefined, null, '', '   ', 42, {}, new Error('')]) assert.equal(prepararReporte('promesa', vacio), null, `vacío: ${String(vacio)}`)

// Limitador: el mismo error una sola vez; como máximo 5 distintos por minuto; pasado el minuto vuelve a dejar pasar
const puede = crearLimitador(5, 60_000)
const rep = (m: string) => ({ origen: 'ventana' as const, mensaje: m, pila: '' })
assert.equal(puede(rep('a'), 0), true)
assert.equal(puede(rep('a'), 1), false, 'el mismo error no se repite')
for (const m of ['b', 'c', 'd', 'e']) assert.equal(puede(rep(m), 2), true)
assert.equal(puede(rep('f'), 3), false, 'más de 5 por minuto se descartan')
assert.equal(puede(rep('g'), 61_000), true, 'pasado el minuto vuelve a pasar')

console.log('errorReporte: todo OK')
