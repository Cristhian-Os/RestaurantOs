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
import { PlatformLeads } from './PlatformLeads'
import { WhatsAppLlaves } from './WhatsAppLlaves'
import { Tabs } from '../ui/Tabs'
import { EncabezadoModulo } from './platformUi'

const TABS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'pagos', label: 'Pagos a vendedores' },
  { id: 'dinero', label: 'Dinero' },
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'leads', label: 'Leads' },
  { id: 'opiniones', label: 'Opiniones' },
  { id: 'ia', label: 'Uso de IA' },
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'opciones', label: 'Opciones por restaurante' },
  { id: 'whatsapp', label: 'WhatsApp (llaves de Meta)' },
] as const
type TabId = typeof TABS[number]['id']

export function PlatformPanel() {
  const [tab, setTab] = useState<TabId>('inicio')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <EncabezadoModulo icono="★" titulo="Plataforma" subtitulo="Restaurantes, vendedores, dinero y uso de IA" />
      {/* Las 11 pestañas se desplazan dentro de su propia franja: la página nunca se desborda */}
      <div style={{ overflowX: 'auto', margin: '0 -1rem', padding: '0 1rem', scrollbarWidth: 'none' }}>
        <div style={{ width: 'max-content' }}>
          <Tabs label="Secciones del panel de plataforma" items={TABS.map(t => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} />
        </div>
      </div>
      {tab === 'inicio' && <PlatformInicio />}
      {tab === 'restaurantes' && <PlatformOverview />}
      {tab === 'vendedores' && <VendedoresPanel />}
      {tab === 'pagos' && <PagosVendedores />}
      {tab === 'dinero' && <DineroPanel />}
      {tab === 'rendimiento' && <RendimientoPanel />}
      {tab === 'leads' && <PlatformLeads />}
      {tab === 'opiniones' && <PlatformOpiniones />}
      {tab === 'ia' && <PlatformIA />}
      {tab === 'plantillas' && <PlantillasManager />}
      {tab === 'opciones' && <OpcionesRestaurantes />}
      {tab === 'whatsapp' && <WhatsAppLlaves />}
    </div>
  )
}
