import { useState, useEffect, useCallback, startTransition } from 'react'
import { supabase }  from './services/supabaseClient'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import PublicMenu    from './pages/PublicMenu'
import type { Session } from '@supabase/supabase-js'

const IS_PUBLIC_MENU = typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/menu')

function SplashScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#D8DAE4',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.5rem', fontFamily: 'Nunito, sans-serif', zIndex: 9999,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '1.25rem', overflow: 'hidden',
        flexShrink: 0, backgroundColor: '#D8DAE4',
        boxShadow: '8px 8px 16px rgba(130,142,170,0.5),-8px -8px 16px rgba(255,255,255,0.5)',
      }}>
        <img src="/logo.jpg" alt="RestaurantOS"
          style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
      <p style={{ color:'#2D3561', fontWeight:700, fontSize:'1.125rem', margin:0 }}>
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready,   setReady]   = useState(false)

  useEffect(() => {
    if (IS_PUBLIC_MENU) {
      setReady(true)
      return
    }

    // onAuthStateChange es la ÚNICA fuente de verdad.
    // startTransition → React marca el update como baja prioridad,
    // nunca interrumpe un render en curso → elimina el error #300.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        startTransition(() => {
          setSession(s)
          setReady(true)
        })
      }
    )

    // Forzar que Supabase emita el estado inicial
    supabase.auth.getSession().catch(() => {
      startTransition(() => setReady(true))
    })

    // Timeout de seguridad: si en 6s no llega nada, mostrar login
    const timeout = setTimeout(() => {
      startTransition(() => setReady(true))
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    // signOut dispara onAuthStateChange con session=null → setSession automático
  }, [])

  if (IS_PUBLIC_MENU) return <PublicMenu />
  if (!ready)         return <SplashScreen />
  if (session)        return <Dashboard onLogout={handleLogout} />
  return <Login onLogin={() => { /* onAuthStateChange maneja el login */ }} />
}
