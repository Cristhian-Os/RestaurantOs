import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { conListas, parseMenuConfig, type MenuConfig } from '../services/menuOptions'
import type { OptionList } from '../types'

// Config del menú del restaurante del usuario (categorías, sabores, listas de opciones y lo que
// caja marcó como agotado), en vivo: si alguien la cambia, se refleja al instante.
export function useMenuConfig(): MenuConfig {
  const [cfg, setCfg] = useState<MenuConfig>(() => parseMenuConfig(null))
  const raw = useRef<{ mods: unknown; listas: OptionList[] }>({ mods: null, listas: [] })

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    const apply = () => { if (!cancelled) setCfg(conListas(parseMenuConfig(raw.current.mods), raw.current.listas)) }
    const loadListas = () => supabase.from('option_lists').select('key,nombre,items,sort_order').order('sort_order')
      .then(({ data }) => { raw.current.listas = (data ?? []) as OptionList[]; apply() })

    supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
      .then(({ data }) => { if (data) { raw.current.mods = data.modules_enabled; apply() } })
    loadListas()
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel(`menu-config-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_config', filter: `restaurant_id=eq.${rid}` },
          (p) => { raw.current.mods = (p.new as { modules_enabled?: unknown })?.modules_enabled; apply() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'option_lists', filter: `restaurant_id=eq.${rid}` }, () => { loadListas() })
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [])

  return cfg
}
