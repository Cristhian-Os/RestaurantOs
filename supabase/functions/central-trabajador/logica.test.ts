// Pruebas de central-trabajador (sin red ni base).  Correr con:  node supabase/functions/central-trabajador/logica.test.ts
import assert from 'node:assert/strict'
import { MAX_POR_CORRIDA, armarPedido, citasDeRespuesta, claveTrabajoDiario, costoCorrida, cupoRestante, extraerJson, hostDe, urlNorm, validarCandidatos } from './logica.ts'

// Cupo: respeta el máximo de la campaña y el tope por corrida; sin máximo no busca
assert.equal(cupoRestante(30, 0), MAX_POR_CORRIDA)
assert.equal(cupoRestante(30, 28), 2)
assert.equal(cupoRestante(30, 30), 0)
assert.equal(cupoRestante(0, 0), 0)
assert.equal(cupoRestante('x', 0), 0)
assert.equal(cupoRestante(undefined, 0), 0)

// URLs
assert.equal(hostDe('https://www.Ejemplo.com/menu'), 'ejemplo.com')
assert.equal(hostDe('javascript:alert(1)'), null)
assert.equal(hostDe('no es url'), null)
assert.equal(urlNorm('https://www.a.com/x/#top'), urlNorm('https://a.com/x'))

// Clave diaria estable (misma campaña y día = mismo trabajo)
assert.equal(claveTrabajoDiario('abc', '2026-11-24'), claveTrabajoDiario('abc', '2026-11-24'))
assert.notEqual(claveTrabajoDiario('abc', '2026-11-24'), claveTrabajoDiario('abc', '2026-11-25'))

// Pedido: ordena tratar la web como dato no confiable y no pedir teléfonos
const p = armarPedido({ ciudad: 'Armenia', segmento: 'pizzerías', criterios_exclusion: 'cadenas' }, 3)
assert.match(p.sistema, /NO confiable/)
assert.match(p.sistema, /No pongas teléfonos/)
assert.match(p.usuario, /hasta 3/)
assert.match(p.usuario, /Armenia/)

// JSON con ``` y con texto alrededor
assert.deepEqual(extraerJson('```json\n{"candidatos":[]}\n```'), { candidatos: [] })
assert.deepEqual(extraerJson('Claro: {"candidatos":[]} listo'), { candidatos: [] })
assert.equal(extraerJson('sin json'), null)
assert.equal(extraerJson('{roto'), null)

// Validación: SOLO pasa lo que tiene una fuente realmente citada
const citas = [{ url: 'https://directorio.co/pizzeria-roma', title: 'Roma' }, { url: 'https://www.sabor.com/', title: 'Sabor' }]
const crudo = { candidatos: [
  { nombre_comercial: 'Pizzería Roma', segmento: 'pizzería', ciudad: 'Armenia', ubicacion_publica: 'Barrio Centro', fuente_url: 'https://directorio.co/pizzeria-roma', web: 'https://pizzeriaroma.co' },
  { nombre_comercial: 'Sabor', segmento: 'restaurante', fuente_url: 'https://sabor.com', web: 'https://www.sabor.com/inicio' },
  { nombre_comercial: 'Inventado SAS', fuente_url: 'https://no-aparecio.com/x' },
  { nombre_comercial: 'pizzería roma', fuente_url: 'https://directorio.co/pizzeria-roma' },
  { nombre_comercial: 'X', fuente_url: 'https://directorio.co/pizzeria-roma' },
  { nombre_comercial: 'Malicioso', fuente_url: 'javascript:alert(1)' },
] }
const v = validarCandidatos(crudo, citas, { ciudad: 'Armenia' }, 5)
assert.deepEqual(v.aceptados.map(c => c.nombre_comercial), ['Pizzería Roma', 'Sabor'])
assert.equal(v.aceptados[0].web, null, 'una web que no apareció en la búsqueda no se guarda')
assert.equal(v.aceptados[1].web, 'https://www.sabor.com/inicio', 'una web con dominio citado sí')
assert.equal(v.aceptados[1].ciudad, 'Armenia', 'sin ciudad usa la de la campaña')
assert.ok(v.aceptados[0].fuente.includes('Sin verificar'))
assert.deepEqual(v.descartados.map(d => d.motivo).sort(), ['fuente_no_verificada', 'fuente_no_verificada', 'repetido', 'sin_nombre'].sort())

// Respeta el cupo y tolera basura
assert.equal(validarCandidatos(crudo, citas, {}, 1).aceptados.length, 1)
assert.equal(validarCandidatos(null, citas, {}, 5).aceptados.length, 0)
assert.equal(validarCandidatos({ candidatos: 'x' }, citas, {}, 5).aceptados.length, 0)
assert.equal(validarCandidatos(crudo, [], {}, 5).aceptados.length, 0, 'sin citas no se acepta nada')

// Caracteres de control fuera del nombre
const lim = validarCandidatos({ candidatos: [{ nombre_comercial: 'Bar\u0000 Uno\n', fuente_url: 'https://directorio.co/pizzeria-roma' }] }, citas, {}, 5)
assert.equal(lim.aceptados[0].nombre_comercial, 'Bar Uno')

// Citas de la respuesta del proveedor
assert.deepEqual(citasDeRespuesta({ annotations: [{ type: 'url_citation', url_citation: { url: 'https://a.com/x', title: 'A' } }, { type: 'otra' }, { type: 'url_citation', url_citation: { url: 'ftp://malo' } }] }).map(c => c.url), ['https://a.com/x'])
assert.deepEqual(citasDeRespuesta(null), [])

// Costo: siempre incluye la búsqueda web
assert.ok(costoCorrida(0) > 0)
assert.ok(costoCorrida(0.01) > costoCorrida(0))

console.log('central-trabajador: todo OK')
