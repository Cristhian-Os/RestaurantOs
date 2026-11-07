import type { ReactNode } from 'react'

/** Encabezado de módulo de las láminas: icono naranja + título + subtítulo, acciones a la derecha. */
export function ModuleHeader({ icon, title, subtitle, actions }: { icon: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3" style={{ fontFamily: 'var(--w-font)' }}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--w-r-md)] bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)] [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="font-bold leading-tight text-[color:var(--w-text)] text-[length:var(--w-fs-screen)]">{title}</h1>
          {subtitle && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Tarjeta de dato (KPI) de las láminas: icono suave + etiqueta + número grande. */
export function StatCard({ label, value, tone = 'accent', icon }: { label: string; value: ReactNode; tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'; icon?: ReactNode }) {
  return (
    <div
      className="flex min-w-0 flex-col items-start gap-2 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4"
      style={{ boxShadow: 'var(--w-shadow-sm)', fontFamily: 'var(--w-font)', containerType: 'inline-size' }}
    >
      {icon && (
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5"
          style={{ background: tone === 'accent' ? 'var(--w-accent-soft)' : `var(--w-${tone}-bg)`, color: tone === 'accent' ? 'var(--w-accent-text)' : `var(--w-${tone}-text)` }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{label}</p>
        <p className="font-bold leading-tight text-[color:var(--w-text)] text-[length:clamp(1.0625rem,8.5cqi,var(--w-fs-kpi))] [overflow-wrap:anywhere]">{value}</p>
      </div>
    </div>
  )
}

/** Burbuja de icono de color (estado de tarea, avatar de tarjeta). */
export function IconBubble({ tone = 'accent', size = 40, children }: { tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'; size?: number; children: ReactNode }) {
  const bg = tone === 'accent' ? 'var(--w-accent-soft)' : tone === 'neutral' ? 'var(--w-surface-sunken)' : `var(--w-${tone}-bg)`
  const fg = tone === 'accent' ? 'var(--w-accent-text)' : tone === 'neutral' ? 'var(--w-text-2)' : `var(--w-${tone}-text)`
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5" style={{ width: size, height: size, background: bg, color: fg }}>
      {children}
    </span>
  )
}
