/**
 * PlatformOverview.tsx — vista del super-administrador de la plataforma
 * ───────────────────────────────────────────────────────────────────
 * Cross-tenant: lista todos los restaurantes (plan, país, contacto,
 * estado de suscripción) y las conversaciones del chatbot de soporte,
 * para que Cristhian pueda revisar quejas reales sin entrar a Supabase.
 * Solo visible para profiles.role === 'super_admin' (gateado también
 * server-side por is_super_admin() en el RPC y la política RLS).
 */
import { useState, useEffect, memo } from 'react'
import { supabase } from '../../services/supabaseClient'

const S = {
  out: { boxShadow: 'var(--shadow-out)' },
  in:  { boxShadow: 'var(--shadow-in)' },
} as const

interface Contact {
  email:     string | null
  full_name: string | null
  phone:     string | null
}

interface RestaurantRow {
  id:                   string
  name:                 string
  slug:                 string
  country:              string | null
  active:               boolean
  is_promo:             boolean
  is_founder:           boolean
  created_at:           string
  plan:                 string | null
  subscription_status:  string | null
  current_period_end:   string | null
  trial_ends_at:        string | null
  contacts:             Contact[] | null
}

interface ChatLog {
  id:            string
  created_at:    string
  restaurant_id: string | null
  user_message:  string
  bot_reply:     string
  ip:            string | null
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const PlatformOverview = memo(() => {
  const bg     = 'var(--bg, #D8DAE4)'
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  const txt    = 'var(--text-primary, #2D3561)'
  const txtSec = 'var(--text-secondary, #6b7280)'

  const [restaurants, setRestaurants] = useState<RestaurantRow[] | null>(null)
  const [logs,        setLogs]        = useState<ChatLog[] | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_platform_overview').then(({ data, error }) => {
      if (error) { setError(error.message); return }
      setRestaurants((data as RestaurantRow[]) ?? [])
    })
    supabase.from('platform_chat_logs').select('*')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (error) { setError(prev => prev ?? error.message); return }
        setLogs((data as ChatLog[]) ?? [])
      })
  }, [])

  if (error) return (
    <div style={{ borderRadius: '1rem', padding: '1.5rem', backgroundColor: bg, ...S.in, color: 'var(--tag-red-text, #b91c1c)' }}>
      No se pudo cargar: {error}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: txt, margin: '0 0 1rem' }}>
          Restaurantes {restaurants && `(${restaurants.length})`}
        </h2>
        {!restaurants ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: txtSec }}>Cargando…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {restaurants.map(r => (
              <div key={r.id} style={{ borderRadius: '1rem', padding: '1rem 1.25rem', backgroundColor: bg, opacity: r.active ? 1 : 0.55, ...S.out }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: txt, fontSize: '1rem' }}>
                      {r.name}
                      {!r.active && <span style={{ marginLeft: '0.5rem', fontSize: '0.625rem', backgroundColor: 'var(--tag-red-bg)', color: 'var(--tag-red-text)', fontWeight: 700, padding: '0.0625rem 0.375rem', borderRadius: '9999px' }}>INACTIVO</span>}
                      {r.is_promo && <span style={{ marginLeft: '0.5rem', fontSize: '0.625rem', backgroundColor: 'var(--tag-purple-bg)', color: 'var(--tag-purple-text)', fontWeight: 700, padding: '0.0625rem 0.375rem', borderRadius: '9999px' }}>PROMO DE POR VIDA</span>}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: txtSec, marginTop: '0.125rem' }}>
                      /{r.slug} · {r.country ?? 'país sin registrar'} · cliente desde {fmtDate(r.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: txt, textTransform: 'capitalize' }}>{r.plan ?? '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: txtSec }}>{r.subscription_status ?? 'sin suscripción'}</div>
                  </div>
                </div>
                {r.contacts && r.contacts.length > 0 && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${bgSurf}`, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {r.contacts.map((c, i) => (
                      <div key={i} style={{ fontSize: '0.8125rem', color: txtSec }}>
                        {c.full_name ?? 'Sin nombre'} · {c.email ?? 'sin correo'}{c.phone ? ` · ${c.phone}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: txt, margin: '0 0 1rem' }}>
          Conversaciones del chatbot {logs && `(últimas ${logs.length})`}
        </h2>
        {!logs ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: txtSec }}>Cargando…</div>
        ) : logs.length === 0 ? (
          <div style={{ borderRadius: '1rem', padding: '2rem', textAlign: 'center', backgroundColor: bg, color: txtSec, ...S.in }}>
            Todavía no hay conversaciones registradas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {logs.map(l => (
              <div key={l.id} style={{ borderRadius: '1rem', padding: '0.875rem 1.25rem', backgroundColor: bg, ...S.in }}>
                <div style={{ fontSize: '0.6875rem', color: txtSec, marginBottom: '0.375rem' }}>
                  {new Date(l.created_at).toLocaleString('es-CO')} {l.ip ? `· ${l.ip}` : ''}
                </div>
                <div style={{ fontSize: '0.875rem', color: txt, marginBottom: '0.25rem' }}>
                  <strong>Usuario:</strong> {l.user_message}
                </div>
                <div style={{ fontSize: '0.875rem', color: txtSec }}>
                  <strong>Resti:</strong> {l.bot_reply}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
