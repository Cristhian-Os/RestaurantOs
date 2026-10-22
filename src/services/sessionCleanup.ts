import { queryClient } from './queryClient'
import { supabase } from './supabaseClient'

// Bases IndexedDB de la app (pedidos/pagos/facturas pendientes). Si se agrega una nueva, anotarla aquí.
const BASES_IDB = ['restaurantos_offline', 'restaurantos_pagos', 'facturas-pendientes']
// Claves de localStorage con datos del usuario/restaurante. NO incluye el tema ni preferencias del dispositivo.
const CLAVES_LS = ['restaurantos_offline_orders', 'ros_push_vapid', 'restaurantos_rid']
const PREFIJOS_LS = ['rt_pedido_']
export const KEY_ULTIMO_USUARIO = 'ros_last_uid'

function borrarBase(nombre: string): Promise<void> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(nombre)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch { resolve() }
  })
}

async function quitarPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    // Con red lenta o colgada no se espera: el servidor descarta suscripciones muertas al fallar el envío.
    await Promise.race([
      (async () => {
        try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) } catch { /* sin red */ }
        await sub.unsubscribe()
      })(),
      new Promise<void>(r => setTimeout(r, 3000)),
    ])
  } catch { /* no crítico */ }
}

// Tiendas con trabajo del usuario que aún no llegó al servidor.
const PENDIENTES: Array<[string, string]> = [['restaurantos_offline', 'offline_orders'], ['restaurantos_pagos', 'pagos_pendientes'], ['facturas-pendientes', 'facturas']]

function contarTienda(base: string, tienda: string): Promise<number> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(base)
      req.onerror = () => resolve(0)
      req.onsuccess = () => {
        const db = req.result
        try {
          if (!db.objectStoreNames.contains(tienda)) { db.close(); return resolve(0) }
          const c = db.transaction(tienda, 'readonly').objectStore(tienda).count()
          c.onsuccess = () => { db.close(); resolve(c.result) }
          c.onerror = () => { db.close(); resolve(0) }
        } catch { db.close(); resolve(0) }
      }
    } catch { resolve(0) }
  })
}

/** Cuántos pedidos, cobros y facturas siguen guardados solo en este dispositivo (se perderían al cerrar sesión). */
export async function contarPendientesLocales(): Promise<number> {
  try {
    // Abrir una base que no existe la CREARÍA vacía y rompería su esquema: solo se consultan las que ya existen.
    if (typeof indexedDB.databases !== 'function') return 0
    const existentes = new Set((await indexedDB.databases()).map(d => d.name))
    const cuentas = await Promise.all(PENDIENTES.filter(([b]) => existentes.has(b)).map(([b, s]) => contarTienda(b, s)))
    return cuentas.reduce((a, b) => a + b, 0)
  } catch { return 0 }
}

/** Borra todo dato local ligado a la sesión anterior. Llamar ANTES de signOut y al cambiar de usuario. */
export async function limpiarSesionLocal(): Promise<void> {
  // Push primero: necesita la sesión vigente para borrar la fila.
  await quitarPush()
  try { queryClient.clear() } catch { /* nada */ }
  await Promise.all(BASES_IDB.map(borrarBase))
  try { sessionStorage.removeItem('last_crash') } catch { /* nada */ }
  try {
    for (const k of CLAVES_LS) localStorage.removeItem(k)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && PREFIJOS_LS.some(p => k.startsWith(p))) localStorage.removeItem(k)
    }
    localStorage.removeItem(KEY_ULTIMO_USUARIO)
  } catch { /* sin almacenamiento */ }
}
