/**
 * ThemeContext.tsx
 * Sistema de tema global Light/Dark.
 * - Admin guarda la preferencia en restaurant_config (Supabase)
 * - PublicMenu la lee en tiempo real via Realtime
 * - localStorage actúa como caché para carga instantánea
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'

export type Theme = 'light' | 'dark'

interface ThemeCtx {
  theme:    Theme
  setTheme: (t: Theme) => Promise<void>
  saving:   boolean
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: async () => {},
  saving: false,
})

// Aplica el tema inmediatamente al DOM
function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  document.body.style.backgroundColor = t === 'dark' ? '#0F1118' : 'var(--bg)'
  document.body.style.backgroundImage = t === 'dark'
    ? 'radial-gradient(ellipse at 15% 10%, rgba(59,130,246,0.08) 0%, transparent 45%), radial-gradient(ellipse at 85% 90%, rgba(255,104,53,0.05) 0%, transparent 45%)'
    : 'radial-gradient(ellipse at 20% 5%, rgba(255,255,255,0.45) 0%, transparent 50%), radial-gradient(ellipse at 80% 95%, rgba(255,87,34,0.04) 0%, transparent 50%)'
  document.body.style.backgroundAttachment = 'fixed'
  document.body.style.color = t === 'dark' ? '#E2E5F4' : 'var(--text-primary)'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme,    setThemeState] = useState<Theme>('light')
  const [saving,   setSaving]     = useState(false)

  useEffect(() => {
    // 1. Carga instantánea desde localStorage
    const local = localStorage.getItem('ros_theme') as Theme | null
    if (local === 'light' || local === 'dark') {
      applyTheme(local)
      setThemeState(local)
    }

    // 2. Fuente de verdad: Supabase
    supabase.from('restaurant_config')
      .select('id, modules_enabled')
      .single()
      .then(({ data }) => {
        if (!data) return
        const modules = data.modules_enabled as Record<string, unknown> | null
        const dbTheme = modules?.theme as Theme | undefined
        if (dbTheme === 'light' || dbTheme === 'dark') {
          applyTheme(dbTheme)
          setThemeState(dbTheme)
          localStorage.setItem('ros_theme', dbTheme)
        }
      })

    // 3. Suscripción realtime — para que PublicMenu refleje cambio del admin
    const ch = supabase.channel('ros-theme-sync')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'restaurant_config',
      }, (payload) => {
        const mods = (payload.new as Record<string, unknown>)?.modules_enabled as Record<string, unknown> | null
        const t = mods?.theme as Theme | undefined
        if (t === 'light' || t === 'dark') {
          applyTheme(t)
          setThemeState(t)
          localStorage.setItem('ros_theme', t)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  const setTheme = useCallback(async (t: Theme) => {
    applyTheme(t)
    setThemeState(t)
    localStorage.setItem('ros_theme', t)
    setSaving(true)
    try {
      const { data: cfg } = await supabase
        .from('restaurant_config')
        .select('id, modules_enabled')
        .single()
      if (cfg) {
        const modules = (cfg.modules_enabled as Record<string, unknown>) ?? {}
        await supabase.from('restaurant_config')
          .update({ modules_enabled: { ...modules, theme: t } })
          .eq('id', cfg.id)
      }
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, saving }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
