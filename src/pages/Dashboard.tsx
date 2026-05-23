// ============================================================
// RESTAURANTOS V5.4 — DASHBOARD COMPLETO
// ============================================================

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '../services/supabaseClient'
import { initializeOfflineSync } from '../services/offlineService'
import { pushNotificationService } from '../services/pushNotificationService'
import Spin    from 'antd/es/spin'
import message from 'antd/es/message'
import Tabs    from 'antd/es/tabs'

// Componentes nuevos
import { OrderFlow }    from '../components/orders/OrderFlow'
import { TableMap }     from '../components/tables/TableMap'
import { KitchenBoard } from '../components/kitchen/KitchenBoard'
import { CashierPanel } from '../components/cashier/CashierPanel'
import { TeamManager }  from '../components/team/TeamManager'
import { MenuManager }  from '../components/menu/MenuManager'

// Componentes existentes
import { ClientMenuSection }  from '../components/ClientMenuSection'
import { AdminTasksView }     from '../components/tasks/AdminTasksView'
import { EmployeeTasksView }  from '../components/tasks/EmployeeTasksView'
import { ShoppingList }       from '../components/inventory/ShoppingList'
import { RecipeBuilder }      from '../components/recipes/RecipeBuilder'
import BusinessAssistant      from './BusinessAssistant'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  neoIn:   { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
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

// ─── Iconos ────────────────────────────────────────────────────
const Icon = {
  Dashboard:  memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>),
  Orders:     memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"/><path d="M9 12h6M9 16h4"/></svg>),
  Tables:     memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14M19 7v14M8 12h8"/></svg>),
  Kitchen:    memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M12 2a9 9 0 100 18A9 9 0 0012 2z"/><circle cx="12" cy="12" r="4"/></svg>),
  Cashier:    memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12a2 2 0 100-4 2 2 0 000 4zM6 12h.01M18 12h.01"/></svg>),
  Tasks:      memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>),
  Inventory:  memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>),
  Analytics:  memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Team:       memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>),
  Menu:       memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M12 2a9 9 0 100 18 9 9 0 000-18zM8 12h8M8 8h8M8 16h5"/></svg>),
  Logout:     memo(() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>),
}

// ─── Nav por rol ───────────────────────────────────────────────
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
    { view: 'orders',  icon: <Icon.Orders />,  label: 'Pedidos' },
    { view: 'tables',  icon: <Icon.Tables />,  label: 'Mesas'   },
    { view: 'tasks',   icon: <Icon.Tasks />,   label: 'Tareas'  },
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

// ─── AdminDashboard (overview) ─────────────────────────────────
const AdminDashboard = memo(({ profile, onNavigate }: { profile: Profile; onNavigate: (v: NavView) => void }) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_admin_metrics')
      if (!error) setMetrics(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 30000)
    return () => clearInterval(t)
  }, [fetch])

  const cards = [
    { label: 'Ventas hoy',    value: `$${(metrics?.total_sales_today ?? 0).toFixed(2)}`, icon: '💰', nav: 'analytics' as NavView, color: 'text-emerald-600' },
    { label: 'Pendientes',    value: metrics?.pending_count   ?? 0, icon: '⏳', nav: 'kitchen'  as NavView, color: 'text-amber-600'   },
    { label: 'En cocina',     value: metrics?.cooking_count   ?? 0, icon: '🍳', nav: 'kitchen'  as NavView, color: 'text-blue-600'    },
    { label: 'Listas',        value: metrics?.ready_count     ?? 0, icon: '✅', nav: 'cashier'  as NavView, color: 'text-emerald-600' },
    { label: 'Completadas',   value: metrics?.completed_today ?? 0, icon: '🎉', nav: 'analytics'as NavView, color: 'text-purple-600'  },
    { label: 'Mesas activas', value: metrics?.active_tables   ?? 0, icon: '🍽️', nav: 'tables'   as NavView, color: 'text-orange-600'  },
  ]

  if (loading) return <div className="flex justify-center py-20"><Spin size="large" /></div>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#2D3561] mb-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          Buenos días, {profile.full_name?.split(' ')[0] ?? 'Admin'} 👋
        </h2>
        <p className="text-sm text-[#9CA3AF]">
          {new Date().toLocaleDateString('es', { weekday:'long', day:'numeric', month:'long' })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <button key={i} onClick={() => onNavigate(card.nav)}
            className="p-5 bg-[#E8EAF0] rounded-3xl text-left hover:scale-[1.02] transition-transform"
            style={S.neoOut}
          >
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className={`text-2xl font-bold ${card.color}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {card.value}
            </div>
            <div className="text-xs text-[#9CA3AF] font-medium mt-1">{card.label}</div>
          </button>
        ))}
      </div>

      <Tabs defaultActiveKey="orders" items={[
        { key: 'orders',    label: '📋 Nueva orden',   children: <OrderFlow profile={profile} onOrderCreated={() => {}} /> },
        { key: 'tables',    label: '🗺️ Mesas',         children: <TableMap profile={profile} /> },
        { key: 'tasks',     label: '✅ Tareas',         children: <AdminTasksView profile={profile} /> },
      ]} />
    </div>
  )
})
AdminDashboard.displayName = 'AdminDashboard'

// ─── Componente Principal ──────────────────────────────────────
interface DashboardProps { onLogout: () => void }

export default function Dashboard({ onLogout }: DashboardProps) {
  const [profile,   setProfile]  = useState<Profile | null>(null)
  const [activeNav, setActiveNav]= useState<NavView>('dashboard')
  const [loading,   setLoading]  = useState(true)
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
    <div className="min-h-screen bg-[#E8EAF0] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-3xl overflow-hidden mx-auto mb-4 animate-pulse" style={S.neoOut}>
          <img src="/logo.jpg" alt="RestaurantOS" className="w-full h-full object-cover" />
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
        : null // BUG FIX #9: solo admin puede ver el dashboard de métricas
      case 'orders':    return (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-[#2D3561]">📋 Nueva Orden</h2>
          <OrderFlow profile={profile} onOrderCreated={() => message.success('Orden enviada')} />
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
    <div className="min-h-screen bg-[#E8EAF0]">
      {/* Header */}
      <header className="bg-[#E8EAF0] px-6 py-4 flex justify-between items-center sticky top-0 z-20" style={S.neoOut}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0" style={S.neoOutSm}>
            <img src="/logo.jpg" alt="RestaurantOS" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              RestaurantOS
            </h1>
            <p className="text-xs text-[#9CA3AF]">
              {profile.full_name ?? profile.email} · {profile.role}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-3 bg-[#E8EAF0] rounded-2xl text-[#6B7280] hover:text-[#FF5722] transition"
          style={S.neoOutSm} title="Cerrar sesión"
        >
          <Icon.Logout />
        </button>
      </header>

      <div className="flex">
        {/* Sidebar Nav */}
        <nav className="w-20 bg-[#E8EAF0] flex flex-col items-center py-6 gap-2 sticky top-[72px] h-[calc(100vh-72px)] overflow-y-auto" style={S.neoOut}>
          {navItems.map(({ view, icon, label }) => (
            <button key={view}
              onClick={() => setActiveNav(view)}
              className={`p-3 rounded-2xl transition-all w-14 flex flex-col items-center gap-1 ${
                activeNav === view ? 'bg-[#FF5722] text-white' : 'text-[#6B7280] hover:text-[#FF5722]'
              }`}
              style={activeNav === view ? S.coral : S.neoOutSm}
              title={label}
            >
              {icon}
              <span className="text-[9px] font-bold leading-none text-center">{label}</span>
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto max-h-[calc(100vh-72px)]">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
