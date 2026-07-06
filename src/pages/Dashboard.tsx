// ============================================================
// RESTAURANTOS V5.5 — DASHBOARD SIN LAZY LOADING
// Todos los imports estáticos para evitar error #300
// ============================================================

import { useState, useEffect, useCallback, memo, startTransition } from 'react'
import { supabase } from '../services/supabaseClient'
import { useTheme } from '../contexts/ThemeContext'
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
import SupportChat            from '../components/SupportChat'
import BrandingManager, { applyBranding } from '../components/branding/BrandingManager'

export type Role    = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'
export type NavView = 'dashboard' | 'orders' | 'tables' | 'kitchen' | 'cashier' | 'tasks' | 'inventory' | 'analytics' | 'team' | 'menu' | 'branding'

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
  sm:    { boxShadow: 'var(--w-shadow-sm)' },
  md:    { boxShadow: 'var(--w-shadow-md)' },
  terra: { boxShadow: 'var(--w-shadow-terra)' },
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
  Sun:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:18,height:18 }}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  Moon:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:18,height:18 }}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
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
    { view:'branding',  icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:18,height:18 }}><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="14" r="2.5"/><path d="M12 22a10 10 0 110-20"/></svg>, label:'Marca' },
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
    { label:'Ventas hoy',    value:`$${(metrics?.total_sales_today??0).toLocaleString('es-CO')}`, Icon:Icons.Analytics, nav:'analytics' as NavView, color:'var(--w-olive)'   },
    { label:'Pendientes',    value:metrics?.pending_count??0,   Icon:Icons.Orders,  nav:'kitchen'   as NavView, color:'var(--w-saffron)' },
    { label:'En cocina',     value:metrics?.cooking_count??0,   Icon:Icons.Kitchen, nav:'kitchen'   as NavView, color:'var(--w-terra)'   },
    { label:'Listas',        value:metrics?.ready_count??0,     Icon:Icons.Tasks,   nav:'cashier'   as NavView, color:'var(--w-olive)'   },
    { label:'Completadas',   value:metrics?.completed_today??0, Icon:Icons.Tasks,   nav:'analytics' as NavView, color:'var(--w-wine)'    },
    { label:'Mesas activas', value:metrics?.active_tables??0,   Icon:Icons.Tables,  nav:'tables'    as NavView, color:'var(--w-terra)'   },
  ]

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'5rem 0'}}><Spin size="large"/></div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
      <div>
        <p className="ed-kicker" style={{marginBottom:'0.375rem'}}>
          {new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'})}
        </p>
        <h2 className="ed-display" style={{fontWeight:600,fontSize:'2rem',margin:0}}>
          Hola, {profile.full_name?.split(' ')[0]??'Admin'}
        </h2>
      </div>

      <InstallPWA />

      <div className="menu-grid">
        {cards.map((card,i) => (
          <button key={i} onClick={()=>onNavigate(card.nav)}
            className="w-lift w-rise"
            style={{padding:'1.25rem',textAlign:'left',border:'1px solid var(--w-line)',cursor:'pointer',fontFamily:'var(--w-sans)',background:'var(--w-surface)',borderRadius:'1.25rem',boxShadow:'var(--w-shadow-sm)',animationDelay:`${i*45}ms`}}>
            <div style={{color:card.color,marginBottom:'0.75rem'}}><card.Icon /></div>
            <div className="ed-display" style={{fontWeight:600,fontSize:'1.75rem',color:card.color,lineHeight:1}}>
              {card.value}
            </div>
            <div className="ed-body" style={{fontSize:'0.75rem',color:'var(--w-ink-mut)',fontWeight:500,marginTop:'0.375rem'}}>
              {card.label}
            </div>
          </button>
        ))}
      </div>

      <Tabs defaultActiveKey="orders" items={[
        { key:'orders', label:'Nueva orden', children:<OrderFlow profile={profile} onOrderCreated={()=>{}} /> },
        { key:'tables', label:'Mesas',       children:<TableMap profile={profile} /> },
        { key:'tasks',  label:'Tareas',      children:<AdminTasksView profile={profile} /> },
        { key:'qr',     label:'QR del Menú', children:<QRMenu /> },
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
  const [brand,      setBrand]      = useState<{ name?: string; logo?: string }>({})
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    try { initializeOfflineSync() } catch { /* no crítico */ }
    try { pushNotificationService.initializePushNotifications() } catch { /* no crítico */ }
  }, [])

  // Aplicar la marca del restaurante (color, logo y nombre) al cargar
  useEffect(() => {
    supabase.from('restaurant_config').select('display_name, logo_url, color_primario').maybeSingle()
      .then(({ data }) => {
        applyBranding(data?.color_primario)
        setBrand({ name: data?.display_name ?? undefined, logo: data?.logo_url ?? undefined })
      })
  }, [])

  useEffect(() => {
    // Variable local — cada ejecución del efecto tiene su propio 'active'
    let active = true

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (active) setLoading(false); return }

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

        if (!active) return
        if (prof) {
          setProfile(prof)
          const defaults: Record<Role, NavView> = {
            admin:'dashboard', waiter:'orders', kitchen:'kitchen', cashier:'cashier', client:'menu'
          }
          startTransition(() => setActiveNav(defaults[prof!.role as Role] ?? 'orders'))
        }
      } catch (e) {
        console.error('Dashboard load:', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
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
          <h2 className="ed-display" style={{fontWeight:600,fontSize:'1.875rem',marginBottom:'1.25rem'}}>
            Nueva orden
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
          { key:'1', label:'Lista de compras', children:<ShoppingList /> },
          { key:'2', label:'Recetas',          children:<RecipeBuilder /> },
        ]} />
      )
      case 'analytics': return <BusinessAssistant />
      case 'team':      return <TeamManager />
      case 'menu':      return profile.role === 'admin' ? <MenuManager /> : <ClientMenuSection />
      case 'branding':  return <BrandingManager />
      default:          return null
    }
  }

  if (loading) return (
    <div style={{minHeight:'100vh',background:'var(--w-bg)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:'1.25rem',overflow:'hidden',margin:'0 auto 1rem',border:'1px solid var(--w-line)',...S.md}}>
          <img src="/logo.jpg" alt="logo" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} />
        </div>
        <Spin size="large" />
      </div>
    </div>
  )

  if (!loading && !profile) return (
    <div style={{minHeight:'100vh',background:'var(--w-bg)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:'var(--w-terra)',fontWeight:700,fontFamily:'var(--w-sans)'}}>Reiniciando sesión...</p>
    </div>
  )

  const navItems = NAV_BY_ROLE[profile!.role] ?? NAV_BY_ROLE.client

  const chromeBtn: React.CSSProperties = {
    padding:'0.625rem', background:'var(--w-surface)', borderRadius:'0.75rem',
    border:'1px solid var(--w-line)', color:'var(--w-ink-soft)', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
  }

  return (
    <div style={{minHeight:'100vh',background:'var(--w-bg)',fontFamily:'var(--w-sans)'}}>

      {/* Notificaciones pedido listo — mesero y admin */}
      {(profile!.role === 'waiter' || profile!.role === 'admin') && (
        <WaiterNotifications />
      )}

      {/* Header */}
      <header className="lg" style={{
        padding:'0.875rem 1.25rem', borderRadius:0, border:'none',
        borderBottom:'1px solid var(--w-line)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        position:'sticky', top:0, zIndex:20,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
          <div style={{width:38,height:38,borderRadius:'0.625rem',overflow:'hidden',flexShrink:0,border:'1px solid var(--w-line)',background:'var(--w-surface)'}}>
            <img src={brand.logo || '/logo.jpg'} alt={brand.name || 'RestaurantOS'} style={{width:'100%',height:'100%',objectFit:brand.logo?'contain':'cover',display:'block'}}
              onError={e => { (e.target as HTMLImageElement).src = '/logo.jpg' }} />
          </div>
          <div>
            <h1 className="ed-display" style={{fontWeight:600,fontSize:'1.125rem',margin:0,lineHeight:1.1}}>
              {brand.name || 'RestaurantOS'}
            </h1>
            <p style={{fontSize:'0.6875rem',color:'var(--w-ink-mut)',margin:0,fontFamily:'var(--w-sans)'}}>
              {profile!.full_name ?? profile!.email} · {profile!.role}
            </p>
          </div>
        </div>

        <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <InstallPWA compact />
          {/* Theme toggle — solo admin */}
          {profile!.role === 'admin' && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={chromeBtn}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
              {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
            </button>
          )}
          <button onClick={()=>setMobileOpen(p=>!p)} style={chromeBtn} aria-label="Menú">
            <Icons.Hamburger />
          </button>
          <button onClick={onLogout} style={chromeBtn} title="Cerrar sesión">
            <Icons.Logout />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{position:'fixed',inset:0,zIndex:30,background:'oklch(0.20 0.02 55 / 0.50)',
          backdropFilter:'blur(6px)'}} onClick={()=>setMobileOpen(false)}>
          <nav className="lg" style={{position:'absolute',top:0,left:0,bottom:0,width:230,
            padding:'1.5rem 1rem',display:'flex',
            flexDirection:'column',gap:'0.375rem',overflowY:'auto',borderRadius:0,
            borderRight:'1px solid var(--w-line)'}}
            onClick={e=>e.stopPropagation()}>
            <p className="ed-kicker" style={{marginBottom:'0.875rem',paddingLeft:'0.5rem'}}>
              Navegación
            </p>
            {navItems.map(({view,icon,label})=>(
              <button key={view} onClick={()=>{setActiveNav(view);setMobileOpen(false)}}
                className="w-press"
                style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',
                  borderRadius:'0.875rem',border:'none',cursor:'pointer',fontFamily:'var(--w-sans)',
                  fontWeight:600,fontSize:'0.875rem',width:'100%',textAlign:'left',
                  transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                  ...(activeNav===view
                    ? {background:'var(--w-terra)',color:'#fff',...S.terra}
                    : {background:'transparent',color:'var(--w-ink-soft)'})}}>
                {icon}{label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Layout */}
      <div style={{display:'flex',alignItems:'flex-start'}}>
        {/* Sidebar desktop */}
        <nav className="lg-sidebar lg" style={{width:84,flexDirection:'column',
          alignItems:'center',padding:'1.25rem 0',gap:'0.5rem',
          position:'sticky',top:70,height:'calc(100vh - 70px)',
          overflowY:'auto',borderRadius:0,borderRight:'1px solid var(--w-line)',
          display:'none'}}>
          {navItems.map(({view,icon,label})=>(
            <button key={view} onClick={()=>setActiveNav(view)} title={label}
              className="w-press"
              style={{width:60,padding:'0.625rem 0',borderRadius:'0.875rem',border:'none',
                cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',
                gap:'0.3rem',fontFamily:'var(--w-sans)',
                transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                ...(activeNav===view
                  ? {background:'var(--w-terra)',color:'#fff',...S.terra}
                  : {background:'transparent',color:'var(--w-ink-mut)'})}}>
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

      <style>{`@keyframes rs{to{transform:rotate(360deg)}}`}</style>
      <SupportChat />
    </div>
  )
}
