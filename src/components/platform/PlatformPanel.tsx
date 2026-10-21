/**
 * PlatformPanel.tsx — panel del dueño de la plataforma con pestañas:
 * Restaurantes (altas, planes, claves), Plantillas (editor) y Opciones por restaurante (interruptor, plantillas, respuestas).
 * Va dentro de MfaGate: nada se muestra ni se ejecuta sin el código de 2 pasos.
 */
import { useState } from 'react'
import { PlatformOverview } from './PlatformOverview'
import { PlatformInicio } from './PlatformInicio'
import { VendedoresPanel } from './VendedoresPanel'
import { PagosVendedores } from './PagosVendedores'
import { DineroPanel } from './DineroPanel'
import { RendimientoPanel } from './RendimientoPanel'
import { PlantillasManager } from './PlantillasManager'
import { OpcionesRestaurantes } from './OpcionesRestaurantes'
import { PlatformOpiniones } from './PlatformOpiniones'
import { PlatformIA } from './PlatformIA'

const TABS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'pagos', label: 'Pagos a vendedores' },
  { id: 'dinero', label: 'Dinero' },
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'opiniones', label: 'Opiniones' },
  { id: 'ia', label: 'Uso de IA' },
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'opciones', label: 'Opciones por restaurante' },
] as const
type TabId = typeof TABS[number]['id']

export function PlatformPanel() {
  const [tab, setTab] = useState<TabId>('inicio')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div role="tablist" aria-label="Secciones del panel de plataforma" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            style={{ border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', borderRadius: '0.75rem', padding: '0.6rem 1rem', minHeight: '2.75rem',
              background: tab === t.id ? 'var(--w-terra, #C2570C)' : 'var(--bg-surface, #CDD0DC)', color: tab === t.id ? '#fff' : 'var(--text-primary, #2D3561)' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'inicio' && <PlatformInicio />}
      {tab === 'restaurantes' && <PlatformOverview />}
      {tab === 'vendedores' && <VendedoresPanel />}
      {tab === 'pagos' && <PagosVendedores />}
      {tab === 'dinero' && <DineroPanel />}
      {tab === 'rendimiento' && <RendimientoPanel />}
      {tab === 'opiniones' && <PlatformOpiniones />}
      {tab === 'ia' && <PlatformIA />}
      {tab === 'plantillas' && <PlantillasManager />}
      {tab === 'opciones' && <OpcionesRestaurantes />}
    </div>
  )
}
