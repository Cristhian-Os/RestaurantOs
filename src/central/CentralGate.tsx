/**
 * CentralGate.tsx — puerta de RestaurantOS Central.
 * Orden: sesión → rol super_admin → código de 2 pasos (el mismo MfaGate del panel de plataforma) → confirmación del servidor.
 * La pantalla solo orienta: los datos de Central los protege la base (central_autorizado() en políticas y funciones).
 * Sin un "sí" explícito del servidor no se muestra nada (cerrado por defecto).
 */
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'
import { MfaGate } from '../components/platform/MfaGate'
import { StatePanel as Panel } from '../components/ui/StatePanel'
import { Button } from '../components/ui/Button'
import { decidirAcceso, interpretarVerificacion, type Acceso, type Verificacion } from './acceso'

// Los avisos de la puerta salen centrados y con margen (Central no tiene aún su cáscara en este punto).
const StatePanel = (p: ComponentProps<typeof Panel>) => <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center p-4"><Panel {...p} /></div>

const enlace = 'inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline'
const Volver = () => <a href="/" className={enlace}>Volver al panel</a>

/** Último paso: el servidor confirma (y deja registro del acceso). */
function ConfirmacionServidor({ children }: { children: ReactNode }) {
  const [v, setV] = useState<Verificacion | 'cargando'>('cargando')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    setV('cargando')
    supabase.rpc('central_verificar_acceso').then(
      ({ data, error }) => { if (vivo) setV(interpretarVerificacion(data, error)) },
      () => { if (vivo) setV('error') },
    )
    return () => { vivo = false }
  }, [intento])

  if (v === 'permitido') return <>{children}</>
  if (v === 'cargando') return <StatePanel kind="loading" title="Confirmando con el servidor…" />
  if (v === 'no_disponible') return (
    <StatePanel kind="forbidden" title="Central aún no está activado en este servidor"
      text="Falta instalar su parte en la base de datos. Hasta entonces no se muestra nada." action={<Volver />} />
  )
  if (v === 'error' || v === 'requiere_mfa') return (
    <StatePanel kind="error" title="No se pudo confirmar tu acceso"
      text={v === 'requiere_mfa' ? 'El servidor pide de nuevo tu código de 2 pasos.' : 'Revisa tu conexión e inténtalo de nuevo.'}
      action={<Button variant="secondary" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>} />
  )
  return <StatePanel kind="forbidden" title="Central es privado" text="Esta sección es solo para el dueño de la plataforma." action={<Volver />} />
}

export function CentralGate({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Acceso | 'cargando' | 'error'>('cargando')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado('cargando')
    const revisar = async (): Promise<Acceso | 'error'> => {
      const { data: { user }, error: eUser } = await supabase.auth.getUser()
      // Una caída de red no es "sin sesión": se ofrece reintentar en vez de mandar a iniciar sesión.
      if (!user) return eUser?.name === 'AuthRetryableFetchError' ? 'error' : 'sin_sesion'
      const { data: perfil, error: ePerfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (ePerfil) return 'error'
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      return decidirAcceso({ haySesion: true, rol: perfil?.role, aal: aal?.currentLevel })
    }
    revisar().then(e => { if (vivo) setEstado(e) }, () => { if (vivo) setEstado('error') })
    return () => { vivo = false }
  }, [intento])

  // Quien no es el dueño igual consulta al servidor: así su intento queda en el registro de Central.
  useEffect(() => {
    if (estado === 'sin_permiso') supabase.rpc('central_verificar_acceso').then(() => {}, () => {})
  }, [estado])

  if (estado === 'cargando') return <StatePanel kind="loading" title="Comprobando tu acceso…" />
  if (estado === 'error') return (
    <StatePanel kind="error" title="No se pudo comprobar tu acceso" text="Revisa tu conexión e inténtalo de nuevo."
      action={<Button variant="secondary" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>} />
  )
  if (estado === 'sin_sesion') return (
    <StatePanel kind="forbidden" title="Inicia sesión para continuar" text="Central es privado."
      action={<a href="/login" className={enlace}>Ir a iniciar sesión</a>} />
  )
  if (estado === 'sin_permiso') return (
    <StatePanel kind="forbidden" title="Central es privado" text="Esta sección es solo para el dueño de la plataforma." action={<Volver />} />
  )
  // 'requiere_mfa' o 'permitido': MfaGate pide el código si falta y, con sesión de 2 pasos, deja pasar.
  return <MfaGate><ConfirmacionServidor>{children}</ConfirmacionServidor></MfaGate>
}
