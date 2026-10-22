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
  user_id?:       string | null   // quién lo cobró: solo ese usuario lo reenvía
  restaurant_id?: string | null   // en qué restaurante: solo ese lo reenvía
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

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, modo)
    const req = fn(t.objectStore(STORE))
    // La conexión se cierra al terminar cada operación (así el borrado de la base al cerrar sesión no se bloquea).
    t.oncomplete = () => { db.close(); resolve(req.result) }
    t.onerror    = () => { db.close(); reject(t.error) }
    t.onabort    = () => { db.close(); reject(t.error) }
  })
}

/** Usuario y restaurante con sesión abierta (se guardan en cada pago para no reenviarlo a otra cuenta). */
export async function identidadActual(): Promise<{ user_id: string | null; restaurant_id: string | null }> {
  let user_id: string | null = null
  let restaurant_id: string | null = null
  try { user_id = (await supabase.auth.getSession()).data.session?.user?.id ?? null } catch { /* sin sesión */ }
  try { const { data } = await supabase.rpc('current_restaurant_id'); restaurant_id = (data as string | null) ?? null } catch { /* sin red */ }
  return { user_id, restaurant_id }
}

export const listarPagosPendientes = () => tx('readonly', s => s.getAll() as IDBRequest<PagoPendiente[]>)

export async function guardarPagoPendiente(p: PagoPendiente): Promise<void> {
  await tx('readwrite', s => s.put(p))
  avisar()
}

export async function borrarPagoPendiente(idem: string): Promise<void> {
  await tx('readwrite', s => s.delete(idem))
  avisar()
}

/** ¿El error es de conexión (se reintenta) y no del servidor (se rechaza)? */
export const esErrorDeRed = (msg: string | undefined | null) =>
  !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg ?? '')

/** Transitorio = red, tiempo agotado, 5xx o sesión por renovar (401): se reintenta, NO es conflicto. */
export const esErrorTransitorio = (msg: string | undefined | null, status?: number) =>
  esErrorDeRed(msg) || status === 0 || status === 401 || status === 408 || status === 429 || (status !== undefined && status >= 500)
  || /timeout|timed out|jwt/i.test(msg ?? '')

/** Reintento manual de un pago en conflicto: vuelve a 'pendiente' y se envía. */
export async function reintentarPagoPendiente(idem: string): Promise<{ enviados: number; conflictos: number; faltan: number }> {
  const p = (await listarPagosPendientes()).find(x => x.idem === idem)
  if (p) await guardarPagoPendiente({ ...p, estado: 'pendiente', motivo: undefined })
  return enviarPagosPendientes()
}

/** Descarta un pago en cola (la persona confirmó que no debe enviarse). */
export const descartarPagoPendiente = (idem: string) => borrarPagoPendiente(idem)

let enviando = false

/** Reenvía los pagos guardados, de a uno y en orden. Devuelve cuántos se enviaron y cuántos quedaron en conflicto. */
export async function enviarPagosPendientes(): Promise<{ enviados: number; conflictos: number; faltan: number }> {
  if (enviando) return { enviados: 0, conflictos: 0, faltan: 0 }
  enviando = true
  let enviados = 0, conflictos = 0
  try {
    const id = await identidadActual()
    if (!id.user_id || !id.restaurant_id) return { enviados: 0, conflictos: 0, faltan: (await listarPagosPendientes()).length }
    const lista = (await listarPagosPendientes())
      .filter(p => p.estado === 'pendiente')
      .filter(p => (!p.user_id || p.user_id === id.user_id) && (!p.restaurant_id || p.restaurant_id === id.restaurant_id))   // solo los de esta cuenta y este restaurante (los viejos sin dato se envían)
      .sort((a, b) => a.creado.localeCompare(b.creado))
    for (const p of lista) {
      let error: { message: string } | null = null
      let status: number | undefined
      try {
        const r = await supabase.rpc('registrar_pago', p.args)
        error = r.error; status = r.status
      } catch (e) { error = { message: e instanceof Error ? e.message : String(e) }; status = 0 }
      if (!error) { await borrarPagoPendiente(p.idem); enviados++; continue }
      if (esErrorTransitorio(error.message, status)) break   // sin internet / servidor caído / sesión por renovar: se intenta más tarde
      await guardarPagoPendiente({ ...p, estado: 'conflicto', motivo: error.message })
      conflictos++
    }
  } finally {
    enviando = false
  }
  const faltan = (await listarPagosPendientes()).length
  return { enviados, conflictos, faltan }
}

let inicializada = false
let alTerminarActual: ((r: { enviados: number; conflictos: number }) => void) | null = null
/** Reenvía solo al volver la conexión. El listener se registra una vez; el callback es siempre el de la última instancia. */
export function iniciarEnvioDePagos(alTerminar: (r: { enviados: number; conflictos: number }) => void) {
  alTerminarActual = alTerminar
  if (inicializada) return
  inicializada = true
  window.addEventListener('online', async () => {
    const r = await enviarPagosPendientes()
    if (r.enviados > 0 || r.conflictos > 0) alTerminarActual?.(r)
  })
}
