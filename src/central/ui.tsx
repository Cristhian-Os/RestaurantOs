/**
 * ui.tsx — piezas visuales propias de Central (iconos, avatar de agente, tarjetas de cifra, encabezado de página).
 * Los componentes base (Button, Card, Badge, Modal, Tabs, Field…) vienen de src/components/ui; aquí solo lo que Central necesita
 * y que no existe allí. Todo usa tokens --w-*.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useCentral } from './datos.tsx'

const ICONOS: Record<string, string> = {
  inicio: 'M3 11l9-8 9 8M5 10v10h14V10',
  oficina: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  mundo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  departamentos: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  agentes: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  chat: 'M4 5h16v11H9l-5 4z',
  tareas: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  reuniones: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  biblioteca: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10',
  memoria: 'M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5 4 4 0 0 0 8 0 3 3 0 0 0 2-5 3 3 0 0 0-2-5V7a4 4 0 0 0-4-4zM12 3v18',
  integraciones: 'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
  dinero: 'M12 3v18M16 7.5C16 6 14 5 12 5S8 6 8 7.5 10 10 12 10s4 1 4 2.5S14 15 12 15s-4-1-4-2.5',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  ajustes: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
  campana: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
  cerrar: 'M6 6l12 12M18 6L6 18',
  enviar: 'M4 12l16-8-6 16-3-7z',
  flecha: 'M9 6l6 6-6 6',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  candado: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  atras: 'M15 6l-6 6 6 6',
  mas_circulo: 'M12 5v14M5 12h14',
}

export function Icono({ nombre, size = 22, className }: { nombre: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      <path d={ICONOS[nombre] ?? ICONOS.inicio} />
    </svg>
  )
}

/** Avatar de agente: robot chef (como las láminas), con el color del área en el traje y la banda del gorro, y un punto de estado. */
export function AgenteAvatar({ color, size = 44, estadoColor, titulo }: { color: string; size?: number; estadoColor?: string; titulo?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true} className="shrink-0">
      <defs>
        <radialGradient id={`f${id}`} cx="50%" cy="38%" r="70%"><stop offset="0" stopColor={color} stopOpacity="0.38" /><stop offset="1" stopColor={color} stopOpacity="0.08" /></radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#CBD5E1" /></linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0.62" /></linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill={`url(#f${id})`} stroke={color} strokeOpacity="0.7" strokeWidth="1.2" />
      <path d="M8.5 42c0-6.5 6-10 15.5-10s15.5 3.5 15.5 10c-4 3.2-9.5 4.6-15.5 4.6S12.5 45.2 8.5 42z" fill={`url(#t${id})`} />
      <path d="M20 32.6l4 3.4 4-3.4" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11.6" y="21.5" width="3.2" height="6" rx="1.6" fill={color} />
      <rect x="33.2" y="21.5" width="3.2" height="6" rx="1.6" fill={color} />
      <rect x="13.8" y="17" width="20.4" height="16" rx="6.5" fill={`url(#c${id})`} />
      <rect x="16.4" y="20.4" width="15.2" height="8.4" rx="4.2" fill="#0B1220" />
      <circle cx="21" cy="24.6" r="1.9" fill="#7DE8FF" /><circle cx="27" cy="24.6" r="1.9" fill="#7DE8FF" />
      <circle cx="21" cy="24.6" r="3.2" fill="#7DE8FF" fillOpacity="0.22" /><circle cx="27" cy="24.6" r="3.2" fill="#7DE8FF" fillOpacity="0.22" />
      <path d="M13 16.2a5.2 5.2 0 0 1 2.6-9 5.6 5.6 0 0 1 8.4-2.2 5.6 5.6 0 0 1 8.4 2.2 5.2 5.2 0 0 1 2.6 9z" fill={`url(#c${id})`} />
      <rect x="13" y="14.2" width="22" height="3.4" rx="1.4" fill={color} />
      {estadoColor && <circle cx="39" cy="39" r="5" fill={estadoColor} stroke="#0B1220" strokeWidth="2" />}
    </svg>
  )
}

export function Punto({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
}

/** Etiqueta con punto de color + texto (el estado nunca se comunica solo con color). */
export function Estado({ color, children }: { color: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-2)]"><Punto color={color} />{children}</span>
}

export function Kpi({ etiqueta, valor, detalle, color, icono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; color?: string; icono?: string }) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4" style={{ ['--c' as string]: color ?? '#FF7A1A' }}>
      <span className="flex items-center gap-2.5 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-2)]">
        {icono && (
          <span className="c-halo inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--w-border-strong)] bg-[var(--w-surface-raised)]" style={{ color: color ?? 'var(--w-accent-text)' }}>
            <Icono nombre={icono} size={17} />
          </span>
        )}{etiqueta}
      </span>
      <span className="c-cifra font-bold leading-none" style={{ fontSize: 'var(--w-fs-kpi)' }}>{valor}</span>
      {detalle && <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{detalle}</span>}
      <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--c), transparent)', opacity: 0.7 }} />
    </div>
  )
}

export function Pagina({ titulo, subtitulo, acciones, children }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5" aria-labelledby="central-titulo">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 id="central-titulo" className="m-0 font-bold leading-tight text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-screen)' }}>{titulo}</h1>
          {subtitulo && <p className="m-0 mt-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </header>
      {children}
    </section>
  )
}

export const TituloBloque = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>{children}</h2>
)

/** Aviso de "esto es una simulación / no está conectado": siempre visible donde corresponde, nunca escondido. */
export function AvisoHonesto({ children, tono = 'info' }: { children: ReactNode; tono?: 'info' | 'warning' }) {
  return (
    <p role="note" className={cn(
      'm-0 flex items-start gap-2 rounded-[var(--w-r-md)] border px-3 py-2 text-[length:var(--w-fs-label)]',
      tono === 'warning' ? 'border-[var(--w-warning)] bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]' : 'border-[var(--w-border-strong)] bg-[var(--w-surface-sunken)] text-[color:var(--w-text-2)]',
    )}>
      <Icono nombre="alerta" size={18} className="mt-0.5 shrink-0" /><span>{children}</span>
    </p>
  )
}

/** Mensaje de error de un formulario o acción (junto al botón, con role="alert"). */
export const ErrorAccion = ({ texto }: { texto: string | null }) =>
  texto ? <p role="alert" className="m-0 text-[length:var(--w-fs-caption)] font-medium text-[color:var(--w-danger-text)]">✕ {texto}</p> : null

/** Ejecuta una acción de acciones.ts, la deja "ocupada" mientras corre, recarga los datos y guarda el error para mostrarlo. */
export function useAccion() {
  const { hacer } = useCentral()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ejecutar = async (fn: () => Promise<string | null>): Promise<boolean> => {
    setOcupado(true); setError(null)
    const e = await hacer(fn)
    setOcupado(false); setError(e)
    return e === null
  }
  return { ocupado, error, ejecutar, limpiar: () => setError(null) }
}

export function useMediaQuery(consulta: string): boolean {
  const leer = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : false)
  const [coincide, setCoincide] = useState(leer)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(consulta)
    const al = () => setCoincide(m.matches)
    al()
    m.addEventListener('change', al)
    return () => m.removeEventListener('change', al)
  }, [consulta])
  return coincide
}
/** Pantalla ancha (escritorio / tableta horizontal). */
export const useEscritorio = () => useMediaQuery('(min-width: 1024px)')
