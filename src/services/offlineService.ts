import { useMutation } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { queryClient } from './queryClient'
import message from 'antd/es/message'
import type { Order } from '../types'

export interface OfflineOrder extends Order {
  sync_status: 'pending' | 'synced' | 'conflict'
  conflict_reason?: string
}

const STORAGE_KEY = 'restaurantos_offline_orders'

export const offlineService = {
  // ─── Guardar orden localmente cuando offline ────────────────
  async saveOrderLocally(order: Order): Promise<void> {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OfflineOrder[]

    const offlineOrder: OfflineOrder = {
      ...order,
      id: order.id || crypto.randomUUID(),
      sync_status: 'pending',
    }

    stored.push(offlineOrder)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  },

  // ─── Obtener órdenes pendientes de sincronizar ──────────────
  getOfflineOrders(): OfflineOrder[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OfflineOrder[]
  },

  // ─── Sincronizar órdenes cuando vuelve conexión ────────────
  async syncOfflineOrders(): Promise<{
    synced: OfflineOrder[]
    conflicts: OfflineOrder[]
  }> {
    const offlineOrders = this.getOfflineOrders()
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
            conflicts.push(order)
          } else {
            throw error
          }
        } else {
          order.sync_status = 'synced'
          synced.push(order)
        }
      } catch (error) {
        console.error('Sync error:', error)
        // Reintentar más tarde (se queda pendiente en localStorage)
      }
    }

    // Quitar las sincronizadas de localStorage; conservar pendientes y conflictos.
    const syncedIds   = new Set(synced.map(o => o.id))
    const conflictIds = new Set(conflicts.map(o => o.id))
    const remaining = offlineOrders
      .filter(o => !syncedIds.has(o.id))
      .map(o => conflictIds.has(o.id) ? (conflicts.find(c => c.id === o.id) ?? o) : o)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))

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
