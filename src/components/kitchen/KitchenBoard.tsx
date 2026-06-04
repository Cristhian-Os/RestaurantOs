/**
 * KitchenBoard.tsx — Warm Editorial
 * Tablero de cocina (kanban) en tiempo real. Alto contraste para trabajo.
 * Lógica intacta: timer por orden, realtime, avance de estado.
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { pushNotificationService } from '../../services/pushNotificationService'
import message from 'antd/es/message'

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

const tint = (c: string, pct: number) => `color-mix(in oklch, ${c} ${pct}%, var(--w-surface))`

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

// ─── Tarjeta de orden ─────────────────────────────────────────
const OrderCard = memo(({ order, onAdvance }: { order: Order; onAdvance: (id: string, next: Order['status']) => void }) => {
  const elapsed = useElapsed(order.created_at)
  const elapsedSecs = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
  const isUrgent = elapsedSecs > 900

  const nextStatus: Record<Order['status'], Order['status'] | null> = {
    pending: 'cooking', cooking: 'ready', ready: 'completed', completed: null,
  }
  const next = nextStatus[order.status]
  const actionLabel: Record<Order['status'], string | null> = {
    pending: 'Iniciar preparación', cooking: 'Marcar listo', ready: null, completed: null,
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{
        background: 'var(--w-surface)', borderRadius: '1.125rem', padding: '0.875rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
        border: isUrgent ? '2px solid var(--w-wine)' : '1px solid var(--w-line)',
        boxShadow: 'var(--w-shadow-sm)',
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p className="ed-display" style={{ fontWeight: 600, fontSize: '1.0625rem', margin: 0 }}>
            {order.table_num ? `Mesa ${order.table_num}` : order.tipo_pedido}
          </p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0, fontFamily: 'var(--w-sans)' }}>#{order.id.slice(0,8)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '1.0625rem', margin: 0,
            color: isUrgent ? 'var(--w-wine)' : 'var(--w-ink-mut)' }} className={isUrgent ? 'animate-pulse' : ''}>
            {elapsed}
          </p>
          {isUrgent && <p style={{ fontSize: '0.625rem', color: 'var(--w-wine)', fontWeight: 800, margin: 0 }}>¡URGENTE!</p>}
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem', border: '1px solid var(--w-line)' }}>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: '0.5rem', background: 'var(--w-terra)', color: '#fff', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, fontFamily: 'var(--w-sans)' }}>
              {item.quantity}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--w-ink)', margin: 0, fontFamily: 'var(--w-sans)' }}>{item.name}</p>
              {item.notes && <p style={{ fontSize: '0.6875rem', color: 'var(--w-saffron)', fontWeight: 600, margin: 0 }}>{item.notes}</p>}
            </div>
          </div>
        ))}
      </div>

      {order.notes && (
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-soft)', background: 'var(--w-bg)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', margin: 0, border: '1px solid var(--w-line)' }}>
          {order.notes}
        </p>
      )}

      {next && actionLabel[order.status] && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onAdvance(order.id, next)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.875rem', fontWeight: 700, color: '#fff', fontSize: '0.875rem', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)',
            background: order.status === 'pending' ? 'var(--w-terra)' : 'var(--w-olive)',
            boxShadow: order.status === 'pending' ? 'var(--w-shadow-terra)' : 'var(--w-shadow-sm)' }}>
          {actionLabel[order.status]}
        </motion.button>
      )}
      {order.status === 'ready' && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onAdvance(order.id, 'completed')}
          style={{ width: '100%', padding: '0.625rem', borderRadius: '0.875rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', background: 'var(--w-ink)' }}>
          Entregar al mesero
        </motion.button>
      )}
    </motion.div>
  )
})
OrderCard.displayName = 'OrderCard'

// ─── Board ────────────────────────────────────────────────────
export const KitchenBoard = memo(() => {
  const [orders,   setOrders]  = useState<Order[]>([])
  const [loading,  setLoading] = useState(true)
  const prevCount = useRef(0)

  const parseOrder = (o: any): Order => ({
    ...o,
    items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
  })

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, table_num, tipo_pedido, items, notes, status, created_at')
      .in('status', ['pending','cooking','ready'])
      .order('created_at', { ascending: true })
    if (!error) {
      const parsed = (data || []).map(parseOrder)
      setOrders(prev => {
        if (prevCount.current > 0 && parsed.filter(o => o.status === 'pending').length >
            prev.filter(o => o.status === 'pending').length) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
        }
        prevCount.current = parsed.length
        return parsed
      })
    }
    setLoading(false)
  }, [])

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
      const dest = order?.table_num ? `Mesa ${order.table_num}` : 'Pedido'
      message.success({ content: `${dest} — pedido listo. Notificando al mesero...`, duration: 5 })
      // Push a meseros y admin (suena aunque tengan la app cerrada)
      pushNotificationService.notify(['waiter', 'admin'], 'Pedido listo', `${dest} está listo para entregar`, '/')
    }
    if (nextStatus === 'completed') message.success('Pedido entregado')
  }, [fetchOrders])

  const pending = orders.filter(o => o.status === 'pending')
  const cooking = orders.filter(o => o.status === 'cooking')
  const ready   = orders.filter(o => o.status === 'ready')

  const COLS = [
    { key: 'pending', label: 'Pendientes', orders: pending, color: 'var(--w-saffron)' },
    { key: 'cooking', label: 'En cocina',  orders: cooking, color: 'var(--w-terra)'   },
    { key: 'ready',   label: 'Listas',     orders: ready,   color: 'var(--w-olive)'   },
  ]

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '5rem 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid var(--w-terra)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', margin: 0 }}>Cocina</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)', margin: 0, fontFamily: 'var(--w-sans)' }}>{orders.length} órdenes activas · tiempo real</p>
        </div>
        <button onClick={fetchOrders} className="w-press" style={{ padding: '0.625rem', borderRadius: '0.75rem', color: 'var(--w-ink-soft)', background: 'var(--w-surface)', border: '1px solid var(--w-line)', cursor: 'pointer', display: 'flex' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ background: 'var(--w-surface)', borderRadius: '1.25rem', padding: '4rem 1rem', textAlign: 'center', border: '1px solid var(--w-line)' }}>
          <p className="ed-display" style={{ fontSize: '1.5rem', color: 'var(--w-ink)', margin: 0 }}>Sin órdenes activas</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', marginTop: '0.5rem', fontFamily: 'var(--w-sans)' }}>Las nuevas órdenes aparecerán aquí al instante</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '1rem' }} className="kitchen-cols">
          {COLS.map(col => (
            <div key={col.key} style={{ background: tint(col.color, 10), borderRadius: '1.25rem', padding: '0.875rem', border: `1px solid ${tint(col.color, 35)}`, minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.8125rem', color: col.color, margin: 0, fontFamily: 'var(--w-sans)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</h3>
                <span style={{ color: '#fff', background: col.color, fontSize: '0.75rem', fontWeight: 700, borderRadius: '9999px', minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--w-sans)' }}>
                  {col.orders.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <AnimatePresence>
                  {col.orders.map(order => <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />)}
                </AnimatePresence>
                {col.orders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', fontFamily: 'var(--w-sans)' }}>Sin órdenes</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@media (min-width: 768px) { .kitchen-cols { grid-template-columns: repeat(3, 1fr) !important; } }`}</style>
    </div>
  )
})
KitchenBoard.displayName = 'KitchenBoard'
