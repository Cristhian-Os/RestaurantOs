// Chequeo de la carga/creación de claves VAPID de send-push (sin red ni framework):
//   node --experimental-strip-types scripts/vapid.check.ts
import assert from 'node:assert/strict'
import { loadOrCreateVapid, parseVapid, type VapidKeys, type VapidStore } from '../supabase/functions/send-push/vapid.ts'

/** Base en memoria con la misma semántica que la fila `vapid_keys`: insertar solo si no existe. */
function memStore(initial: string | null = null) {
  const state = { value: initial, inserts: 0 }
  const store: VapidStore = {
    async read() { await Promise.resolve(); return state.value },
    async insertIfAbsent(v) { await Promise.resolve(); if (state.value === null) { state.value = v; state.inserts++ } },
  }
  return { state, store }
}

let n = 0
const fakeGen = (): VapidKeys => { n++; return { publicKey: `PUB${n}`.padEnd(30, 'x'), privateKey: `PRIV${n}`.padEnd(30, 'y') } }

// parseVapid: solo acepta un par completo y válido
assert.equal(parseVapid(null), null)
assert.equal(parseVapid(''), null)
assert.equal(parseVapid('no es json'), null)
assert.equal(parseVapid('{"publicKey":"corta","privateKey":"corta"}'), null)
assert.equal(parseVapid(JSON.stringify({ publicKey: 'a'.repeat(30) })), null)
assert.deepEqual(parseVapid(JSON.stringify({ publicKey: 'a'.repeat(30), privateKey: 'b'.repeat(30) })), { publicKey: 'a'.repeat(30), privateKey: 'b'.repeat(30) })

// Primera vez: genera y guarda; la segunda devuelve exactamente el mismo par sin generar otro
{
  const { state, store } = memStore()
  const first = await loadOrCreateVapid(store, fakeGen)
  const second = await loadOrCreateVapid(store, fakeGen)
  assert.deepEqual(second, first)
  assert.equal(state.inserts, 1)
}

// Ya hay un par guardado: se usa y NO se genera otro
{
  const saved = { publicKey: 'S'.repeat(30), privateKey: 'T'.repeat(30) }
  const { state, store } = memStore(JSON.stringify(saved))
  let generated = 0
  const got = await loadOrCreateVapid(store, () => { generated++; return fakeGen() })
  assert.deepEqual(got, saved)
  assert.equal(generated, 0)
  assert.equal(state.inserts, 0)
}

// Carrera: varias instancias arrancan a la vez. Todas terminan con EL MISMO par (el que quedó guardado)
{
  const { state, store } = memStore()
  const results = await Promise.all(Array.from({ length: 8 }, () => loadOrCreateVapid(store, fakeGen)))
  for (const r of results) assert.deepEqual(r, results[0])
  assert.equal(state.inserts, 1)
  assert.deepEqual(parseVapid(state.value), results[0])
}

// Fila dañada (existe pero no es un par válido): falla con error claro en vez de usar basura
{
  const { store } = memStore('{"publicKey":"x"}')
  await assert.rejects(() => loadOrCreateVapid(store, fakeGen), /No se pudo guardar la clave VAPID/)
}

// Error de la base al leer: se propaga (la función responde 500 y no inventa claves)
{
  const store: VapidStore = { async read() { throw new Error('db caída') }, async insertIfAbsent() { /* nada */ } }
  await assert.rejects(() => loadOrCreateVapid(store, fakeGen), /db caída/)
}

process.stdout.write('vapid.check OK\n')
