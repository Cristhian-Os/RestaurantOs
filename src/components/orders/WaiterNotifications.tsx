/**
 * WaiterNotifications.tsx v2
 * - Usa REPLICA IDENTITY FULL → payload.new contiene todos los campos
 * - Fallback: polling cada 15s por si Realtime falla
 * - Tono según el tipo de pedido (orderSounds) + vibración al llegar
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { playOrderSound, TIPO_LABEL } from '../../services/orderSounds'

interface ReadyOrder {
  id:            string
  table_num:     number | null
  customer_name: string | null
  created_at:    string
  user_id:       string | null
  tipo_pedido:   string | null
}

export const WaiterNotifications = memo(() => {
  const [ready, setReady] = useState<ReadyOrder[]>([])

  // Todos los meseros ven el aviso de "pedido listo": cualquiera puede ir a
  // buscarlo. "Ya lo tengo" lo quita en todos los dispositivos.
  const fetchReady = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, table_num, customer_name, created_at, user_id, tipo_pedido')
      .eq('status', 'ready')
      .is('delivered_at', null)
    if (data) setReady(data)
  }, [])

  // Marcar como entregada: persiste en la base (visible en Caja) y quita
  // el aviso de todos los dispositivos, no solo de esta pantalla.
  const markDelivered = useCallback(async (orderId: string) => {
    setReady(prev => prev.filter(o => o.id !== orderId))
    await supabase.from('orders').update({ delivered_at: new Date().toISOString() }).eq('id', orderId)
  }, [])

  useEffect(() => {
    // Carga inicial
    fetchReady()

    // Polling de respaldo cada 15 segundos
    const poll = setInterval(fetchReady, 15_000)

    // Canal único por instancia — evita canales duplicados si React monta 2 veces
    const channelName = `waiter-notifs-${Date.now()}`
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // Filtrado por restaurant_id: sin esto, el mesero de CUALQUIER restaurante
    // recibía el beep + aviso de "pedido listo" de pedidos de OTROS restaurantes.
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` },
          (payload) => {
            const row = payload.new as {
              id: string; status: string; table_num: number | null
              customer_name: string | null; created_at: string; delivered_at: string | null
              user_id: string | null; tipo_pedido: string | null
            }

            if (row.status === 'ready' && !row.delivered_at) {
              setReady(prev => {
                if (prev.some(o => o.id === row.id)) return prev
                playOrderSound(row.tipo_pedido)
                return [...prev, {
                  id: row.id, table_num: row.table_num,
                  customer_name: row.customer_name, created_at: row.created_at,
                  user_id: row.user_id, tipo_pedido: row.tipo_pedido,
                }]
              })
            }
            // Entregada (por este u otro mesero) o cerrada: quitar el aviso de todos los dispositivos.
            if (row.delivered_at || row.status === 'completed' || row.status === 'cancelled') {
              setReady(prev => prev.filter(o => o.id !== row.id))
            }
          }
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      clearInterval(poll)
      if (ch) supabase.removeChannel(ch)
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
              boxShadow: 'var(--shadow-green)',
            }}>
              {/* Ícono animado */}
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                style={{
                  width: 42, height: 42, borderRadius: '0.875rem',
                  backgroundColor: 'var(--green)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                  boxShadow: 'var(--shadow-green)',
                }}></motion.div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '0.9375rem', fontFamily: 'DM Sans, sans-serif' }}>
                  {order.table_num ? `Mesa ${order.table_num}` : TIPO_LABEL[order.tipo_pedido ?? ''] ?? 'Pedido'} — ¡Listo!
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--green)', margin: 0, fontWeight: 600 }}>
                  Entregar ahora{order.customer_name ? ` · ${order.customer_name}` : ''}
                </p>
              </div>

              <button
                onClick={() => markDelivered(order.id)}
                style={{
                  background: 'var(--green)', border: 'none', cursor: 'pointer', color: '#fff',
                  fontSize: '0.75rem', fontWeight: 700, padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>Ya lo tengo</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})
WaiterNotifications.displayName = 'WaiterNotifications'
