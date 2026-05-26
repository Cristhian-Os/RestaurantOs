// ============================================================
// RESTAURANTOS V5.5 — DASHBOARD SIN LAZY LOADING
// Todos los imports estáticos para evitar error #300
// ============================================================

import { useState, useEffect, useCallback, useRef, memo, startTransition } from 'react'
import { supabase } from '../services/supabaseClient'
import { initializeOfflineSync } from '../services/offlineService'
import { pushNotificationService } from '../services/pushNotificationService'
import Spin    from 'antd/es/spin'
import message from 'antd/es/message'
import Tabs    from 'antd/es/tabs'

// Imports estáticos — sin lazy para evitar error #300 con Suspense anidado
import { OrderFlow }         from '../components/orders/OrderFlow'
import { TableMap }          from '../components/tables/TableMap'
import { KitchenBoard }      from '../components/kitchen/KitchenBoard'
import { CashierPanel }      from '../components/cashier/CashierPanel'
import { TeamManager }       from '../components/team/TeamManager'
import { MenuManager }       from '../components/menu/MenuManager'
import { ClientMenuSection } from '../components/ClientMenuSection'
import { AdminTasksView }    from '../components/tasks/AdminTasksView'
import { EmployeeTasksView } from '../components/tasks/EmployeeTasksView'
import { ShoppingList }      from '../components/inventory/ShoppingList'
import { RecipeBuilder }     from '../components/recipes/RecipeBuilder'
import BusinessAssistant     from './BusinessAssistant'
import { InstallPWA }        from '../components/pwa/InstallPWA'
import { QRMenu }            from '../components/pwa/QRMenu'
import { WaiterNotifications } from '../components/orders/WaiterNotifications'

export type Role    = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'
export type NavView = 'dashboard' | 'orders' | 'tables' | 'kitchen' | 'cashier' | 'tasks' | 'inventory' | 'analytics' | 'team' | 'menu'

export interface Profile {
  id:          string
  role:        Role
  full_name:   string | null
  email?:      string
  phone?:      string | null
  avatar_url?: string | null
  active?:     boolean
}

interface Metrics {
  total_sales_today: number
  pending_count:     number
  cooking_count:     number
  ready_count:       number
  active_tables:     number
  completed_today:   number
}

const S = {
  neoOut:   { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  neoIn:    { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:    { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

// Iconos SVG inline
const Icons = {
  Dashboard: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Orders:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"/><path d="M9 12h6M9 16h4"/></svg>,
  Tables:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14M19 7v14M8 12h8"/></svg>,
  Kitchen:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>,
  Cashier:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12a2 2 0 100-4 2 2 0 000 4zM6 12h.01M18 12h.01"/></svg>,
  Tasks:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  Inventory: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  Analytics: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Team:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  Menu:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M12 2a9 9 0 100 18A9 9 0 0012 2z"/><circle cx="12" cy="12" r="4"/></svg>,
  Logout:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>,
  Hamburger: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Download:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:18,height:18 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
}

const NAV_BY_ROLE: Record<Role, { view: NavView; icon: React.ReactNode; label: string }[]> = {
  admin: [
    { view:'dashboard', icon:<Icons.Dashboard />, label:'Inicio'     },
    { view:'orders',    icon:<Icons.Orders />,    label:'Pedidos'    },
    { view:'tables',    icon:<Icons.Tables />,    label:'Mesas'      },
    { view:'kitchen',   icon:<Icons.Kitchen />,   label:'Cocina'     },
    { view:'cashier',   icon:<Icons.Cashier />,   label:'Caja'       },
    { view:'tasks',     icon:<Icons.Tasks />,     label:'Tareas'     },
    { view:'inventory', icon:<Icons.Inventory />, label:'Inventario' },
    { view:'analytics', icon:<Icons.Analytics />, label:'Analytics'  },
    { view:'team',      icon:<Icons.Team />,      label:'Equipo'     },
    { view:'menu',      icon:<Icons.Menu />,      label:'Menú'       },
  ],
  waiter:  [
    { view:'orders', icon:<Icons.Orders />, label:'Pedidos' },
    { view:'tables', icon:<Icons.Tables />, label:'Mesas'   },
    { view:'tasks',  icon:<Icons.Tasks />,  label:'Tareas'  },
  ],
  kitchen: [{ view:'kitchen', icon:<Icons.Kitchen />, label:'Cocina' }],
  cashier: [
    { view:'cashier', icon:<Icons.Cashier />, label:'Caja'    },
    { view:'orders',  icon:<Icons.Orders />,  label:'Pedidos' },
    { view:'tasks',   icon:<Icons.Tasks />,   label:'Tareas'  },
  ],
  client:  [{ view:'menu', icon:<Icons.Menu />, label:'Menú' }],
}

// ── Admin Dashboard ────────────────────────────────────────────
const AdminDashboard = memo(({ profile, onNavigate }: {
  profile: Profile
  onNavigate: (v: NavView) => void
}) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_metrics')
      if (!error && data) setMetrics(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const t = setInterval(fetchMetrics, 30_000)
    return () => clearInterval(t)
  }, [fetchMetrics])

  const cards = [
    { label:'Ventas hoy',    value:`$${(metrics?.total_sales_today??0).toLocaleString('es')}`, icon:'💰', nav:'analytics' as NavView, color:'#10B981' },
    { label:'Pendientes',    value:metrics?.pending_count??0,   icon:'⏳', nav:'kitchen'   as NavView, color:'#F59E0B' },
    { label:'En cocina',     value:metrics?.cooking_count??0,   icon:'🍳', nav:'kitchen'   as NavView, color:'#3B82F6' },
    { label:'Listas',        value:metrics?.ready_count??0,     icon:'✅', nav:'cashier'   as NavView, color:'#10B981' },
    { label:'Completadas',   value:metrics?.completed_today??0, icon:'🎉', nav:'analytics' as NavView, color:'#8B5CF6' },
    { label:'Mesas activas', value:metrics?.active_tables??0,   icon:'🍽️', nav:'tables'    as NavView, color:'#FF5722' },
  ]

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'5rem 0'}}><Spin size="large"/></div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
      <div>
        <h2 style={{fontFamily:'"DM Sans",sans-serif',fontWeight:700,fontSize:'1.5rem',color:'#2D3561',marginBottom:'0.25rem'}}>
          Hola, {profile.full_name?.split(' ')[0]??'Admin'} 👋
        </h2>
        <p style={{fontSize:'0.875rem',color:'#9CA3AF'}}>
          {new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'})}
        </p>
      </div>

      <InstallPWA />

      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'1rem'}}>
        {cards.map((card,i) => (
          <button key={i} onClick={()=>onNavigate(card.nav)}
            style={{padding:'1.25rem',backgroundColor:'#D8DAE4',borderRadius:'1.5rem',
              textAlign:'left',border:'none',cursor:'pointer',fontFamily:'inherit',...S.neoOut}}
            onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.02)')}
            onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
            <div style={{fontSize:'1.875rem',marginBottom:'0.75rem'}}>{card.icon}</div>
            <div style={{fontFamily:'"DM Sans",sans-serif',fontWeight:700,fontSize:'1.5rem',color:card.color}}>
              {card.value}
            </div>
            <div style={{fontSize:'0.75rem',color:'#9CA3AF',fontWeight:500,marginTop:'0.25rem'}}>
              {card.label}
            </div>
          </button>
        ))}
      </div>

      <Tabs defaultActiveKey="orders" items={[
        { key:'orders', label:'📋 Nueva orden',  children:<OrderFlow profile={profile} onOrderCreated={()=>{}} /> },
        { key:'tables', label:'🗺️ Mesas',         children:<TableMap profile={profile} /> },
        { key:'tasks',  label:'✅ Tareas',         children:<AdminTasksView profile={profile} /> },
        { key:'qr',     label:'📱 QR del Menú',   children:<QRMenu /> },
      ]} />
    </div>
  )
})
AdminDashboard.displayName = 'AdminDashboard'

// ── Dashboard Principal ─────────────────────────────────────────
interface DashboardProps { onLogout: () => void }

export default function Dashboard({ onLogout }: DashboardProps) {
  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [activeNav,  setActiveNav]  = useState<NavView>('dashboard')
  const [loading,    setLoading]    = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMounted = useRef(true)

  useEffect(() => {
    try { initializeOfflineSync() } catch { /* no crítico */ }
    try { pushNotificationService.initializePushNotifications() } catch { /* no crítico */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (isMounted.current) setLoading(false); return }

        let { data: prof, error } = await supabase
          .from('profiles').select('*').eq('id', user.id).single()

        if (error?.code === 'PGRST116' || (!prof && error)) {
          const { data: np } = await supabase.from('profiles').insert({
            id: user.id, email: user.email ?? '',
            full_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Usuario',
            role: user.user_metadata?.role ?? 'waiter', active: true,
          }).select('*').single()
          prof = np; error = null
        }

        if (!isMounted.current) return
        if (prof) {
          setProfile(prof)
          const defaults: Record<Role, NavView> = {
            admin:'dashboard', waiter:'orders', kitchen:'kitchen', cashier:'cashier', client:'menu'
          }
          startTransition(() => setActiveNav(defaults[prof.role as Role] ?? 'orders'))
        }
      } catch (e) {
        console.error('Dashboard load:', e)
      } finally {
        if (isMounted.current) setLoading(false)
      }
    }
    load()
    return () => { isMounted.current = false }
  }, [])

  // Redirigir si no-admin aterriza en 'dashboard'
  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin' && activeNav === 'dashboard') {
      const defaults: Record<string, NavView> = {
        waiter:'orders', kitchen:'kitchen', cashier:'cashier', client:'menu'
      }
      const target = defaults[profile.role]
      if (target) startTransition(() => setActiveNav(target))
    }
  }, [profile, activeNav])

  // signOut en useEffect — NUNCA durante el render
  useEffect(() => {
    if (!loading && !profile) {
      supabase.auth.signOut().then(() => onLogout())
    }
  }, [loading, profile, onLogout])

  const renderContent = () => {
    if (!profile) return null
    switch (activeNav) {
      case 'dashboard': return profile.role === 'admin'
        ? <AdminDashboard profile={profile} onNavigate={setActiveNav} />
        : null
      case 'orders':    return (
        <div>
          <h2 style={{fontFamily:'"DM Sans",sans-serif',fontWeight:700,fontSize:'1.5rem',color:'#2D3561',marginBottom:'1rem'}}>
            📋 Nueva Orden
          </h2>
          <OrderFlow profile={profile} onOrderCreated={()=>message.success('Orden enviada a cocina')} />
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
          { key:'1', label:'📦 Lista de compras', children:<ShoppingList /> },
          { key:'2', label:'🍳 Recetas',           children:<RecipeBuilder /> },
        ]} />
      )
      case 'analytics': return <BusinessAssistant />
      case 'team':      return <TeamManager />
      case 'menu':      return profile.role === 'admin' ? <MenuManager /> : <ClientMenuSection />
      default:          return null
    }
  }

  if (loading) return (
    <div style={{minHeight:'100vh',backgroundColor:'#D8DAE4',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:'1.5rem',overflow:'hidden',margin:'0 auto 1rem',...S.neoOut}}>
          <img src="/logo.jpg" alt="logo" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
        </div>
        <Spin size="large" />
      </div>
    </div>
  )

  if (!loading && !profile) return (
    <div style={{minHeight:'100vh',backgroundColor:'#D8DAE4',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:'#FF5722',fontWeight:700,fontFamily:'"Nunito",sans-serif'}}>Reiniciando sesión...</p>
    </div>
  )

  const navItems = NAV_BY_ROLE[profile!.role] ?? NAV_BY_ROLE.client

  return (
    <div style={{minHeight:'100vh',backgroundColor:'#D8DAE4',fontFamily:'"Nunito",sans-serif'}}>

      {/* Notificaciones pedido listo — mesero y admin */}
      {(profile!.role === 'waiter' || profile!.role === 'admin') && (
        <WaiterNotifications />
      )}

      {/* Header */}
      <header style={{
        backgroundColor:'#D8DAE4', padding:'1rem 1.5rem',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        position:'sticky', top:0, zIndex:20, ...S.neoOut,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
          <div style={{width:40,height:40,borderRadius:'0.75rem',overflow:'hidden',flexShrink:0,...S.neoOutSm}}>
            <img src="/logo.jpg" alt="RestaurantOS" style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
          </div>
          <div>
            <h1 style={{fontFamily:'"DM Sans",sans-serif',fontWeight:700,fontSize:'1.0625rem',color:'#2D3561',margin:0}}>
              RestaurantOS
            </h1>
            <p style={{fontSize:'0.7rem',color:'#8B92AA',margin:0}}>
              {profile!.full_name ?? profile!.email} · {profile!.role}
            </p>
          </div>
        </div>

        <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <InstallPWA compact />
          <button onClick={()=>setMobileOpen(p=>!p)}
            style={{padding:'0.625rem',backgroundColor:'#D8DAE4',borderRadius:'0.75rem',
              border:'none',color:'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',
              justifyContent:'center',...S.neoOutSm}}
            aria-label="Menú">
            <Icons.Hamburger />
          </button>
          <button onClick={onLogout}
            style={{padding:'0.625rem',backgroundColor:'#D8DAE4',borderRadius:'0.75rem',
              border:'none',color:'#6B7280',cursor:'pointer',display:'flex',alignItems:'center',
              justifyContent:'center',...S.neoOutSm}}
            title="Cerrar sesión">
            <Icons.Logout />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{position:'fixed',inset:0,zIndex:30,backgroundColor:'rgba(45,53,97,0.4)',
          backdropFilter:'blur(4px)'}} onClick={()=>setMobileOpen(false)}>
          <nav style={{position:'absolute',top:0,left:0,bottom:0,width:220,
            backgroundColor:'#D8DAE4',padding:'1.5rem 1rem',display:'flex',
            flexDirection:'column',gap:'0.375rem',overflowY:'auto',...S.neoOut}}
            onClick={e=>e.stopPropagation()}>
            <p style={{fontSize:'0.65rem',fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',
              letterSpacing:'0.1em',marginBottom:'0.75rem',paddingLeft:'0.5rem'}}>
              Navegación
            </p>
            {navItems.map(({view,icon,label})=>(
              <button key={view} onClick={()=>{setActiveNav(view);setMobileOpen(false)}}
                style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',
                  borderRadius:'1rem',border:'none',cursor:'pointer',fontFamily:'inherit',
                  fontWeight:600,fontSize:'0.875rem',width:'100%',textAlign:'left',
                  ...(activeNav===view
                    ? {backgroundColor:'#FF5722',color:'#fff',...S.coral}
                    : {backgroundColor:'#D8DAE4',color:'#6B7280',...S.neoOutSm})}}>
                {icon}{label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Layout */}
      <div style={{display:'flex',alignItems:'flex-start'}}>
        {/* Sidebar desktop */}
        <nav style={{width:80,backgroundColor:'#D8DAE4',flexDirection:'column',
          alignItems:'center',padding:'1.5rem 0',gap:'0.5rem',
          position:'sticky',top:72,height:'calc(100vh - 72px)',
          overflowY:'auto',...S.neoOut,
          display:'none'}} // Controlado por CSS className abajo
          className="lg-sidebar">
          {navItems.map(({view,icon,label})=>(
            <button key={view} onClick={()=>setActiveNav(view)} title={label}
              style={{width:56,padding:'0.75rem 0',borderRadius:'1rem',border:'none',
                cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',
                gap:'0.25rem',fontFamily:'inherit',
                ...(activeNav===view
                  ? {backgroundColor:'#FF5722',color:'#fff',...S.coral}
                  : {backgroundColor:'transparent',color:'#6B7280'})}}>
              {icon}
              <span style={{fontSize:'9px',fontWeight:700,lineHeight:1,textAlign:'center'}}>
                {label}
              </span>
            </button>
          ))}
        </nav>

        <main style={{flex:1,padding:'1.25rem',overflowX:'hidden',minWidth:0}}>
          {renderContent()}
          <div style={{height:'2rem'}} />
        </main>
      </div>

      <style>{`
        @media (min-width: 1024px) { .lg-sidebar { display: flex !important; } }
        @keyframes rs { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
