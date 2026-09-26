import { useMutation } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { queryClient } from './queryClient'
import message from 'antd/es/message'
import type { Order } from '../types'

export interface OfflineOrder extends Order {
  sync_status: 'pending' | 'synced' | 'conflict'
  conflict_reason?: string
}

// ── Almacenamiento: IndexedDB (antes localStorage) ──────────────────────
// Mismo contrato público (saveOrderLocally/syncOfflineOrders/etc.) — solo
// cambia dónde vive el dato. IndexedDB soporta más volumen que el límite de
// ~5-10MB de localStorage y no bloquea el hilo principal en escrituras
// grandes, lo cual importa si más adelante se guarda algo más que pedidos.
const DB_NAME    = 'restaurantos_offline'
const DB_VERSION = 1
const STORE      = 'offline_orders'
const LEGACY_STORAGE_KEY = 'restaurantos_offline_orders' // localStorage, versión anterior

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function idbGetAll(): Promise<OfflineOrder[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as OfflineOrder[])
    req.onerror   = () => reject(req.error)
  })
}

async function idbPut(order: OfflineOrder): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(order)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

// Migración de una sola vez: si queda algo en el localStorage de la versión
// anterior (ej. un pedido pendiente de un mesero que no había sincronizado
// cuando se desplegó este cambio), se importa a IndexedDB y se limpia — para
// que nadie pierda un pedido offline por el cambio de almacenamiento.
let migrated = false
async function migrateLegacyOnce(): Promise<void> {
  if (migrated) return
  migrated = true
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return
    const legacy = JSON.parse(raw) as OfflineOrder[]
    for (const order of legacy) await idbPut(order)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch (e) {
    console.error('Migración de pedidos offline (localStorage → IndexedDB) falló:', e)
  }
}

export const offlineService = {
  // ─── Guardar orden localmente cuando offline ────────────────
  async saveOrderLocally(order: Order): Promise<void> {
    await migrateLegacyOnce()
    const offlineOrder: OfflineOrder = {
      ...order,
      id: order.id || crypto.randomUUID(),
      sync_status: 'pending',
    }
    await idbPut(offlineOrder)
  },

  // ─── Obtener órdenes pendientes de sincronizar ──────────────
  async getOfflineOrders(): Promise<OfflineOrder[]> {
    await migrateLegacyOnce()
    return idbGetAll()
  },

  // ─── Sincronizar órdenes cuando vuelve conexión ────────────
  async syncOfflineOrders(): Promise<{
    synced: OfflineOrder[]
    conflicts: OfflineOrder[]
  }> {
    const offlineOrders = await this.getOfflineOrders()
    const synced: OfflineOrder[] = []
    const conflicts: OfflineOrder[] = []

    for (const order of offlineOrders) {
      if (order.sync_status === 'synced') continue

      try {
        // Parsear items (se guardan como string JSON al crear offline)
        let items: unknown = order.items
        if (typeof items === 'string') {
          try { items = JSON.parse(items) } catch { items = [] }
        }

        // IMPORTANTE: usar el MISMO RPC que el flujo online (crear_orden_completa)
        // para que la orden sincronizada pase por toda la lógica (detalles,
        // descuento de inventario, etc.) y use el auth.uid() del usuario YA
        // autenticado al volver la conexión (no el user_id offline).
        const { error } = await supabase.rpc('crear_orden_completa', {
          p_mesa_id:     null,
          p_items:       items,
          p_tipo_pedido: order.tipo_pedido ?? 'LOCAL',
          p_notes:       order.notes ?? null,
          p_table_num:   order.table_num ?? null,
        })

        if (error) {
          // Stock insuficiente / conflicto de inventario
          if (error.code === '23514' || /stock|insuficiente|inventario/i.test(error.message)) {
            order.sync_status = 'conflict'
            order.conflict_reason = 'Desajuste de inventario: el stock cambió desde que se creó la orden offline.'
            await idbPut(order)
            conflicts.push(order)
          } else {
            throw error
          }
        } else {
          await idbDelete(order.id)
          synced.push(order)
        }
      } catch (error) {
        console.error('Sync error:', error)
        // Reintentar más tarde (se queda pendiente en IndexedDB)
      }
    }

    return { synced, conflicts }
  },

  // ─── Hook para monitorear conexión ───────────────────────────
  useOfflineSync() {
    return useMutation({
      mutationFn: () => this.syncOfflineOrders(),
      onSuccess: (result: { synced: OfflineOrder[]; conflicts: OfflineOrder[] }) => {
        if (result.conflicts.length > 0) {
          console.warn('Conflictos detectados:', result.conflicts)
        }
      },
    })
  },
}

// Sincronizar cuando vuelve la conexión.
// Guard para registrar el listener UNA sola vez (Dashboard puede remontarse).
let offlineSyncInitialized = false
export function initializeOfflineSync() {
  if (offlineSyncInitialized) return
  offlineSyncInitialized = true
  window.addEventListener('online', async () => {
    try {
      const { synced, conflicts } = await offlineService.syncOfflineOrders()
      if (synced.length > 0) {
        // Refrescar las vistas que dependen de órdenes
        queryClient.invalidateQueries()
        message.success(
          `Conexión restaurada — ${synced.length} pedido(s) offline sincronizado(s) y enviado(s) a cocina`,
        )
      }
      if (conflicts.length > 0) {
        message.warning(
          `${conflicts.length} pedido(s) offline no se pudieron sincronizar por inventario. Revísalos manualmente.`,
        )
      }
    } catch (e) {
      console.error('Error en sincronización offline:', e)
    }
  })
  // Intento inicial por si quedó algo pendiente de una sesión anterior
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    offlineService.syncOfflineOrders().then(({ synced }) => {
      if (synced.length > 0) queryClient.invalidateQueries()
    }).catch(() => {})
  }
}
