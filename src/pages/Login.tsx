/**
 * Login.tsx — lámina del Login (pantalla dividida, vidrio oscuro). Marco en AuthShell.
 * Lógica de autenticación intacta.
 */
import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import { AuthShell, IconMail, IconLock, IconEye } from './AuthShell'

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

const Logo = () => <img className="au-logo" src="/brand/logo-oficial.png" alt="RestaurantOS" />

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

  return (
    <AuthShell>
      <motion.div className="au-card"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Logo />

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <motion.div key="login"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="au-title">Bienvenido de nuevo</h1>
              <p className="au-sub">Inicia sesión para continuar con RestaurantOS</p>
              <form className="au-form" onSubmit={handleLogin} noValidate>
                <label className="au-field">
                  <IconMail />
                  <input type="email" aria-label="Correo electrónico" value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    placeholder="Correo electrónico" autoComplete="email" autoCapitalize="none" />
                </label>
                <label className="au-field">
                  <IconLock />
                  <input type={showPass ? 'text' : 'password'} aria-label="Contraseña" value={password}
                    onChange={e => { setPass(e.target.value); setError(null) }}
                    placeholder="Contraseña" autoComplete="current-password" />
                  <button type="button" className="au-eye" onClick={() => setShow(p => !p)}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    <IconEye off={!showPass} />
                  </button>
                </label>
                <div className="au-row">
                  <button type="button" className="au-link" onClick={() => { setMode('forgot'); setError(null) }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                {error && (
                  <motion.div role="alert" className="au-err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.div>
                )}

                <button type="submit" className="au-btn" disabled={loading}>
                  {loading ? 'Ingresando...' : 'Iniciar sesión →'}
                </button>
              </form>
              <p className="au-foot">
                ¿No tienes una cuenta?{' '}
                <a className="au-link" href="/registro">Regístrate aquí</a>
              </p>
            </motion.div>
          )}

          {/* ── FORGOT ── */}
          {mode === 'forgot' && (
            <motion.div key="forgot"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="au-title">Recuperar contraseña</h1>
              <p className="au-sub">Te enviaremos un enlace para crear una nueva contraseña.</p>
              <form className="au-form" onSubmit={handleForgot} noValidate>
                <label className="au-field">
                  <IconMail />
                  <input type="email" aria-label="Correo electrónico" value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    placeholder="Correo electrónico" autoComplete="email" autoCapitalize="none" />
                </label>
                {error && <div role="alert" className="au-err">{error}</div>}
                <button type="submit" className="au-btn" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
              <p className="au-foot">
                <button type="button" className="au-link mute" onClick={() => { setMode('login'); setError(null) }}>
                  ← Volver a iniciar sesión
                </button>
              </p>
            </motion.div>
          )}

          {/* ── SENT ── */}
          {mode === 'forgot_sent' && (
            <motion.div key="sent"
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}>
              <div className="au-ok">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </div>
              <h1 className="au-title">Revisa tu correo</h1>
              <p className="au-sub">
                Enviamos un enlace a <strong style={{ color: '#fff' }}>{email}</strong>. Revisa también tu carpeta de spam.
              </p>
              <button type="button" className="au-btn" onClick={() => { setMode('login'); setError(null) }}>
                Volver al inicio de sesión
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </AuthShell>
  )
}
