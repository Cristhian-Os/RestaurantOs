/**
 * Login.tsx — Warm Editorial + Liquid Glass
 * Primera impresión: fondo lino cálido, tarjeta liquid glass,
 * tipografía Fraunces. Lógica de autenticación intacta.
 */
import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'

interface LoginProps { onLogin: () => void }

type Mode = 'login' | 'forgot' | 'forgot_sent'

function getAuthError(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':        return 'Email o contraseña incorrectos'
    case 'email_not_confirmed':        return 'Confirma tu email antes de ingresar'
    case 'over_email_send_rate_limit': return 'Demasiados intentos, espera un momento'
    case 'user_not_found':             return 'No existe cuenta con ese email'
    default:                           return 'Error al iniciar sesión, intenta de nuevo'
  }
}

const ICON = { width: 16, height: 16 } as const

const inputBase: React.CSSProperties = {
  width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem',
  paddingTop: '0.8rem', paddingBottom: '0.8rem',
  fontSize: '0.9375rem', color: 'var(--w-ink)', border: '1px solid var(--w-line)',
  outline: 'none', fontFamily: 'var(--w-sans)', boxSizing: 'border-box',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}

const errorBox: React.CSSProperties = {
  background: 'color-mix(in oklch, var(--w-wine) 10%, var(--w-surface))',
  border: '1px solid color-mix(in oklch, var(--w-wine) 35%, transparent)',
  color: 'var(--w-wine)', fontSize: '0.8125rem', fontWeight: 500,
  padding: '0.75rem 1rem', borderRadius: '0.875rem',
}

export default function Login({ onLogin }: LoginProps) {
  const [mode,     setMode]    = useState<Mode>('login')
  const [email,    setEmail]   = useState('')
  const [password, setPass]    = useState('')
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState<string | null>(null)
  const [showPass, setShow]    = useState(false)

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim())    { setError('El email es requerido');      return }
    if (!password.trim()) { setError('La contraseña es requerida'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) { setError(getAuthError(err.code)); setLoading(false); return }
      onLogin()
    } catch {
      setError('Error de conexión. Verifica tu internet')
      setLoading(false)
    }
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('Ingresa tu email'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) { setError(err.message); return }
      setMode('forgot_sent')
    } catch { setError('Error al enviar el correo') }
    finally  { setLoading(false) }
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--w-terra)'
    e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in oklch, var(--w-terra) 16%, transparent)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--w-line)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div style={{
      minHeight: '100vh', position: 'relative', overflow: 'hidden',
      background: 'var(--w-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', fontFamily: 'var(--w-sans)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* ── Encabezado editorial ── */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 88, height: 88, borderRadius: '1.25rem', overflow: 'hidden', margin: '0 auto 1.25rem', boxShadow: 'var(--w-shadow-md)', border: '1px solid var(--w-line)', background: 'var(--w-surface)' }}>
            <img src="/logo.jpg" alt="RestaurantOS" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <p className="ed-kicker" style={{ marginBottom: '0.5rem' }}>Bienvenido</p>
          <h1 className="ed-display" style={{ fontSize: '2.5rem', fontWeight: 600, margin: 0 }}>RestaurantOS</h1>
          <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', marginTop: '0.5rem' }}>
            Sistema de gestión gastronómica
          </p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <motion.div key="login"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <div className="lg" style={{ padding: '1.75rem', borderRadius: '1.5rem' }}>
                <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.375rem', margin: '0 0 1.5rem' }}>Iniciar sesión</h2>

                <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Email */}
                  <div>
                    <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--w-ink-mut)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      </span>
                      <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null) }}
                        placeholder="tu@email.com" autoComplete="email" autoCapitalize="none"
                        onFocus={onFocus} onBlur={onBlur}
                        style={{ ...inputBase, paddingLeft: '2.75rem', paddingRight: '1rem' }} />
                    </div>
                  </div>

                  {/* Contraseña */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="ed-kicker">Contraseña</label>
                      <button type="button" onClick={() => { setMode('forgot'); setError(null) }}
                        style={{ fontSize: '0.75rem', color: 'var(--w-terra)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--w-ink-mut)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      </span>
                      <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPass(e.target.value); setError(null) }}
                        placeholder="••••••••" autoComplete="current-password"
                        onFocus={onFocus} onBlur={onBlur}
                        style={{ ...inputBase, paddingLeft: '2.75rem', paddingRight: '3rem' }} />
                      <button type="button" onClick={() => setShow(p => !p)}
                        style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {showPass
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={errorBox}>{error}</motion.div>
                  )}

                  <button type="submit" disabled={loading} className="lg-accent w-press"
                    style={{ width: '100%', padding: '0.95rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading
                      ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <svg style={{ animation: 'spin 0.8s linear infinite', width: 16, height: 16 }} viewBox="0 0 24 24" fill="none">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Ingresando...
                        </span>
                      : 'Ingresar'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (
            <motion.div key="forgot"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <div className="lg" style={{ padding: '1.75rem', borderRadius: '1.5rem' }}>
                <button onClick={() => { setMode('login'); setError(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', marginBottom: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  ← Volver
                </button>
                <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.375rem', margin: '0 0 0.5rem' }}>Recuperar contraseña</h2>
                <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', marginBottom: '1.5rem' }}>
                  Te enviaremos un enlace para crear una nueva contraseña.
                </p>
                <form onSubmit={handleForgot} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null) }}
                    placeholder="tu@email.com" autoComplete="email" onFocus={onFocus} onBlur={onBlur}
                    style={{ ...inputBase, padding: '0.8rem 1rem' }} />
                  {error && <div style={errorBox}>{error}</div>}
                  <button type="submit" disabled={loading} className="lg-accent w-press"
                    style={{ width: '100%', padding: '0.95rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── SENT ── */}
          {mode === 'forgot_sent' && (
            <motion.div key="sent"
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}>
              <div className="lg" style={{ padding: '2rem', borderRadius: '1.5rem', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--w-olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#fff', boxShadow: 'var(--w-shadow-md)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 26, height: 26 }}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                </div>
                <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.375rem', margin: '0 0 0.5rem' }}>Revisa tu correo</h2>
                <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', marginBottom: '1.5rem' }}>
                  Enviamos un enlace a <strong style={{ color: 'var(--w-ink)' }}>{email}</strong>. Revisa también tu carpeta de spam.
                </p>
                <button onClick={() => { setMode('login'); setError(null) }} className="lg-accent w-press"
                  style={{ width: '100%', padding: '0.95rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer' }}>
                  Volver al inicio de sesión
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-ink-mut)', marginTop: '1.5rem', letterSpacing: '0.14em' }}>
          RestaurantOS · Sistema Multi-Rol
        </p>
      </motion.div>
    </div>
  )
}
