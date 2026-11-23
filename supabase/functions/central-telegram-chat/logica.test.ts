// Pruebas de central-telegram-chat (sin red ni base).  Correr con:  node supabase/functions/central-telegram-chat/logica.test.ts
import assert from 'node:assert/strict'
import { TEXTO_AYUDA, comando, contextoParaIA, esDelDueno, iguales, leerMensaje, partir, textoEstado } from './logica.ts'

const upd = (over: Record<string, unknown> = {}) => ({ update_id: 10, message: { chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false }, text: 'hola', ...over } })
assert.deepEqual(leerMensaje(upd()), { updateId: 10, chatId: '555', fromId: '555', texto: 'hola' })
assert.equal(leerMensaje(upd({ text: '   ' })), null)
assert.equal(leerMensaje(upd({ text: 5 })), null)
assert.equal(leerMensaje(upd({ chat: { id: 555, type: 'group' } })), null, 'grupos no')
assert.equal(leerMensaje(upd({ from: { id: 555, is_bot: true } })), null, 'bots no')
assert.equal(leerMensaje({ update_id: 'x', message: {} }), null)
assert.equal(leerMensaje(null), null)
assert.equal(leerMensaje({ edited_message: {} }), null)
assert.equal(leerMensaje(upd({ text: 'a'.repeat(5000) }))!.texto.length, 2000)

// Solo el dueño: chat y persona
assert.equal(esDelDueno(leerMensaje(upd())!, '555'), true)
assert.equal(esDelDueno(leerMensaje(upd())!, '556'), false)
assert.equal(esDelDueno(leerMensaje(upd({ from: { id: 999, is_bot: false } }))!, '555'), false)
assert.equal(esDelDueno(leerMensaje(upd())!, ''), false, 'sin chat configurado nadie es dueño')

// Secreto
assert.equal(iguales('abc123', 'abc123'), true)
assert.equal(iguales('abc123', 'abc124'), false)
assert.equal(iguales('abc', 'abcd'), false)
assert.equal(iguales('', ''), false)

// Comandos: solo los permitidos. No existe un comando para encender, aprobar ni gastar.
assert.equal(comando('/estado'), 'estado')
assert.equal(comando('/APAGAR'), 'apagar')
assert.equal(comando('/estado@MiBot'), 'estado')
assert.equal(comando('/encender'), null)
assert.equal(comando('apaga todo'), null)
assert.ok(!/encender|aprobar/.test('estado apagar ayuda start'))

// Partir en trozos
assert.deepEqual(partir('hola'), ['hola'])
assert.deepEqual(partir('  '), [])
const largo = ('palabra '.repeat(1000)).trim()
const trozos = partir(largo, 3500)
assert.ok(trozos.length >= 3 && trozos.every(t => t.length <= 3500))
assert.equal(trozos.join(' ').replace(/\s+/g, ' '), largo)

// Estado y contexto
const e = { agentesActivos: false, campanasVigentes: 1, prospectos: 7, prospectosPorVerificar: 7, trabajosHoy: { succeeded: 2, failed: 0 }, gastoMes: 0.31, topeMes: 5, pausados: [] }
assert.match(textoEstado(e), /apagados/)
assert.match(textoEstado(e), /2 terminados/)
assert.ok(!/fallidos/.test(textoEstado(e)), 'no lista ceros')
assert.match(textoEstado({ ...e, trabajosHoy: {}, pausados: ['Buscar negocios'] }), /ninguno/)
assert.match(contextoParaIA(e), /NO inventes/)
assert.match(contextoParaIA(e), /no ejecutas acciones/)
assert.match(TEXTO_AYUDA, /2 pasos/)
console.log('central-telegram-chat: todo OK')
