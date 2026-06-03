/**
 * WaiterNotifications.tsx v2
 * - Usa REPLICA IDENTITY FULL → payload.new contiene todos los campos
 * - Fallback: polling cada 15s por si Realtime falla
 * - Beep + vibración al llegar notificación nueva
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'

interface ReadyOrder {
  id:            string
  table_num:     number | null
  customer_name: string | null
  created_at:    string
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.2].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3)
    })
  } catch { /* sin audio */ }
}

export const WaiterNotifications = memo(() => {
  const [ready, setReady] = useState<ReadyOrder[]>([])

  const fetchReady = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, table_num, customer_name, created_at')
      .eq('status', 'ready')
    if (data) setReady(data)
  }, [])

  useEffect(() => {
    // Carga inicial
    fetchReady()

    // Polling de respaldo cada 15 segundos
    const poll = setInterval(fetchReady, 15_000)

    // Canal único por instancia — evita canales duplicados si React monta 2 veces
    const channelName = `waiter-notifs-${Date.now()}`
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new as {
            id: string; status: string; table_num: number | null
            customer_name: string | null; created_at: string
          }

          if (row.status === 'ready') {
            setReady(prev => {
              if (prev.some(o => o.id === row.id)) return prev
              beep()
              if ('vibrate' in navigator) navigator.vibrate([300, 100, 300])
              return [...prev, {
                id: row.id, table_num: row.table_num,
                customer_name: row.customer_name, created_at: row.created_at,
              }]
            })
          }
          if (row.status === 'completed' || row.status === 'cancelled') {
            setReady(prev => prev.filter(o => o.id !== row.id))
          }
        }
      )
      .subscribe((status) => {
        console.log('WaiterNotifications canal:', status)
      })

    return () => {
      clearInterval(poll)
      supabase.removeChannel(ch)
    }
  }, [fetchReady])

  if (ready.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column-reverse', gap: '0.5rem',
      width: '92%', maxWidth: 400, pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {ready.map(order => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 48, scale: 0.88 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{ pointerEvents: 'auto' }}
          >
            <div style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '1.25rem',
              padding: '0.875rem 1rem',
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              border: '2.5px solid #10B981',
              boxShadow: '0 8px 24px rgba(16,185,129,0.25), 8px 8px 16px rgba(130,142,170,0.45),-8px -8px 16px rgba(255,255,255,0.55)',
            }}>
              {/* Ícono animado */}
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                style={{
                  width: 42, height: 42, borderRadius: '0.875rem',
                  backgroundColor: 'var(--green)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                  boxShadow: '4px 4px 8px rgba(16,185,129,0.3),-2px -2px 6px rgba(255,255,255,0.5)',
                }}></motion.div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '0.9375rem', fontFamily: 'DM Sans, sans-serif' }}>
                  Mesa {order.table_num ?? '?'} — ¡Listo!
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--green)', margin: 0, fontWeight: 600 }}>
                  Entregar ahora{order.customer_name ? ` · ${order.customer_name}` : ''}
                </p>
              </div>

              <button
                onClick={() => setReady(prev => prev.filter(o => o.id !== order.id))}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '1.125rem', padding: '0.25rem',
                  flexShrink: 0, minHeight: 'auto', minWidth: 'auto',
                }}>✕</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})
WaiterNotifications.displayName = 'WaiterNotifications'
