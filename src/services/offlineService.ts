import { supabase } from './supabaseClient'
import { queryClient } from './queryClient'
import message from 'antd/es/message'
import Modal from 'antd/es/modal'
import { contextoActual, esDelContexto, esErrorTransitorio } from './paymentQueue'
import type { Order } from '../types'

export interface OfflineOrder extends Order {
  sync_status: 'pending' | 'synced' | 'conflict'
  conflict_reason?: string
  mesa_id?: string | null          // mesa elegida (p_mesa_id)
  idempotency_key?: string         // misma clave en cada reintento: el servidor no duplica el pedido
  restaurant_id?: string | null    // restaurante de quien lo creó (solo ese restaurante lo sincroniza)
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

let syncing = false   // un solo envío a la vez (el evento 'online' y el intento inicial no deben duplicar pedidos)

async function listarOffline(): Promise<OfflineOrder[]> {
  await migrateLegacyOnce()
  return idbGetAll()
}

export const offlineService = {
  // ─── Guardar orden localmente cuando offline ────────────────
  async saveOrderLocally(order: Order & Partial<Pick<OfflineOrder, 'mesa_id' | 'idempotency_key' | 'restaurant_id'>>): Promise<void> {
    await migrateLegacyOnce()
    const ctx = order.restaurant_id ? null : await contextoActual()
    const offlineOrder: OfflineOrder = {
      ...order,
      id: order.id || crypto.randomUUID(),
      idempotency_key: order.idempotency_key ?? crypto.randomUUID(),
      restaurant_id: order.restaurant_id ?? ctx?.restaurantId ?? null,
      sync_status: 'pending',
    }
    await idbPut(offlineOrder)
  },

  // ─── Pedidos en conflicto del usuario/restaurante actuales ───
  async getConflicts(): Promise<OfflineOrder[]> {
    const ctx = await contextoActual()
    return (await listarOffline()).filter(o => o.sync_status === 'conflict' && esDelContexto(o, ctx))
  },

  // ─── Descartar un pedido offline (el usuario decide perderlo) ─
  async discardOrder(id: string): Promise<void> {
    await idbDelete(id)
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
      const ctx = await contextoActual()
      if (!ctx.userId) return { synced, conflicts }
      const offlineOrders = (await listarOffline())
        // Solo los del usuario y restaurante actuales; los ajenos no se envían.
        .filter(o => esDelContexto(o, ctx))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))

      for (const order of offlineOrders) {
        if (order.sync_status !== 'pending') continue   // synced o conflicto: no se reenvía solo

        try {
          // Parsear items (se guardan como string JSON al crear offline)
          let items: unknown = order.items
          if (typeof items === 'string') {
            try { items = JSON.parse(items) } catch { items = [] }
          }

          // Pedidos guardados por versiones anteriores no traen clave: se fija una y se guarda
          // ANTES de enviar, para que cualquier reintento sea idempotente.
          if (!order.idempotency_key) {
            order.idempotency_key = crypto.randomUUID()
            await idbPut(order)
          }

          // IMPORTANTE: usar el MISMO RPC que el flujo online (crear_orden_completa)
          // para que la orden sincronizada pase por toda la lógica (detalles,
          // descuento de inventario, etc.) y use el auth.uid() del usuario YA
          // autenticado al volver la conexión (no el user_id offline).
          const { error, status } = await supabase.rpc('crear_orden_completa', {
            p_mesa_id:         order.mesa_id ?? null,
            p_items:           items,
            p_tipo_pedido:     order.tipo_pedido ?? 'LOCAL',
            p_notes:           order.notes ?? null,
            p_table_num:       order.table_num ?? null,
            p_customer_name:   order.customer_name ?? null,
            p_idempotency_key: order.idempotency_key,
          })

          if (error) {
            // Red, tiempo agotado, 5xx o sesión por renovar: se queda pendiente y se reintenta luego.
            if (esErrorTransitorio(error, status)) break
            // Cualquier otro rechazo del servidor (stock, mesa ocupada, datos inválidos...) es un conflicto.
            order.sync_status = 'conflict'
            order.conflict_reason = /stock|insuficiente|inventario/i.test(error.message)
              ? `Desajuste de inventario: ${error.message}`
              : error.message
            await idbPut(order)
            conflicts.push(order)
          } else {
            await idbDelete(order.id)
            synced.push(order)
          }
        } catch (error) {
          console.error('Sync error:', error)
          break   // fallo inesperado (casi siempre de red): se reintenta más tarde
        }
      }
    } finally {
      syncing = false
    }

    return { synced, conflicts }
  },
}

// Avisa de un pedido offline que el servidor rechazó, con opción de descartarlo.
const avisados = new Set<string>()
function avisarConflicto(o: OfflineOrder) {
  if (avisados.has(o.id)) return
  avisados.add(o.id)
  const destino = o.table_num ? `Mesa ${o.table_num}` : (o.tipo_pedido ?? 'Pedido')
  Modal.confirm({
    title: 'Un pedido hecho sin internet no se pudo enviar',
    content: `${destino}${o.customer_name ? ` · ${o.customer_name}` : ''} · $${Math.round(o.total ?? 0).toLocaleString('es-CO')}. Motivo: ${o.conflict_reason ?? 'rechazado por el servidor'}. Si lo descartas se pierde; si lo conservas queda guardado en este equipo.`,
    okText: 'Descartar pedido',
    okButtonProps: { danger: true },
    cancelText: 'Conservar',
    onOk: async () => {
      try { await offlineService.discardOrder(o.id) } catch (e) { message.error('No se pudo descartar el pedido'); console.error(e) }
    },
  })
}

async function sincronizarYAvisar(): Promise<number> {
  const { synced, conflicts } = await offlineService.syncOfflineOrders()
  if (synced.length > 0) {
    // Refrescar las vistas que dependen de órdenes
    queryClient.invalidateQueries()
    message.success(
      `Conexión restaurada — ${synced.length} pedido(s) offline sincronizado(s)`,
    )
  }
  const pendientes = await offlineService.getConflicts()   // incluye conflictos de sesiones anteriores
  for (const o of [...conflicts, ...pendientes]) avisarConflicto(o)
  return synced.length
}

// Sincronizar cuando vuelve la conexión.
// Guard para registrar el listener UNA sola vez (Dashboard puede remontarse).
let offlineSyncInitialized = false
export function initializeOfflineSync() {
  if (offlineSyncInitialized) return
  offlineSyncInitialized = true
  window.addEventListener('online', () => {
    sincronizarYAvisar().catch(e => console.error('Error en sincronización offline:', e))
  })
  // Intento inicial por si quedó algo pendiente de una sesión anterior
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    sincronizarYAvisar().catch(() => {})
  }
}
