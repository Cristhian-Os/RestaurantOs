/**
 * SubscriptionPanel.tsx — Fase 3: facturación del restaurante
 * ───────────────────────────────────────────────────────────────
 * El admin ve el estado de su suscripción, paga/renueva su plan y (Premium)
 * activa los pagos en línea para sus comensales con sus propias llaves Wompi.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Toggle } from '../ui/Toggle'
import { Tabs } from '../ui/Tabs'
import { formatCOP, formatCentsCOP, openWompiCheckout, type SubStatus } from '../../config/billing'
import { usePlanes } from '../../config/usePlanes'
import type { PlanId } from '../../config/plans'

interface Sub {
  plan: string
  ciclo: 'mensual' | 'anual'
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
  trialing: { label: 'Por activar', color: 'var(--w-warning-text)', bg: 'var(--w-warning-bg)' },
  active:   { label: 'Activa',      color: 'var(--w-success-text)', bg: 'var(--w-success-bg)'  },
  past_due: { label: 'En mora',     color: 'var(--w-danger-text)', bg: 'var(--w-danger-bg)'  },
  canceled: { label: 'Cancelada',   color: 'var(--w-text-3)', bg: 'var(--w-surface-sunken)'      },
}

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

export default function SubscriptionPanel() {
  const { planes } = usePlanes()
  const [sel,   setSel]   = useState<PlanId | null>(null)
  const [ciclo, setCiclo] = useState<'mensual' | 'anual'>('mensual')
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
        .select('plan, ciclo, status, amount_in_cents, is_promo, trial_ends_at, current_period_end, grace_ends_at, wompi_payment_source_id')
        .maybeSingle()
      if (s) {
        setSub(s as Sub)
        if (['emprende', 'pro', 'premium'].includes(s.plan)) setSel(s.plan as PlanId)
        setCiclo(s.ciclo === 'anual' ? 'anual' : 'mensual')
      }

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
      // El servidor fija el plan y calcula el monto (base + IVA); el navegador solo dice qué eligió.
      if (!sel) { message.info('Elige un plan para continuar'); return }
      const { error: planErr } = await supabase.rpc('elegir_plan', { p_plan: sel, p_ciclo: ciclo })
      if (planErr) throw new Error(planErr.message)
      const { data, error } = await supabase.functions.invoke('wompi-init', {
        body: { kind: 'subscription', redirect_url: window.location.origin },
      })
      if (error) throw error
      if (data?.error) { message.warning(data.error === 'llaves de Wompi no configuradas todavía' ? 'Los pagos en línea aún no están habilitados. Inténtalo más tarde.' : data.error); return }
      openWompiCheckout(data)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo iniciar el pago')
    } finally { setPaying(false) }
  }, [sel, ciclo])

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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--w-text-3)' }}>Cargando…</div>

  const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', padding: '1.5rem' }
  const label: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--w-text-2)', marginBottom: '0.4rem' }
  const inputBox: React.CSSProperties = { width: '100%', padding: '0.7rem 0.9rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', background: 'var(--w-surface)', color: 'var(--w-text)', fontFamily: 'var(--w-font)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }
  const st = sub ? STATUS_META[sub.status] : STATUS_META.trialing

  return (
    <div className="mx-auto w-full max-w-[1100px]" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-font)' }}>
      <ModuleHeader icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>} title="Suscripción" subtitle="Tu plan, tus pagos y la facturación de tu restaurante." />

      {/* Estado del plan */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--w-text-3)' }}>Plan actual</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--w-text)', }}>{planes?.find(p => p.id === sub?.plan)?.nombre ?? (sub?.plan === 'trial' ? 'Prueba gratis' : sub?.plan ?? '—')}</p>
          </div>
          <span style={{ padding: '0.35rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span>
        </div>

        {sub?.is_promo && (
          <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: 'var(--w-r-md)', background: 'var(--w-success-bg)', color: 'var(--w-success-text)', fontSize: '0.85rem', fontWeight: 600 }}>
            🎉 Restaurante fundador — plan gratuito de por vida. No se te cobrará nunca.
          </div>
        )}

        {!sub?.is_promo && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0.75rem' }}>
            <StatCard label="Precio mensual" value={sub?.amount_in_cents ? formatCentsCOP(sub.amount_in_cents) : '—'} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>} />
            <StatCard tone="info" label={sub?.status === 'trialing' ? 'Acceso vence' : sub?.status === 'past_due' ? 'Mora vence' : 'Próximo cobro'}
              value={<span className="text-[length:var(--w-fs-body-lg)]">{fmtDate(sub?.status === 'past_due' ? sub?.grace_ends_at : sub?.status === 'trialing' ? sub?.trial_ends_at : sub?.current_period_end ?? null)}</span>}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>} />
          </div>
        )}

        {!sub?.is_promo && planes && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div>
              <Tabs label="Ciclo de pago" value={ciclo} onChange={setCiclo}
                items={[{ key: 'mensual', label: 'Mensual' }, { key: 'anual', label: 'Anual · pagas 10,5 meses' }]} />
            </div>
            {planes.map(p => {
              const d = p[ciclo]
              const activo = sel === p.id
              return (
                <button key={p.id} disabled={!p.disponible} onClick={() => setSel(p.id)} className="w-press"
                  style={{ textAlign: 'left', padding: '0.8rem 1rem', borderRadius: 'var(--w-r-md)', border: `2px solid ${activo ? 'var(--w-accent)' : 'var(--w-border)'}`, background: 'var(--w-bg)', color: 'var(--w-text)', opacity: p.disponible ? 1 : 0.55, cursor: p.disponible ? 'pointer' : 'not-allowed' }}>
                  <span style={{ fontWeight: 700 }}>{p.nombre}</span>
                  {!p.disponible
                    ? <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>Próximamente</span>
                    : <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--w-text-3)', marginTop: '0.15rem' }}>
                        {formatCOP(d.total_cop)} {ciclo === 'anual' ? 'al año' : 'al mes'} con IVA ({formatCOP(d.base_cop)} + IVA {formatCOP(d.iva_cop)})
                      </span>}
                </button>
              )
            })}
          </div>
        )}

        {!sub?.is_promo && (
          <Button size="lg" className="mt-5 w-full" onClick={pagar} loading={paying}>
            {paying ? 'Abriendo pago…' : sub?.status === 'active' ? 'Renovar plan' : 'Pagar plan'}
          </Button>
        )}
      </div>

      {/* Pagos en línea para comensales — disponible para todos los restaurantes */}
      <div style={card}>
        <span style={label}>Pagos en línea de tus clientes</span>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-text-3)', margin: '0 0 1rem' }}>
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
          <div className="mt-1 flex items-center justify-between gap-3">
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--w-text)' }}>Activar pagos en línea para mis comensales</span>
            <Toggle checked={cfg.enabled} onChange={v => setCfg(c => ({ ...c, enabled: v }))} label="Activar pagos en línea para mis comensales" />
          </div>
          <Button size="lg" className="mt-2 w-full" onClick={guardarCfg} loading={savingCfg}>
            {savingCfg ? 'Guardando…' : 'Guardar cambios ✓'}
          </Button>
        </div>
      </div>
    </div>
  )
}
