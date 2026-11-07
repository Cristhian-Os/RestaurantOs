// Pruebas de la lógica de resti-voz (sin red). Correr con:  node supabase/functions/resti-voz/voz.test.ts
import assert from 'node:assert/strict'
import { crearLectorSse, vocabulario, validarPeticion, pedidoTranscribir, leerTranscripcion, pedidoHablar, leerAudio, pcmDeWav, listaModelos, esReintentable, MODELOS_TTS_POR_DEFECTO, MAX_AUDIO_B64 } from './voz.ts'

const wavB64 = 'UklGR' + 'A'.repeat(400)
// Validación: solo peticiones bien formadas llegan a Gemini
assert.deepEqual(validarPeticion({ accion: 'estado' }), { accion: 'estado' })
assert.equal(validarPeticion(null), null); assert.equal(validarPeticion('x'), null); assert.equal(validarPeticion({ accion: 'borrar' }), null)
assert.equal(validarPeticion({ accion: 'transcribir', audio: wavB64 })?.accion, 'transcribir')
assert.equal(validarPeticion({ accion: 'transcribir', audio: 'corto' }), null)
assert.equal(validarPeticion({ accion: 'transcribir', audio: 'A'.repeat(500) }), null, 'no es WAV')
assert.equal(validarPeticion({ accion: 'transcribir', audio: wavB64 + '<script>' }), null, 'no es base64')
assert.equal(validarPeticion({ accion: 'transcribir', audio: 'UklGR' + 'A'.repeat(MAX_AUDIO_B64) }), null, 'demasiado largo')
assert.equal(validarPeticion({ accion: 'hablar', texto: '   ' }), null)
assert.equal((validarPeticion({ accion: 'hablar', texto: 'Hola\u0000 mundo' }) as any).texto, 'Hola mundo')
assert.equal((validarPeticion({ accion: 'hablar', texto: 'x'.repeat(900) }) as any).texto.length, 400)
// Petición a Gemini: el audio va como dato, la instrucción es fija
{ const p = pedidoTranscribir(wavB64); assert.equal(p.contents[0].parts[1].inlineData?.mimeType, 'audio/wav'); assert.match(p.contents[0].parts[0].text!, /Transcribe literalmente/) }
{ const p = pedidoHablar('Hola', 'Kore'); assert.equal(p.contents[0].parts[0].text, 'Hola', 'solo el texto: una instrucción delante se lee en voz alta'); assert.deepEqual(p.generationConfig.responseModalities, ['AUDIO']); assert.equal(p.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore') }
// Lectura de la transcripción
const resp = (t: string) => ({ candidates: [{ content: { parts: [{ text: t }] } }] })
assert.equal(leerTranscripcion(resp('  Sube el precio de la hamburguesa  ')), 'Sube el precio de la hamburguesa')
assert.equal(leerTranscripcion(resp('"Hola Resti"')), 'Hola Resti')
assert.equal(leerTranscripcion(resp('[silencio]')), ''); assert.equal(leerTranscripcion(resp('')), ''); assert.equal(leerTranscripcion(null), '')
assert.equal(leerTranscripcion(resp('a'.repeat(900))).length, 300)
// Lectura del audio
assert.deepEqual(leerAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/L16;codec=pcm;rate=24000' } }] } }] }), { pcm: 'AAAA', rate: 24000 })
assert.equal(leerAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/L16;rate=16000' } }] } }] })?.rate, 16000)
assert.equal(leerAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/L16;rate=999999' } }] } }] })?.rate, 24000, 'frecuencia absurda → por defecto')
assert.equal(leerAudio({ candidates: [] }), null)
// Audio en contenedor WAV (gemini-3.8-flash-tts): se extrae el PCM y la frecuencia de la cabecera
{
  const pcm = Uint8Array.from([1, 0, 2, 0, 3, 0, 4, 0]), h = new DataView(new ArrayBuffer(44)); const t = (o: number, x: string) => { for (let i = 0; i < x.length; i++) h.setUint8(o + i, x.charCodeAt(i)) }
  t(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); t(8, 'WAVE'); t(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, 22050, true); h.setUint32(28, 44100, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); t(36, 'data'); h.setUint32(40, pcm.length, true)
  const todo = new Uint8Array(44 + pcm.length); todo.set(new Uint8Array(h.buffer), 0); todo.set(pcm, 44)
  const b64 = btoa(String.fromCharCode(...todo)), r = pcmDeWav(b64)!
  assert.equal(r.rate, 22050); assert.deepEqual(Array.from(Uint8Array.from(atob(r.pcm), c => c.charCodeAt(0))), [1, 0, 2, 0, 3, 0, 4, 0])
  assert.deepEqual(leerAudio({ candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType: 'audio/wav' } }] } }] }), r, 'leerAudio detecta el WAV')
  h.setUint32(40, 0, true); const stream = new Uint8Array(44 + pcm.length); stream.set(new Uint8Array(h.buffer), 0); stream.set(pcm, 44)   // tamaño 0 (cabecera de streaming)
  assert.equal(Uint8Array.from(atob(pcmDeWav(btoa(String.fromCharCode(...stream)))!.pcm), c => c.charCodeAt(0)).length, 8)
  assert.equal(pcmDeWav(btoa('no soy un wav, solo texto de relleno para que pase el largo mínimo de cuarenta y cuatro bytes')), null)
}
// Modelos: lista configurable y respaldo
assert.deepEqual(listaModelos(' gemini-3.8-flash-tts , gemini-3.1-flash-tts-preview ', []), ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'])
assert.deepEqual(listaModelos(undefined, MODELOS_TTS_POR_DEFECTO), MODELOS_TTS_POR_DEFECTO); assert.deepEqual(listaModelos('mal modelo; drop', ['x-y-z']), ['x-y-z'])
assert.ok(esReintentable(404) && esReintentable(429) && esReintentable(503) && !esReintentable(400) && !esReintentable(401))
// Streaming SSE: eventos partidos entre trozos, cabecera WAV y frecuencia
{
  const pcm = (...v: number[]) => btoa(String.fromCharCode(...v))
  const ev = (b64: string, mime = 'audio/l16; rate=24000; channels=1') => `data: {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "${mime}","data": "${b64}"}}]}}]}\r\n\r\n`
  const l = crearLectorSse(), e1 = ev(pcm(1, 0, 2, 0)), e2 = ev(pcm(3, 0, 4, 0))
  const a = [...l.empujar(e1.slice(0, 40)), ...l.empujar(e1.slice(40) + e2.slice(0, 25)), ...l.empujar(e2.slice(25))]
  assert.deepEqual(a.map(x => Array.from(x)), [[1, 0, 2, 0], [3, 0, 4, 0]]); assert.equal(l.rate(), 24000)
  const l2 = crearLectorSse(); assert.deepEqual(l2.empujar(ev(pcm(9, 0)).trimEnd()).length, 0, 'sin línea en blanco aún no es un evento completo'); assert.equal(l2.cerrar().length, 1)
  const wav = new Uint8Array(46); wav.set([82, 73, 70, 70], 0); wav[44] = 7; wav[45] = 0
  const l3 = crearLectorSse(); const r3 = l3.empujar(ev(btoa(String.fromCharCode(...wav)), 'audio/L16; rate=22050')); assert.deepEqual(Array.from(r3[0]), [7, 0]); assert.equal(l3.rate(), 22050)
  assert.equal(crearLectorSse().empujar('data: {no es json}\r\n\r\n').length, 0)
}
// Pedido de hablar en streaming y vocabulario del restaurante
assert.deepEqual(validarPeticion({ accion: 'hablar_stream', texto: 'Hola' }), { accion: 'hablar_stream', texto: 'Hola' })
assert.equal(validarPeticion({ accion: 'hablar_stream', texto: '  ' }), null)
assert.equal(vocabulario(['Helado de vainilla', 'helado de vainilla', 'x', 'Oreo\n', 'Brownie']), 'Helado de vainilla, Oreo, Brownie')
assert.ok(vocabulario(Array.from({ length: 500 }, (_, i) => 'plato número ' + i), 300).length <= 300)
assert.match(JSON.stringify(pedidoTranscribir('A'.repeat(300), 'Oreo, Brownie')), /Oreo, Brownie/)
assert.doesNotMatch(JSON.stringify(pedidoTranscribir('A'.repeat(300))), /ayuda para escribir/)
console.log('voz.test OK')
