/**
 * MfaGate.tsx — Verificación en dos pasos (TOTP) delante del panel de plataforma (solo super admin).
 * Primera vez: muestra el QR para la app de códigos (Google Authenticator, Authy…) y pide el primer código.
 * Después: pide el código de 6 dígitos de cada sesión. Con sesión aal2 muestra el panel.
 * La base también lo exige (función _exigir_aal2) en las acciones de plataforma.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '../../services/supabaseClient'

type Fase = 'cargando' | 'listo' | 'inscribir' | 'codigo'

export function MfaGate({ children }: { children: ReactNode }) {
  const [fase, setFase]         = useState<Fase>('cargando')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr]             = useState('')
  const [secreto, setSecreto]   = useState('')
  const [codigo, setCodigo]     = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const revisar = useCallback(async () => {
    setError(null)
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') { setFase('listo'); return }
    const { data: lista, error: e1 } = await supabase.auth.mfa.listFactors()
    if (e1) { setError(e1.message); return }
    const verificado = lista?.totp?.find(f => f.status === 'verified')
    if (verificado) { setFactorId(verificado.id); setFase('codigo'); return }
    // Restos de un intento anterior sin terminar: se limpian para poder inscribir de nuevo.
    for (const f of lista?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error: e2 } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RestaurantOS' })
    if (e2 || !data) { setError(e2?.message ?? 'No se pudo preparar la verificación en dos pasos'); return }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecreto(data.totp.secret); setFase('inscribir')
  }, [])

  useEffect(() => { void revisar() }, [revisar])

  const verificar = async () => {
    if (!/^\d{6}$/.test(codigo) || enviando) return
    setEnviando(true); setError(null)
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo })
    setEnviando(false)
    if (e) { setError('El código no es correcto. Revisa que el reloj de tu celular esté en hora e intenta de nuevo.'); setCodigo(''); return }
    await supabase.auth.refreshSession()
    setFase('listo')
  }

  if (fase === 'listo') return <>{children}</>

  const caja: CSSProperties = { maxWidth: 420, margin: '2rem auto', padding: '1.5rem', borderRadius: '1.25rem', background: 'var(--w-surface)', border: '1px solid var(--w-line)', fontFamily: 'var(--w-sans)', color: 'var(--w-ink)' }
  const campo: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '1.25rem', letterSpacing: '0.4em', textAlign: 'center' }

  return (
    <div style={caja}>
      <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Verificación en dos pasos</h3>
      {fase === 'cargando' && !error && <p style={{ margin: 0, color: 'var(--w-ink-mut)' }}>Comprobando…</p>}
      {fase === 'inscribir' && (
        <>
          <p style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
            Este panel maneja los datos de todos los restaurantes. Escanea este código con una app de códigos
            (Google Authenticator, Authy o similar) y escribe el número que te muestra.
          </p>
          <img src={qr} alt="Código QR para la app de verificación" style={{ width: 180, height: 180, display: 'block', margin: '0.5rem auto', background: '#fff', padding: 8, borderRadius: 8 }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', wordBreak: 'break-all', textAlign: 'center' }}>
            ¿No puedes escanear? Escribe esta clave en la app: <b>{secreto}</b>
          </p>
        </>
      )}
      {fase === 'codigo' && <p style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Escribe el código de 6 dígitos de tu app de verificación.</p>}
      {(fase === 'inscribir' || fase === 'codigo') && (
        <>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} placeholder="000000" aria-label="Código de 6 dígitos"
            onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') void verificar() }} style={campo} />
          <button type="button" onClick={() => void verificar()} disabled={enviando || codigo.length !== 6}
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontWeight: 700, background: 'var(--w-terra, #d97757)', color: '#fff', opacity: enviando || codigo.length !== 6 ? 0.6 : 1 }}>
            {enviando ? 'Verificando…' : 'Verificar'}
          </button>
        </>
      )}
      {error && <p style={{ color: '#d33', fontSize: '0.8125rem', margin: '0.75rem 0 0' }}>{error}</p>}
      {error && fase === 'cargando' && (
        <button type="button" onClick={() => void revisar()} style={{ marginTop: '0.5rem', cursor: 'pointer' }}>Reintentar</button>
      )}
    </div>
  )
}
