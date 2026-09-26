/**
 * ResetPassword.tsx — pantalla que completa el flujo de recuperación de contraseña.
 * Se llega aquí desde el enlace del correo de Supabase (redirectTo=/reset-password),
 * que ya deja una sesión de recuperación activa; solo falta pedir la nueva contraseña
 * y llamar a supabase.auth.updateUser.
 */
import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../services/supabaseClient'

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

const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = 'var(--w-terra)'
  e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in oklch, var(--w-terra) 16%, transparent)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = 'var(--w-line)'
  e.currentTarget.style.boxShadow = 'none'
}

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [done,     setDone]     = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6)   { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirm)  { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) {
        setError(
          err.message.includes('session') || err.message.toLowerCase().includes('token')
            ? 'El enlace expiró o ya fue usado. Solicita uno nuevo desde "¿Olvidaste tu contraseña?"'
            : err.message
        )
        setLoading(false)
        return
      }
      setDone(true)
      await supabase.auth.signOut()
      setTimeout(() => { window.location.href = '/login' }, 2200)
    } catch {
      setError('Error de conexión. Verifica tu internet')
      setLoading(false)
    }
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

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 88, height: 88, borderRadius: '1.25rem', overflow: 'hidden', margin: '0 auto 1.25rem', boxShadow: 'var(--w-shadow-md)', border: '1px solid var(--w-line)', background: 'var(--w-surface)' }}>
            <img src="/logo.jpg" alt="RestaurantOS" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <p className="ed-kicker" style={{ marginBottom: '0.5rem' }}>Recuperación</p>
          <h1 className="ed-display" style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>Nueva contraseña</h1>
        </div>

        {!done ? (
          <div className="lg" style={{ padding: '1.75rem', borderRadius: '1.5rem' }}>
            <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', marginBottom: '1.5rem' }}>
              Elige una nueva contraseña para tu cuenta.
            </p>
            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>Nueva contraseña</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--w-ink-mut)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </span>
                  <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null) }}
                    placeholder="••••••••" autoComplete="new-password"
                    onFocus={onFocus} onBlur={onBlur}
                    style={{ ...inputBase, paddingLeft: '2.75rem', paddingRight: '1rem' }} />
                </div>
              </div>

              <div>
                <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>Confirmar contraseña</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--w-ink-mut)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={ICON}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </span>
                  <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(null) }}
                    placeholder="••••••••" autoComplete="new-password"
                    onFocus={onFocus} onBlur={onBlur}
                    style={{ ...inputBase, paddingLeft: '2.75rem', paddingRight: '1rem' }} />
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={errorBox}>{error}</motion.div>
              )}

              <button type="submit" disabled={loading} className="lg-accent w-press"
                style={{ width: '100%', padding: '0.95rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}>
            <div className="lg" style={{ padding: '2rem', borderRadius: '1.5rem', textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--w-olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#fff', boxShadow: 'var(--w-shadow-md)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 26, height: 26 }}><path d="M5 13l4 4L19 7"/></svg>
              </div>
              <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.375rem', margin: '0 0 0.5rem' }}>Contraseña actualizada</h2>
              <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
                Ya puedes iniciar sesión con tu nueva contraseña. Redirigiendo...
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
