import { supabase } from './supabaseClient'
import { queryClient } from './queryClient'
import message from 'antd/es/message'
import type { Order } from '../types'

export interface OfflineOrder extends Order {
  sync_status: 'pending' | 'synced' | 'conflict'
  conflict_reason?: string
  restaurant_id?: string | null   // restaurante con el que se tomó el pedido (solo se envía a ese)
  mesa_id?: string | null
  idempotency_key?: string        // se genera una vez y se reutiliza en cada reintento
}

/** Evento de window: la lista de pedidos offline cambió (la pantalla de conflictos se refresca). */
export const OFFLINE_CAMBIO = 'offline-orders-cambio'
const avisar = () => { try { window.dispatchEvent(new Event(OFFLINE_CAMBIO)) } catch { /* sin window */ } }

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

// Cada operación abre y CIERRA su conexión (así el borrado de la base al cerrar sesión no queda bloqueado).
async function idbGetAll(): Promise<OfflineOrder[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    tx.oncomplete = () => { db.close(); resolve(req.result as OfflineOrder[]) }
    tx.onerror    = () => { db.close(); reject(tx.error) }
    tx.onabort    = () => { db.close(); reject(tx.error) }
  })
}

async function idbPut(order: OfflineOrder): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(order)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror    = () => { db.close(); reject(tx.error) }
    tx.onabort    = () => { db.close(); reject(tx.error) }
  })
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror    = () => { db.close(); reject(tx.error) }
    tx.onabort    = () => { db.close(); reject(tx.error) }
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

async function leerTodos(): Promise<OfflineOrder[]> {
  await migrateLegacyOnce()
  return idbGetAll()
}

/** ¿El fallo es transitorio (red, tiempo agotado, 5xx, sesión por renovar)? Se reintenta; cualquier otro es conflicto. */
function esTransitorio(error: { message?: string; code?: string }, status: number | undefined): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (status === 0 || status === 401 || status === 408 || status === 429 || (status !== undefined && status >= 500)) return true
  return /failed to fetch|networkerror|network request failed|load failed|fetch|timeout|timed out|jwt expired|jwt/i.test(error.message ?? '')
}

// Candado de módulo: una sola sincronización a la vez (online + intento inicial + reintentos manuales).
let syncing = false

export const offlineService = {
  // ─── Guardar orden localmente cuando offline ────────────────
  async saveOrderLocally(order: Order & Partial<Pick<OfflineOrder, 'restaurant_id' | 'mesa_id' | 'idempotency_key'>>): Promise<void> {
    await migrateLegacyOnce()
    const offlineOrder: OfflineOrder = {
      ...order,
      id: order.id || crypto.randomUUID(),
      idempotency_key: order.idempotency_key || crypto.randomUUID(),
      sync_status: 'pending',
    }
    await idbPut(offlineOrder)
    avisar()
  },

  // ─── Pedidos que el servidor rechazó (para revisarlos en pantalla) ───
  async listConflicts(): Promise<OfflineOrder[]> {
    const todos = await leerTodos()
    return todos.filter(o => o.sync_status === 'conflict')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async discardOrder(id: string): Promise<void> {
    await idbDelete(id)
    avisar()
  },

  /** Vuelve a dejar un pedido en conflicto como pendiente y lo intenta de nuevo. */
  async retryOrder(id: string): Promise<{ synced: OfflineOrder[]; conflicts: OfflineOrder[] }> {
    const o = (await leerTodos()).find(x => x.id === id)
    if (o) { await idbPut({ ...o, sync_status: 'pending', conflict_reason: undefined }); avisar() }
    return this.syncOfflineOrders()
  },

  // ─── Sincronizar órdenes cuando vuelve conexión ────────────
  async syncOfflineOrders(): Promise<{
    synced: OfflineOrder[]
    conflicts: OfflineOrder[]
  }> {
    const synced: OfflineOrder[] = []
    const conflicts: OfflineOrder[] = []
    if (syncing) return { synced, conflicts }
    syncing = true
    try {
      // Solo se envían los pedidos de la persona y el restaurante con sesión abierta ahora.
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return { synced, conflicts }
      const { data: rid, error: ridErr } = await supabase.rpc('current_restaurant_id')
      if (ridErr || !rid) return { synced, conflicts }

      const offlineOrders = (await leerTodos())
        .filter(o => o.sync_status === 'pending')
        .filter(o => o.user_id === userId && (!o.restaurant_id || o.restaurant_id === rid))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))

      for (const order of offlineOrders) {
        // Parsear items (se guardan como string JSON al crear offline)
        let items: unknown = order.items
        if (typeof items === 'string') {
          try { items = JSON.parse(items) } catch { items = [] }
        }

        // La clave se fija y se guarda ANTES de enviar: si la respuesta se pierde, el reintento
        // usa la misma y el servidor devuelve el pedido ya creado en lugar de duplicarlo.
        if (!order.idempotency_key) {
          order.idempotency_key = crypto.randomUUID()
          await idbPut(order)
        }

        // IMPORTANTE: usar el MISMO RPC que el flujo online (crear_orden_completa)
        // para que la orden sincronizada pase por toda la lógica (detalles,
        // descuento de inventario, etc.) y use el auth.uid() del usuario YA
        // autenticado al volver la conexión (no el user_id offline).
        let error: { message?: string; code?: string } | null = null
        let status: number | undefined
        try {
          const r = await supabase.rpc('crear_orden_completa', {
            p_mesa_id:         order.mesa_id ?? null,
            p_items:           items,
            p_tipo_pedido:     order.tipo_pedido ?? 'LOCAL',
            p_notes:           order.notes ?? null,
            p_table_num:       order.table_num ?? null,
            p_customer_name:   order.customer_name ?? null,
            p_idempotency_key: order.idempotency_key,
          })
          error = r.error
          status = r.status
        } catch (e) {
          error = { message: e instanceof Error ? e.message : String(e) }
          status = 0
        }

        if (!error) {
          await idbDelete(order.id)
          synced.push(order)
          continue
        }
        if (esTransitorio(error, status)) {
          // Sin red / servidor caído / sesión por renovar: se queda pendiente y se corta la ronda.
          console.error('Sync pendiente (error transitorio):', error)
          break
        }
        // Cualquier otro error (incluye «Ya no hay suficiente…») es un conflicto que una persona debe revisar.
        const conflicto: OfflineOrder = {
          ...order, sync_status: 'conflict',
          conflict_reason: error.message || 'El servidor rechazó el pedido.',
        }
        await idbPut(conflicto)
        conflicts.push(conflicto)
      }
    } finally {
      syncing = false
      avisar()
    }
    return { synced, conflicts }
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
          `Conexión restaurada — ${synced.length} pedido(s) offline sincronizado(s) y enviado(s) a caja`,
        )
      }
      if (conflicts.length > 0) {
        message.warning(
          `${conflicts.length} pedido(s) offline fueron rechazados por el servidor. Revísalos en Pedidos.`,
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
