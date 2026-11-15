// Pruebas de central-agente (sin red ni base).  Correr con:  node supabase/functions/central-agente/logica.test.ts
import assert from 'node:assert/strict'
import { llamarAnthropic } from './anthropic.ts'
import {
  PRECIO_PRUDENTE, PROVEEDORES, armarTurnos, costoEstimado, decidirLimite, elegirProveedor, leerAal, modeloDe, primerDiaDelMes, sistemaAgente, textoBloqueo,
} from './logica.ts'

const base = { encendida: true, topeGlobal: 20, gastoGlobal: 1, presupuestoAgente: 5, gastoAgente: 1, mensajesUltimoMinuto: 0 }

// Límites: cada regla bloquea por sí sola, y sin tope del dueño no se gasta nada
assert.equal(decidirLimite(base), null)
assert.equal(decidirLimite({ ...base, encendida: false }), 'apagada')
assert.equal(decidirLimite({ ...base, topeGlobal: 0 }), 'sin_tope')
assert.equal(decidirLimite({ ...base, gastoGlobal: 20 }), 'tope_global')
assert.equal(decidirLimite({ ...base, presupuestoAgente: 0 }), 'sin_presupuesto')
assert.equal(decidirLimite({ ...base, gastoAgente: 5 }), 'presupuesto_agente')
assert.equal(decidirLimite({ ...base, mensajesUltimoMinuto: 8 }), 'muy_rapido')
for (const c of ['apagada', 'sin_tope', 'tope_global', 'sin_presupuesto', 'presupuesto_agente', 'muy_rapido', 'sin_proveedor']) assert.ok(textoBloqueo(c).length > 10)

// Costo: precio del dueño si lo puso; si no, uno alto a propósito
assert.equal(costoEstimado(1_000_000, 1_000_000, { claude: { entrada: 3, salida: 15 } }, 'claude'), 18)
assert.equal(costoEstimado(1_000_000, 0, {}, 'nvidia'), PRECIO_PRUDENTE.entrada)
assert.equal(costoEstimado(0, 1_000_000, null, 'nvidia'), PRECIO_PRUDENTE.salida)
assert.equal(costoEstimado(1000, 500, { claude: { entrada: -1, salida: 'x' } }, 'claude'), costoEstimado(1000, 500, {}, 'claude'), 'precios inválidos → prudente')

// Proveedor: respeta el orden del agente, luego el predeterminado, y salta los que no tienen llave
const conLlaves = (...ids: string[]) => (p: { id: string }) => ids.includes(p.id)
assert.equal(elegirProveedor(['nvidia', 'claude'], 'claude', conLlaves('claude', 'nvidia'))?.id, 'nvidia')
assert.equal(elegirProveedor(['nvidia'], 'claude', conLlaves('claude'))?.id, 'claude')
assert.equal(elegirProveedor([], 'x-inexistente', conLlaves('deepseek'))?.id, 'deepseek')
assert.equal(elegirProveedor(['claude'], 'claude', conLlaves()), null)
assert.equal(elegirProveedor('no-es-lista', 5, conLlaves('claude'))?.id, 'claude')

// Modelo: el del dueño solo si tiene forma válida (nada de espacios ni símbolos raros)
const nv = PROVEEDORES.find(p => p.id === 'nvidia')!
assert.equal(modeloDe(nv, { nvidia: 'deepseek-ai/deepseek-r1' }), 'deepseek-ai/deepseek-r1')
assert.equal(modeloDe(nv, { nvidia: 'mal modelo; drop' }), nv.modeloDefecto)
assert.equal(modeloDe(nv, null), nv.modeloDefecto)

// Turnos: alternan, se funden los repetidos, empiezan y terminan en el usuario, ignoran al sistema
assert.deepEqual(armarTurnos([
  { autor_tipo: 'agente', contenido: 'bienvenido' }, { autor_tipo: 'humano', contenido: 'hola' }, { autor_tipo: 'humano', contenido: '¿estás?' },
  { autor_tipo: 'sistema', contenido: 'aviso' }, { autor_tipo: 'agente', contenido: 'sí' }, { autor_tipo: 'humano', contenido: 'bien' },
]), [{ rol: 'user', texto: 'hola\n¿estás?' }, { rol: 'assistant', texto: 'sí' }, { rol: 'user', texto: 'bien' }])
assert.deepEqual(armarTurnos([{ autor_tipo: 'humano', contenido: 'hola' }, { autor_tipo: 'agente', contenido: 'respondí' }]), [], 'si el último no es del usuario no hay nada que responder')
assert.equal(armarTurnos(Array.from({ length: 40 }, (_, i) => ({ autor_tipo: i % 2 ? 'agente' : 'humano', contenido: `m${i}` })), 6).length <= 6, true)

// Prompt: dice la verdad sobre sus límites y no incluye llaves
const sis = sistemaAgente({ nombre: 'Sofía', rol: 'jefe', especialidad: 'Soporte', objetivos: ['Responder rápido', 7], nivel: 'N0' }, 'Soporte')
assert.match(sis, /Sofía/); assert.match(sis, /NO tienes acceso/); assert.match(sis, /N3/); assert.match(sis, /Responder rápido/)
assert.doesNotMatch(sis, /sk-|api[_-]?key/i)

// Mes de Colombia: a las 7 p. m. del 31 (00:00 UTC del 1) todavía es el mes anterior
assert.equal(primerDiaDelMes(new Date('2026-12-01T00:30:00Z')), '2026-11-01')
assert.equal(primerDiaDelMes(new Date('2026-12-01T06:00:00Z')), '2026-12-01')

// JWT: lee aal; cualquier basura = aal1 (nunca da más permiso del que hay)
const jwt = (o: object) => `x.${Buffer.from(JSON.stringify(o)).toString('base64url')}.y`
assert.equal(leerAal(jwt({ aal: 'aal2' })), 'aal2')
assert.equal(leerAal(jwt({})), 'aal1'); assert.equal(leerAal('basura'), 'aal1'); assert.equal(leerAal(''), 'aal1')

// Claude: cabeceras, cuerpo, uso de tokens; la clave solo viaja en la cabecera
{
  const vistas: { url: string; init: any }[] = []
  const f = async (url: string, init: any) => { vistas.push({ url, init }); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: ' Hola, Cristhian. ' }], usage: { input_tokens: 30, output_tokens: 9 } }) } }
  const r = await llamarAnthropic({ modelo: 'claude-sonnet-5-5', clave: 'sk-ant-prueba' }, { sistema: 'Eres Sofía.', turnos: [{ rol: 'user', texto: 'hola' }], maxTokens: 700 }, f)
  const { url, init } = vistas[0], cuerpo = JSON.parse(init.body)
  assert.equal(url, 'https://api.anthropic.com/v1/messages')
  assert.equal(init.headers['x-api-key'], 'sk-ant-prueba'); assert.equal(init.headers['anthropic-version'], '2023-06-01')
  assert.doesNotMatch(url + init.body, /sk-ant-prueba/)
  assert.equal(cuerpo.model, 'claude-sonnet-5-5'); assert.equal(cuerpo.system, 'Eres Sofía.'); assert.deepEqual(cuerpo.messages, [{ role: 'user', content: 'hola' }])
  assert.equal(r.texto, 'Hola, Cristhian.'); assert.equal(r.tokensEntrada, 30); assert.equal(r.tokensSalida, 9); assert.ok(init.signal)
  await assert.rejects(() => llamarAnthropic({ modelo: 'm', clave: '' }, { sistema: 's', turnos: [], maxTokens: 1 }, f), /clave/)
  const malo = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'clave sk-ant-prueba inválida' } }) })
  await assert.rejects(() => llamarAnthropic({ modelo: 'm', clave: 'sk-ant-prueba' }, { sistema: 's', turnos: [], maxTokens: 1 }, malo), (e: Error) => /401/.test(e.message) && !/sk-ant/.test(e.message))
}

console.log('central-agente: todo OK')
