/**
 * Login.tsx — Pantalla de inicio de sesión neomórfica
 * Mobile-first, logo controlado, fuentes garantizadas
 */
import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'

interface LoginProps { onLogin: () => void }

// Sombras neomórficas (inline para independencia de Tailwind)
const S = {
  neoOut: { boxShadow: '12px 12px 24px rgba(163,177,198,0.7),-12px -12px 24px rgba(255,255,255,0.8)' },
  neoIn:  { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:  { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
  green:  { boxShadow: '8px 8px 16px rgba(16,185,129,0.28),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

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
    if (!email.trim())   { setError('El email es requerido');     return }
    if (!password.trim()){ setError('La contraseña es requerida'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) { setError(getAuthError(err.code)); return }
      onLogin()
    } catch { setError('Error de conexión. Verifica tu internet') }
    finally  { setLoading(false) }
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

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#D8DAE4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: '"Nunito", ui-sans-serif, sans-serif',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ width: '100%', maxWidth: '380px' }}
      >
        {/* ── Logo: tamaño fijo w-24 h-24 rounded-3xl object-contain ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              width: '96px',       /* w-24 */
              height: '96px',      /* h-24 */
              borderRadius: '1.5rem', /* rounded-3xl */
              overflow: 'hidden',
              flexShrink: 0,
              marginBottom: '1rem',
              ...S.neoOut,
              backgroundColor: '#D8DAE4',
            }}
          >
            <img
              src="/logo.jpg"
              alt="RestaurantOS"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',  /* No distorsionar — mantiene proporción */
                display: 'block',
              }}
            />
          </div>
          <h1
            style={{
              fontFamily: '"DM Sans", ui-sans-serif, sans-serif',
              fontWeight: 700,
              fontSize: '1.5rem',
              color: '#2D3561',
              margin: 0,
            }}
          >
            RestaurantOS
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
            Sistema de gestión gastronómica
          </p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <motion.div key="login"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}
            >
              <div
                style={{
                  backgroundColor: '#D8DAE4',
                  borderRadius: '1.5rem',
                  padding: '2rem',
                  ...S.neoOut,
                }}
              >
                <h2 style={{ fontWeight: 700, color: '#2D3561', fontSize: '1.125rem', marginBottom: '1.5rem' }}>
                  Iniciar sesión
                </h2>

                <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Email */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                      Email
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}>
                          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError(null) }}
                        placeholder="tu@email.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        style={{
                          width: '100%',
                          backgroundColor: '#CDD0DC',
                          borderRadius: '1rem',
                          paddingLeft: '2.75rem',
                          paddingRight: '1rem',
                          paddingTop: '0.75rem',
                          paddingBottom: '0.75rem',
                          fontSize: '0.875rem',
                          color: '#2D3561',
                          border: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                          ...S.neoIn,
                        }}
                      />
                    </div>
                  </div>

                  {/* Contraseña */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Contraseña
                      </label>
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(null) }}
                        style={{ fontSize: '0.75rem', color: '#FF5722', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 'auto' }}
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}>
                          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                        </svg>
                      </span>
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPass(e.target.value); setError(null) }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        style={{
                          width: '100%',
                          backgroundColor: '#CDD0DC',
                          borderRadius: '1rem',
                          paddingLeft: '2.75rem',
                          paddingRight: '3rem',
                          paddingTop: '0.75rem',
                          paddingBottom: '0.75rem',
                          fontSize: '0.875rem',
                          color: '#2D3561',
                          border: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                          ...S.neoIn,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShow(p => !p)}
                        style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 'auto', minWidth: 'auto' }}
                      >
                        {showPass
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '16px', height: '16px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '0.75rem', fontWeight: 500, padding: '0.75rem 1rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      ⚠️ {error}
                    </motion.div>
                  )}

                  {/* Botón ingresar */}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={!loading ? { scale: 0.97 } : {}}
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '1rem',
                      backgroundColor: '#FF5722',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.9375rem',
                      border: 'none',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                      fontFamily: 'inherit',
                      ...S.coral,
                    }}
                  >
                    {loading
                      ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <svg style={{ animation: 'spin 0.8s linear infinite', width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Ingresando...
                        </span>
                      : 'Ingresar'
                    }
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (
            <motion.div key="forgot"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
            >
              <div style={{ backgroundColor: '#D8DAE4', borderRadius: '1.5rem', padding: '2rem', ...S.neoOut }}>
                <button
                  onClick={() => { setMode('login'); setError(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#9CA3AF', marginBottom: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: 'auto' }}
                >
                  ← Volver
                </button>
                <h2 style={{ fontWeight: 700, color: '#2D3561', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  Recuperar contraseña
                </h2>
                <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', marginBottom: '1.5rem' }}>
                  Te enviaremos un enlace para crear una nueva contraseña.
                </p>
                <form onSubmit={handleForgot} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    style={{ width: '100%', backgroundColor: '#CDD0DC', borderRadius: '1rem', padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#2D3561', border: 'none', outline: 'none', fontFamily: 'inherit', ...S.neoIn }}
                  />
                  {error && (
                    <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '0.75rem', padding: '0.75rem 1rem', borderRadius: '1rem' }}>
                      ⚠️ {error}
                    </div>
                  )}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.97 }}
                    style={{ width: '100%', padding: '0.875rem', borderRadius: '1rem', backgroundColor: '#FF5722', color: '#fff', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit', ...S.coral }}
                  >
                    {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── SENT ── */}
          {mode === 'forgot_sent' && (
            <motion.div key="sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <div style={{ backgroundColor: '#D8DAE4', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center', ...S.neoOut }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '1rem', backgroundColor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', margin: '0 auto 1rem', boxShadow: '8px 8px 16px rgba(16,185,129,0.28),-4px -4px 12px rgba(255,255,255,0.45)' }}>
                  📧
                </div>
                <h2 style={{ fontWeight: 700, color: '#2D3561', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  Revisa tu correo
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '1.5rem' }}>
                  Enviamos un enlace a <strong style={{ color: '#2D3561' }}>{email}</strong>.
                  Revisa también tu carpeta de spam.
                </p>
                <button
                  onClick={() => { setMode('login'); setError(null) }}
                  style={{ width: '100%', padding: '0.875rem', borderRadius: '1rem', backgroundColor: '#FF5722', color: '#fff', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...S.coral }}
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9CA3AF', marginTop: '1.5rem' }}>
          RestaurantOS · Sistema Multi-Rol
        </p>
      </motion.div>
    </div>
  )
}
