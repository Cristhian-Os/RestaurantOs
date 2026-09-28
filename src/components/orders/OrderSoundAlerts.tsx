/**
 * OrderSoundAlerts.tsx — avisos sonoros de pedidos mientras la app está abierta.
 * Cada tipo de pedido suena distinto (ver services/orderSounds.ts):
 *  - Cocina: llega un pedido para preparar (ya pagado y pendiente).
 *  - Caja y admin: llega un pedido de otra persona (mesero o menú QR).
 *    Caja además oye cuando cocina marca un pedido como listo.
 *  - Meseros: suenan en WaiterNotifications (su pedido está listo).
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { playOrderSound, unlockAudio, isAudioLocked, onAudioStateChange, TIPO_LABEL } from '../../services/orderSounds'
import message from 'antd/es/message'

interface OrderRow { id: string; status: string; paid_at: string | null; tipo_pedido: string | null; user_id: string | null }

export function OrderSoundAlerts({ role, userId }: { role: string; userId: string }) {
  useEffect(() => {
    const isKitchen = role === 'kitchen'
    if (!isKitchen && role !== 'cashier' && role !== 'admin') return
    const heard = new Set<string>()
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // Lo que ya estaba activo al abrir la pantalla no vuelve a sonar.
    supabase.from('orders').select('id, status, paid_at').in('status', ['pending', 'cooking', 'ready'])
      .then(({ data }) => (data ?? []).forEach(o => {
        if (!isKitchen || o.paid_at) heard.add(`${o.id}:new`)
        if (o.status === 'ready') heard.add(`${o.id}:ready`)
      }))

    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel(`order-sounds-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, (payload) => {
          const o = payload.new as OrderRow
          if (!o?.id) return
          let key: string | null = null
          if (isKitchen) {
            if (o.status === 'pending' && o.paid_at) key = `${o.id}:new`
          } else if (payload.eventType === 'INSERT') {
            if (o.user_id !== userId) key = `${o.id}:new`
          } else if (role === 'cashier' && o.status === 'ready') {
            key = `${o.id}:ready`
          }
          if (!key || heard.has(key)) return
          heard.add(key)
          playOrderSound(o.tipo_pedido)
        })
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [role, userId])

  return null
}

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
)

// Botón del encabezado: reproduce los 4 tonos para reconocerlos y subir volumen.
export function SoundTestButton({ style }: { style: React.CSSProperties }) {
  const probar = () => {
    unlockAudio()
    ;(['LOCAL', 'LLEVAR', 'DOMICILIO', 'RAPPI'] as const).forEach((t, i) => setTimeout(() => {
      playOrderSound(t)
      message.info({ content: `Sonido de pedido: ${TIPO_LABEL[t]}`, duration: 2.5 })
    }, 300 + i * 3300))
  }
  return (
    <button onClick={probar} style={style} title="Probar sonidos de pedidos" aria-label="Probar sonidos de pedidos">
      <BellIcon />
    </button>
  )
}

// Aviso mientras el navegador no deje sonar: cualquier toque lo activa.
export function SoundUnlockBanner() {
  const [locked, setLocked] = useState(isAudioLocked)
  useEffect(() => onAudioStateChange(() => setLocked(isAudioLocked())), [])
  if (!locked) return null
  return (
    <button onClick={unlockAudio}
      style={{
        position: 'fixed', left: '50%', bottom: '1rem', transform: 'translateX(-50%)', zIndex: 190,
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem',
        width: 'max-content', maxWidth: 'calc(100vw - 2rem)', textAlign: 'left',
        borderRadius: '1.5rem', border: 'none', cursor: 'pointer',
        background: 'var(--w-saffron)', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
        fontFamily: 'var(--w-sans)', boxShadow: 'var(--w-shadow-md)',
      }}>
      <span style={{ flexShrink: 0, display: 'flex' }}><BellIcon /></span> Toca aquí para activar el sonido de los pedidos
    </button>
  )
}
