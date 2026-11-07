import type { ReactNode } from 'react'

export type StateKind = 'loading' | 'empty' | 'error' | 'forbidden' | 'offline' | 'syncing' | 'saved'

const COPY: Record<StateKind, { glyph: string; title: string; text: string }> = {
  loading:   { glyph: '◌', title: 'Cargando…',        text: 'Esto toma solo un momento.' },
  empty:     { glyph: '∅', title: 'Todavía no hay nada', text: 'Cuando haya datos aparecerán aquí.' },
  error:     { glyph: '✕', title: 'No se pudo cargar', text: 'Revisa tu conexión e inténtalo de nuevo.' },
  forbidden: { glyph: '⛔', title: 'Sin permiso',       text: 'Tu rol no puede ver esta sección.' },
  offline:   { glyph: '⚡', title: 'Sin conexión',      text: 'Sigues trabajando; se sincroniza al volver internet.' },
  syncing:   { glyph: '↻', title: 'Sincronizando…',    text: 'Enviando los cambios guardados sin conexión.' },
  saved:     { glyph: '✓', title: 'Guardado',          text: 'Los cambios quedaron registrados.' },
}

/** Estados explícitos: icono + título + texto (nunca solo color). Textos reemplazables por prop. */
export function StatePanel({ kind, title, text, action }: { kind: StateKind; title?: string; text?: string; action?: ReactNode }) {
  const c = COPY[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="flex flex-col items-center gap-2 rounded-[var(--w-r-lg)] border border-dashed border-[var(--w-border-strong)] px-6 py-8 text-center"
      style={{ fontFamily: 'var(--w-font)' }}
    >
      <span aria-hidden className={`text-2xl ${kind === 'loading' || kind === 'syncing' ? 'animate-spin' : ''}`} style={{ color: kind === 'error' ? 'var(--w-danger)' : 'var(--w-text-3)' }}>
        {c.glyph}
      </span>
      <p className="font-semibold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">{title ?? c.title}</p>
      <p className="max-w-[32ch] text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{text ?? c.text}</p>
      {action}
    </div>
  )
}
