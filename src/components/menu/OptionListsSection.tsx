import { useMenuConfig } from '../../hooks/useMenuConfig'
import { OptionListsManager } from './OptionListsManager'

// "Listas y opciones": solo está disponible cuando el dueño de la plataforma activó las opciones nuevas para este restaurante.
export function OptionListsSection() {
  const menu = useMenuConfig()
  if (menu.optionsV2) return <OptionListsManager />
  return (
    <div style={{ fontFamily: 'var(--w-sans)', maxWidth: '40rem' }}>
      <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', margin: 0 }}>Listas y opciones</h2>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.9375rem', color: 'var(--w-ink-mut)', lineHeight: 1.5 }}>
        Las listas reutilizables (sabores, leches, salsas, adiciones) todavía no están activadas para tu restaurante.
        Cuando se activen, aquí las vas a armar una sola vez y las vas a usar en todos tus platos.
      </p>
    </div>
  )
}
