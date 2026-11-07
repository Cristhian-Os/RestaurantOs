import type { NavEntry } from './FloatingNav'

interface Props<V extends string> {
  items: NavEntry<V>[]
  active: V
  onSelect: (v: V) => void
  badges?: Partial<Record<V, number>>
  userName: string
  userRole: string
  restaurant: string
  onLogout: () => void
}

const ROLE_ES: Record<string, string> = {
  admin: 'Administrador', cashier: 'Cajero', waiter: 'Mesero', kitchen: 'Cocina', super_admin: 'Superadministrador', client: 'Cliente',
}

const CSS = `
.ros-nav-item{transition:background var(--w-dur) var(--w-ease),color var(--w-dur) var(--w-ease)}
.ros-nav-item:not(.on):hover{background:var(--w-surface-sunken)}
`

/** Menú lateral de escritorio, como las láminas: logo, módulos, tarjeta de usuario y cerrar sesión. */
export function Sidebar<V extends string>({ items, active, onSelect, badges = {}, userName, userRole, restaurant, onLogout }: Props<V>) {
  return (
    <aside style={{
      width: 248, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--w-surface)', borderRight: '1px solid var(--w-border)', fontFamily: 'var(--w-font)',
    }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 12px' }}>
        <img src="/brand/logo-oficial.png" alt="" width={40} height={40} style={{ objectFit: 'contain', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 'var(--w-fs-title)', color: 'var(--w-text)' }}>RestaurantOS</span>
      </div>

      <nav aria-label="Navegación principal" style={{ flex: 1, overflowY: 'auto', padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => {
          const on = it.view === active
          const n = badges[it.view] ?? 0
          return (
            <button key={it.view} type="button" className={`ros-nav-item${on ? ' on' : ''}`} onClick={() => onSelect(it.view)}
              aria-current={on ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '0 12px', borderRadius: 'var(--w-r-md)',
                border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--w-fs-body)', fontWeight: 600,
                background: on ? 'var(--w-accent)' : 'transparent', color: on ? 'var(--w-on-accent)' : 'var(--w-text)',
              }}>
              <span style={{ display: 'flex', flexShrink: 0 }}>{it.icon}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              {n > 0 && (
                <span aria-label={`${n} avisos`} style={{ minWidth: 20, padding: '0 6px', lineHeight: '20px', borderRadius: 999, fontSize: '0.6875rem', fontWeight: 700, textAlign: 'center', background: 'var(--w-danger)', color: '#fff' }}>{n}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div style={{ borderTop: '1px solid var(--w-border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px' }}>
          <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--w-accent-soft)', color: 'var(--w-accent-text)', fontWeight: 700 }}>
            {(userName || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--w-fs-label)', color: 'var(--w-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
            <div style={{ fontSize: 'var(--w-fs-caption)', color: 'var(--w-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ROLE_ES[userRole] ?? userRole} · {restaurant}
            </div>
          </div>
        </div>
        <button type="button" className="ros-nav-item" onClick={onLogout} style={{
          display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '0 12px', borderRadius: 'var(--w-r-md)', border: 'none',
          cursor: 'pointer', background: 'transparent', color: 'var(--w-text-2)', fontFamily: 'inherit', fontSize: 'var(--w-fs-body)', fontWeight: 600,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20} aria-hidden><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
