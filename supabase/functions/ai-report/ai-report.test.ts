// Pruebas del reporte con IA (sin red). Correr con:  node supabase/functions/ai-report/ai-report.test.ts
import assert from 'node:assert/strict'
import { callModel, costoUsd, type Fetch } from './modelo.ts'
import { redactar } from './generar.ts'
import { periodo } from './periodo.ts'
import { aNumero, cifrasDeTexto, cifrasInventadas, limpiarPersonales, tieneCorreo, validarEsquema } from './validar.ts'

// Datos de la semana de ejemplo (los mismos que se calcularon a mano en la base de prueba)
const datos = {
  periodo: { desde: '2026-01-05', hasta: '2026-01-11', dias: 7 },
  ventas: { total: 118000, pedidos: 3, ticket_promedio: 39333 },
  comparacion: { periodo_anterior: { ventas: 59000, variacion_ventas_pct: 100.0 }, promedio_4_semanas_equivalentes: { variacion_pct: -22.5 } },
  por_dia_semana: [{ dia: 'Martes', ventas: 86000, pedidos: 2 }],
  platos: { mas_vendidos: [{ nombre: 'Jugo', unidades: 5, margen_pct: 50.0 }], sin_receta_vendidos: 1 },
}
const bueno = {
  resumen: 'Vendiste 118.000 en 3 pedidos, el doble de la semana anterior.',
  hallazgos: [{ texto: 'Las ventas subieron 100% frente a la semana anterior (59.000)', cifra: '100%', fuente: 'comparacion.periodo_anterior.variacion_ventas_pct' },
              { texto: 'El martes vendió 86.000 en 2 pedidos', cifra: '86.000', fuente: 'por_dia_semana.0.ventas' }],
  acciones: [{ texto: 'Probablemente conviene reforzar el martes', confianza: 'probable' }], datos_faltantes: ['1 plato vendido no tiene receta'],
}
const resp = (o: unknown, tin = 1000, tout = 300) => ({ texto: typeof o === 'string' ? o : JSON.stringify(o), tokensEntrada: tin, tokensSalida: tout, proveedor: 'gemini', modelo: 'm' })

// 1) Cifras en formato colombiano
assert.equal(aNumero('1.234.567'), 1234567); assert.equal(aNumero('39.333'), 39333); assert.equal(aNumero('25,5'), 25.5); assert.equal(aNumero('22.5'), 22.5); assert.equal(aNumero('100'), 100)
assert.deepEqual(cifrasDeTexto('Subió 22,5% a $310.000 el 5 de enero'), [22.5, 310000, 5])

// 2) Validación de cifras: lo que está en los datos pasa; lo inventado se detecta; el signo no importa; redondear distinto no se acepta
const v = validarEsquema(bueno); assert.ok(v.ok)
const r0 = (v as any).r
assert.deepEqual(cifrasInventadas(r0, datos), [])
assert.deepEqual(cifrasInventadas({ ...r0, resumen: 'Bajó 22,5% y vendió 118.000' }, datos), [], '-22,5 se escribe 22,5')
assert.deepEqual(cifrasInventadas({ ...r0, resumen: 'Vendiste 150.000 pesos' }, datos), ['150.000'])
assert.deepEqual(cifrasInventadas({ ...r0, resumen: 'Un ticket de 39.000' }, datos), ['39.000'])
assert.deepEqual(cifrasInventadas({ ...r0, resumen: 'Del 5 al 11 de enero de 2026' }, datos), [], 'las partes de las fechas son datos')

// 3) Forma del JSON
assert.equal(validarEsquema('no es json').ok, false)
assert.equal(validarEsquema({ ...bueno, hallazgos: [] }).ok, false)
assert.equal(validarEsquema({ ...bueno, acciones: [{ texto: 'x', confianza: 'seguro por seguro' }] }).ok, false)
assert.equal(validarEsquema({ ...bueno, hallazgos: [{ texto: 'x', cifra: '1' }] }).ok, false, 'sin fuente no vale')
assert.ok(validarEsquema('```json\n' + JSON.stringify(bueno) + '\n```').ok, 'tolera la cerca de código')

// 4) Privacidad: ningún campo de persona ni correo llega al modelo
const conPersonas = { ...datos, mesero: 'Ana', cliente_telefono: '3001234567', detalle: [{ full_name: 'Luis', correo: 'a@b.co', ventas: 5 }], gastos: { pagado_por_nombre: 'Pedro', total: 15000 } }
const limpio = limpiarPersonales(conPersonas)
assert.ok(!/Ana|Luis|Pedro|3001234567|a@b\.co/.test(JSON.stringify(limpio)), JSON.stringify(limpio))
assert.equal((limpio as any).gastos.total, 15000); assert.equal((limpio as any).detalle[0].ventas, 5)
assert.equal(tieneCorreo({ x: 'dueño@correo.com' }), true)

// 5) Flujo completo
const pedidos: string[] = []
let g = await redactar('semanal', conPersonas, async p => { pedidos.push(p.usuario); return resp(bueno) })
assert.equal(g.estado, 'ok'); assert.equal(g.intentos, 1); assert.ok(!/Ana|Luis|Pedro|3001234567|a@b\.co/.test(pedidos[0] + JSON.stringify(g.datosEnviados)), 'lo enviado no trae personas')
let n = 0
g = await redactar('semanal', datos, async p => { n++; if (n === 1) return resp({ ...bueno, resumen: 'Vendiste 999.999' }); assert.match(p.usuario, /999\.999/); return resp(bueno) })
assert.equal(g.estado, 'ok'); assert.equal(g.intentos, 2); assert.equal(g.tokensEntrada, 2000)
g = await redactar('mensual', datos, async () => resp({ ...bueno, resumen: 'Vendiste 999.999' }))
assert.equal(g.estado, 'sin_redaccion'); assert.equal(g.resultado, null); assert.match(g.error!, /999\.999/)
g = await redactar('semanal', datos, async () => resp('esto no es json'))
assert.equal(g.estado, 'sin_redaccion')
g = await redactar('semanal', datos, async () => { throw new Error('El proveedor respondió 503') })
assert.equal(g.estado, 'error'); assert.equal(g.intentos, 2)
let llamado = false
g = await redactar('semanal', { x: 'a@b.com' }, async () => { llamado = true; return resp(bueno) })
assert.equal(g.estado, 'error'); assert.equal(llamado, false)

// 6) callModel: Gemini y proveedor compatible (DeepSeek, Qwen...), conteo de tokens y costo
let visto: any
const fGemini: Fetch = async (url, init) => { visto = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 800, thoughtsTokenCount: 200 } }) } }
let m = await callModel({ proveedor: 'gemini', modelo: 'gemini-2.5-flash', clave: 'K' }, { sistema: 'S', usuario: 'U' }, fGemini)
assert.match(visto.url, /gemini-2\.5-flash:generateContent/); assert.equal(visto.init.headers['x-goog-api-key'], 'K')
assert.equal(visto.body.generationConfig.responseMimeType, 'application/json'); assert.equal(visto.body.generationConfig.thinkingConfig.thinkingBudget, 0)
assert.equal(m.tokensEntrada, 5000); assert.equal(m.tokensSalida, 1000, 'cuenta también los tokens de pensamiento')
const fCompat: Fetch = async (url, init) => { visto = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 4000, completion_tokens: 700 } }) } }
m = await callModel({ proveedor: 'compatible', modelo: 'deepseek-chat', clave: 'K2', urlBase: 'https://api.deepseek.com/' }, { sistema: 'S', usuario: 'U' }, fCompat)
assert.equal(visto.url, 'https://api.deepseek.com/chat/completions'); assert.equal(visto.init.headers.Authorization, 'Bearer K2'); assert.equal(visto.body.messages[0].role, 'system')
assert.equal(m.tokensEntrada, 4000); assert.equal(m.tokensSalida, 700)
assert.throws(() => callModel({ proveedor: 'gemini', modelo: 'x', clave: '' }, { sistema: '', usuario: '' }, fGemini), /clave/)
await assert.rejects(callModel({ proveedor: 'gemini', modelo: 'x', clave: 'K' }, { sistema: '', usuario: '' }, async () => ({ ok: false, status: 429, json: async () => ({}) })), /429/)
assert.equal(costoUsd(5000, 1000, 0.3, 2.5), 0.004)

// 7) Periodo: último semana/mes COMPLETO en hora de Colombia
const bog = (iso: string) => new Date(iso)
assert.deepEqual(periodo('semanal', bog('2026-10-21T15:00:00Z')), { desde: '2026-10-12', hasta: '2026-10-18' }, 'miércoles 21-oct')
assert.deepEqual(periodo('semanal', bog('2026-10-19T05:30:00Z')), { desde: '2026-10-12', hasta: '2026-10-18' }, 'lunes 00:30 en Colombia ya cuenta como lunes')
assert.deepEqual(periodo('semanal', bog('2026-10-19T04:00:00Z')), { desde: '2026-10-05', hasta: '2026-10-11' }, 'domingo 23:00 en Colombia todavía es la semana en curso')
assert.deepEqual(periodo('mensual', bog('2026-10-21T15:00:00Z')), { desde: '2026-09-01', hasta: '2026-09-30' })
assert.deepEqual(periodo('mensual', bog('2026-01-15T15:00:00Z')), { desde: '2025-12-01', hasta: '2025-12-31' }, 'cruce de año')
assert.deepEqual(periodo('mensual', bog('2026-03-01T04:00:00Z')), { desde: '2026-01-01', hasta: '2026-01-31' }, '28-feb 23:00 en Colombia aún es febrero')

console.log('ai-report.test.ts: todo OK')
