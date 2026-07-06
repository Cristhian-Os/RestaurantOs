/**
 * SubscriptionBanner.tsx — aviso de estado de la suscripción
 * ───────────────────────────────────────────────────────────────
 * Se muestra arriba del panel cuando el restaurante está en prueba, en mora o
 * cancelado. Invita al admin a ir a "Suscripción" para pagar. No bloquea la app
 * (el bloqueo duro lo maneja restaurants.active + el cron); esto es el aviso.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../services/supabaseClient'
import type { NavView } from '../../pages/Dashboard'
import type { SubStatus } from '../../config/billing'

const daysLeft = (iso: string | null): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null

export default function SubscriptionBanner({ onNavigate }: { onNavigate?: (v: NavView) => void }) {
  const [info, setInfo] = useState<{ status: SubStatus; trial_ends_at: string | null; grace_ends_at: string | null; is_promo: boolean } | null>(null)
  const [billingActive, setBillingActive] = useState(false)

  useEffect(() => {
    supabase.from('subscriptions')
      .select('status, trial_ends_at, grace_ends_at, is_promo')
      .maybeSingle()
      .then(({ data }) => { if (data) setInfo(data as any) })
    supabase.rpc('platform_billing_active').then(({ data }) => setBillingActive(data === true))
  }, [])

  // Mientras la plataforma no tenga Wompi activo, nada de esto se aplica de
  // verdad todavía (ver enforce_subscription_lifecycle) — no alarmar a nadie.
  if (!billingActive) return null
  if (!info || info.is_promo) return null
  if (info.status === 'active') return null

  let text = '', bg = '', color = ''
  if (info.status === 'trialing') {
    const d = daysLeft(info.trial_ends_at)
    if (d === null || d > 3) return null // solo avisar cerca del final
    text = d <= 0 ? 'Tu prueba gratuita terminó. Activa tu plan para seguir usando la app.' : `Tu prueba gratuita termina en ${d} día${d === 1 ? '' : 's'}. Activa tu plan para no perder acceso.`
    bg = 'rgba(201,160,64,0.14)'; color = '#8a6d3b'
  } else if (info.status === 'past_due') {
    const d = daysLeft(info.grace_ends_at)
    text = `Pago pendiente. Tienes ${Math.max(d ?? 0, 0)} día${d === 1 ? '' : 's'} de gracia antes de perder acceso. Ponte al día para no interrumpir tu servicio.`
    bg = 'rgba(176,52,29,0.12)'; color = '#B0341D'
  } else { // canceled
    text = 'Tu acceso está suspendido por falta de pago. Reactiva tu plan para recuperar tu restaurante (tus datos se conservan 30 días).'
    bg = 'rgba(176,52,29,0.16)'; color = '#B0341D'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', padding: '0.85rem 1.1rem', borderRadius: '0.9rem', background: bg, color, marginBottom: '1.25rem', fontFamily: 'var(--w-sans)', fontSize: '0.88rem', fontWeight: 600 }}>
      <span style={{ flex: 1, minWidth: 200 }}>{text}</span>
      {onNavigate && (
        <button onClick={() => onNavigate('billing')} className="w-press"
          style={{ padding: '0.5rem 1rem', borderRadius: '0.7rem', border: 'none', background: color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Ir a Suscripción
        </button>
      )}
    </div>
  )
}
