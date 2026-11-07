import { useState } from 'react'
import type { ReactNode } from 'react'
import type { NavEntry } from './FloatingNav'

interface Props<V extends string> {
  phone: boolean
  items: NavEntry<V>[]
  onSelect: (v: V) => void
  onMenu: () => void
  children?: ReactNode
}

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={20} height={20} aria-hidden><path d={d} /></svg>
)

/** Barra superior de las láminas: menú, buscador de módulos y acciones (campana, tema). */
export function TopBar<V extends string>({ phone, items, onSelect, onMenu, children }: Props<V>) {
  const [q, setQ] = useState('')
  const found = q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  return (
    <header className="liquid-glass" style={{
      position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, padding: phone ? '8px 12px' : '12px 24px',
      minHeight: 64, fontFamily: 'var(--w-font)', borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    }}>
      <button type="button" onClick={onMenu} aria-label="Menú" style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--w-r-md)', border: 'none', background: 'transparent', color: 'var(--w-text)', cursor: 'pointer' }}>
        <Ico d="M3 6h18M3 12h18M3 18h18" />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: phone ? 1 : 'none', minWidth: 0 }}>
        <img src="/brand/logo-oficial.png" alt="" width={32} height={32} style={{ objectFit: 'contain', borderRadius: 9 }} />
        <span style={{ fontWeight: 700, fontSize: 'var(--w-fs-title)', color: 'var(--w-text)' }}>RestaurantOS</span>
      </div>
      {!phone && (
        <div style={{ position: 'relative', flex: 1, maxWidth: 560, marginLeft: 16 }}>
          <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--w-text-3)', display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={18} height={18}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en RestaurantOS…" aria-label="Buscar módulo"
            onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) { onSelect(found[0].view); setQ('') } if (e.key === 'Escape') setQ('') }}
            style={{ width: '100%', minHeight: 44, padding: '0 14px 0 42px', borderRadius: 'var(--w-r-pill)', border: '1px solid var(--w-border)', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', fontFamily: 'inherit', fontSize: 'var(--w-fs-body)', outline: 'none' }} />
          {found.length > 0 && (
            <ul role="listbox" style={{ position: 'absolute', top: 50, left: 0, right: 0, margin: 0, padding: 6, listStyle: 'none', background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', boxShadow: 'var(--w-shadow-lg)', zIndex: 30 }}>
              {found.map((i) => (
                <li key={i.view}>
                  <button type="button" onClick={() => { onSelect(i.view); setQ('') }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 10px', border: 'none', borderRadius: 'var(--w-r-md)', background: 'transparent', color: 'var(--w-text)', fontFamily: 'inherit', fontSize: 'var(--w-fs-body)', cursor: 'pointer', textAlign: 'left' }}>
                    {i.icon}{i.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>{children}</div>
    </header>
  )
}
