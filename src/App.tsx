import { useState, useEffect } from 'react'
import { supabase }  from './services/supabaseClient'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import type { Session } from '@supabase/supabase-js'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E8EAF0] flex flex-col items-center justify-center gap-4">
        <div
          className="w-24 h-24 rounded-3xl overflow-hidden animate-pulse"
          style={{ boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' }}
        >
          <img
            src="/logo.jpg"
            alt="RestaurantOS"
            className="w-full h-full object-cover"
          />
        </div>
        <p
          className="text-[#2D3561] font-bold text-lg tracking-wide"
          style={{ fontFamily: '"DM Sans", sans-serif' }}
        >
          RestaurantOS
        </p>
      </div>
    )
  }

  return session
    ? <Dashboard onLogout={() => supabase.auth.signOut()} />
    : <Login onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />
}

