/**
 * ConfigHub.tsx — pantalla "Configuración" de las láminas: banner + tarjetas por sección.
 * Solo reúne accesos a pantallas que ya existen; no guarda nada por sí misma.
 * `onNavigate` recibe la clave de vista del Dashboard (setup, branding, impresion, billing, shifts).
 */
import type { ReactNode } from 'react'
import { hayDegradados } from '../../lib/degradados'
import { ModuleHeader } from '../tasks/ModuleHeader'

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

const GearIcon = () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>)
const ArrowIcon = () => svg(<path d="M5 12h14M13 6l6 6-6 6" />)

interface Seccion { vista: string; titulo: string; detalle: string; icono: ReactNode }

const SECCIONES: Seccion[] = [
  { vista: 'branding', titulo: 'Marca', detalle: 'Logo, colores, portada, contacto y horario', icono: svg(<><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="14" r="2.5" /><path d="M12 22a10 10 0 110-20" /></>) },
  { vista: 'impresion', titulo: 'Dispositivos e impresión', detalle: 'Configura impresoras y destinos', icono: svg(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></>) },
  { vista: 'shifts', titulo: 'Turnos y jornadas', detalle: 'Turnos de trabajo de tu equipo', icono: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>) },
  { vista: 'setup', titulo: 'Configuración guiada', detalle: 'Repasa paso a paso lo que falta', icono: svg(<><path d="M5 12l5 5L20 7" /></>) },
  { vista: 'billing', titulo: 'Suscripción', detalle: 'Tu plan, tus pagos y la facturación', icono: svg(<><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>) },
]

export function ConfigHub({ onNavigate, visibles }: { onNavigate: (vista: string) => void; visibles?: string[] }) {
  const lista = visibles ? SECCIONES.filter(s => visibles.includes(s.vista)) : SECCIONES
  return (
    <div className="mx-auto w-full max-w-[1100px]" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader icon={<GearIcon />} title="Configuración" subtitle="Ajusta y personaliza la operación de tu restaurante" />

      <div
        className="mb-5 flex items-center gap-4 rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-5"
        style={{ background: hayDegradados() ? 'radial-gradient(120% 220% at 100% 100%, color-mix(in srgb, var(--w-deg-1) 16%, transparent) 0%, transparent 60%), var(--w-surface)' : 'var(--w-surface)', boxShadow: 'var(--w-shadow-md)' }}
      >
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center text-[color:var(--w-accent)] [&>svg]:h-10 [&>svg]:w-10"><GearIcon /></span>
        <div className="min-w-0">
          <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-screen)]">Tu restaurante, a tu medida</p>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Gestiona la configuración y mantén todo en perfecto funcionamiento.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map(s => (
          <button
            key={s.vista}
            type="button"
            onClick={() => onNavigate(s.vista)}
            className="w-press relative flex min-h-[120px] flex-col items-start gap-2 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left"
            style={{ boxShadow: 'var(--w-shadow-sm)', fontFamily: 'var(--w-font)' }}
          >
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-[var(--w-r-md)] bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)] [&>svg]:h-6 [&>svg]:w-6">{s.icono}</span>
            <span aria-hidden className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--w-border)] text-[color:var(--w-text-2)] [&>svg]:h-4 [&>svg]:w-4"><ArrowIcon /></span>
            <span className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body)]">{s.titulo}</span>
            <span className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{s.detalle}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
