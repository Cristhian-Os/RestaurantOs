/**
 * ThemeContext.tsx
 * Sistema de tema global Light/Dark.
 * - Admin guarda la preferencia en restaurant_config (Supabase)
 * - PublicMenu la lee en tiempo real via Realtime
 * - localStorage actúa como caché para carga instantánea
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'
import ConfigProvider from 'antd/es/config-provider'
import antdTheme from 'antd/es/theme'

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
// Usa variables temáticas (--bg, --bg-gradient, --text-primary) que ya
// resuelven a valores cálidos según data-theme (claro/oscuro).
function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  document.body.style.backgroundColor = 'var(--bg)'
  document.body.style.backgroundImage = 'var(--bg-gradient)'
  document.body.style.backgroundAttachment = 'fixed'
  document.body.style.color = 'var(--text-primary)'
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

  // Theming de Ant Design — sigue el tema (claro/oscuro) y la paleta verde.
  const isDark = theme === 'dark'
  return (
    <ThemeContext.Provider value={{ theme, setTheme, saving }}>
      <ConfigProvider
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary:     isDark ? '#84C25E' : '#4F7A47',
            colorInfo:        isDark ? '#84C25E' : '#4F7A47',
            colorBgBase:      isDark ? '#16171A' : '#F4EEE4',
            colorBgContainer: isDark ? '#202227' : '#FBF6EE',
            colorBgElevated:  isDark ? '#202227' : '#FDFAF4',
            colorTextBase:    isDark ? '#F4F5F7' : '#2B2018',
            borderRadius:     12,
            fontFamily:       "'Inter', ui-sans-serif, system-ui, sans-serif",
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
