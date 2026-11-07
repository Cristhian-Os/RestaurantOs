import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export interface NavEntry<V extends string> { view: V; icon: ReactNode; label: string }

interface Props<V extends string> {
  items: NavEntry<V>[]
  active: V
  onSelect: (v: V) => void
  badges?: Partial<Record<V, number>>
  open: boolean
  setOpen: (v: boolean) => void
  /** Contenido extra al final del panel Más (p. ej. cerrar sesión). */
  footer?: ReactNode
}

const MAX_DIRECT = 4

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }} aria-hidden>
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
)

// El vidrio líquido vive en la clase .liquid-glass (tokens.css)
const glass: CSSProperties = {}

/** Barra inferior plana de celular (como las láminas) + panel "Más" de vidrio líquido. */
export function MobileNav<V extends string>({ items, active, onSelect, badges = {}, open, setOpen, footer }: Props<V>) {
  const needMore = items.length > MAX_DIRECT + 1
  const direct = needMore ? items.slice(0, MAX_DIRECT) : items
  const more = needMore ? items.slice(MAX_DIRECT) : items
  const moreActive = needMore && more.some((i) => i.view === active)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const badge = (v: V) => {
    const n = badges[v] ?? 0
    return n > 0 ? (
      <span aria-label={`${n} avisos`} style={{
        position: 'absolute', top: -4, right: -8, minWidth: 16, padding: '0 4px', lineHeight: '16px', borderRadius: 999,
        fontSize: '0.625rem', fontWeight: 700, textAlign: 'center', background: 'var(--w-danger)', color: '#fff',
      }}>{n}</span>
    ) : null
  }

  const tab = (on: boolean): CSSProperties => ({
    position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    minHeight: 52, padding: '6px 2px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--w-font)', borderRadius: 'var(--w-r-pill)',
    fontSize: '0.6875rem', fontWeight: 600, color: on ? 'var(--w-accent-text)' : 'var(--w-text-2)',
  })

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--w-overlay)' }}>
          <div role="dialog" aria-label="Más opciones" className="liquid-glass" onClick={(e) => e.stopPropagation()} style={{
            ...glass, position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            bottom: 'calc(88px + env(safe-area-inset-bottom))', width: 'min(94vw, 440px)', maxHeight: '70vh', overflowY: 'auto',
            borderRadius: 'var(--w-r-xl)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {more.map((it) => (
                <button key={it.view} type="button" onClick={() => { onSelect(it.view); setOpen(false) }}
                  style={{ ...tab(it.view === active), flex: 'none', minHeight: 72, borderRadius: 'var(--w-r-lg)', fontSize: '0.75rem', textAlign: 'center', background: it.view === active ? 'var(--w-accent-soft)' : 'transparent' }}>
                  <span style={{ position: 'relative', display: 'flex' }}>{it.icon}{badge(it.view)}</span>
                  {it.label}
                </button>
              ))}
            </div>
            {footer}
          </div>
        </div>
      )}

      <nav aria-label="Navegación principal" className="liquid-glass" style={{
        ...glass, position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'stretch',
        bottom: 'calc(12px + env(safe-area-inset-bottom))', width: 'min(94vw, 520px)', padding: '4px 6px', borderRadius: 'var(--w-r-pill)',
      }}>
        {direct.map((it) => (
          <button key={it.view} type="button" onClick={() => onSelect(it.view)} aria-current={it.view === active ? 'page' : undefined} style={tab(it.view === active)}>
            <span style={{ position: 'relative', display: 'flex' }}>{it.icon}{badge(it.view)}</span>
            {it.label}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={tab(moreActive || open)}>
          <MoreIcon />Más
        </button>
      </nav>
    </>
  )
}
