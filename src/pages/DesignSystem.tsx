// Muestra del Design System — SOLO desarrollo (/design-system). No se incluye en producción.
import { useState } from 'react'
import { Badge, type Tone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, GlassPanel } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { StatePanel, type StateKind } from '../components/ui/StatePanel'
import { Tabs } from '../components/ui/Tabs'
import { Toggle } from '../components/ui/Toggle'

const SWATCHES = ['bg', 'surface', 'surface-sunken', 'border-strong', 'text', 'text-2', 'text-3', 'accent', 'accent-text', 'accent-soft', 'success', 'warning', 'danger', 'info']
const TONES: Tone[] = ['success', 'warning', 'danger', 'info', 'neutral', 'accent']
const STATES: StateKind[] = ['loading', 'empty', 'error', 'forbidden', 'offline', 'syncing', 'saved']

const H = ({ children }: { children: string }) => (
  <h2 className="mb-3 mt-10 font-bold text-[length:var(--w-fs-title)] text-[color:var(--w-text)]">{children}</h2>
)

export default function DesignSystem() {
  const [dark, setDark] = useState(document.documentElement.getAttribute('data-theme') === 'dark')
  const [tab, setTab] = useState('ventas')
  const [on, setOn] = useState(true)
  const [open, setOpen] = useState(false)

  const flip = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    setDark(!dark)
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-24 pt-8" style={{ fontFamily: 'var(--w-font)', color: 'var(--w-text)', background: 'var(--w-bg)', minHeight: '100dvh' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[length:var(--w-fs-caption)] uppercase tracking-widest text-[color:var(--w-accent-text)]">Design System · Fase 1</p>
          <h1 className="font-bold text-[length:var(--w-fs-screen)]">RestaurantOS · Premium equilibrado</h1>
        </div>
        <Button variant="secondary" onClick={flip}>{dark ? 'Tema claro' : 'Tema oscuro'}</Button>
      </header>

      <H>Color</H>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {SWATCHES.map((n) => (
          <div key={n} className="overflow-hidden rounded-[var(--w-r-md)] border border-[var(--w-border)] bg-[var(--w-surface)]">
            <div className="h-12" style={{ background: `var(--w-${n})` }} />
            <p className="px-2 py-1.5 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-2)]">--w-{n}</p>
          </div>
        ))}
      </div>

      <H>Tipografía (Inter)</H>
      <Card className="space-y-2">
        <p className="font-bold text-[length:var(--w-fs-kpi)] leading-none">$ 2.450.000</p>
        <p className="font-bold text-[length:var(--w-fs-screen)]">Título de pantalla</p>
        <p className="font-semibold text-[length:var(--w-fs-title)]">Título de sección</p>
        <p className="text-[length:var(--w-fs-body)]">Cuerpo: Pedido #0248 · Mesa 5 · 12 min en preparación.</p>
        <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Etiqueta: Ventas de la semana</p>
        <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Microcopy: Actualizado hace 2 min · ñ á é í ó ú ¿?</p>
      </Card>

      <H>Botones</H>
      <div className="flex flex-wrap items-center gap-3">
        <Button>Guardar cambios</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="ghost">Ver detalle</Button>
        <Button variant="danger">Eliminar</Button>
        <Button loading>Guardando</Button>
        <Button disabled>Deshabilitado</Button>
        <Button size="sm">Pequeño</Button>
        <Button size="lg">Grande</Button>
      </div>

      <H>Estados (icono + texto, nunca solo color)</H>
      <div className="flex flex-wrap gap-2">{TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}</div>

      <H>Formularios</H>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre del plato" required placeholder="Ej. Hamburguesa clásica" hint="Como lo verá el cliente." />
        <Input label="Precio" error="Escribe un precio mayor a 0." defaultValue="0" />
        <Select label="Categoría" defaultValue=""><option value="" disabled>Selecciona una categoría</option><option>Hamburguesas</option><option>Bebidas</option></Select>
        <Input label="Deshabilitado" disabled defaultValue="No editable" />
        <div className="sm:col-span-2"><Textarea label="Descripción" placeholder="Describe el plato…" /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-[length:var(--w-fs-body)]">Plato disponible <Toggle label="Plato disponible" checked={on} onChange={setOn} /></label>
        <Tabs label="Vista" value={tab} onChange={setTab} items={[{ key: 'ventas', label: 'Ventas' }, { key: 'gastos', label: 'Gastos' }]} />
        <Button variant="secondary" onClick={() => setOpen(true)}>Abrir diálogo</Button>
      </div>

      <H>Tarjetas y vidrio (solo capas flotantes)</H>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Ventas de hoy</p>
          <p className="font-bold text-[length:var(--w-fs-kpi)] leading-tight">$ 245.800</p>
          <Badge tone="success">+12 % vs ayer</Badge>
        </Card>
        <div className="rounded-[var(--w-r-lg)] p-6" style={{ background: 'linear-gradient(135deg, var(--w-surface-sunken), var(--w-accent-soft))' }}>
          <GlassPanel className="flex items-center justify-around">
            {['Inicio', 'Analytics', 'Pedidos', 'Inventario', 'Más'].map((n, i) => (
              <span key={n} className={`rounded-[var(--w-r-pill)] px-3 py-2 text-[length:var(--w-fs-caption)] font-semibold ${i === 0 ? 'bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]' : 'text-[color:var(--w-text-2)]'}`}>{n}</span>
            ))}
          </GlassPanel>
          <p className="mt-2 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Píldora flotante (Fase 2 la construye con estos tokens)</p>
        </div>
      </div>

      <H>Estados de pantalla</H>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STATES.map((k) => <StatePanel key={k} kind={k} />)}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar plato"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => setOpen(false)}>Guardar</Button></>}>
        <div className="space-y-4">
          <Input label="Nombre del plato" defaultValue="Hamburguesa clásica" />
          <Input label="Precio" defaultValue="28000" inputMode="numeric" />
        </div>
      </Modal>
    </div>
  )
}
