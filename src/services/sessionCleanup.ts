// ============================================================
// sessionCleanup — limpia TODO lo que quedó en el navegador de la
// cuenta anterior (caché de consultas, colas offline, push, crash).
// Evita que una cuenta vea o envíe datos de otra en el mismo dispositivo.
// ============================================================
import { queryClient } from './queryClient'
import { supabase } from './supabaseClient'

// Borra una base IndexedDB sin quedarse colgado si otra pestaña la tiene abierta.
function borrarBaseIndexedDB(nombre: string): Promise<void> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(); return }
      const req = indexedDB.deleteDatabase(nombre)
      req.onsuccess = () => resolve()
      req.onerror   = () => resolve()
      req.onblocked = () => resolve()
      setTimeout(resolve, 2000)
    } catch { resolve() }
  })
}

// Quita la suscripción push de ESTE dispositivo (fila en BD + suscripción del navegador).
// Debe correr con la sesión aún activa: la RLS solo deja borrar filas propias.
async function desuscribirPush(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) } catch { /* sin red: se limpia al reenviar */ }
    try { await sub.unsubscribe() } catch { /* ya no existe */ }
  } catch { /* no crítico */ }
}

export async function limpiarSesionLocal(): Promise<void> {
  try { queryClient.clear() } catch { /* no crítico */ }
  try { sessionStorage.removeItem('last_crash') } catch { /* sin almacenamiento */ }
  await Promise.all([
    desuscribirPush(),
    borrarBaseIndexedDB('restaurantos_offline'),
    borrarBaseIndexedDB('restaurantos_pagos'),
  ])
}
