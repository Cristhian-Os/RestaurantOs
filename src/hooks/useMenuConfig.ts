import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { parseMenuConfig, type MenuConfig } from '../services/menuOptions'

// Config del menú del restaurante del usuario (categorías, sabores y lo que
// caja marcó como agotado), en vivo: si alguien la cambia, se refleja al instante.
export function useMenuConfig(): MenuConfig {
  const [cfg, setCfg] = useState<MenuConfig>(() => parseMenuConfig(null))

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setCfg(parseMenuConfig(data.modules_enabled)) })
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel(`menu-config-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_config', filter: `restaurant_id=eq.${rid}` },
          (p) => setCfg(parseMenuConfig((p.new as { modules_enabled?: unknown })?.modules_enabled)))
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [])

  return cfg
}
