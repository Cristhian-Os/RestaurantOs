import { useState, useEffect } from 'react'
import { supabase }   from './services/supabaseClient'
import Login          from './pages/Login'
import Dashboard      from './pages/Dashboard'
import PublicMenu     from './pages/PublicMenu'
import type { Session } from '@supabase/supabase-js'

function SplashScreen() {
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#E8EAF0',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
      fontFamily: '"Nunito", sans-serif',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '1.5rem', overflow: 'hidden', flexShrink: 0,
        boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)',
        animation: 'pulseSoft 1.5s ease infinite',
      }}>
        <img src="/logo.jpg" alt="RestaurantOS"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#2D3561', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.25rem', letterSpacing: '0.025em' }}>
          RestaurantOS
        </p>
        <div style={{
          marginTop: '1rem', width: 24, height: 24, borderRadius: '50%',
          border: '3px solid #E0E3EC', borderTopColor: '#FF5722',
          animation: 'spin 0.8s linear infinite', margin: '1rem auto 0',
        }} />
      </div>
      <style>{`
        @keyframes pulseSoft { 0%,100%{opacity:1} 50%{opacity:.6} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Ruta pública /menu — sin autenticación ──────────────
  const isPublicMenu = window.location.pathname === '/menu'
  if (isPublicMenu) return <PublicMenu />

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <SplashScreen />

  return session
    ? <Dashboard onLogout={() => supabase.auth.signOut()} />
    : <Login onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />
}
