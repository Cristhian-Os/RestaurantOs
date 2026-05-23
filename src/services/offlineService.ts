import { useMutation } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
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
        const { error } = await supabase.from('orders').insert([
          {
            id: order.id,
            user_id: order.user_id,
            items: order.items,
            total: order.total,
            status: order.status,
            table_num: order.table_num,
            notes: order.notes,
            tipo_pedido: order.tipo_pedido,
          },
        ])

        if (error) {
          // CHECK constraint violation (stock insuficiente)
          if (error.code === '23514') {
            order.sync_status = 'conflict'
            order.conflict_reason = 'Desajuste de Inventario: El stock ha cambiado desde que se creó la orden offline.'
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
        // Reintentar más tarde
      }
    }

    // BUG FIX #5: .includes() compara por referencia de objeto, no por id.
    // Como los objetos en synced/conflicts son referencias distintas a offlineOrders,
    // el filter siempre incluía TODOS, triplicando entradas en localStorage.
    const syncedIds    = new Set(synced.map(o => o.id))
    const conflictIds  = new Set(conflicts.map(o => o.id))

    const updatedOrders = [
      ...offlineOrders.map(o => {
        if (syncedIds.has(o.id))   return { ...o, sync_status: 'synced' as const }
        if (conflictIds.has(o.id)) return conflicts.find(c => c.id === o.id)!
        return o
      }),
    ]

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrders))

    return { synced, conflicts }
  },

  // ─── Hook para monitorear conexión ───────────────────────────
  useOfflineSync() {
    return useMutation({
      mutationFn: () => this.syncOfflineOrders(),
      onSuccess: (result: { synced: OfflineOrder[]; conflicts: OfflineOrder[] }) => {
        if (result.conflicts.length > 0) {
          console.warn('⚠️ Conflictos detectados:', result.conflicts)
        }
      },
    })
  },
}

// Sincronizar cuando vuelve la conexión
export function initializeOfflineSync() {
  window.addEventListener('online', async () => {
    console.log('📡 Conexión restaurada. Sincronizando órdenes...')
    await offlineService.syncOfflineOrders()
  })
}
