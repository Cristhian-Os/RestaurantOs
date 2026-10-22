// Pruebas del adaptador de modelos (sin red). Correr con:  node supabase/functions/_shared/modelo.test.ts
import assert from 'node:assert/strict'
import { callModel, cargarProveedor, type Fetch } from './modelo.ts'

const capturas: { url: string; init: any }[] = []
const falso = (cuerpo: unknown, ok = true, status = 200): Fetch => async (url, init) => { capturas.push({ url, init }); return { ok, status, json: async () => cuerpo } }

// Compatible (DeepSeek): URL, cabecera, orden de mensajes y modo JSON
{
  const f = falso({ choices: [{ message: { content: ' {"speech":"Hola."} ' } }], usage: { prompt_tokens: 40, completion_tokens: 7 } })
  const r = await callModel({ proveedor: 'compatible', modelo: 'm-x', clave: 'sk-prueba', urlBase: 'https://api.ejemplo.com/' }, {
    sistema: 'Eres Resti.', usuario: '¿y ayer?', mensajes: [{ rol: 'user', texto: 'ventas de hoy' }, { rol: 'assistant', texto: 'Van 120 mil.' }],
  }, f)
  const { url, init } = capturas.at(-1)!, cuerpo = JSON.parse(init.body)
  assert.equal(url, 'https://api.ejemplo.com/chat/completions')
  assert.equal(init.headers.Authorization, 'Bearer sk-prueba')
  assert.deepEqual(cuerpo.messages.map((m: any) => m.role), ['system', 'user', 'assistant', 'user'])
  assert.equal(cuerpo.messages.at(-1).content, '¿y ayer?')
  assert.deepEqual(cuerpo.response_format, { type: 'json_object' })
  assert.match(cuerpo.messages[0].content, /json/i, 'el modo JSON exige la palabra json en el mensaje')
  assert.equal(r.texto, '{"speech":"Hola."}'); assert.equal(r.tokensEntrada, 40); assert.equal(r.proveedor, 'compatible')
  assert.ok(init.signal, 'lleva señal de tiempo límite')
}
// Compatible: sin modo JSON si se pide texto libre
{
  await callModel({ proveedor: 'compatible', modelo: 'm', clave: 'k', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u', json: false }, falso({ choices: [{ message: { content: 'ok' } }] }))
  assert.equal(JSON.parse(capturas.at(-1)!.init.body).response_format, undefined)
}
// Gemini (respaldo): roles user/model y clave en cabecera, nunca en la URL
{
  await callModel({ proveedor: 'gemini', modelo: 'g-1', clave: 'AIza-prueba' }, { sistema: 's', usuario: 'u2', mensajes: [{ rol: 'user', texto: 'u1' }, { rol: 'assistant', texto: 'a1' }] },
    falso({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }))
  const { url, init } = capturas.at(-1)!, c = JSON.parse(init.body)
  assert.ok(!url.includes('AIza-prueba')); assert.equal(init.headers['x-goog-api-key'], 'AIza-prueba')
  assert.deepEqual(c.contents.map((x: any) => x.role), ['user', 'model', 'user'])
}
// Errores: sin clave, respuesta no ok (el mensaje no filtra la clave ni el cuerpo), tiempo límite
assert.throws(() => callModel({ proveedor: 'compatible', modelo: 'm', clave: '', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u' }, falso({})), /clave/)   // error síncrono: contrato que ya usa ai-report
await assert.rejects(() => callModel({ proveedor: 'compatible', modelo: 'm', clave: 'sk-secreta', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u' }, falso({ error: 'sk-secreta' }, false, 429)),
  (e: Error) => /429/.test(e.message) && !e.message.includes('sk-secreta'))
await assert.rejects(() => callModel({ proveedor: 'compatible', modelo: 'm', clave: 'k', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u', timeoutMs: 20 },
  (_u, init) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('abortado'))))), /tardó demasiado/)

// cargarProveedor: DeepSeek solo si está configurado; si no, Gemini; sin clave → null
const admin = (filas: Record<string, string>) => ({ from: () => ({ select: () => ({ in: async () => ({ data: Object.entries(filas).map(([key, value]) => ({ key, value })) }) }) }) })
assert.deepEqual(await cargarProveedor(admin({ ai_proveedor: 'compatible', ai_url_base: 'https://api.deepseek.com', ai_modelo: 'm1', ai_api_key: 'k1', gemini_api_key: 'g' })), { proveedor: 'compatible', modelo: 'm1', clave: 'k1', urlBase: 'https://api.deepseek.com' })
assert.equal((await cargarProveedor(admin({ gemini_api_key: 'g' })))?.proveedor, 'gemini')
assert.equal(await cargarProveedor(admin({ ai_proveedor: 'compatible', ai_modelo: 'm1' })), null)
assert.equal(await cargarProveedor(admin({})), null)

console.log('modelo.test OK')
