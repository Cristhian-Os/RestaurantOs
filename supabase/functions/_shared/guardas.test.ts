// Pruebas de las guardas compartidas (sin red). Correr con:  node supabase/functions/_shared/guardas.test.ts
import assert from 'node:assert/strict'
import { iguales, permitido, respuestaPermitida, origenValido, redirectPermitido, sinPersonales, registrarUsoIA, UUID, EMAIL } from './guardas.ts'

// Comparación en tiempo constante: mismo resultado que ===, y no revienta con tipos raros
assert.equal(iguales('abc', 'abc'), true); assert.equal(iguales('abc', 'abd'), false); assert.equal(iguales('abc', 'abcd'), false)
assert.equal(iguales('', ''), true); assert.equal(iguales(null, 'x'), false); assert.equal(iguales('ñ', 'ñ'), true)

// Limitador: FALLA CERRADO (solo true deja pasar)
const rpc = (r: () => Promise<{ data: unknown; error?: unknown }>) => ({ rpc: () => r() })
assert.equal(await permitido(rpc(async () => ({ data: true })), 'k', 1, 1), true)
assert.equal(await permitido(rpc(async () => ({ data: false })), 'k', 1, 1), false)
assert.equal(await permitido(rpc(async () => ({ data: null })), 'k', 1, 1), false)
assert.equal(await permitido(rpc(async () => ({ data: true, error: { message: 'x' } })), 'k', 1, 1), false)
assert.equal(await permitido(rpc(async () => { throw new Error('red') }), 'k', 1, 1), false)
assert.equal(respuestaPermitida({ data: true }), true); assert.equal(respuestaPermitida({ data: undefined }), false); assert.equal(respuestaPermitida(null), false)

// Orígenes y redirect_url
assert.equal(origenValido('https://app.com/', ['https://app.com']), 'https://app.com'); assert.equal(origenValido('https://evil.com', ['https://app.com']), null)
assert.equal(origenValido('https://x.com', []), 'https://x.com'); assert.equal(origenValido(null, []), null)
assert.equal(redirectPermitido('https://app.com/pago?ok=1', 'https://otro.com', ['https://app.com']), true)
assert.equal(redirectPermitido('https://evil.com/', 'https://app.com', ['https://app.com']), false)
assert.equal(redirectPermitido('http://app.com/', 'http://app.com', []), false)            // solo https
assert.equal(redirectPermitido('https://app.com/x', 'https://app.com', []), true)           // sin APP_ORIGINS: solo el Origin del request
assert.equal(redirectPermitido('https://app.com/x', null, []), false)
assert.equal(redirectPermitido('https://app.com@evil.com/', 'https://app.com', []), false)
assert.equal(redirectPermitido('javascript:alert(1)', 'https://app.com', []), false)

// Formatos
assert.ok(UUID.test('123e4567-e89b-12d3-a456-426614174000')); assert.ok(!UUID.test('no'))
assert.ok(EMAIL.test('ana@correo.co')); assert.ok(!EMAIL.test('ana@correo')); assert.ok(!EMAIL.test('a b@c.co'))

// Datos personales
assert.equal(sinPersonales('Escríbeme a ana@correo.co o al 300 111 2222'), 'Escríbeme a [correo] o al [número]')

// Uso de IA: sin tokens no escribe; con tokens inserta con costo
const filas: unknown[] = []
const admin = {
  rpc: async () => ({ data: true }),
  from: (t: string) => t === 'ai_usage'
    ? { insert: async (f: unknown) => { filas.push(f); return { error: null } } }
    : { select: () => ({ in: async () => ({ data: [{ clave: 'ai_precio_entrada_usd_millon', valor: 1 }, { clave: 'ai_precio_salida_usd_millon', valor: 2 }] }) }) },
}
await registrarUsoIA(admin, 'r1', 'f', { proveedor: 'gemini', modelo: 'm', tokensEntrada: 0, tokensSalida: 0 }); assert.equal(filas.length, 0)
await registrarUsoIA(admin, 'r1', 'f', { proveedor: 'gemini', modelo: 'm', tokensEntrada: 1_000_000, tokensSalida: 500_000 })
assert.equal(filas.length, 1); assert.equal((filas[0] as { costo_usd: number }).costo_usd, 2)
await registrarUsoIA({ ...admin, from: () => { throw new Error('boom') } }, 'r1', 'f', { proveedor: 'g', modelo: 'm', tokensEntrada: 5, tokensSalida: 5 })   // nunca lanza
console.log('guardas.test OK')
