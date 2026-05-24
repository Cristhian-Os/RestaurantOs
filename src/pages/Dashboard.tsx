// ============================================================
// RESTAURANTOS V5.5 — DASHBOARD COMPLETO
// Mobile-first + estilos inline garantizados
// ============================================================

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '../services/supabaseClient'
import { initializeOfflineSync } from '../services/offlineService'
import { pushNotificationService } from '../services/pushNotificationService'
import Spin    from 'antd/es/spin'
import message from 'antd/es/message'
import Tabs    from 'antd/es/tabs'

import { OrderFlow }    from '../components/orders/OrderFlow'
import { TableMap }     from '../components/tables/TableMap'
import { KitchenBoard } from '../components/kitchen/KitchenBoard'
import { CashierPanel } from '../components/cashier/CashierPanel'
import { TeamManager }  from '../components/team/TeamManager'
import { MenuManager }  from '../components/menu/MenuManager'
import { ClientMenuSection }  from '../components/ClientMenuSection'
import { AdminTasksView }     from '../components/tasks/AdminTasksView'
import { EmployeeTasksView }  from '../components/tasks/EmployeeTasksView'
import { ShoppingList }       from '../components/inventory/ShoppingList'
import { RecipeBuilder }      from '../components/recipes/RecipeBuilder'
import BusinessAssistant      from './BusinessAssistant'
import { InstallPWA }         from '../components/pwa/InstallPWA'
import { QRMenu }             from '../components/pwa/QRMenu'

// ── Sombras neomórficas inline (independientes de Tailwind) ──
const S = {
  neoOut:   { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutSm: { boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  neoIn:    { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:    { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
} as const

export type Role    = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'
export type NavView = 'dashboard' | 'orders' | 'tables' | 'kitchen' | 'cashier' | 'tasks' | 'inventory' | 'analytics' | 'team' | 'menu'

export interface Profile {
  id:        string
  role:      Role
  full_name: string | null
  email?:    string
  active?:   boolean
}

interface Metrics {
  total_sales_today: number
  pending_count:     number
  cooking_count:     number
  ready_count:       number
  active_tables:     number
  completed_today:   number
}

// ── Iconos SVG ────────────────────────────────────────────────
const Icon = {
  Dashboard: memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>),
  Orders:    memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"/><path d="M9 12h6M9 16h4"/></svg>),
  Tables:    memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14M19 7v14M8 12h8"/></svg>),
  Kitchen:   memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M12 2a9 9 0 100 18A9 9 0 0012 2z"/><circle cx="12" cy="12" r="4"/></svg>),
  Cashier:   memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12a2 2 0 100-4 2 2 0 000 4zM6 12h.01M18 12h.01"/></svg>),
  Tasks:     memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>),
  Inventory: memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>),
  Analytics: memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Team:      memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>),
  Menu:      memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M12 2a9 9 0 100 18 9 9 0 000-18zM8 12h8M8 8h8M8 16h5"/></svg>),
  Logout:    memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>),
  Menu2:     memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:'20px', height:'20px' }}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>),
}

// ── Nav por rol ───────────────────────────────────────────────
const NAV_BY_ROLE: Record<Role, { view: NavView; icon: React.ReactNode; label: string }[]> = {
  admin: [
    { view: 'dashboard', icon: <Icon.Dashboard />, label: 'Inicio'     },
    { view: 'orders',    icon: <Icon.Orders />,    label: 'Pedidos'    },
    { view: 'tables',    icon: <Icon.Tables />,    label: 'Mesas'      },
    { view: 'kitchen',   icon: <Icon.Kitchen />,   label: 'Cocina'     },
    { view: 'cashier',   icon: <Icon.Cashier />,   label: 'Caja'       },
    { view: 'tasks',     icon: <Icon.Tasks />,     label: 'Tareas'     },
    { view: 'inventory', icon: <Icon.Inventory />, label: 'Inventario' },
    { view: 'analytics', icon: <Icon.Analytics />, label: 'Analytics'  },
    { view: 'team',      icon: <Icon.Team />,      label: 'Equipo'     },
    { view: 'menu',      icon: <Icon.Menu />,      label: 'Menú'       },
  ],
  waiter: [
    { view: 'orders', icon: <Icon.Orders />, label: 'Pedidos' },
    { view: 'tables', icon: <Icon.Tables />, label: 'Mesas'   },
    { view: 'tasks',  icon: <Icon.Tasks />,  label: 'Tareas'  },
  ],
  kitchen: [
    { view: 'kitchen', icon: <Icon.Kitchen />, label: 'Cocina' },
  ],
  cashier: [
    { view: 'cashier', icon: <Icon.Cashier />, label: 'Caja'    },
    { view: 'orders',  icon: <Icon.Orders />,  label: 'Pedidos' },
    { view: 'tasks',   icon: <Icon.Tasks />,   label: 'Tareas'  },
  ],
  client: [
    { view: 'menu', icon: <Icon.Menu />, label: 'Menú' },
  ],
}

// ── AdminDashboard ────────────────────────────────────────────
const AdminDashboard = memo(({ profile, onNavigate }: { profile: Profile; onNavigate: (v: NavView) => void }) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_metrics')
      if (!error && data) setMetrics(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const t = setInterval(fetchMetrics, 30_000)
    return () => clearInterval(t)
  }, [fetchMetrics])

  const cards = [
    { label: 'Ventas hoy',    value: `$${(metrics?.total_sales_today ?? 0).toLocaleString('es')}`, icon: '💰', nav: 'analytics' as NavView, color: '#10B981' },
    { label: 'Pendientes',    value: metrics?.pending_count   ?? 0, icon: '⏳', nav: 'kitchen'   as NavView, color: '#F59E0B' },
    { label: 'En cocina',     value: metrics?.cooking_count   ?? 0, icon: '🍳', nav: 'kitchen'   as NavView, color: '#3B82F6' },
    { label: 'Listas',        value: metrics?.ready_count     ?? 0, icon: '✅', nav: 'cashier'   as NavView, color: '#10B981' },
    { label: 'Completadas',   value: metrics?.completed_today ?? 0, icon: '🎉', nav: 'analytics' as NavView, color: '#8B5CF6' },
    { label: 'Mesas activas', value: metrics?.active_tables   ?? 0, icon: '🍽️', nav: 'tables'    as NavView, color: '#FF5722' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
      <Spin size="large" />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Saludo */}
      <div>
        <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#2D3561', marginBottom: '0.25rem' }}>
          Buenos días, {profile.full_name?.split(' ')[0] ?? 'Admin'} 👋
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Instalar como app */}
      <InstallPWA />

      {/* Grid de métricas — 2 cols mobile, 3 cols desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
      }}
        className="md:grid-cols-3"
      >
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => onNavigate(card.nav)}
            style={{
              padding: '1.25rem',
              backgroundColor: '#E8EAF0',
              borderRadius: '1.5rem',
              textAlign: 'left',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.15s ease',
              fontFamily: 'inherit',
              ...S.neoOut,
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ fontSize: '1.875rem', marginBottom: '0.75rem' }}>{card.icon}</div>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: card.color }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500, marginTop: '0.25rem' }}>
              {card.label}
            </div>
          </button>
        ))}
      </div>

      {/* Tabs rápidos */}
      <Tabs defaultActiveKey="orders" items={[
        { key: 'orders', label: '📋 Nueva orden',  children: <OrderFlow profile={profile} onOrderCreated={() => {}} /> },
        { key: 'tables', label: '🗺️ Mesas',         children: <TableMap profile={profile} /> },
        { key: 'tasks',  label: '✅ Tareas',         children: <AdminTasksView profile={profile} /> },
        { key: 'qr',     label: '📱 QR del Menú',   children: <QRMenu /> },
      ]} />
    </div>
  )
})
AdminDashboard.displayName = 'AdminDashboard'

// ── Dashboard Principal ───────────────────────────────────────
interface DashboardProps { onLogout: () => void }

export default function Dashboard({ onLogout }: DashboardProps) {
  const [profile,    setProfile]   = useState<Profile | null>(null)
  const [activeNav,  setActiveNav] = useState<NavView>('dashboard')
  const [loading,    setLoading]   = useState(true)
  const [mobileOpen, setMobileOpen]= useState(false)
  const isMounted = useRef(true)

  useEffect(() => {
    initializeOfflineSync()
    pushNotificationService.initializePushNotifications()
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (error) throw error
        if (isMounted.current) {
          setProfile(data)
          const defaultNav: Record<Role, NavView> = {
            admin: 'dashboard', waiter: 'orders', kitchen: 'kitchen', cashier: 'cashier', client: 'menu'
          }
          setActiveNav(defaultNav[data.role as Role])
        }
      } catch (e) {
        console.error(e)
        message.error('Error cargando perfil')
      } finally {
        if (isMounted.current) setLoading(false)
      }
    }
    load()
    return () => { isMounted.current = false }
  }, [])

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#E8EAF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        {/* Logo de carga: w-16 h-16 rounded-3xl object-contain */}
        <div style={{ width: '64px', height: '64px', borderRadius: '1.5rem', overflow: 'hidden', margin: '0 auto 1rem', animation: 'pulseSoft 1.5s ease infinite', ...S.neoOut }}>
          <img src="/logo.jpg" alt="RestaurantOS" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
        <Spin size="large" />
      </div>
    </div>
  )

  const navItems = NAV_BY_ROLE[profile.role] ?? NAV_BY_ROLE.client

  const renderContent = () => {
    switch (activeNav) {
      case 'dashboard': return profile.role === 'admin'
        ? <AdminDashboard profile={profile} onNavigate={setActiveNav} />
        : null
      case 'orders':    return (
        <div>
          <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#2D3561', marginBottom: '1rem' }}>📋 Nueva Orden</h2>
          <OrderFlow profile={profile} onOrderCreated={() => message.success('Orden enviada a cocina')} />
        </div>
      )
      case 'tables':    return <TableMap profile={profile} />
      case 'kitchen':   return <KitchenBoard />
      case 'cashier':   return <CashierPanel profile={profile} />
      case 'tasks':     return profile.role === 'admin'
        ? <AdminTasksView profile={profile} />
        : <EmployeeTasksView profile={profile} />
      case 'inventory': return (
        <Tabs defaultActiveKey="1" items={[
          { key: '1', label: '📦 Lista de compras', children: <ShoppingList /> },
          { key: '2', label: '🍳 Recetas',          children: <RecipeBuilder /> },
        ]} />
      )
      case 'analytics': return <BusinessAssistant />
      case 'team':      return <TeamManager />
      case 'menu':      return profile.role === 'admin' ? <MenuManager /> : <ClientMenuSection />
      default:          return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#E8EAF0', fontFamily: '"Nunito", sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header style={{
        backgroundColor: '#E8EAF0',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        ...S.neoOut,
      }}>
        {/* Logo + nombre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Logo: w-10 h-10 rounded-2xl object-contain — TAMAÑO FIJO */}
          <div style={{
            width: '40px',      /* w-10 */
            height: '40px',     /* h-10 */
            borderRadius: '0.75rem', /* rounded-xl */
            overflow: 'hidden',
            flexShrink: 0,      /* No se estira */
            backgroundColor: '#E8EAF0',
            ...S.neoOutSm,
          }}>
            <img
              src="/logo.jpg"
              alt="RestaurantOS"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',  /* Mantiene proporción sin distorsión */
                display: 'block',
              }}
            />
          </div>
          <div>
            <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.0625rem', color: '#2D3561', margin: 0 }}>
              RestaurantOS
            </h1>
            <p style={{ fontSize: '0.7rem', color: '#9CA3AF', margin: 0 }}>
              {profile.full_name ?? profile.email} · {profile.role}
            </p>
          </div>
        </div>

        {/* Acciones header */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Instalar PWA — compacto */}
          <InstallPWA compact />

          {/* Botón hamburguesa — solo mobile */}
          <button
            onClick={() => setMobileOpen(p => !p)}
            style={{
              padding: '0.625rem',
              backgroundColor: '#E8EAF0',
              borderRadius: '0.75rem',
              border: 'none',
              color: '#6B7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...S.neoOutSm,
            }}
            className="lg:hidden"
            title="Menú"
            aria-label="Abrir menú"
          >
            <Icon.Menu2 />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            style={{
              padding: '0.625rem',
              backgroundColor: '#E8EAF0',
              borderRadius: '0.75rem',
              border: 'none',
              color: '#6B7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...S.neoOutSm,
            }}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <Icon.Logout />
          </button>
        </div>
      </header>

      {/* ── MOBILE NAV (drawer) ─────────────────────────────── */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 30,
            backgroundColor: 'rgba(45,53,97,0.4)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setMobileOpen(false)}
        >
          <nav
            style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: '220px',
              backgroundColor: '#E8EAF0',
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              overflowY: 'auto',
              ...S.neoOut,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
              Navegación
            </p>
            {navItems.map(({ view, icon, label }) => (
              <button
                key={view}
                onClick={() => { setActiveNav(view); setMobileOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '1rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  textAlign: 'left',
                  ...(activeNav === view
                    ? { backgroundColor: '#FF5722', color: '#ffffff', ...S.coral }
                    : { backgroundColor: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }
                  ),
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ── LAYOUT DESKTOP ──────────────────────────────────── */}
      <div style={{ display: 'flex' }}>

        {/* Sidebar — solo visible en desktop (lg+) */}
        <nav
          className="hidden lg:flex"
          style={{
            width: '80px',
            backgroundColor: '#E8EAF0',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1.5rem 0',
            gap: '0.5rem',
            position: 'sticky',
            top: '72px',
            height: 'calc(100vh - 72px)',
            overflowY: 'auto',
            ...S.neoOut,
          }}
        >
          {navItems.map(({ view, icon, label }) => (
            <button
              key={view}
              onClick={() => setActiveNav(view)}
              title={label}
              style={{
                width: '56px',
                padding: '0.75rem 0',
                borderRadius: '1rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
                ...(activeNav === view
                  ? { backgroundColor: '#FF5722', color: '#ffffff', ...S.coral }
                  : { backgroundColor: 'transparent', color: '#6B7280', boxShadow: 'none' }
                ),
              }}
              onMouseEnter={e => {
                if (activeNav !== view) e.currentTarget.style.color = '#FF5722'
              }}
              onMouseLeave={e => {
                if (activeNav !== view) e.currentTarget.style.color = '#6B7280'
              }}
            >
              {icon}
              <span style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1, textAlign: 'center' }}>
                {label}
              </span>
            </button>
          ))}
        </nav>

        {/* Contenido principal */}
        <main style={{
          flex: 1,
          padding: '1.5rem',
          overflowX: 'hidden',
          maxHeight: 'calc(100vh - 72px)',
          overflowY: 'auto',
        }}>
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
