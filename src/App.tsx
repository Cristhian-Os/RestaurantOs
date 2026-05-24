import { useState, useEffect, useCallback } from 'react'
import { supabase }  from './services/supabaseClient'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import PublicMenu    from './pages/PublicMenu'
import type { Session } from '@supabase/supabase-js'

const IS_PUBLIC_MENU = typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/menu')

// ── Splash mínimo — solo CSS inline, cero dependencias ──────
function SplashScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: '#D8DAE4',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.5rem', fontFamily: 'Nunito, sans-serif',
      zIndex: 9999,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '1.25rem',
        overflow: 'hidden', flexShrink: 0,
        boxShadow: '8px 8px 16px rgba(130,142,170,0.5),-8px -8px 16px rgba(255,255,255,0.5)',
        backgroundColor: '#D8DAE4',
      }}>
        <img
          src="/logo.jpg"
          alt="RestaurantOS"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      <p style={{ color: '#2D3561', fontWeight: 700, fontSize: '1.125rem', margin: 0 }}>
        RestaurantOS
      </p>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid #CDD0DC', borderTopColor: '#FF5722',
        animation: 'rs 0.8s linear infinite',
      }} />
      <style>{`@keyframes rs{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function PublicMenuRoute() {
  return <PublicMenu />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready,   setReady]   = useState(false)

  const handleLogin = useCallback(() => {
    // App escucha onAuthStateChange — no hacer nada aquí
  }, [])

  useEffect(() => {
    if (IS_PUBLIC_MENU) { setReady(true); return }

    let active = true

    async function init() {
      try {
        // Intentar obtener sesión con timeout de seguridad para móvil
        const timeoutPromise = new Promise<null>(resolve =>
          setTimeout(() => resolve(null), 5000)
        )
        const sessionPromise = supabase.auth.getSession()
          .then(({ data }) => data.session)
          .catch(() => null)

        const s = await Promise.race([sessionPromise, timeoutPromise])
        if (active) {
          setSession(s)
          setReady(true)
        }
      } catch {
        if (active) setReady(true)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) {
        setSession(s)
        setReady(true)   // por si el timeout se adelantó
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (IS_PUBLIC_MENU) return <PublicMenuRoute />

  // Mostrar splash hasta que sepamos el estado de auth
  if (!ready) return <SplashScreen />

  if (session) {
    return (
      <Dashboard
        onLogout={async () => {
          await supabase.auth.signOut()
          setSession(null)
        }}
      />
    )
  }

  return <Login onLogin={handleLogin} />
}
