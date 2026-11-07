import { useMenuConfig } from '../../hooks/useMenuConfig'
import { OptionListsManager } from './OptionListsManager'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { StatePanel } from '../ui/StatePanel'

// "Listas y opciones": solo está disponible cuando el dueño de la plataforma activó las opciones nuevas para este restaurante.
export function OptionListsSection() {
  const menu = useMenuConfig()
  if (menu.optionsV2) return <OptionListsManager />
  return (
    <div style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>}
        title="Listas y opciones"
        subtitle="Listas reutilizables de sabores, leches, salsas y adiciones."
      />
      <StatePanel kind="empty" title="Todavía no están activadas"
        text="Las listas reutilizables todavía no están activadas para tu restaurante. Cuando se activen, aquí las vas a armar una sola vez y las vas a usar en todos tus platos." />
    </div>
  )
}
