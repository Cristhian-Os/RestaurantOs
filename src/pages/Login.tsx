/**
 * Login.tsx — v2 con recuperación de contraseña
 */
import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'

interface LoginProps { onLogin: () => void }

const S = {
  neoOut: { boxShadow: '12px 12px 24px rgba(163,177,198,0.7),-12px -12px 24px rgba(255,255,255,0.8)' },
  neoIn:  { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:  { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
  green:  { boxShadow: '8px 8px 16px rgba(16,185,129,0.3),-4px -4px 12px rgba(255,255,255,0.6)' },
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
    if (!email.trim())  { setError('El email es requerido');     return }
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
    <div className="min-h-screen bg-[#E8EAF0] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 rounded-3xl overflow-hidden mb-4" style={S.neoOut}>
            <img src="/logo.jpg" alt="RestaurantOS" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            RestaurantOS
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Sistema de gestión gastronómica</p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <div className="bg-[#E8EAF0] rounded-3xl p-8" style={S.neoOut}>
                <h2 className="text-lg font-bold text-[#2D3561] mb-6">Iniciar sesión</h2>
                <form onSubmit={handleLogin} className="flex flex-col gap-5" noValidate>
                  <div>
                    <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Email</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                      </span>
                      <input type="email" value={email}
                        onChange={e => { setEmail(e.target.value); setError(null) }}
                        placeholder="tu@email.com" autoComplete="email" autoCapitalize="none"
                        className="w-full bg-[#E0E3EC] rounded-2xl pl-10 pr-4 py-3 text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
                        style={S.neoIn} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Contraseña</label>
                      <button type="button" onClick={() => { setMode('forgot'); setError(null) }}
                        className="text-xs text-[#FF5722] font-medium hover:underline">
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                        </svg>
                      </span>
                      <input type={showPass ? 'text' : 'password'} value={password}
                        onChange={e => { setPass(e.target.value); setError(null) }}
                        placeholder="••••••••" autoComplete="current-password"
                        className="w-full bg-[#E0E3EC] rounded-2xl pl-10 pr-12 py-3 text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
                        style={S.neoIn} />
                      <button type="button" onClick={() => setShow(p => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
                        {showPass
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-3 rounded-2xl flex items-center gap-2">
                      ⚠️ {error}
                    </motion.div>
                  )}

                  <motion.button type="submit" disabled={loading} whileTap={!loading ? { scale: 0.97 } : {}}
                    className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm bg-[#FF5722] ${loading ? 'opacity-70' : ''}`}
                    style={S.coral}>
                    {loading
                      ? <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
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

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <div className="bg-[#E8EAF0] rounded-3xl p-8" style={S.neoOut}>
                <button onClick={() => { setMode('login'); setError(null) }}
                  className="flex items-center gap-2 text-xs text-[#9CA3AF] mb-5 hover:text-[#6B7280]">
                  ← Volver
                </button>
                <h2 className="text-lg font-bold text-[#2D3561] mb-2">Recuperar contraseña</h2>
                <p className="text-xs text-[#9CA3AF] mb-6">
                  Te enviaremos un enlace para crear una nueva contraseña.
                </p>
                <form onSubmit={handleForgot} className="flex flex-col gap-5" noValidate>
                  <div>
                    <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Tu email</label>
                    <input type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setError(null) }}
                      placeholder="tu@email.com" autoComplete="email"
                      className="w-full bg-[#E0E3EC] rounded-2xl px-4 py-3 text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
                      style={S.neoIn} />
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-3 rounded-2xl">
                      ⚠️ {error}
                    </div>
                  )}
                  <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
                    className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm bg-[#FF5722] ${loading ? 'opacity-70' : ''}`}
                    style={S.coral}>
                    {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── FORGOT SENT ── */}
          {mode === 'forgot_sent' && (
            <motion.div key="sent" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <div className="bg-[#E8EAF0] rounded-3xl p-8 text-center" style={S.neoOut}>
                <div className="w-16 h-16 rounded-3xl bg-emerald-500 flex items-center justify-center text-3xl mx-auto mb-4"
                  style={S.green}>📧</div>
                <h2 className="text-lg font-bold text-[#2D3561] mb-2">Revisa tu correo</h2>
                <p className="text-sm text-[#9CA3AF] mb-6">
                  Enviamos un enlace de recuperación a <strong className="text-[#2D3561]">{email}</strong>.
                  Revisa también tu carpeta de spam.
                </p>
                <button onClick={() => { setMode('login'); setError(null) }}
                  className="w-full py-3 rounded-2xl font-bold text-white bg-[#FF5722] text-sm" style={S.coral}>
                  Volver al inicio de sesión
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <p className="text-center text-xs text-[#9CA3AF] mt-6">RestaurantOS · Sistema Multi-Rol</p>
      </motion.div>
    </div>
  )
}
