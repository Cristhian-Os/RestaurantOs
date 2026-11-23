import { useMutation } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { queryClient } from './queryClient'
import { esErrorDeRed } from './paymentQueue'
import message from 'antd/es/message'
import type { Order } from '../types'

export interface OfflineOrder extends Order {
  sync_status: 'pending' | 'synced' | 'conflict'
  conflict_reason?: string
}

export interface SyncResult {
  synced: OfflineOrder[]
  conflicts: OfflineOrder[]
  failed: OfflineOrder[]   // sin conexión: se quedan en la cola y se reintentan solos
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Evento de window: la cola de pedidos sin enviar cambió (la pantalla de pedidos lo escucha).
export const OFFLINE_CAMBIO = 'offline-orders-cambio'
const avisarCambio = () => {
  try { window.dispatchEvent(new Event(OFFLINE_CAMBIO)) } catch { /* no crítico */ }
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

// Solo una sincronización a la vez: si el evento "online", el reintento automático y el arranque
// coinciden, el mismo pedido no se envía dos veces (eso creaba pedidos dobles).
let syncEnCurso: Promise<SyncResult> | null = null

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
    avisarCambio()
  },

  // ─── Obtener órdenes pendientes de sincronizar ──────────────
  async getOfflineOrders(): Promise<OfflineOrder[]> {
    await migrateLegacyOnce()
    return idbGetAll()
  },

  // ─── Descartar un pedido que no se pudo enviar (lo decide el personal) ───
  async discardOrder(id: string): Promise<void> {
    await idbDelete(id)
    avisarCambio()
  },

  // ─── Sincronizar órdenes cuando vuelve conexión ────────────
  syncOfflineOrders(): Promise<SyncResult> {
    if (syncEnCurso) return syncEnCurso
    syncEnCurso = this.syncOnce().finally(() => { syncEnCurso = null })
    return syncEnCurso
  },

  async syncOnce(): Promise<SyncResult> {
    const offlineOrders = (await this.getOfflineOrders())
      .filter(o => o.sync_status === 'pending')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))   // en el orden en que se tomaron
    const synced: OfflineOrder[] = []
    const conflicts: OfflineOrder[] = []
    const failed: OfflineOrder[] = []

    for (const order of offlineOrders) {
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
          p_mesa_id:       order.mesa_id ?? null,
          p_items:         items,
          p_tipo_pedido:   order.tipo_pedido ?? 'LOCAL',
          p_notes:         order.notes ?? null,
          p_table_num:     order.table_num ?? null,
          p_customer_name: order.customer_name ?? null,
          // El id de la cola es el código único del envío: si un intento anterior sí llegó al servidor, no se duplica.
          p_idempotency_key: ES_UUID.test(order.id) ? order.id : null,
        })

        if (error) throw error
        await idbDelete(order.id)
        synced.push(order)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message ?? '')
        if (esErrorDeRed(msg)) {
          // Sin conexión real: se queda en la cola y se reintenta solo, sin saltarse el orden.
          failed.push(order)
          break
        }
        // El servidor lo rechazó (stock, permisos, datos): no se reintenta solo, lo revisa el personal.
        order.sync_status = 'conflict'
        order.conflict_reason = /stock|insuficiente|inventario/i.test(msg)
          ? 'Desajuste de inventario: el stock cambió desde que se creó la orden offline.'
          : (msg || 'El servidor rechazó el pedido.')
        await idbPut(order)
        conflicts.push(order)
      }
    }

    if (synced.length > 0 || conflicts.length > 0) avisarCambio()
    return { synced, conflicts, failed }
  },

  // ─── Hook para monitorear conexión ───────────────────────────
  useOfflineSync() {
    return useMutation({
      mutationFn: () => this.syncOfflineOrders(),
      onSuccess: (result: SyncResult) => {
        if (result.conflicts.length > 0) {
          console.warn('Conflictos detectados:', result.conflicts)
        }
      },
    })
  },
}

async function sincronizarYAvisar() {
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
        `${conflicts.length} pedido(s) offline no se pudieron enviar. Revísalos en Pedidos: puedes descartarlos y volver a tomarlos.`,
      )
    }
  } catch (e) {
    console.error('Error en sincronización offline:', e)
  }
}

// Sincronizar cuando vuelve la conexión.
// Guard para registrar el listener UNA sola vez (Dashboard puede remontarse).
let offlineSyncInitialized = false
export function initializeOfflineSync() {
  if (offlineSyncInitialized) return
  offlineSyncInitialized = true
  window.addEventListener('online', () => { void sincronizarYAvisar() })
  // Reintento automático: si el WiFi vuelve pero el evento "online" no llega (o el primer intento falló),
  // los pedidos guardados no se quedan esperando para siempre.
  window.setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) void sincronizarYAvisar()
  }, 30_000)
  // Intento inicial por si quedó algo pendiente de una sesión anterior
  if (typeof navigator !== 'undefined' && navigator.onLine) void sincronizarYAvisar()
}
