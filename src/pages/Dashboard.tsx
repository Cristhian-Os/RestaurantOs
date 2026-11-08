// ============================================================
// RESTAURANTOS V5.5 — DASHBOARD SIN LAZY LOADING
// Todos los imports estáticos para evitar error #300
// ============================================================

import { useState, useEffect, useCallback, memo, startTransition } from 'react'
import { supabase } from '../services/supabaseClient'
import { useTheme } from '../contexts/ThemeContext'
import { initializeOfflineSync } from '../services/offlineService'
import { queryClient } from '../services/queryClient'
import { VoiceCommandModal } from '../components/VoiceCommandModal'
import { VoiceCommandFab } from '../components/VoiceCommandFab'
import { pushNotificationService } from '../services/pushNotificationService'
import Spin    from 'antd/es/spin'
import message from 'antd/es/message'
import Tabs    from 'antd/es/tabs'

// Imports estáticos — sin lazy para evitar error #300 con Suspense anidado
import { OrderFlow }         from '../components/orders/OrderFlow'
import { TableMap }          from '../components/tables/TableMap'
import { KitchenBoard }      from '../components/kitchen/KitchenBoard'
import { CashierPanel }      from '../components/cashier/CashierPanel'
import { DomiciliosPanel }   from '../components/cashier/DomiciliosPanel'
import { ConversacionesPanel } from '../components/cashier/ConversacionesPanel'
import { TeamManager }       from '../components/team/TeamManager'
import { MyShifts }          from '../components/team/MyShifts'
import { MenuManager }       from '../components/menu/MenuManager'
import { ClientMenuSection } from '../components/ClientMenuSection'
import { AdminTasksView }    from '../components/tasks/AdminTasksView'
import { EmployeeTasksView } from '../components/tasks/EmployeeTasksView'
import { FidelizacionView }  from '../components/fidelizacion/FidelizacionView'
import { ShoppingList }      from '../components/inventory/ShoppingList'
import { IngredientesManager } from '../components/inventory/IngredientesManager'
import { RecipeBuilder }     from '../components/recipes/RecipeBuilder'
import BusinessAssistant     from './BusinessAssistant'
import { InstallPWA }        from '../components/pwa/InstallPWA'
import { QRPrintManager }    from '../components/pwa/QRPrintManager'
import { WaiterNotifications } from '../components/orders/WaiterNotifications'
import SupportChat            from '../components/SupportChat'
import BrandingManager, { applyBranding } from '../components/branding/BrandingManager'
import SubscriptionPanel from '../components/billing/SubscriptionPanel'
import SubscriptionBanner from '../components/billing/SubscriptionBanner'
import SedeSelector from '../components/SedeSelector'
import Resti from '../components/resti/Resti'
import { MobileNav } from '../components/shell/FloatingNav'
import { aplicarDegradados, coloresDe, degradadosDe } from '../lib/degradados'
import { ConfigHub } from '../components/settings/ConfigHub'
import { WhatsAppConfig } from '../components/settings/WhatsAppConfig'
import { PedidosMesaPanel } from '../components/waiter/PedidosMesaPanel'
import { CampanasPanel } from '../components/fidelizacion/CampanasPanel'
import { ArmPanel } from '../components/fidelizacion/ArmPanel'
import { FidelidadConfig } from '../components/fidelizacion/FidelidadConfig'
import { TopBar } from '../components/shell/TopBar'
import VentasView from '../components/ventas/VentasView'
import { Tabs as UiTabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Badge, type Tone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ModuleHeader, StatCard } from '../components/tasks/ModuleHeader'
import { hoyBogota } from '../services/menuOptions'
import { formatCOP } from '../config/billing'
import {
  dayBoundsBogota, esRappi, forWhom, itemsSummary, parseItems, productTotals, summarize,
  type ProductTotal, type SaleOrder,
} from '../services/salesHistory'
import { PlatformPanel } from '../components/platform/PlatformPanel'
import { MfaGate } from '../components/platform/MfaGate'
import { MenuAvailability } from '../components/menu/MenuAvailability'
import { OptionListsSection } from '../components/menu/OptionListsSection'
import { Proveedores }      from '../components/cashier/Proveedores'
import { Facturas }         from '../components/cashier/Facturas'
import { OpinionSection }   from '../components/feedback/OpinionSection'
import { ConfiguracionGuiada } from '../components/onboarding/ConfiguracionGuiada'
import { ImpresionConfig } from '../components/print/ImpresionConfig'
import { EstacionImpresion } from '../components/print/EstacionImpresion'
import { SetupWizard }      from '../components/onboarding/SetupWizard'
import { OrderSoundAlerts, SoundTestButton, SoundUnlockBanner } from '../components/orders/OrderSoundAlerts'

export type Role    = 'super_admin' | 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'
export type NavView = 'dashboard' | 'orders' | 'tables' | 'kitchen' | 'cashier' | 'tasks' | 'shifts' | 'inventory' | 'analytics' | 'ventas' | 'team' | 'menu' | 'menu_gestion' | 'menu_listas' | 'proveedores' | 'facturas' | 'opinion' | 'fidelizacion' | 'setup' | 'impresion' | 'branding' | 'billing' | 'whatsapp' | 'domicilios' | 'conversaciones' | 'pedidos_mesa' | 'campanas' | 'arm' | 'fidelidad_config' | 'config' | 'platform'

export interface Profile {
  id:          string
  role:        Role
  full_name:   string | null
  email?:      string
  phone?:      string | null
  avatar_url?: string | null
  active?:     boolean
  must_change_password?: boolean
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
  Platform:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0018 0V5M3 12a9 3 0 0018 0"/></svg>,
  Toggles:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><rect x="2" y="5" width="20" height="6" rx="3"/><circle cx="16" cy="8" r="1.5"/><rect x="2" y="13" width="20" height="6" rx="3"/><circle cx="8" cy="16" r="1.5"/></svg>,
  Receipt:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6"/></svg>,
  Truck:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/></svg>,
  Printer:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>,
  Heart:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  Opinion:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width:20,height:20 }}><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0113 3h.5a8.5 8.5 0 018 8z"/></svg>,
}

const NAV_BY_ROLE: Record<Role, { view: NavView; icon: React.ReactNode; label: string }[]> = {
  super_admin: [
    { view:'platform', icon:<Icons.Platform />, label:'Restaurantes' },
  ],
  admin: [
    { view:'dashboard', icon:<Icons.Dashboard />, label:'Inicio'     },
    { view:'orders',    icon:<Icons.Orders />,    label:'Pedidos'    },
    { view:'tables',    icon:<Icons.Tables />,    label:'Mesas'      },
    { view:'kitchen',   icon:<Icons.Kitchen />,   label:'Cocina'     },
    { view:'cashier',   icon:<Icons.Cashier />,   label:'Caja'       },
    { view:'domicilios', icon:<Icons.Truck />,    label:'Domicilios' },
    { view:'conversaciones', icon:<Icons.Opinion />, label:'Conversaciones' },
    { view:'pedidos_mesa', icon:<Icons.Tables />,  label:'Pedidos de mesa' },
    { view:'tasks',     icon:<Icons.Tasks />,     label:'Tareas'     },
    { view:'inventory', icon:<Icons.Inventory />, label:'Inventario' },
    { view:'analytics', icon:<Icons.Analytics />, label:'Analytics'  },
    { view:'ventas',    icon:<Icons.Receipt />,   label:'Ventas'     },
    { view:'team',      icon:<Icons.Team />,      label:'Equipo'     },
    { view:'menu',      icon:<Icons.Menu />,      label:'Menú'       },
    { view:'menu_gestion', icon:<Icons.Toggles />, label:'Gestión menú'},
    { view:'menu_listas', icon:<Icons.Menu />,     label:'Listas y opciones'},
    { view:'proveedores',  icon:<Icons.Truck />,   label:'Proveedores'},
    { view:'facturas',     icon:<Icons.Receipt />, label:'Facturas'   },
    { view:'fidelizacion', icon:<Icons.Heart />,   label:'Fidelización' },
    { view:'campanas',     icon:<Icons.Heart />,   label:'Campañas'   },
    { view:'arm',          icon:<Icons.Analytics />, label:'Asistente de clientes' },
    { view:'opinion',      icon:<Icons.Opinion />, label:'Opinión'    },
    { view:'config',       icon:<Icons.Toggles />, label:'Configuración' },
  ],
  waiter:  [
    { view:'orders', icon:<Icons.Orders />, label:'Pedidos' },
    { view:'tables', icon:<Icons.Tables />, label:'Mesas'   },
    { view:'pedidos_mesa', icon:<Icons.Tables />, label:'Pedidos de mesa' },
    { view:'tasks',  icon:<Icons.Tasks />,  label:'Tareas'  },
    { view:'shifts', icon:<Icons.Team />,   label:'Turnos' },
    { view:'fidelizacion', icon:<Icons.Heart />, label:'Fidelización' },
    { view:'opinion', icon:<Icons.Opinion />, label:'Opinión' },
  ],
  kitchen: [
    { view:'kitchen', icon:<Icons.Kitchen />, label:'Cocina' },
    { view:'shifts',  icon:<Icons.Team />,    label:'Turnos' },
    { view:'opinion', icon:<Icons.Opinion />, label:'Opinión' },
  ],
  cashier: [
    { view:'cashier',      icon:<Icons.Cashier />, label:'Caja'         },
    { view:'domicilios',   icon:<Icons.Truck />,   label:'Domicilios'   },
    { view:'conversaciones', icon:<Icons.Opinion />, label:'Conversaciones' },
    { view:'pedidos_mesa', icon:<Icons.Tables />,  label:'Pedidos de mesa' },
    { view:'orders',       icon:<Icons.Orders />,  label:'Pedidos'      },
    { view:'tasks',        icon:<Icons.Tasks />,   label:'Tareas'       },
    { view:'shifts',       icon:<Icons.Team />,    label:'Turnos'   },
    { view:'menu_gestion', icon:<Icons.Toggles />, label:'Gestión menú' },
    { view:'proveedores',  icon:<Icons.Truck />,   label:'Proveedores'  },
    { view:'facturas',     icon:<Icons.Receipt />, label:'Facturas'     },
    { view:'fidelizacion', icon:<Icons.Heart />,   label:'Fidelización' },
    { view:'campanas',     icon:<Icons.Heart />,   label:'Campañas'     },
    { view:'opinion',      icon:<Icons.Opinion />, label:'Opinión'      },
  ],
  client:  [{ view:'menu', icon:<Icons.Menu />, label:'Menú' }],
}

// ── Admin Dashboard (Inicio) ───────────────────────────────────
// Composición de la lámina "Inicio": saludo, 4 KPI con variación, ventas de la semana,
// estado de cocina, pedidos recientes, platos más vendidos e inventario en riesgo.
// Solo lee datos que la app ya consulta (pedidos, mesas, ingredientes, get_admin_metrics).
const dsvg = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const DI = {
  home:  dsvg('M3 11l9-8 9 8M5 10v10h14V10'),
  chart: dsvg('M4 20V10M10 20V4M16 20v-8M22 20H2'),
  cart:  dsvg('M3 4h2l2.4 11h11L21 7H6M9 20h.01M18 20h.01'),
  table: dsvg('M3 5h18v3H3zM6 8v12M18 8v12M9 13h6'),
  bell:  dsvg('M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0'),
}

const sumarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diaBogota = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const diaCorto = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
const DASH_PAGE = 1000

interface VentasSemana { hoy: number; ayer: number; nHoy: number; nAyer: number; dias: { etiqueta: string; valor: number }[]; platos: ProductTotal[] }
type PedidoReciente = Pick<SaleOrder, 'id' | 'order_number_today' | 'table_num' | 'customer_name' | 'tipo_pedido' | 'items' | 'created_at'> & { status: string }
interface Riesgo { nombre: string; stock: number; minimo: number; unidad: string | null }
interface MesasResumen { total: number; ocupadas: number }

const ESTADO_PEDIDO: Record<string, { label: string; tone: Tone }> = {
  pending:   { label: 'Pendiente',      tone: 'warning' },
  cooking:   { label: 'En preparación', tone: 'info' },
  ready:     { label: 'Listo',          tone: 'success' },
  completed: { label: 'Completado',     tone: 'neutral' },
}

/** Variación contra ayer. Sin ayer con la que comparar no se muestra nada (no se inventa). */
function Variacion({ actual, previo }: { actual: number; previo: number }) {
  if (previo <= 0) return null
  const pct = Math.round(((actual - previo) / previo) * 100)
  const sube = pct >= 0
  return (
    <span className="ml-1.5 whitespace-nowrap text-[length:var(--w-fs-caption)] font-semibold"
      style={{ color: sube ? 'var(--w-success-text)' : 'var(--w-danger-text)' }}>
      {sube ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

/** Línea con área en SVG puro (mismo criterio que VentasView: sin librerías). */
function LineaVentas({ dias }: { dias: { etiqueta: string; valor: number }[] }) {
  const W = 300, H = 110
  const max = Math.max(...dias.map(d => d.valor), 1)
  const x = (i: number) => (dias.length > 1 ? (i / (dias.length - 1)) * W : W / 2)
  const y = (v: number) => H - 4 - (v / max) * (H - 12)
  const linea = dias.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.valor).toFixed(1)}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 150 }} role="img"
        aria-label={`Ventas de la semana: ${dias.map(d => `${d.etiqueta} ${formatCOP(d.valor)}`).join(', ')}`}>
        <defs>
          <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--w-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--w-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={4 + f * (H - 12)} y2={4 + f * (H - 12)} stroke="var(--w-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={`${linea} L${W} ${H} L0 ${H} Z`} fill="url(#dash-area)" />
        <path d={linea} fill="none" stroke="var(--w-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {dias.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.valor)} r="6" fill="transparent"><title>{`${d.etiqueta}: ${formatCOP(d.valor)}`}</title></circle>)}
      </svg>
      <div className="mt-1 flex justify-between text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
        {dias.map((d, i) => <span key={i}>{d.etiqueta}</span>)}
      </div>
    </div>
  )
}

/** Anillo de estado de cocina: en preparación / listos / pendientes. */
function AnilloCocina({ cooking, ready, pending }: { cooking: number; ready: number; pending: number }) {
  const total = cooking + ready + pending
  const partes = [
    { n: cooking, c: 'var(--w-accent)' }, { n: ready, c: 'var(--w-success)' }, { n: pending, c: 'var(--w-warning)' },
  ]
  let acum = 0
  return (
    <div className="relative mx-auto h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--w-surface-sunken)" strokeWidth="4" />
        {total > 0 && partes.map((p, i) => {
          const len = (p.n / total) * 100
          const el = p.n > 0 ? <circle key={i} cx="18" cy="18" r="15.9155" fill="none" stroke={p.c} strokeWidth="4"
            strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-acum} /> : null
          acum += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bold leading-none text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-kpi)' }}>{cooking}</span>
        <span className="mt-1 px-4 text-[length:var(--w-fs-caption)] leading-tight text-[color:var(--w-text-3)]">en preparación</span>
      </div>
    </div>
  )
}

const AdminDashboard = memo(({ profile, onNavigate }: {
  profile: Profile
  onNavigate: (v: NavView) => void
}) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [ventas, setVentas] = useState<VentasSemana | null>(null)
  const [recientes, setRecientes] = useState<PedidoReciente[]>([])
  const [riesgo, setRiesgo] = useState<Riesgo[]>([])
  const [mesas, setMesas] = useState<MesasResumen | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [tab, setTab] = useState<'orders'|'tables'|'tasks'|'qr'>('orders')

  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_metrics')
      if (!error && data) setMetrics(data)
    } finally { setLoading(false) }
  }, [])

  // Ventas de 7 días con las mismas reglas del corte (pagados, hora Colombia, sin Rappi).
  const cargarVentas = useCallback(async () => {
    const hoy = hoyBogota()
    const desde = sumarDias(hoy, -6)
    const todos: SaleOrder[] = []
    for (let ini = 0; ; ini += DASH_PAGE) {
      const { data, error } = await supabase.from('orders')
        .select('id, order_number_today, user_id, table_num, customer_name, items, total, tipo_pedido, payment_method, propina, paid_at, created_at, notes')
        .eq('status', 'completed').gte('paid_at', dayBoundsBogota(desde).from).lt('paid_at', dayBoundsBogota(hoy).to)
        .order('paid_at', { ascending: false }).range(ini, ini + DASH_PAGE - 1)
      if (error) throw error
      todos.push(...(data ?? []).map(o => ({ ...o, items: parseItems(o.items) }) as SaleOrder))
      if (!data || data.length < DASH_PAGE) break
    }
    for (let i = 0; i < todos.length; i += 200) {
      const lote = todos.slice(i, i + 200)
      const { data: pagos } = await supabase.from('order_payments')
        .select('order_id, payment_method, monto').is('anulado_at', null).in('order_id', lote.map(o => o.id))
      const por = new Map<string, { payment_method: string; monto: number }[]>()
      for (const p of pagos ?? []) {
        const a = por.get(p.order_id as string) ?? []
        a.push({ payment_method: p.payment_method as string, monto: Number(p.monto) })
        por.set(p.order_id as string, a)
      }
      for (const o of lote) o.pagos = por.get(o.id)
    }
    const porDia = new Map<string, { total: number; n: number }>()
    for (const o of todos) {
      if (esRappi(o) || !o.paid_at) continue
      const d = diaBogota(o.paid_at)
      const a = porDia.get(d) ?? { total: 0, n: 0 }
      a.total += summarize([o]).total; a.n += 1
      porDia.set(d, a)
    }
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i))
    const ayer = porDia.get(sumarDias(hoy, -1))
    const dHoy = porDia.get(hoy)
    setVentas({
      hoy: dHoy?.total ?? 0, nHoy: dHoy?.n ?? 0, ayer: ayer?.total ?? 0, nAyer: ayer?.n ?? 0,
      dias: dias.map(d => ({ etiqueta: diaCorto(d), valor: porDia.get(d)?.total ?? 0 })),
      platos: productTotals(todos).slice(0, 4),
    })
  }, [])

  const cargarResto = useCallback(async () => {
    const hoy = hoyBogota()
    const [rec, ing, mes] = await Promise.all([
      supabase.from('orders').select('id, order_number_today, table_num, customer_name, tipo_pedido, items, status, created_at')
        .gte('created_at', dayBoundsBogota(hoy).from).order('created_at', { ascending: false }).limit(5),
      supabase.from('ingredientes').select('nombre, stock_actual, stock_minimo, unidad_medida'),
      supabase.from('mesas').select('estado').eq('activa', true),
    ])
    if (!rec.error) setRecientes((rec.data ?? []).map(o => ({ ...o, items: parseItems(o.items) }) as PedidoReciente))
    if (!ing.error) {
      setRiesgo((ing.data ?? [])
        .filter(i => Number(i.stock_actual) <= Number(i.stock_minimo))
        .map(i => ({ nombre: i.nombre as string, stock: Number(i.stock_actual), minimo: Number(i.stock_minimo), unidad: (i.unidad_medida as string | null) ?? null }))
        .sort((a, b) => (a.minimo > 0 ? a.stock / a.minimo : 0) - (b.minimo > 0 ? b.stock / b.minimo : 0)))
    }
    if (!mes.error) {
      const lista = mes.data ?? []
      setMesas({ total: lista.length, ocupadas: lista.filter(m => m.estado === 'ocupada' || m.estado === 'cuenta').length })
    }
  }, [])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    try { await Promise.allSettled([fetchMetrics(), cargarVentas(), cargarResto()]) } finally { setRefrescando(false) }
  }, [fetchMetrics, cargarVentas, cargarResto])

  useEffect(() => {
    void refrescar()
    const t = setInterval(fetchMetrics, 30_000)
    const t2 = setInterval(() => { void Promise.allSettled([cargarVentas(), cargarResto()]) }, 60_000)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [refrescar, fetchMetrics, cargarVentas, cargarResto])

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'5rem 0'}}><Spin size="large"/></div>

  const fecha = (d => d.charAt(0).toUpperCase() + d.slice(1))(new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'}))
  const ventasHoy = ventas ? ventas.hoy : (metrics?.total_sales_today ?? 0)
  const pctMesas = mesas && mesas.total > 0 ? Math.round((mesas.ocupadas / mesas.total) * 100) : 0
  const cooking = metrics?.cooking_count ?? 0, ready = metrics?.ready_count ?? 0, pending = metrics?.pending_count ?? 0
  const filasCocina = [
    { target: 'card-en-cocina', label: 'En preparación', n: cooking, color: 'var(--w-accent)', nav: 'kitchen' as NavView },
    { target: 'card-listas', label: 'Listos', n: ready, color: 'var(--w-success)', nav: 'cashier' as NavView },
    { target: 'card-pendientes', label: 'Pendientes', n: pending, color: 'var(--w-warning)', nav: 'kitchen' as NavView },
    { target: 'card-completadas', label: 'Completadas hoy', n: metrics?.completed_today ?? 0, color: 'var(--w-info)', nav: 'analytics' as NavView },
  ]
  const tituloCard = 'm-0 font-bold text-[color:var(--w-text)]'
  const verMas = 'text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-accent-text)] hover:underline'

  const tabContent = tab === 'orders' ? <OrderFlow profile={profile} onOrderCreated={()=>{}} />
    : tab === 'tables' ? <TableMap profile={profile} />
    : tab === 'tasks' ? <AdminTasksView profile={profile} />
    : <QRPrintManager />

  return (
    <div className="flex flex-col gap-5 [&>header]:mb-0" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={DI.home}
        title={`¡Hola, ${profile.full_name?.split(' ')[0] ?? 'Admin'}!`}
        subtitle={`${fecha} · Aquí tienes un resumen de la actividad de tu restaurante.`}
        actions={<Button variant="secondary" onClick={() => void refrescar()} loading={refrescando}>Actualizar</Button>}
      />

      <InstallPWA />

      <section aria-label="Resumen del día" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => onNavigate('ventas')} data-resti-target="card-ventas-hoy" className="cursor-pointer text-left">
          <StatCard label="Ventas del día" icon={DI.chart}
            value={<>{formatCOP(ventasHoy)}{ventas && <Variacion actual={ventas.hoy} previo={ventas.ayer} />}</>} />
        </button>
        <button type="button" onClick={() => onNavigate('orders')} className="cursor-pointer text-left">
          <StatCard label="Pedidos realizados" tone="info" icon={DI.cart}
            value={ventas ? <>{ventas.nHoy}<Variacion actual={ventas.nHoy} previo={ventas.nAyer} /></> : (metrics?.completed_today ?? 0)} />
        </button>
        <button type="button" onClick={() => onNavigate('tables')} data-resti-target="card-mesas-activas" className="cursor-pointer text-left">
          <StatCard label="Mesas ocupadas" tone="success" icon={DI.table}
            value={<>{pctMesas}%<span className="ml-1.5 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-3)]">{mesas ? `${mesas.ocupadas}/${mesas.total}` : '0/0'}</span></>} />
        </button>
        <button type="button" onClick={() => onNavigate('inventory')} className="cursor-pointer text-left">
          <StatCard label="Alertas activas" tone={riesgo.length > 0 ? 'warning' : 'success'} icon={DI.bell} value={riesgo.length} />
        </button>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Ventas de la semana</h2>
            <button type="button" onClick={() => onNavigate('ventas')} className={verMas}>Ver ventas →</button>
          </div>
          {ventas ? <LineaVentas dias={ventas.dias} /> : <p className="m-0 text-[color:var(--w-text-3)]">Cargando ventas...</p>}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Estado de cocina</h2>
            <button type="button" onClick={() => onNavigate('kitchen')} className={verMas}>Ver detalles →</button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <AnilloCocina cooking={cooking} ready={ready} pending={pending} />
            <ul className="m-0 flex min-w-[150px] flex-1 list-none flex-col gap-1 p-0">
              {filasCocina.map(f => (
                <li key={f.target}>
                  <button type="button" onClick={() => onNavigate(f.nav)} data-resti-target={f.target}
                    className="flex min-h-[36px] w-full cursor-pointer items-center gap-2 text-left text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.color }} />
                    <span className="flex-1">{f.label}</span>
                    <span className="font-bold text-[color:var(--w-text)]">{f.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Pedidos recientes</h2>
            <button type="button" onClick={() => onNavigate('orders')} className={verMas}>Ver todos →</button>
          </div>
          {recientes.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-body)] text-[color:var(--w-text-3)]">Aún no hay pedidos hoy.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {recientes.map(o => {
                const est = ESTADO_PEDIDO[o.status] ?? { label: o.status, tone: 'neutral' as Tone }
                return (
                  <li key={o.id} className="flex min-h-[44px] items-center gap-2">
                    <span className="shrink-0 font-bold text-[color:var(--w-accent-text)] text-[length:var(--w-fs-label)]">
                      {o.order_number_today ? `#${o.order_number_today}` : '—'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">{forWhom(o)} · {itemsSummary(o.items) || 'Sin productos'}</span>
                      <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{horaCorta(o.created_at)}</span>
                    </span>
                    <Badge tone={est.tone}>{est.label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Platos más vendidos (7 días)</h2>
          {!ventas || ventas.platos.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-body)] text-[color:var(--w-text-3)]">Cuando se cobren pedidos, aquí verás los más vendidos.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {ventas.platos.map((p, i) => (
                <li key={p.producto} className="flex min-h-[44px] items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--w-accent-soft)] text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-accent-text)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[length:var(--w-fs-body)] text-[color:var(--w-text)]">{p.producto}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[length:var(--w-fs-body)] font-semibold text-[color:var(--w-text)]">{p.cantidad} uds</span>
                    <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{formatCOP(p.subtotal)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Inventario en riesgo</h2>
            <button type="button" onClick={() => onNavigate('inventory')} className={verMas}>Ver inventario →</button>
          </div>
          {riesgo.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-body)] text-[color:var(--w-text-3)]">Todo el inventario está por encima de su mínimo.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {riesgo.slice(0, 4).map(r => {
                const pct = r.minimo > 0 ? Math.max(0, Math.min(100, Math.round((r.stock / r.minimo) * 100))) : 0
                return (
                  <li key={r.nombre} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[length:var(--w-fs-body)] text-[color:var(--w-text)]">{r.nombre}</span>
                      <Badge tone={r.stock <= 0 ? 'danger' : 'warning'}>{r.stock <= 0 ? 'Agotado' : 'Stock bajo'}</Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--w-surface-sunken)]" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.stock <= 0 ? 'var(--w-danger)' : 'var(--w-warning)' }} />
                    </div>
                    <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Quedan {r.stock}{r.unidad ? ` ${r.unidad}` : ''} · mínimo {r.minimo}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className={tituloCard} style={{ fontSize: 'var(--w-fs-title)' }}>Acciones rápidas</h2>
        <div style={{overflowX:'auto'}}>
          <UiTabs label="Secciones de inicio" value={tab} onChange={setTab} items={[
            { key:'orders', label:'Nueva orden' },
            { key:'tables', label:'Mesas' },
            { key:'tasks',  label:'Tareas' },
            { key:'qr',     label:'Imprimir QR' },
          ]} />
        </div>
        <div data-resti-target={tab === 'orders' ? 'tab-nueva-orden' : tab === 'tables' ? 'tab-mesas' : undefined}>{tabContent}</div>
      </Card>
    </div>
  )
})
AdminDashboard.displayName = 'AdminDashboard'

// ── Modal obligatorio: cambiar contraseña temporal en el primer login ──
const ForcePasswordChangeModal = ({ onDone }: { onDone: () => void }) => {
  const [pw1, setPw1]         = useState('')
  const [pw2, setPw2]         = useState('')
  const [err, setErr]         = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    setErr(null)
    if (pw1.trim().length < 8) { setErr('La contraseña debe tener al menos 8 caracteres'); return }
    if (pw1 !== pw2) { setErr('Las contraseñas no coinciden'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('change_my_password', { p_new_password: pw1.trim() })
      if (error) throw error
      message.success('Contraseña actualizada')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar la contraseña')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(20,20,30,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
      <div style={{ width:'100%', maxWidth:400, borderRadius:'1.25rem', padding:'1.75rem', background:'var(--w-surface)', border:'1px solid var(--w-line)', boxShadow:'var(--w-shadow-md)', fontFamily:'var(--w-sans)' }}>
        <h3 style={{ margin:'0 0 0.5rem', fontWeight:700, fontSize:'1.125rem', color:'var(--w-ink)' }}>Configura tu contraseña</h3>
        <p style={{ margin:'0 0 1.25rem', fontSize:'0.8125rem', color:'var(--w-ink-mut)' }}>
          Tu cuenta se creó con una contraseña temporal. Por seguridad, elige una nueva antes de continuar.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <input type="password" placeholder="Nueva contraseña (mínimo 8 caracteres)" value={pw1}
            onChange={e => setPw1(e.target.value)}
            style={{ width:'100%', padding:'0.75rem 1rem', borderRadius:'0.75rem', border:'1px solid var(--w-line)', outline:'none', fontSize:'0.875rem', color:'var(--w-ink)', background:'var(--w-bg)', boxSizing:'border-box' }} />
          <input type="password" placeholder="Confirma la nueva contraseña" value={pw2}
            onChange={e => setPw2(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{ width:'100%', padding:'0.75rem 1rem', borderRadius:'0.75rem', border:'1px solid var(--w-line)', outline:'none', fontSize:'0.875rem', color:'var(--w-ink)', background:'var(--w-bg)', boxSizing:'border-box' }} />
        </div>
        {err && <p style={{ color:'#d33', fontSize:'0.8125rem', margin:'0.75rem 0 0' }}>{err}</p>}
        <button onClick={handleSave} disabled={saving}
          style={{ width:'100%', marginTop:'1.25rem', padding:'0.75rem', borderRadius:'1rem', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.875rem', background:'var(--w-terra, #d97757)', color:'#fff', opacity:saving?0.7:1 }}>
          {saving ? 'Guardando...' : 'Guardar y continuar'}
        </button>
      </div>
    </div>
  )
}

// ── Inventario: pestañas en píldora ─────────────────────────────
const InventoryView = () => {
  const [t, setT] = useState('i')
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'var(--w-s-4)'}}>
      <div style={{overflowX:'auto'}}>
        <UiTabs label="Inventario" value={t} onChange={setT} items={[
          { key:'i', label:'Ingredientes' },
          { key:'c', label:'Lista de compras' },
          { key:'r', label:'Recetas' },
        ]} />
      </div>
      {t === 'i' ? <IngredientesManager /> : t === 'c' ? <ShoppingList /> : <RecipeBuilder />}
    </div>
  )
}

// ── Dashboard Principal ─────────────────────────────────────────
interface DashboardProps { onLogout: () => void }

export default function Dashboard({ onLogout }: DashboardProps) {
  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [activeNav,  setActiveNav]  = useState<NavView>('dashboard')
  const [loading,    setLoading]    = useState(true)
  // 'red' = falló la conexión (no se toca la sesión); 'sin-sesion' = Supabase confirmó que ya no hay sesión
  const [fallo,      setFallo]      = useState<'red' | 'sin-sesion' | null>(null)
  const [intento,    setIntento]    = useState(0)
  // Cocina: pantalla completa para TV (sin barra lateral ni botones); "Menú" vuelve a mostrarlos.
  const [kitchenMenu, setKitchenMenu] = useState(false)
  useEffect(() => { if (activeNav === 'kitchen') setKitchenMenu(false) }, [activeNav])
  // En celular cocina conserva la barra superior (logo, campana, tema, menú, salir): la pantalla completa es solo para TV.
  // Asistente de configuración: solo el admin de un restaurante nuevo (onboarding_completed_at nulo).
  const [wizardPending, setWizardPending] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [isPhone, setIsPhone] = useState(() => window.innerWidth < 900)
  useEffect(() => {
    const on = () => setIsPhone(window.innerWidth < 900)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  useEffect(() => {
    if (profile?.role !== 'admin') return
    supabase.from('restaurant_config').select('onboarding_completed_at').maybeSingle().then(({ data }) => {
      if (!data || data.onboarding_completed_at) return
      setWizardPending(true)
      try { if (!sessionStorage.getItem('wizard_cerrado')) setWizardOpen(true) } catch { setWizardOpen(true) }
    })
  }, [profile?.role])
  // Resti (módulo B): solo si el restaurante lo tiene encendido (modules_enabled.resti_agent). Apagado por defecto.
  const [restiOn, setRestiOn] = useState(false)
  useEffect(() => {
    if (profile?.role !== 'admin') return
    supabase.from('restaurant_config').select('modules_enabled').maybeSingle().then(({ data }) => {
      setRestiOn((data?.modules_enabled as { resti_agent?: unknown } | null)?.resti_agent === true)
    })
  }, [profile?.role])
  // Degradados: la app es plana salvo en los restaurantes que lo encienden en Marca (modules_enabled.degradados).
  useEffect(() => {
    if (!profile) return
    supabase.from('restaurant_config').select('modules_enabled').maybeSingle().then(({ data }) => aplicarDegradados(degradadosDe(data?.modules_enabled), coloresDe(data?.modules_enabled)))
    return () => { aplicarDegradados(false) }
  }, [profile?.id])
  // Pasos del asistente ya hechos (para el aviso "X de 8 pasos"); se vuelve a leer cada vez que se cierra el asistente.
  const [wizardHechos, setWizardHechos] = useState(0)
  useEffect(() => {
    if (profile?.role !== 'admin' || wizardOpen) return
    supabase.from('restaurant_onboarding').select('steps_done').maybeSingle().then(({ data }) => {
      const sd = (data?.steps_done ?? {}) as Record<string, boolean>
      setWizardHechos(Object.entries(sd).filter(([k, v]) => k !== 'v2' && v === true && Number(k) < 9).length)
    })
  }, [profile?.role, wizardOpen])
  const [brand,      setBrand]      = useState<{ name?: string; logo?: string }>({})
  const [lowStock,   setLowStock]   = useState(0)
  const [pendingSocial, setPendingSocial] = useState(0)
  const [opinionesListas, setOpinionesListas] = useState(0)
  const [voiceCmdOpen, setVoiceCmdOpen] = useState(false)
  const [voiceCmdTexto, setVoiceCmdTexto] = useState<string | undefined>(undefined)   // lo que el administrador le dijo a Resti
  const [refreshKey,   setRefreshKey]   = useState(0)
  const { theme, setTheme } = useTheme()

  // Aviso de stock bajo: cuenta ingredientes por debajo de su mínimo (lo define
  // el admin en Inventario) y lo muestra como insignia sobre "Inventario".
  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    let cancelled = false
    const check = () => supabase.from('ingredientes').select('stock_actual, stock_minimo')
      .then(({ data }) => {
        if (cancelled || !data) return
        setLowStock(data.filter(i => Number(i.stock_actual) <= Number(i.stock_minimo)).length)
      })
    check()
    const channel = supabase.channel('low-stock-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredientes' }, check)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [profile])

  // Aviso de reseñas por aprobar / comentarios reportados, sobre "Menú".
  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    let cancelled = false
    const check = () => Promise.all([
      supabase.from('resenas_platos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('comentarios_platos').select('id', { count: 'exact', head: true }).eq('estado', 'visible').gt('reportado_count', 0),
    ]).then(([r, c]) => {
      if (cancelled) return
      setPendingSocial((r.count ?? 0) + (c.count ?? 0))
    })
    check()
    const channel = supabase.channel('menu-social-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resenas_platos' }, check)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios_platos' }, check)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [profile])

  // Aviso de sugerencias terminadas: cuenta las que pasaron a "hecho" y el restaurante aún no ha visto, sobre "Opinión".
  useEffect(() => {
    if (!profile || !['admin', 'cashier', 'waiter', 'kitchen'].includes(profile.role)) return
    let cancelled = false
    supabase.from('feedback_items').select('id', { count: 'exact', head: true }).eq('estado', 'hecho').is('cierre_visto_at', null)
      .then(({ count }) => { if (!cancelled) setOpinionesListas(count ?? 0) })
    return () => { cancelled = true }
  }, [profile, activeNav])

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

  // Actualizar el encabezado al instante cuando el admin cambia la marca
  useEffect(() => {
    const onBrand = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}
      setBrand(b => ({ name: d.name ?? b.name, logo: d.logo ?? b.logo }))
      if (d.color) applyBranding(d.color)
    }
    window.addEventListener('branding-updated', onBrand)
    return () => window.removeEventListener('branding-updated', onBrand)
  }, [])

  useEffect(() => {
    // Variable local — cada ejecución del efecto tiene su propio 'active'
    let active = true

    const load = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (!user) {
          // Un fallo de red/servidor NO es "sin sesión": cerrar sesión aquí borraba el login por una caída de señal.
          if (active) setFallo(authError?.name === 'AuthRetryableFetchError' ? 'red' : 'sin-sesion')
          return
        }

        let { data: prof, error } = await supabase
          .from('profiles').select('*').eq('id', user.id).single()

        if (error && error.code !== 'PGRST116') { if (active) setFallo('red'); return }
        if (error?.code === 'PGRST116') {
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
            super_admin:'platform', admin:'dashboard', waiter:'orders', kitchen:'kitchen', cashier:'cashier', client:'menu'
          }
          startTransition(() => setActiveNav(defaults[prof!.role as Role] ?? 'orders'))
        }
      } catch (e) {
        console.error('Dashboard load:', e)
        if (active) setFallo('red')
      } finally {
        if (active) setLoading(false)
      }
    }
    setFallo(null); setLoading(true)
    load()
    return () => { active = false }
  }, [intento])

  // Redirigir si no-admin aterriza en 'dashboard'
  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin' && activeNav === 'dashboard') {
      const defaults: Record<string, NavView> = {
        super_admin:'platform', waiter:'orders', kitchen:'kitchen', cashier:'cashier', client:'menu'
      }
      const target = defaults[profile.role]
      if (target) startTransition(() => setActiveNav(target))
    }
  }, [profile, activeNav])

  // signOut en useEffect — NUNCA durante el render
  useEffect(() => {
    if (!loading && !profile && fallo === 'sin-sesion') {
      supabase.auth.signOut().then(() => onLogout())
    }
  }, [loading, profile, fallo, onLogout])

  const renderContent = () => {
    if (!profile) return null
    switch (activeNav) {
      case 'dashboard': return profile.role === 'admin'
        ? <AdminDashboard profile={profile} onNavigate={setActiveNav} />
        : null
      case 'orders':    return <OrderFlow profile={profile} />
      case 'tables':    return <TableMap profile={profile} onNavigate={setActiveNav} />
      case 'kitchen':   return <KitchenBoard />
      case 'cashier':   return <CashierPanel profile={profile} />
      case 'domicilios': return profile.role === 'admin' || profile.role === 'cashier' ? <DomiciliosPanel /> : null
      case 'conversaciones': return profile.role === 'admin' || profile.role === 'cashier' ? <ConversacionesPanel /> : null
      case 'pedidos_mesa': return profile.role === 'admin' || profile.role === 'cashier' || profile.role === 'waiter' ? <PedidosMesaPanel /> : null
      case 'campanas': return profile.role === 'admin' || profile.role === 'cashier' ? <CampanasPanel rol={profile.role} /> : null
      case 'arm': return profile.role === 'admin' ? <ArmPanel /> : null
      case 'fidelidad_config': return profile.role === 'admin' ? <FidelidadConfig /> : null
      case 'tasks':     return profile.role === 'admin'
        ? <AdminTasksView profile={profile} />
        : <EmployeeTasksView profile={profile} />
      case 'shifts':    return <MyShifts profile={profile} />
      case 'inventory': return <InventoryView />
      case 'analytics': return <BusinessAssistant />
      case 'ventas':    return profile.role === 'admin' ? <VentasView /> : null
      case 'team':      return <TeamManager />
      case 'menu':      return profile.role === 'admin' ? <MenuManager /> : <ClientMenuSection />
      case 'menu_gestion': return <MenuAvailability />
      case 'menu_listas':  return <OptionListsSection />
      case 'proveedores':  return <Proveedores canEdit={profile.role === 'admin'} />
      case 'facturas':     return profile.role === 'admin' || profile.role === 'cashier' ? <Facturas profile={profile} /> : null
      case 'fidelizacion': return profile.role === 'admin' || profile.role === 'cashier' || profile.role === 'waiter' ? <FidelizacionView rol={profile.role} /> : null
      case 'opinion':   return ['admin', 'cashier', 'waiter', 'kitchen'].includes(profile.role) ? <OpinionSection /> : null
      case 'impresion': return profile.role === 'admin' ? <ImpresionConfig /> : null
      case 'setup':     return profile.role === 'admin' ? <ConfiguracionGuiada onAbrir={() => setWizardOpen(true)} /> : null
      case 'config':    return profile.role === 'admin' ? <ConfigHub onNavigate={v => setActiveNav(v as NavView)} visibles={['branding', 'impresion', 'whatsapp', 'fidelidad_config', 'setup', 'billing']} /> : null
      case 'whatsapp':  return profile.role === 'admin' ? <WhatsAppConfig /> : null
      case 'branding':  return <BrandingManager />
      case 'billing':   return <SubscriptionPanel />
      case 'platform':  return profile.role === 'super_admin' ? <MfaGate><PlatformPanel /></MfaGate> : null
      default:          return null
    }
  }

  if (loading) return (
    <div style={{minHeight:'100vh',background:'var(--w-bg)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:'1.25rem',overflow:'hidden',margin:'0 auto 1rem',border:'1px solid var(--w-line)',...S.md}}>
          <img src="/brand/logo-oficial.png" alt="logo" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} />
        </div>
        <Spin size="large" />
      </div>
    </div>
  )

  if (!loading && !profile) return (
    <div style={{minHeight:'100vh',background:'var(--w-bg)',display:'flex',flexDirection:'column',gap:'1rem',alignItems:'center',justifyContent:'center'}}>
      {fallo === 'red' ? (
        <>
          <p style={{color:'var(--w-terra)',fontWeight:700,fontFamily:'var(--w-sans)',margin:0,textAlign:'center',padding:'0 1rem'}}>Sin conexión. Tu sesión sigue guardada.</p>
          <button onClick={() => setIntento(n => n + 1)} style={{padding:'0.75rem 1.5rem',background:'var(--w-terra)',color:'#fff',fontWeight:700,border:'none',borderRadius:'1rem',cursor:'pointer'}}>Reintentar</button>
        </>
      ) : (
        <p style={{color:'var(--w-terra)',fontWeight:700,fontFamily:'var(--w-sans)',margin:0}}>Reiniciando sesión...</p>
      )}
    </div>
  )

  const navItems = NAV_BY_ROLE[profile!.role] ?? NAV_BY_ROLE.client
  const navActive: NavView = profile!.role === 'admin' && ['impresion', 'setup', 'branding', 'billing', 'whatsapp', 'fidelidad_config'].includes(activeNav) ? 'config' : activeNav
  const hasSounds =['admin', 'cashier', 'kitchen', 'waiter'].includes(profile!.role)

  const chromeBtn: React.CSSProperties = {
    padding:'0.5rem', minWidth:40, minHeight:40, background:'var(--w-surface)', borderRadius:'0.75rem',
    border:'1px solid var(--w-line)', color:'var(--w-ink-soft)', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
  }

  if (profile!.role === 'kitchen' && activeNav === 'kitchen' && !kitchenMenu && !isPhone) {
    return (
      <div style={{minHeight:'100vh',background:'var(--w-bg)'}}>
        {profile!.must_change_password && (
          <ForcePasswordChangeModal onDone={() => setProfile(p => p ? { ...p, must_change_password: false } : p)} />
        )}
        <OrderSoundAlerts role={profile!.role} userId={profile!.id} />
        <EstacionImpresion />
        <KitchenBoard tv onMenu={() => setKitchenMenu(true)} onLogout={onLogout} />
      </div>
    )
  }

  return (
    <div className="ros-ambient" style={{minHeight:'100vh',background:'var(--w-bg)',fontFamily:'var(--w-sans)'}}>

      {profile!.must_change_password && (
        <ForcePasswordChangeModal onDone={() => setProfile(p => p ? { ...p, must_change_password: false } : p)} />
      )}

      {wizardOpen && (
        <SetupWizard
          onClose={ir => {
            try { sessionStorage.setItem('wizard_cerrado', '1') } catch { /* sin almacenamiento: se reabre en la próxima visita */ }
            setWizardOpen(false)
            if (ir) setActiveNav(ir)
          }}
          onFinished={() => { setWizardOpen(false); setWizardPending(false) }}
        />
      )}

      {/* Notificaciones pedido listo — mesero (solo lo suyo) y admin (todo) */}
      {(profile!.role === 'waiter' || profile!.role === 'admin') && (
        <WaiterNotifications />
      )}

      {/* Sonido por tipo de pedido: cocina (pedido para preparar) y caja/admin (pedido nuevo) */}
      <OrderSoundAlerts role={profile!.role} userId={profile!.id} />
      {['admin', 'cashier', 'kitchen'].includes(profile!.role) && <EstacionImpresion />}
      {hasSounds && <SoundUnlockBanner />}

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start'}}>
      <div style={{flex:1,minWidth:0}}>
      <TopBar<NavView> phone={isPhone} items={navItems} onSelect={setActiveNav}
        onMenu={() => setMoreOpen(true)}>
        {profile!.role === 'admin' && <SedeSelector style={{ ...chromeBtn, width: 'auto', padding: '0 0.5rem', maxWidth: 140 }} />}
        {!isPhone && <InstallPWA compact />}
        {hasSounds && !isPhone && <SoundTestButton style={chromeBtn} />}
        {profile!.role === 'admin' && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={chromeBtn}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
            {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
          </button>
        )}
        {isPhone && (
          <button onClick={onLogout} style={chromeBtn} title="Cerrar sesión">
            <Icons.Logout />
          </button>
        )}
      </TopBar>

      {/* Layout */}
      <div style={{display:'flex',alignItems:'flex-start'}}>
        <main style={{flex:1,padding:'1.25rem 1.25rem 7rem',overflowX:'clip',minWidth:0}}>
          {profile?.role === 'admin' && activeNav !== 'billing' && <SubscriptionBanner onNavigate={setActiveNav} />}
          {wizardPending && !wizardOpen && (
            <button onClick={() => setWizardOpen(true)} style={{
              width:'100%', marginBottom:'1rem', padding:'0.875rem 1rem', borderRadius:'1rem', cursor:'pointer', textAlign:'left',
              border:'1px solid var(--w-terra)', background:'var(--w-surface)', color:'var(--w-ink)', fontFamily:'var(--w-sans)', fontWeight:700, minHeight:'2.75rem',
            }}>
              Completa la configuración de tu restaurante ({wizardHechos} de 8 pasos) → continuar
            </button>
          )}
          {/* La key re-monta la sección activa tras un comando de voz para que muestre los datos nuevos */}
          <div key={refreshKey}>{renderContent()}</div>
          <div style={{height:'2rem'}} />
        </main>
      </div>
      </div>
      </div>

      <MobileNav<NavView>
        items={navItems}
        active={navActive}
        onSelect={setActiveNav}
        open={moreOpen}
        setOpen={setMoreOpen}
        footer={<button type="button" onClick={onLogout} style={{ minHeight: 48, borderRadius: 'var(--w-r-lg)', border: '1px solid var(--w-border)', background: 'transparent', color: 'var(--w-text)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Cerrar sesión</button>}
        badges={{ inventory: lowStock, menu: pendingSocial, opinion: opinionesListas }}
      />

      <style>{`@keyframes rs{to{transform:rotate(360deg)}}`}</style>
      {restiOn && profile!.role === 'admin'
        // Resti no aparece en caja, cocina, mesero (nueva orden), pagos ni en el panel de plataforma.
        ? (['cashier', 'kitchen', 'orders', 'billing', 'platform'].includes(activeNav) ? null : <Resti userId={profile!.id} role="admin" onApplied={() => { void queryClient.invalidateQueries(); setRefreshKey(k => k + 1) }} onOpenVoiceCommands={t => { setVoiceCmdTexto(t); setVoiceCmdOpen(true) }} onGoHome={() => setActiveNav('dashboard')} />)
        : (activeNav === 'orders' ? null /* en Nueva orden el lugar es del carrito */ : <SupportChat modo={['admin', 'cashier', 'waiter', 'kitchen'].includes(profile!.role) ? 'opinion' : 'soporte'} pantalla={activeNav} />)}
      {(profile?.role === 'admin' || profile?.role === 'cashier') && !(restiOn && profile.role === 'admin') && activeNav !== 'orders' && (
        <VoiceCommandFab onClick={() => { setVoiceCmdTexto(undefined); setVoiceCmdOpen(true) }} />
      )}
      {voiceCmdOpen && (profile?.role === 'admin' || profile?.role === 'cashier') && (
        <VoiceCommandModal
          userId={profile.id}
          role={profile.role}
          textoInicial={voiceCmdTexto}
          onClose={() => { setVoiceCmdOpen(false); setVoiceCmdTexto(undefined) }}
          onApplied={() => { void queryClient.invalidateQueries(); setRefreshKey(k => k + 1) }} />
      )}
    </div>
  )
}
