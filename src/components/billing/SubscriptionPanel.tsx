/**
 * SubscriptionPanel.tsx — Fase 3: facturación del restaurante
 * ───────────────────────────────────────────────────────────────
 * El admin ve el estado de su suscripción, paga/renueva su plan y (Premium)
 * activa los pagos en línea para sus comensales con sus propias llaves Wompi.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { formatCentsCOP, openWompiCheckout, type SubStatus } from '../../config/billing'

interface Sub {
  plan: string
  status: SubStatus
  amount_in_cents: number | null
  is_promo: boolean
  trial_ends_at: string | null
  current_period_end: string | null
  grace_ends_at: string | null
  wompi_payment_source_id: string | null
}

interface PayCfg {
  enabled: boolean
  wompi_public_key: string          // no es secreta (Wompi la llama "public key"), se puede ver/editar libremente
  wompi_private_key: string         // estos 3 son SECRETOS: nunca se leen de vuelta del servidor,
  wompi_events_secret: string       // solo se mandan si el admin escribe un valor nuevo — ver
  wompi_integrity_secret: string    // restaurant_payment_config_status (solo trae booleanos "has_X")
}
interface PayStatus {
  enabled: boolean
  wompi_public_key: string | null
  has_private_key: boolean
  has_events_secret: boolean
  has_integrity_secret: boolean
}

const STATUS_META: Record<SubStatus, { label: string; color: string; bg: string }> = {
  trialing: { label: 'En prueba',   color: '#8a6d3b', bg: 'rgba(201,160,64,0.14)' },
  active:   { label: 'Activa',      color: '#1D7A46', bg: 'rgba(29,122,70,0.12)'  },
  past_due: { label: 'En mora',     color: '#B0341D', bg: 'rgba(176,52,29,0.12)'  },
  canceled: { label: 'Cancelada',   color: '#6b6b6b', bg: 'rgba(0,0,0,0.06)'      },
}

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

export default function SubscriptionPanel() {
  const [rid,   setRid]   = useState<string | null>(null)
  const [sub,   setSub]   = useState<Sub | null>(null)
  const [cfg,   setCfg]   = useState<PayCfg>({ enabled: false, wompi_public_key: '', wompi_private_key: '', wompi_events_secret: '', wompi_integrity_secret: '' })
  const [status, setStatus] = useState<PayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying,  setPaying]  = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
      setRid(prof?.restaurant_id ?? null)

      const { data: s } = await supabase.from('subscriptions')
        .select('plan, status, amount_in_cents, is_promo, trial_ends_at, current_period_end, grace_ends_at, wompi_payment_source_id')
        .maybeSingle()
      if (s) setSub(s as Sub)

      // Solo booleanos "ya configurado" — nunca los secretos reales de vuelta al navegador.
      const { data: st } = await supabase.from('restaurant_payment_config_status')
        .select('enabled, wompi_public_key, has_private_key, has_events_secret, has_integrity_secret')
        .maybeSingle()
      if (st) {
        setStatus(st as PayStatus)
        setCfg(c => ({ ...c, enabled: st.enabled ?? false, wompi_public_key: st.wompi_public_key ?? '' }))
      }
      setLoading(false)
    })()
  }, [])

  const pagar = useCallback(async () => {
    setPaying(true)
    try {
      const { data, error } = await supabase.functions.invoke('wompi-init', {
        body: { kind: 'subscription', redirect_url: window.location.origin },
      })
      if (error) throw error
      if (data?.error) { message.warning(data.error === 'llaves de Wompi no configuradas todavía' ? 'Los pagos en línea aún no están habilitados. Inténtalo más tarde.' : data.error); return }
      openWompiCheckout(data)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo iniciar el pago')
    } finally { setPaying(false) }
  }, [])

  const guardarCfg = useCallback(async () => {
    if (!rid) return
    setSavingCfg(true)
    try {
      // Los 3 secretos solo se incluyen si el admin realmente escribió un valor
      // nuevo — así nunca se sobreescribe lo ya guardado con un campo vacío
      // (los inputs empiezan vacíos a propósito, ver comentario en el estado).
      const payload: Record<string, unknown> = {
        restaurant_id: rid,
        provider: 'wompi',
        enabled: cfg.enabled,
        wompi_public_key: cfg.wompi_public_key?.trim() || null,
      }
      if (cfg.wompi_private_key.trim())      payload.wompi_private_key = cfg.wompi_private_key.trim()
      if (cfg.wompi_events_secret.trim())    payload.wompi_events_secret = cfg.wompi_events_secret.trim()
      if (cfg.wompi_integrity_secret.trim()) payload.wompi_integrity_secret = cfg.wompi_integrity_secret.trim()

      const { error } = await supabase.from('restaurant_payment_config').upsert(payload, { onConflict: 'restaurant_id' })
      if (error) throw error
      message.success('Configuración de pagos guardada')
      setCfg(c => ({ ...c, wompi_private_key: '', wompi_events_secret: '', wompi_integrity_secret: '' }))
      const { data: st } = await supabase.from('restaurant_payment_config_status')
        .select('enabled, wompi_public_key, has_private_key, has_events_secret, has_integrity_secret')
        .maybeSingle()
      if (st) setStatus(st as PayStatus)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSavingCfg(false) }
  }, [rid, cfg])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--w-ink-mut)' }}>Cargando…</div>

  const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.5rem' }
  const label: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--w-ink-soft)', marginBottom: '0.4rem' }
  const inputBox: React.CSSProperties = { width: '100%', padding: '0.7rem 0.9rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }
  const st = sub ? STATUS_META[sub.status] : STATUS_META.trialing

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Suscripción</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>Tu plan, tus pagos y la facturación de tu restaurante.</p>
      </div>

      {/* Estado del plan */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--w-ink-mut)' }}>Plan actual</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--w-ink)', textTransform: 'capitalize' }}>{sub?.plan ?? '—'}</p>
          </div>
          <span style={{ padding: '0.35rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span>
        </div>

        {sub?.is_promo && (
          <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '0.75rem', background: 'rgba(29,122,70,0.10)', color: '#1D7A46', fontSize: '0.85rem', fontWeight: 600 }}>
            🎉 Restaurante fundador — plan gratuito de por vida. No se te cobrará nunca.
          </div>
        )}

        {!sub?.is_promo && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.75rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>Precio mensual</p>
              <p style={{ margin: '0.1rem 0 0', fontWeight: 700, color: 'var(--w-ink)' }}>{sub?.amount_in_cents ? formatCentsCOP(sub.amount_in_cents) : '—'}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>
                {sub?.status === 'trialing' ? 'Prueba termina' : sub?.status === 'past_due' ? 'Mora vence' : 'Próximo cobro'}
              </p>
              <p style={{ margin: '0.1rem 0 0', fontWeight: 700, color: 'var(--w-ink)' }}>
                {fmtDate(sub?.status === 'past_due' ? sub?.grace_ends_at : sub?.status === 'trialing' ? sub?.trial_ends_at : sub?.current_period_end ?? null)}
              </p>
            </div>
          </div>
        )}

        {!sub?.is_promo && (
          <button onClick={pagar} disabled={paying} className="lg-accent w-press"
            style={{ marginTop: '1.25rem', width: '100%', padding: '0.95rem', border: 'none', borderRadius: '0.9rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.95rem', cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.7 : 1, background: 'var(--w-terra)', color: '#fff' }}>
            {paying ? 'Abriendo pago…' : sub?.status === 'active' ? 'Renovar plan' : 'Pagar plan'}
          </button>
        )}
      </div>

      {/* Pagos en línea para comensales — disponible para todos los restaurantes */}
      <div style={card}>
        <span style={label}>Pagos en línea de tus clientes</span>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0 0 1rem' }}>
          Conecta tu propia cuenta de Wompi para que tus comensales paguen su cuenta desde el menú y el dinero llegue directo a <b>tu</b> banco.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={label}>Llave pública (pub_…)</label>
            <input value={cfg.wompi_public_key} onChange={e => setCfg(c => ({ ...c, wompi_public_key: e.target.value }))} style={inputBox} placeholder="pub_..." />
          </div>
          {([
            ['wompi_private_key', 'Llave privada (prv_…)', status?.has_private_key],
            ['wompi_events_secret', 'Secreto de eventos', status?.has_events_secret],
            ['wompi_integrity_secret', 'Secreto de integridad', status?.has_integrity_secret],
          ] as const).map(([k, txt, has]) => (
            <div key={k}>
              <label style={label}>{txt}</label>
              <input value={cfg[k]} onChange={e => setCfg(c => ({ ...c, [k]: e.target.value }))} style={inputBox}
                placeholder={has ? '•••• ya configurado — déjalo vacío para no cambiarlo' : 'pega aquí tu llave/secreto de Wompi'} />
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', color: 'var(--w-ink)', cursor: 'pointer', marginTop: '0.25rem' }}>
            <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
            Activar pagos en línea para mis comensales
          </label>
          <button onClick={guardarCfg} disabled={savingCfg} className="w-press"
            style={{ marginTop: '0.5rem', alignSelf: 'flex-start', padding: '0.7rem 1.2rem', border: '1px solid var(--w-line)', borderRadius: '0.8rem', background: 'var(--w-bg)', color: 'var(--w-ink)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            {savingCfg ? 'Guardando…' : 'Guardar configuración de pagos'}
          </button>
        </div>
      </div>
    </div>
  )
}
