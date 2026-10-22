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
// Herramientas (guardar_opinion, guardar_lead…): compatible y Gemini
{
  const herr = [{ name: 'guardar_opinion', description: 'Guarda la opinión', parameters: { type: 'OBJECT', properties: { tipo: { type: 'STRING', enum: ['fallo', 'mejora'] }, detalle: { type: 'STRING' } }, required: ['tipo', 'detalle'] } }]
  const f = falso({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'guardar_opinion', arguments: '{"tipo":"fallo","detalle":"no carga"}' } }] } }], usage: { prompt_tokens: 5, completion_tokens: 3 } })
  const r = await callModel({ proveedor: 'compatible', modelo: 'm', clave: 'k', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'se cae la caja', herramientas: herr }, f)
  const cuerpo = JSON.parse(capturas.at(-1)!.init.body)
  assert.deepEqual(r.llamadas, [{ nombre: 'guardar_opinion', args: { tipo: 'fallo', detalle: 'no carga' } }]); assert.equal(r.texto, '')
  assert.equal(cuerpo.tools[0].function.parameters.type, 'object', 'tipos en minúscula para el proveedor compatible')
  assert.equal(cuerpo.tools[0].function.parameters.properties.tipo.type, 'string')
  assert.deepEqual(cuerpo.tools[0].function.parameters.properties.tipo.enum, ['fallo', 'mejora'])
  assert.equal(cuerpo.response_format, undefined, 'con herramientas no se fuerza JSON'); assert.equal(cuerpo.tool_choice, 'auto')
  // argumentos que no son JSON: llamada con args vacíos (el validador de cada función la rechaza)
  const mala = await callModel({ proveedor: 'compatible', modelo: 'm', clave: 'k', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u', herramientas: herr },
    falso({ choices: [{ message: { tool_calls: [{ function: { name: 'guardar_opinion', arguments: '{roto' } }] } }] }))
  assert.deepEqual(mala.llamadas, [{ nombre: 'guardar_opinion', args: {} }])
  // Gemini: declaraciones tal cual y llamadas leídas de functionCall
  const g = await callModel({ proveedor: 'gemini', modelo: 'g', clave: 'k' }, { sistema: 's', usuario: 'u', herramientas: herr },
    falso({ candidates: [{ content: { parts: [{ functionCall: { name: 'guardar_opinion', args: { tipo: 'mejora', detalle: 'x' } } }] } }] }))
  const cg = JSON.parse(capturas.at(-1)!.init.body)
  assert.equal(cg.tools[0].functionDeclarations[0].parameters.type, 'OBJECT'); assert.equal(cg.generationConfig.responseMimeType, undefined)
  assert.deepEqual(g.llamadas, [{ nombre: 'guardar_opinion', args: { tipo: 'mejora', detalle: 'x' } }])
  assert.deepEqual((await callModel({ proveedor: 'compatible', modelo: 'm', clave: 'k', urlBase: 'https://x.com' }, { sistema: 's', usuario: 'u' }, falso({ choices: [{ message: { content: 'hola' } }] }))).llamadas, [])
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
