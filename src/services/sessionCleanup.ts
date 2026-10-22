import { queryClient } from './queryClient'
import { supabase } from './supabaseClient'

// Bases IndexedDB de la app (pedidos/pagos/facturas pendientes). Si se agrega una nueva, anotarla aquí.
const BASES_IDB = ['restaurantos_offline', 'restaurantos_pagos', 'facturas-pendientes']
// Claves de localStorage con datos del usuario/restaurante. NO incluye el tema ni preferencias del dispositivo.
const CLAVES_LS = ['restaurantos_offline_orders', 'ros_push_vapid']
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
    try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) } catch { /* sin red: el servidor la descarta al fallar */ }
    await sub.unsubscribe()
  } catch { /* no crítico */ }
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
