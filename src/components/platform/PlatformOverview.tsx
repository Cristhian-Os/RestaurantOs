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

  // ── Altas, planes y recuperación de administradores (solo el dueño de la plataforma) ──
  const [nuevo,    setNuevo]    = useState({ nombre: '', admin: '', email: '' })
  const [busy,     setBusy]     = useState(false)
  const [planSel,  setPlanSel]  = useState<Record<string, string>>({})
  const [cred,     setCred]     = useState<{ titulo: string; email: string; pass: string } | null>(null)
  const [aviso,    setAviso]    = useState<string | null>(null)

  const recargar = () => supabase.rpc('get_platform_overview').then(({ data }) => setRestaurants((data as RestaurantRow[]) ?? []))
  const clave = () => {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    const b = new Uint32Array(12); crypto.getRandomValues(b)
    return Array.from(b, x => abc[x % abc.length]).join('')
  }
  const crearRestaurante = async () => {
    if (nuevo.nombre.trim().length < 2 || !nuevo.email.includes('@')) { setAviso('Escribe el nombre del restaurante y el correo del administrador'); return }
    setBusy(true); setAviso(null)
    const pass = clave()
    const { error: e } = await supabase.rpc('crear_restaurante', {
      p_restaurant_name: nuevo.nombre.trim(), p_owner_email: nuevo.email.trim().toLowerCase(),
      p_owner_password: pass, p_owner_full_name: nuevo.admin.trim() || null,
    })
    setBusy(false)
    if (e) { setAviso(e.message); return }
    setCred({ titulo: `Restaurante "${nuevo.nombre.trim()}" creado`, email: nuevo.email.trim().toLowerCase(), pass })
    setNuevo({ nombre: '', admin: '', email: '' }); recargar()
  }
  const activarPlan = async (rid: string, nombre: string) => {
    const plan = planSel[rid] ?? 'emprende'
    if (!window.confirm(`¿Marcar "${nombre}" como PAGADO con el plan ${plan}?`)) return
    const { error: e } = await supabase.rpc('plataforma_activar_plan', { p_restaurant_id: rid, p_plan: plan })
    if (e) { setAviso(e.message); return }
    setAviso(`${nombre}: plan ${plan} activo`); recargar()
  }
  const restablecer = async (email: string) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${email}? Se cerrarán sus sesiones y deberá cambiarla al entrar.`)) return
    const pass = clave()
    const { error: e } = await supabase.rpc('plataforma_restablecer_admin', { p_email: email, p_password_temporal: pass })
    if (e) { setAviso(e.message); return }
    setCred({ titulo: 'Contraseña restablecida', email, pass })
  }
  const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '1rem', minHeight: '2.75rem' }
  const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', borderRadius: '0.75rem', padding: '0.6rem 1rem', minHeight: '2.75rem' }

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
      {cred && (
        <div style={{ borderRadius: '1rem', padding: '1.25rem', backgroundColor: bg, border: '2px solid var(--w-terra, #C2570C)', ...S.out }}>
          <div style={{ fontWeight: 700, color: txt, marginBottom: '0.5rem' }}>{cred.titulo}</div>
          <div style={{ fontSize: '0.875rem', color: txtSec }}>Correo: <strong style={{ color: txt }}>{cred.email}</strong></div>
          <div style={{ fontSize: '0.875rem', color: txtSec, margin: '0.25rem 0 0.75rem' }}>Contraseña temporal: <strong style={{ color: txt, fontFamily: 'monospace', fontSize: '1.05rem' }}>{cred.pass}</strong></div>
          <p style={{ fontSize: '0.8125rem', color: txtSec, margin: '0 0 0.75rem' }}>Se muestra solo esta vez. Entrégala por un canal privado: al entrar, el administrador deberá cambiarla.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button style={{ ...boton, background: 'var(--w-terra, #C2570C)', color: '#fff' }} onClick={() => navigator.clipboard?.writeText(`Correo: ${cred.email}\nContraseña temporal: ${cred.pass}`)}>Copiar</button>
            <button style={{ ...boton, background: bgSurf, color: txt }} onClick={() => setCred(null)}>Ya la guardé</button>
          </div>
        </div>
      )}
      {aviso && <div style={{ borderRadius: '1rem', padding: '0.875rem 1.25rem', backgroundColor: bg, color: txt, ...S.in }}>{aviso}</div>}
      <div style={{ borderRadius: '1rem', padding: '1.25rem', backgroundColor: bg, ...S.out }}>
        <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: txt, margin: '0 0 0.25rem' }}>Nuevo restaurante</h2>
        <p style={{ fontSize: '0.8125rem', color: txtSec, margin: '0 0 0.875rem' }}>El registro público está cerrado. Crea el restaurante cuando el cliente pague; el administrador recibe una contraseña temporal.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
          <input style={campo} placeholder="Nombre del restaurante" aria-label="Nombre del restaurante" value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
          <input style={campo} placeholder="Nombre del administrador" aria-label="Nombre del administrador" value={nuevo.admin} onChange={e => setNuevo(n => ({ ...n, admin: e.target.value }))} />
          <input style={campo} placeholder="Correo del administrador" aria-label="Correo del administrador" type="email" inputMode="email" autoCapitalize="none" value={nuevo.email} onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} />
        </div>
        <button disabled={busy} onClick={crearRestaurante} style={{ ...boton, marginTop: '0.75rem', background: 'var(--w-terra, #C2570C)', color: '#fff', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creando…' : 'Crear restaurante'}</button>
      </div>
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
                    <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <select aria-label={`Plan de ${r.name}`} value={planSel[r.id] ?? (r.plan && r.plan !== 'trial' ? r.plan : 'emprende')} onChange={e => setPlanSel(p => ({ ...p, [r.id]: e.target.value }))}
                        style={{ ...campo, width: 'auto', minHeight: '2.5rem', padding: '0.4rem 0.6rem' }}>
                        <option value="emprende">Emprende</option><option value="pro">Pro</option><option value="premium">Premium</option>
                      </select>
                      <button onClick={() => activarPlan(r.id, r.name)} style={{ ...boton, minHeight: '2.5rem', padding: '0.4rem 0.8rem', background: bgSurf, color: txt }}>Marcar pagado</button>
                    </div>
                  </div>
                </div>
                {r.contacts && r.contacts.length > 0 && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${bgSurf}`, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {r.contacts.map((c, i) => (
                      <div key={i} style={{ fontSize: '0.8125rem', color: txtSec }}>
                        {c.full_name ?? 'Sin nombre'} · {c.email ?? 'sin correo'}{c.phone ? ` · ${c.phone}` : ''}
                        {c.email && <button onClick={() => restablecer(c.email as string)} style={{ ...boton, marginLeft: '0.5rem', minHeight: '2.25rem', padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: bgSurf, color: txt }}>Restablecer contraseña</button>}
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
