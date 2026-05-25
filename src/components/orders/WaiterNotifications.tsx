/**
 * WaiterNotifications.tsx
 * Banner persistente para meseros cuando un pedido está listo
 * Se monta globalmente en el Dashboard
 */
import { useState, useEffect, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'

interface ReadyOrder {
  id: string
  table_num: number | null
  created_at: string
  customer_name?: string | null
}

export const WaiterNotifications = memo(() => {
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([])
  const audioRef = useRef<AudioContext | null>(null)

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
    } catch { /* sin audio = sin error */ }
  }

  useEffect(() => {
    // Cargar pedidos ya listos al montar
    supabase.from('orders')
      .select('id, table_num, created_at, customer_name')
      .eq('status', 'ready')
      .then(({ data }) => { if (data) setReadyOrders(data) })

    // Escuchar cambios en tiempo real
    const ch = supabase.channel('waiter-alerts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
        const row = payload.new as { status: string; id: string; table_num: number | null; created_at: string; customer_name?: string | null }
        if (row.status === 'ready') {
          setReadyOrders(prev => [...prev.filter(o => o.id !== row.id), {
            id: row.id, table_num: row.table_num, created_at: row.created_at, customer_name: row.customer_name
          }])
          playBeep()
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
        }
        if (row.status === 'completed' || row.status === 'cancelled') {
          setReadyOrders(prev => prev.filter(o => o.id !== row.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  if (readyOrders.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: '0.5rem',
      width: '90%', maxWidth: 420,
    }}>
      <AnimatePresence>
        {readyOrders.map(order => (
          <motion.div key={order.id}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{
              backgroundColor: '#D8DAE4',
              borderRadius: '1.25rem',
              padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              boxShadow: '0 8px 32px rgba(16,185,129,0.3), 8px 8px 16px rgba(130,142,170,0.5),-8px -8px 16px rgba(255,255,255,0.5)',
              border: '2px solid #10B981',
            }}>
            <div style={{
              width: 44, height: 44, borderRadius: '0.875rem', backgroundColor: '#10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.25rem', flexShrink: 0,
              boxShadow: '4px 4px 8px rgba(16,185,129,0.35),-2px -2px 6px rgba(255,255,255,0.5)',
            }}>🔔</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: '#2D3561', margin: 0, fontSize: '0.9375rem' }}>
                Mesa {order.table_num ?? '?'} — ¡Listo!
              </p>
              <p style={{ fontSize: '0.8125rem', color: '#10B981', margin: 0, fontWeight: 600 }}>
                Pedido listo para entregar{order.customer_name ? ` · ${order.customer_name}` : ''}
              </p>
            </div>
            <button
              onClick={() => setReadyOrders(prev => prev.filter(o => o.id !== order.id))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B92AA', fontSize: '1.125rem', padding: 4, flexShrink: 0 }}>
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})
WaiterNotifications.displayName = 'WaiterNotifications'
