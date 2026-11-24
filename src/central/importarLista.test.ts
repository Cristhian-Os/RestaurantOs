// Pruebas de importarLista (sin red ni base).  Correr con:  node src/central/importarLista.test.ts
import assert from 'node:assert/strict'
import { MAX_LINEAS, leerLista } from './importarLista.ts'

const r = leerLista(`
# comentario
Pizzería Roma | Calle 14 #12-30, Centro | https://maps.app.goo.gl/abc123 | 3101234567
Café del Parque, Parque Sucre https://maps.google.com/?q=cafe
Asadero El Fogón - Barrio La Cecilia
Pizzería Roma | otra línea repetida
|
Solo Nombre
javascript:alert(1)
`)
assert.deepEqual(r.filas[0], { nombre_comercial: 'Pizzería Roma', ubicacion_publica: 'Calle 14 #12-30, Centro', fuente_url: 'https://maps.app.goo.gl/abc123', telefono: '3101234567' })
assert.deepEqual(r.filas[1], { nombre_comercial: 'Café del Parque', ubicacion_publica: 'Parque Sucre', fuente_url: 'https://maps.google.com/?q=cafe' })
assert.deepEqual(r.filas[2], { nombre_comercial: 'Asadero El Fogón', ubicacion_publica: 'Barrio La Cecilia' })
assert.deepEqual(r.filas[3], { nombre_comercial: 'Solo Nombre', ubicacion_publica: '' })
assert.ok(r.descartadas.some(d => d.motivo === 'Repetido en la lista'))
assert.ok(r.descartadas.some(d => d.motivo === 'No tiene un nombre'))
assert.equal(r.filas.some(f => f.nombre_comercial.includes('javascript')), true, 'una línea suelta se toma como nombre, pero nunca como enlace')
assert.equal(r.filas.every(f => !f.fuente_url || /^https?:\/\//.test(f.fuente_url)), true)
// Caracteres de control y espacios
assert.equal(leerLista('Bar\u0000   Uno | Calle 1').filas[0].nombre_comercial, 'Bar Uno')
// Máximo por vez
const muchas = Array.from({ length: MAX_LINEAS + 5 }, (_, i) => `Negocio ${i}`).join('\n')
const g = leerLista(muchas)
assert.equal(g.filas.length, MAX_LINEAS); assert.ok(g.descartadas[0].motivo.includes('máximo'))
// Vacío
assert.deepEqual(leerLista('  \n\n'), { filas: [], descartadas: [] })
console.log('importarLista: todo OK')
