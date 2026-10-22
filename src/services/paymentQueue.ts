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
    t.oncomplete = () => resolve(req.result)
    t.onerror    = () => reject(t.error)
  })
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

let enviando = false

/** Reenvía los pagos guardados, de a uno y en orden. Devuelve cuántos se enviaron y cuántos quedaron en conflicto. */
export async function enviarPagosPendientes(): Promise<{ enviados: number; conflictos: number; faltan: number }> {
  if (enviando) return { enviados: 0, conflictos: 0, faltan: 0 }
  enviando = true
  let enviados = 0, conflictos = 0
  try {
    const lista = (await listarPagosPendientes())
      .filter(p => p.estado === 'pendiente').sort((a, b) => a.creado.localeCompare(b.creado))
    for (const p of lista) {
      const { error } = await supabase.rpc('registrar_pago', p.args)
      if (!error) { await borrarPagoPendiente(p.idem); enviados++; continue }
      if (esErrorDeRed(error.message)) break   // sigue sin internet: se intenta más tarde
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
/** Reenvía solo al volver la conexión. Una sola vez por sesión de la app. */
export function iniciarEnvioDePagos(alTerminar: (r: { enviados: number; conflictos: number }) => void) {
  if (inicializada) return
  inicializada = true
  window.addEventListener('online', async () => {
    const r = await enviarPagosPendientes()
    if (r.enviados > 0 || r.conflictos > 0) alTerminar(r)
  })
}
