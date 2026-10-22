/**
 * paymentQueue.ts — Cola local de pagos sin internet (spec Anexo A, B5.8).
 * Si el cajero cobra una parte de la cuenta y no hay conexión, el pago se guarda en el teléfono
 * (IndexedDB) con su clave de idempotencia y se envía solo al volver la red. Como el servidor ignora
 * una clave ya registrada, reenviar nunca duplica el pago. Si al reenviar el servidor lo rechaza
 * (por ejemplo, ya se cobró esa parte desde otro equipo), queda como "conflicto" visible para revisarlo.
 * Es una base aparte de offlineService (pedidos) para no tocar su estructura.
 */
import { supabase } from './supabaseClient'

export interface PagoPendiente {
  idem:       string           // clave de idempotencia = id del pago
  order_id:   string
  resumen:    string           // "Persona 3 · Efectivo · $22.000"
  monto:      number
  args: {
    p_order_id: string; p_comensal: string | null; p_metodo: string; p_monto: number
    p_propina: number; p_recibido: number | null; p_referencia: string | null; p_idempotency_key: string
  }
  creado:     string
  estado:     'pendiente' | 'conflicto'
  motivo?:    string
  user_id?:       string | null   // quién lo guardó: solo ese usuario lo reenvía
  restaurant_id?: string | null   // a qué restaurante pertenece
}

const DB_NAME = 'restaurantos_pagos'
const STORE   = 'pagos_pendientes'
export const COLA_CAMBIO = 'pagos-cola-cambio'   // evento de window: la cola cambió

const avisar = () => window.dispatchEvent(new Event(COLA_CAMBIO))

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'idem' }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// Cierra la conexión a IndexedDB al terminar cada operación (si no, quedan abiertas y bloquean el borrado al cerrar sesión).
async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    let req: IDBRequest<T>
    try {
      const t = db.transaction(STORE, modo)
      req = fn(t.objectStore(STORE))
      t.oncomplete = () => { db.close(); resolve(req.result) }
      t.onerror    = () => { db.close(); reject(t.error) }
      t.onabort    = () => { db.close(); reject(t.error) }
    } catch (e) {
      db.close()
      reject(e)
    }
  })
}

// ── Usuario/restaurante actuales ────────────────────────────────────────
// Los registros guardados llevan user_id/restaurant_id; solo se envían (y se listan) los del usuario y restaurante
// que tienen la sesión abierta. Los ajenos (otro usuario en el mismo equipo) se ignoran y nunca se envían.
let ctxCache: { userId: string; restaurantId: string } | null = null

export async function contextoActual(): Promise<{ userId: string | null; restaurantId: string | null }> {
  const { data } = await supabase.auth.getSession()   // lectura local, funciona sin internet
  const userId = data.session?.user.id ?? null
  if (!userId) return { userId: null, restaurantId: null }
  if (ctxCache?.userId !== userId || !ctxCache.restaurantId) {
    try {
      const { data: rid } = await supabase.rpc('current_restaurant_id')
      if (typeof rid === 'string' && rid) ctxCache = { userId, restaurantId: rid }
    } catch { /* sin conexión: se usa lo último conocido */ }
  }
  return { userId, restaurantId: ctxCache?.userId === userId ? ctxCache.restaurantId : null }
}

/** ¿El registro guardado es del usuario y restaurante actuales? (los registros viejos sin dueño se aceptan) */
export const esDelContexto = (
  r: { user_id?: string | null; restaurant_id?: string | null },
  c: { userId: string | null; restaurantId: string | null },
) => !!c.userId && (!r.user_id || r.user_id === c.userId) && (!r.restaurant_id || !c.restaurantId || r.restaurant_id === c.restaurantId)

/** Pagos guardados del usuario/restaurante actuales. */
export async function listarPagosPendientes(): Promise<PagoPendiente[]> {
  const [todos, c] = await Promise.all([tx('readonly', s => s.getAll() as IDBRequest<PagoPendiente[]>), contextoActual()])
  return todos.filter(p => esDelContexto(p, c))
}

export async function guardarPagoPendiente(p: PagoPendiente): Promise<void> {
  // Un pago nuevo queda marcado con el usuario y restaurante actuales (los ya marcados conservan su dueño).
  const c = p.user_id ? null : await contextoActual()
  await tx('readwrite', s => s.put(c ? { ...p, user_id: c.userId, restaurant_id: c.restaurantId } : p))
  avisar()
}

export async function borrarPagoPendiente(idem: string): Promise<void> {
  await tx('readwrite', s => s.delete(idem))
  avisar()
}

export async function descartarPagoPendiente(idem: string): Promise<void> {
  await borrarPagoPendiente(idem)
}

/** ¿El error es de conexión (se reintenta) y no del servidor (se rechaza)? */
export const esErrorDeRed = (msg: string | undefined | null) =>
  !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg ?? '')

/** Error TRANSITORIO (se reintenta, no es conflicto): red, tiempo agotado, 5xx o 401 (sesión/JWT por renovar). */
export const esErrorTransitorio = (error: { message?: string | null; code?: string | null } | null | undefined, status?: number) =>
  esErrorDeRed(error?.message) ||
  (typeof status === 'number' && (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500)) ||
  /timeout|timed out|jwt|token.*(expired|expirado)|PGRST30[0-9]/i.test(`${error?.message ?? ''} ${error?.code ?? ''}`)

let enviando = false

/** Reenvía los pagos guardados, de a uno y en orden. Devuelve cuántos se enviaron y cuántos quedaron en conflicto. */
export async function enviarPagosPendientes(): Promise<{ enviados: number; conflictos: number; faltan: number }> {
  if (enviando) return { enviados: 0, conflictos: 0, faltan: 0 }
  enviando = true
  let enviados = 0, conflictos = 0
  try {
    const lista = (await listarPagosPendientes())   // ya filtrada: solo del usuario/restaurante actuales
      .filter(p => p.estado === 'pendiente').sort((a, b) => a.creado.localeCompare(b.creado))
    for (const p of lista) {
      const { error, status } = await supabase.rpc('registrar_pago', p.args)
      if (!error) { await borrarPagoPendiente(p.idem); enviados++; continue }
      if (esErrorTransitorio(error, status)) break   // sin internet / servidor caído / sesión por renovar: se intenta más tarde
      await guardarPagoPendiente({ ...p, estado: 'conflicto', motivo: error.message })
      conflictos++
    }
  } finally {
    enviando = false
  }
  const faltan = (await listarPagosPendientes()).length
  return { enviados, conflictos, faltan }
}

/** Pasa un pago en conflicto otra vez a "pendiente" y lo reenvía ya. */
export async function reintentarPagoPendiente(idem: string) {
  const p = (await listarPagosPendientes()).find(x => x.idem === idem)
  if (!p) return { enviados: 0, conflictos: 0, faltan: 0 }
  await guardarPagoPendiente({ ...p, estado: 'pendiente', motivo: undefined })
  return enviarPagosPendientes()
}

let inicializada = false
let ultimoAviso: ((r: { enviados: number; conflictos: number }) => void) | null = null
/** Reenvía solo al volver la conexión. El listener se registra una vez; el aviso es siempre el de la última instancia. */
export function iniciarEnvioDePagos(alTerminar: (r: { enviados: number; conflictos: number }) => void) {
  ultimoAviso = alTerminar
  if (!inicializada) {
    inicializada = true
    window.addEventListener('online', async () => {
      const r = await enviarPagosPendientes()
      if ((r.enviados > 0 || r.conflictos > 0) && ultimoAviso) ultimoAviso(r)
    })
  }
  return () => { if (ultimoAviso === alTerminar) ultimoAviso = null }
}
