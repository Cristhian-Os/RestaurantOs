// Pruebas de la lógica de resti-voz (sin red). Correr con:  node supabase/functions/resti-voz/voz.test.ts
import assert from 'node:assert/strict'
import { validarPeticion, pedidoTranscribir, leerTranscripcion, pedidoHablar, leerAudio, MAX_AUDIO_B64 } from './voz.ts'

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
{ const p = pedidoHablar('Hola', 'Kore'); assert.deepEqual(p.generationConfig.responseModalities, ['AUDIO']); assert.equal(p.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore') }
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
console.log('voz.test OK')
