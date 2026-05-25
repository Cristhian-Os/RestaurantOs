/**
 * KitchenBoard.tsx
 * ─────────────────────────────────────────────────────────────
 * Panel de cocina con:
 *  • Órdenes activas en tiempo real (columnas Kanban)
 *  • Botones para avanzar estado: pending → cooking → ready
 *  • Timer visual por orden (cuánto lleva esperando)
 *  • Sonido/vibración al llegar orden nueva (si el navegador lo permite)
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  neoIn:   { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
  amber:   { boxShadow: '8px 8px 16px rgba(245,158,11,0.3),-4px -4px 12px rgba(255,255,255,0.6)' },
  green:   { boxShadow: '8px 8px 16px rgba(16,185,129,0.28),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

interface OrderItem { id: string; name: string; price: number; quantity: number; notes?: string }
interface Order {
  id:         string
  table_num:  number | null
  tipo_pedido:string
  items:      OrderItem[]
  notes:      string | null
  status:     'pending' | 'cooking' | 'ready' | 'completed'
  created_at: string
}

// ─── Timer hook ───────────────────────────────────────────────
function useElapsed(createdAt: string): string {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
      const m = Math.floor(diff / 60), s = diff % 60
      setElapsed(`${m}:${s.toString().padStart(2,'0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [createdAt])
  return elapsed
}

// ─── Tarjeta de orden individual ─────────────────────────────
const OrderCard = memo(({ order, onAdvance }: { order: Order; onAdvance: (id: string, next: Order['status']) => void }) => {
  const elapsed = useElapsed(order.created_at)
  const elapsedSecs = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
  const isUrgent = elapsedSecs > 900 // >15min → urgente

  const nextStatus: Record<Order['status'], Order['status'] | null> = {
    pending:   'cooking',
    cooking:   'ready',
    ready:     'completed',
    completed: null,
  }
  const next = nextStatus[order.status]

  const actionLabel: Record<Order['status'], string | null> = { pending: '🍳 Iniciar', cooking: '✅ Listo para recoger', ready: null, completed: null }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`bg-[#D8DAE4] rounded-3xl p-4 flex flex-col gap-3 ${isUrgent ? 'ring-2 ring-red-400' : ''}`}
      style={S.neoOut}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-[#2D3561] text-base" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {order.table_num ? `Mesa ${order.table_num}` : order.tipo_pedido}
          </p>
          <p className="text-xs text-[#9CA3AF]">#{order.id.slice(0,8)}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${isUrgent ? 'text-red-500 animate-pulse' : 'text-[#9CA3AF]'}`}>
            ⏱ {elapsed}
          </p>
          {isUrgent && <p className="text-[10px] text-red-500 font-bold">¡URGENTE!</p>}
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5 bg-[#CDD0DC] rounded-2xl p-3" style={S.neoIn}>
        {order.items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-lg bg-[#FF5722] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5" style={S.coral}>
              {item.quantity}
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#2D3561]">{item.name}</p>
              {item.notes && <p className="text-[10px] text-amber-600 font-medium">⚠️ {item.notes}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Nota general */}
      {order.notes && (
        <p className="text-xs text-[#6B7280] bg-[#CDD0DC] rounded-xl px-3 py-2" style={S.neoIn}>
          💬 {order.notes}
        </p>
      )}

      {/* Botón de avance */}
      {/* BUG FIX #3: eliminada prop inválida style2 (no existe en React).
          Background fusionado en style junto con la sombra neomórfica. */}
      {next && actionLabel[order.status] && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onAdvance(order.id, next)}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm"
          style={{
            background: order.status === 'pending' ? '#FF5722' : '#10B981',
            ...(order.status === 'pending' ? S.coral : S.green),
          }}
        >
          {actionLabel[order.status]}
        </motion.button>
      )}
      {order.status === 'ready' && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onAdvance(order.id, 'completed')}
          className="w-full py-2.5 rounded-2xl text-center text-sm font-bold text-white"
          style={{ background: '#2D3561', boxShadow: '8px 8px 16px rgba(45,53,97,0.3),-4px -4px 12px rgba(255,255,255,0.5)' }}
        >
          🛎️ Entregar al mesero
        </motion.button>
      )}
    </motion.div>
  )
})
OrderCard.displayName = 'OrderCard'

// ─── Board principal ──────────────────────────────────────────
export const KitchenBoard = memo(() => {
  const [orders,   setOrders]  = useState<Order[]>([])
  const [loading,  setLoading] = useState(true)
  const prevCount = useRef(0)

  const parseOrder = (o: any): Order => ({
    ...o,
    items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
  })

  // BUG FIX #2: [orders] en el dep array causaba que fetchOrders se recreara
  // cada vez que llegaba una orden nueva → useEffect re-suscribía Realtime en loop.
  // Solución: usar setOrders con función de actualización para comparar contra el
  // estado previo sin declarar orders como dependencia.
  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, table_num, tipo_pedido, items, notes, status, created_at')
      .in('status', ['pending','cooking','ready'])
      .order('created_at', { ascending: true })
    if (!error) {
      const parsed = (data || []).map(parseOrder)
      setOrders(prev => {
        // Notificar si llegó orden nueva (usando el estado previo, no el closure)
        if (prevCount.current > 0 && parsed.filter(o => o.status === 'pending').length >
            prev.filter(o => o.status === 'pending').length) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
        }
        prevCount.current = parsed.length
        return parsed
      })
    }
    setLoading(false)
  }, []) // sin [orders] — estable para siempre

  useEffect(() => {
    fetchOrders()
    const channel = supabase
      .channel('kitchen-board-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdvance = useCallback(async (orderId: string, nextStatus: Order['status']) => {
    const order = orders.find(o => o.id === orderId)
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)
    if (error) { message.error('Error al actualizar: ' + error.message); return }
    fetchOrders()
    if (nextStatus === 'ready') {
      message.success({
        content: `🔔 Mesa ${order?.table_num ?? '?'} — ¡Pedido listo! Notificando al mesero...`,
        duration: 5,
      })
    }
    if (nextStatus === 'completed') message.success('✅ Pedido entregado')
  }, [fetchOrders])

  const pending = orders.filter(o => o.status === 'pending')
  const cooking = orders.filter(o => o.status === 'cooking')
  const ready   = orders.filter(o => o.status === 'ready')

  const COLS = [
    { key: 'pending', label: '⏳ Pendientes', orders: pending, color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200' },
    { key: 'cooking', label: '🍳 En cocina',  orders: cooking, color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
    { key: 'ready',   label: '✅ Listas',      orders: ready,   color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  ]

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            👨‍🍳 Tablero de Cocina
          </h2>
          <p className="text-sm text-[#9CA3AF]">{orders.length} órdenes activas · tiempo real</p>
        </div>
        <button onClick={fetchOrders} className="p-2.5 rounded-2xl text-[#6B7280]" style={S.neoOutSm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>

      {/* Columnas Kanban */}
      {orders.length === 0 ? (
        <div className="bg-[#D8DAE4] rounded-3xl p-16 text-center" style={S.neoIn}>
          <p className="text-5xl mb-3">🍽️</p>
          <p className="font-bold text-[#2D3561] text-lg">Sin órdenes activas</p>
          <p className="text-sm text-[#9CA3AF] mt-1">Las nuevas órdenes aparecerán aquí al instante</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map(col => (
            <div key={col.key} className={`${col.bg} rounded-3xl p-4 border-2 ${col.border} min-h-[200px]`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold text-sm ${col.color}`}>{col.label}</h3>
                <span className={`${col.color} text-xs font-bold bg-white rounded-full w-6 h-6 flex items-center justify-center`} style={S.neoOutSm}>
                  {col.orders.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {col.orders.map(order => (
                    <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />
                  ))}
                </AnimatePresence>
                {col.orders.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-400">
                    Sin órdenes
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
KitchenBoard.displayName = 'KitchenBoard'
