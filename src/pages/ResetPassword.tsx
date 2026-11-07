/**
 * ResetPassword.tsx — pantalla que completa el flujo de recuperación de contraseña.
 * Se llega aquí desde el enlace del correo de Supabase (redirectTo=/reset-password),
 * que ya deja una sesión de recuperación activa; solo falta pedir la nueva contraseña
 * y llamar a supabase.auth.updateUser. Mismo lenguaje visual que Login (AuthShell).
 */
import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import { AuthShell, IconLock } from './AuthShell'

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
    <AuthShell>
      <motion.div className="au-card"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <img className="au-logo" src="/brand/logo-oficial.png" alt="RestaurantOS" />

        {!done ? (
          <>
            <h1 className="au-title">Nueva contraseña</h1>
            <p className="au-sub">Elige una nueva contraseña para tu cuenta.</p>
            <form className="au-form" onSubmit={handleSubmit} noValidate>
              <label className="au-field">
                <IconLock />
                <input type="password" aria-label="Nueva contraseña" value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  placeholder="Nueva contraseña" autoComplete="new-password" />
              </label>
              <label className="au-field">
                <IconLock />
                <input type="password" aria-label="Confirmar contraseña" value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(null) }}
                  placeholder="Confirmar contraseña" autoComplete="new-password" />
              </label>

              {error && (
                <motion.div role="alert" className="au-err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.div>
              )}

              <button type="submit" className="au-btn" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}>
            <div className="au-ok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 className="au-title">Contraseña actualizada</h1>
            <p className="au-sub" style={{ marginBottom: 0 }}>
              Ya puedes iniciar sesión con tu nueva contraseña. Redirigiendo...
            </p>
          </motion.div>
        )}
      </motion.div>
    </AuthShell>
  )
}
