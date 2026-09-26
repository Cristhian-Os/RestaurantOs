/**
 * Signup.tsx — Registro de un nuevo restaurante
 * ───────────────────────────────────────────────────────────────
 * Llama al RPC `crear_restaurante` (crea restaurante + dueño admin,
 * genera slug y dominio) y luego inicia sesión automáticamente.
 * Mismo lenguaje visual que Login (Warm Editorial + Liquid Glass).
 */
import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import { PLANS, TRIAL_DAYS, type PlanId } from '../config/plans'

const go = (path: string) => { window.location.href = path }

const inputBase: React.CSSProperties = {
  width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem',
  padding: '0.8rem 1rem', fontSize: '0.9375rem', color: 'var(--w-ink)',
  border: '1px solid var(--w-line)', outline: 'none',
  fontFamily: 'var(--w-sans)', boxSizing: 'border-box',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}
const errorBox: React.CSSProperties = {
  background: 'color-mix(in oklch, var(--w-wine) 10%, var(--w-surface))',
  border: '1px solid color-mix(in oklch, var(--w-wine) 35%, transparent)',
  color: 'var(--w-wine)', fontSize: '0.8125rem', fontWeight: 500,
  padding: '0.75rem 1rem', borderRadius: '0.875rem',
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--w-terra)'
    e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in oklch, var(--w-terra) 16%, transparent)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--w-line)'
    e.currentTarget.style.boxShadow = 'none'
  }
  return (
    <div>
      <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>{label}</label>
      <input {...props} onFocus={onFocus} onBlur={onBlur} style={inputBase} />
    </div>
  )
}

export default function Signup() {
  const params = new URLSearchParams(window.location.search)
  const planId = params.get('plan') as PlanId | null
  const plan = PLANS.find(p => p.id === planId) ?? null

  const [restaurant, setRestaurant] = useState('')
  const [fullName,   setFullName]   = useState('')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [accepted,   setAccepted]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState<{ domain: string } | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (restaurant.trim().length < 2) { setError('Escribe el nombre de tu restaurante'); return }
    if (!email.trim())                { setError('El email es requerido'); return }
    if (password.length < 6)          { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (!accepted)                    { setError('Debes aceptar los términos y condiciones'); return }
    setLoading(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('crear_restaurante', {
        p_restaurant_name: restaurant.trim(),
        p_owner_email:     email.trim().toLowerCase(),
        p_owner_password:  password,
        p_owner_full_name: fullName.trim() || null,
      })
      if (rpcErr) { setError(rpcErr.message); setLoading(false); return }

      const domain = (data as { email_domain?: string })?.email_domain ?? ''
      setDone({ domain })

      // Iniciar sesión automáticamente → App detecta la sesión y entra al panel
      await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--w-bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      fontFamily: 'var(--w-sans)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 440 }}>

        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <button onClick={() => go('/')} className="w-press"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1rem' }}>
            ← Volver al inicio
          </button>
          <h1 className="ed-display" style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>Crea tu restaurante</h1>
          <p className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', marginTop: '0.5rem' }}>
            Prueba gratis por {TRIAL_DAYS} días · sin tarjeta
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key="form" exit={{ opacity: 0 }}>
              <div className="lg" style={{ padding: '1.75rem', borderRadius: '1.5rem' }}>
                {plan && (
                  <div className="lg" style={{ padding: '0.75rem 1rem', borderRadius: '0.875rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'color-mix(in oklch, var(--w-terra) 8%, transparent)' }}>
                    <span className="ed-kicker" style={{ fontSize: '0.72rem' }}>Plan elegido</span>
                    <span style={{ fontWeight: 700, color: 'var(--w-terra)', fontFamily: 'var(--w-sans)' }}>{plan.name} · {plan.currency}{plan.price}/mes</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                  <Field label="Nombre del restaurante" value={restaurant} placeholder="Ej: Tacos El Güero"
                    onChange={e => { setRestaurant(e.target.value); setError(null) }} />
                  <Field label="Tu nombre" value={fullName} placeholder="Nombre y apellido"
                    onChange={e => { setFullName(e.target.value); setError(null) }} />
                  <Field label="Email" type="email" value={email} placeholder="tu@email.com" autoCapitalize="none"
                    onChange={e => { setEmail(e.target.value); setError(null) }} />
                  <Field label="Contraseña" type="password" value={password} placeholder="Mínimo 6 caracteres"
                    onChange={e => { setPassword(e.target.value); setError(null) }} />

                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--w-ink-soft)', fontFamily: 'var(--w-sans)', lineHeight: 1.45 }}>
                    <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(null) }}
                      style={{ marginTop: 2, accentColor: 'var(--w-terra)', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                    <span>
                      Acepto los{' '}
                      <a href="/terminos" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--w-terra)', fontWeight: 600 }}>Términos y Condiciones</a>
                      {' '}y la{' '}
                      <a href="/privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--w-terra)', fontWeight: 600 }}>Política de Privacidad</a>.
                    </span>
                  </label>

                  {error && <div style={errorBox}>{error}</div>}

                  <button type="submit" disabled={loading} className="lg-accent w-press"
                    style={{ width: '100%', padding: '0.95rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Creando tu restaurante...' : 'Crear mi restaurante'}
                  </button>
                </form>
              </div>

              <p className="ed-body" style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--w-ink-mut)', marginTop: '1.25rem' }}>
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => go('/login')} style={{ color: 'var(--w-terra)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--w-sans)' }}>
                  Inicia sesión
                </button>
              </p>
            </motion.div>
          ) : (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}>
              <div className="lg" style={{ padding: '2rem', borderRadius: '1.5rem', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--w-terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#fff', boxShadow: 'var(--w-shadow-md)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 28, height: 28 }}><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.5rem' }}>¡Restaurante creado!</h2>
                <p className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', marginBottom: '0.5rem' }}>
                  Estamos entrando a tu panel...
                </p>
                {done.domain && (
                  <p className="ed-body" style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)' }}>
                    Los correos de tu equipo usarán <strong style={{ color: 'var(--w-ink)' }}>@{done.domain}</strong>
                  </p>
                )}
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--w-line)', borderTopColor: 'var(--w-terra)', animation: 'spin 0.8s linear infinite', margin: '1.25rem auto 0' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
