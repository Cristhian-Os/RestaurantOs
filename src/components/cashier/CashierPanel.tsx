/**
 * CashierPanel.tsx
 * ─────────────────────────────────────────────────────────────
 * Panel completo de caja:
 *  • Órdenes listas para cobrar con Realtime
 *  • Modal de cobro: efectivo (con cambio) o transferencia
 *  • Base de caja del día (efectivo inicial del cajón)
 *  • Resumen del día (sin Rappi: sus precios no son los del menú)
 *  • Corte de caja diario y mensual
 */
import { destinoPedido } from '../../lib/destino'
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { descargarCorteExcel, descargarCorteMensualExcel, type CorteProducto, type CortePago } from '../../services/corteExcel'
import { SplitPayModal } from './SplitPayModal'
import { COLA_CAMBIO, enviarPagosPendientes, iniciarEnvioDePagos, listarPagosPendientes, type PagoPendiente } from '../../services/paymentQueue'
import { PagosDelDia, ventanaHoy } from './PagosDelDia'
import { pushNotificationService } from '../../services/pushNotificationService'
import { hoyBogota } from '../../services/menuOptions'
import { VoiceButton } from '../VoiceButton'
import { matchName } from '../../services/voiceMatch'
import { EditOrderModal, type OrderItemRow } from '../orders/EditOrderModal'
import { SalesHistory } from './SalesHistory'
import { TicketModal } from '../print/TicketModal'
import { cargarConfig } from '../../lib/print/config'
import { armarCierre, type TicketListo } from '../../lib/print/datos'
import { GastosDesglose } from './GastosDesglose'
import { CategoriasGastoEditor } from './CategoriasGastoEditor'
import { useCategoriasGasto } from '../../hooks/useCategoriasGasto'
import { CATEGORIA_DEFECTO, categoriaLabel, rangoGastosBogota } from '../../services/gastosResumen'
import message from 'antd/es/message'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { limpiarTranscripcion } from '../../services/voiceText'
import type { Profile } from '../../pages/Dashboard'

const FX = {
  card:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  soft:  { boxShadow: 'var(--w-shadow-sm)' },
  field: { border: '1px solid var(--w-border)' },
  cta:   { boxShadow: 'var(--w-shadow-terra)' },
} as const

const svg = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const IC = {
  cash: svg('M2 6h20v12H2zM12 9a3 3 0 100 6 3 3 0 000-6z'),
  card: svg('M2 5h20v14H2zM2 10h20'),
  star: svg('M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 17.8 5.7 21.2 7 14.2 2 9.4l7-.9z'),
  up:   svg('M12 19V5M5 12l7-7 7 7'),
  down: svg('M12 5v14M19 12l-7 7-7-7'),
}

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

interface Order {
  id:         string
  user_id:    string | null
  order_number_today?: number | null
  mesa_id:    string | null
  table_num:  number | null
  customer_name: string | null
  items:      OrderItemRow[]
  total:      number
  status:     string
  tipo_pedido:string
  notes:      string | null
  created_at: string
  delivered_at: string | null
  paid_at:        string | null
  payment_method: string | null
  amount_paid:    number | null
  propina:        number | null
}

interface DaySummary {
  total_efectivo:     number
  total_transferencia:number
  total_tarjeta:      number
  total_ordenes:      number
  total_propinas:     number
  ordenes_rappi:      number   // solo conteo: el dinero lo paga Rappi por fuera
}

interface CorteMensual {
  mes: string; desde: string; hasta: string
  total_efectivo: number; total_transferencia: number; total_tarjeta?: number; total_general: number
  total_ordenes: number; total_propinas: number; total_gastos: number; total_neto: number
  dias: { fecha: string; efectivo: number; transferencia: number; tarjeta?: number; total: number; ordenes: number; gastos: number }[]
}

const fmt = (n: number | string | null | undefined) => '$' + Math.round(Number(n ?? 0)).toLocaleString('es-CO')

// Rappi no cuenta en ventas: sus precios no son los del menú físico y la
// plata la paga Rappi por fuera.
const esRappi = (o: { tipo_pedido?: string | null; payment_method?: string | null }) =>
  o.tipo_pedido === 'RAPPI' || o.payment_method === 'rappi'

// Número del pedido: secuencial del día; los anteriores a ese cambio usan el id corto.
const orderRef = (o: { id: string; order_number_today?: number | null }) =>
  `#${o.order_number_today ?? o.id.slice(0, 8)}`

const PROGRESS_STEPS = [
  { key: 'pending',   label: 'Pendiente',  color: 'var(--w-text-3)' },
  { key: 'cooking',   label: 'Cocinando',  color: 'var(--w-warning)' },
  { key: 'ready',     label: 'Listo',      color: 'var(--w-success-text)' },
  { key: 'completed', label: 'Completado', color: 'var(--w-info)' },
] as const

// Barra de etapas del pedido; se actualiza sola porque la lista se refresca por Realtime.
const OrderProgress = ({ status }: { status: string }) => {
  const idx = Math.max(0, PROGRESS_STEPS.findIndex(s => s.key === status))
  const current = PROGRESS_STEPS[idx]
  return (
    <div className="mb-3" aria-label={`Estado: ${current.label}`}>
      <div className="flex gap-1">
        {PROGRESS_STEPS.map((s, i) => (
          <div key={s.key} className="flex-1 h-2 rounded-full bg-[var(--w-surface-sunken)] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              initial={false}
              animate={{ width: i <= idx ? '100%' : '0%', backgroundColor: current.color }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
        ))}
      </div>
      <p className="text-[length:var(--w-fs-caption)] font-bold mt-1" style={{ color: current.color }}>{current.label}</p>
    </div>
  )
}

type FuenteGasto = 'caja' | 'propio' | 'transferencia' | 'tarjeta'

interface Gasto {
  id:         string
  concepto:   string
  monto:      number
  created_at: string
  fuente:     FuenteGasto
  pagado_por_nombre: string | null
  categoria:  string | null
}

// Gasto adelantado con dinero propio que aún no se le devuelve a quien lo pagó.
interface PorReembolsar { id: string; concepto: string; monto: number; pagado_por_nombre: string | null; created_at: string }

const FUENTE_LABEL: Record<FuenteGasto, string> = {
  caja: 'Efectivo de la caja', propio: 'Dinero propio de quien lo pagó', transferencia: 'Transferencia del negocio', tarjeta: 'Tarjeta del negocio',
}

interface TransferenciaDia { pago_id: string; numero: number | null; mesa: number | null; tipo: string; cliente: string | null; comensal: string | null; monto: number; referencia: string | null; verificada: boolean }
interface MesaMixta { order_id: string; numero: number | null; mesa: number | null; tipo: string; cliente: string | null; total: number; pagos: { comensal: string | null; metodo: string; monto: number; propina: number; referencia: string | null }[] }

interface IngredienteOpt { id: string; nombre: string; unidad_medida: string | null }

interface ProvItem {
  ingrediente_id:  string   // '' si no coincide con un ingrediente existente
  nombre_producto: string
  cantidad:        string
  unidad:          string
  precio_unitario: string
}

const PROV_ITEM_EMPTY: ProvItem = { ingrediente_id: '', nombre_producto: '', cantidad: '', unidad: '', precio_unitario: '' }

type PaymentMethod = 'efectivo' | 'transferencia'

// Denominaciones de billetes y monedas en circulación en Colombia (COP).
const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as const

interface CashierPanelProps { profile: Profile }

export const CashierPanel = memo<CashierPanelProps>(({ profile }) => {
  const [readyOrders,  setReady]     = useState<Order[]>([])
  const [pendingPayment, setPendingPayment] = useState<Order[]>([])
  const [cookingOrders, setCooking]  = useState<Order[]>([])
  const [daySummary,   setSummary]   = useState<DaySummary>({ total_efectivo: 0, total_transferencia: 0, total_tarjeta: 0, total_ordenes: 0, total_propinas: 0, ordenes_rappi: 0 })
  // Cobros por partes: cuánto lleva pagado cada pedido abierto, y el pedido que se está dividiendo.
  const [pagadoPorOrden, setPagadoPorOrden] = useState<Record<string, number>>({})
  const [splitOrder,    setSplitOrder]    = useState<{ order: Order; kind: 'inicial' | 'final' } | null>(null)
  const [showPagos,     setShowPagos]     = useState(false)
  const [porReembolsar, setPorReembolsar] = useState<PorReembolsar[]>([])
  const [gastoFuente,   setGastoFuente]   = useState<FuenteGasto>('caja')
  const [gastoCategoria, setGastoCategoria] = useState<string>(CATEGORIA_DEFECTO)
  const [showCategorias, setShowCategorias] = useState(false)
  // Categorías de gastos del restaurante (las edita el admin). `etiquetas` pone el nombre actual en cortes e historial.
  const { categorias, etiquetas, filas: filasCategorias, usaSugeridas, reload: recargarCategorias } = useCategoriasGasto()
  // La elegida, si sigue vigente; si no (p. ej. la quitaron), "Otros" o la primera disponible.
  const categoriaActual = categorias.some(c => c.key === gastoCategoria)
    ? gastoCategoria
    : (categorias.find(c => c.key === CATEGORIA_DEFECTO)?.key ?? categorias[0]?.key ?? '')
  const [gastoPagadoPor, setGastoPagadoPor] = useState('')
  const [aporteMonto,   setAporteMonto]   = useState('')
  const [aportePor,     setAportePor]     = useState('')
  const [transferencias, setTransferencias] = useState<TransferenciaDia[]>([])
  const [mesasMixtas,   setMesasMixtas]   = useState<MesaMixta[]>([])
  const [pagosCorte,    setPagosCorte]    = useState<CortePago[]>([])
  // Pagos guardados en este equipo por falta de internet (se envían solos al volver la conexión)
  const [colaPagos,     setColaPagos]     = useState<PagoPendiente[]>([])
  const [enviandoCola,  setEnviandoCola]  = useState(false)
  const [loading,     setLoading]   = useState(true)
  const [payingOrder,  setPayingOrder] = useState<Order | null>(null)
  const [payingKind,   setPayingKind]  = useState<'inicial' | 'final'>('final')
  const [payMethod,    setPayMethod] = useState<PaymentMethod>('efectivo')
  const [amountPaid,   setAmountPaid]= useState('')
  const [processing,   setProcessing]= useState(false)
  const [showCorte,    setShowCorte] = useState(false)
  const [corteResult,  setCorteResult] = useState<any>(null)
  const [corteProductos, setCorteProductos] = useState<CorteProducto[]>([])
  const [cortingLoading, setCortingLoading] = useState(false)
  const [gastos,        setGastos]       = useState<Gasto[]>([])
  const [showGastoForm, setShowGastoForm]= useState(false)
  const [gastoModo,     setGastoModo]    = useState<'simple' | 'proveedor'>('simple')
  const [gastoConcepto, setGastoConcepto]= useState('')
  const [gastoMonto,    setGastoMonto]   = useState('')
  const [savingGasto,   setSavingGasto]  = useState(false)
  const [ingredientesOpts, setIngredientesOpts] = useState<IngredienteOpt[]>([])
  const [provItems,     setProvItems]    = useState<ProvItem[]>([{ ...PROV_ITEM_EMPTY }])
  const [conteo,        setConteo]       = useState<Record<number, string>>({})
  const [propinaSugeridaPct, setPropinaSugeridaPct] = useState<number | null>(null)
  const [propinaInput,  setPropinaInput] = useState('')
  const [propinaRespuesta, setPropinaRespuesta] = useState<'si' | 'no' | null>(null)
  const [editingOrder,  setEditingOrder]  = useState<Order | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null)
  const [baseHoy,       setBaseHoy]       = useState<number | null>(null)
  const [baseInput,     setBaseInput]     = useState('')
  const [editandoBase,  setEditandoBase]  = useState(false)
  const [savingBase,    setSavingBase]    = useState(false)
  const [corteMensual,  setCorteMensual]  = useState<CorteMensual | null>(null)
  // Gastos del mes con su categoría: para mostrar y exportar "en qué se gastó". Si falla la carga, el corte sigue mostrando el total.
  const [gastosMes,     setGastosMes]     = useState<{ id: string; concepto: string; monto: number; categoria: string | null; created_at: string }[]>([])
  const [loadingMensual,setLoadingMensual]= useState(false)
  const [showHistory,  setShowHistory]  = useState(false)
  const [cierreTicket, setCierreTicket] = useState<TicketListo | null>(null)
  const [ticket, setTicket] = useState<{ tipo: 'precuenta' | 'recibo'; orderId: string; automatico?: boolean } | null>(null)

  // Tras un cobro completo: el recibo se ofrece o se imprime según lo configurado. Nunca estorba al cobro (si falla la config, no pasa nada).
  const reciboTrasCobro = useCallback((orderId: string) => {
    cargarConfig().then(cfg => { if (cfg.recibo !== 'nunca') setTicket({ tipo: 'recibo', orderId, automatico: cfg.recibo === 'siempre' }) }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    const inicioDia = new Date(new Date().setHours(0,0,0,0)).toISOString()
    const parseItems = (o: any): Order => ({
      ...o,
      items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
    })
    const { desde: pagosDesde, hasta: pagosHasta } = ventanaHoy()
    const [pendingRes, ordersRes, cookingRes, completedRes, gastosRes, baseRes, pagosHoyRes, reembolsarRes] = await Promise.all([
      // Plan B: pedidos recién creados (mesero o QR) esperando cobro ANTES de pasar a cocina.
      supabase.from('orders').select('*').eq('status', 'pending').is('paid_at', null).order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'ready').order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'cooking').order('created_at', { ascending: true }),
      supabase.from('orders').select('total, payment_method, propina, tipo_pedido')
        .eq('status', 'completed')
        .gte('created_at', inicioDia),
      supabase.from('gastos').select('id, concepto, monto, created_at, fuente, pagado_por_nombre, categoria')
        .gte('created_at', inicioDia).order('created_at', { ascending: false }),
      supabase.from('bases_caja').select('monto').eq('fecha', hoyBogota()).maybeSingle(),
      // El dinero del día sale de los PAGOS recibidos hoy, no del total de cada pedido.
      supabase.from('order_payments').select('payment_method, monto, propina, orders!inner(status, tipo_pedido, payment_method)')
        .is('anulado_at', null).gte('paid_at', pagosDesde).lt('paid_at', pagosHasta),
      supabase.from('gastos').select('id, concepto, monto, pagado_por_nombre, created_at')
        .eq('fuente', 'propio').is('reembolsado_at', null).order('created_at'),
    ])

    if (!pendingRes.error) setPendingPayment((pendingRes.data || []).map(parseItems))

    if (!ordersRes.error) {
      setReady((ordersRes.data || []).map(parseItems))
    }

    if (!cookingRes.error) setCooking((cookingRes.data || []).map(parseItems))

    if (!completedRes.error) {
      const all = completedRes.data || []
      const orders = all.filter(o => !esRappi(o))
      // Pagos de hoy (sin pedidos cancelados ni Rappi): efectivo, transferencia, tarjeta y propinas.
      const pagos = ((pagosHoyRes.data ?? []) as unknown as { payment_method: string; monto: number; propina: number; orders: { status: string; tipo_pedido: string; payment_method: string | null } | null }[])
        .filter(p => p.orders && p.orders.status !== 'cancelled' && !esRappi(p.orders))
      const suma = (m: string) => pagos.filter(p => p.payment_method === m).reduce((s, p) => s + Number(p.monto), 0)
      setSummary({
        ordenes_rappi:       all.length - orders.length,
        total_efectivo:      suma('efectivo'),
        total_transferencia: suma('transferencia'),
        total_tarjeta:       suma('tarjeta'),
        total_ordenes:       orders.length,
        total_propinas:      pagos.reduce((s, p) => s + Number(p.propina || 0), 0),
      })
    }

    // Cuánto lleva pagado cada pedido abierto ("Pagado 4 de 5, falta $22.000").
    const abiertos = [...(pendingRes.data ?? []), ...(ordersRes.data ?? []), ...(cookingRes.data ?? [])].map(o => o.id as string)
    if (abiertos.length > 0) {
      const { data: parciales } = await supabase.from('order_payments').select('order_id, monto')
        .is('anulado_at', null).in('order_id', abiertos)
      const mapa: Record<string, number> = {}
      for (const p of parciales ?? []) mapa[p.order_id as string] = (mapa[p.order_id as string] ?? 0) + Number(p.monto)
      setPagadoPorOrden(mapa)
    } else setPagadoPorOrden({})

    if (!reembolsarRes.error) setPorReembolsar((reembolsarRes.data ?? []) as PorReembolsar[])
    if (!gastosRes.error) setGastos((gastosRes.data ?? []) as Gasto[])
    if (!baseRes.error) setBaseHoy(baseRes.data ? Number(baseRes.data.monto) : null)

    setLoading(false)
  }, [])

  const totalGastosHoy = gastos.reduce((s, g) => s + Number(g.monto), 0)

  const handleAgregarGasto = useCallback(async () => {
    const monto = parseFloat(gastoMonto)
    if (!gastoConcepto.trim()) { message.error('Escribe el concepto del gasto'); return }
    if (!monto || monto <= 0) { message.error('Monto inválido'); return }
    if (gastoFuente === 'propio' && !gastoPagadoPor.trim()) { message.error('Escribe quién puso la plata (ej: Angela)'); return }
    setSavingGasto(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('gastos').insert({
      concepto: gastoConcepto.trim(), monto, registrado_por: user?.id ?? null,
      fuente: gastoFuente, pagado_por_nombre: gastoFuente === 'propio' ? gastoPagadoPor.trim() : null,
      categoria: categoriaActual || null,
    })
    setSavingGasto(false)
    if (error) { message.error('Error: ' + error.message); return }
    setGastoConcepto(''); setGastoMonto(''); setGastoFuente('caja'); setGastoCategoria(CATEGORIA_DEFECTO); setGastoPagadoPor(''); setShowGastoForm(false)
    message.success(gastoFuente === 'propio' ? `Gasto registrado · queda por reembolsar a ${gastoPagadoPor.trim()}` : 'Gasto registrado')
    fetchData()
  }, [gastoConcepto, gastoMonto, gastoFuente, categoriaActual, gastoPagadoPor, fetchData])

  // Cola de pagos sin internet: leerla, enviarla al volver la red y refrescar caja cuando se envíe algo.
  const recargarCola = useCallback(async () => {
    try { setColaPagos(await listarPagosPendientes()) } catch { setColaPagos([]) }
  }, [])
  const enviarCola = useCallback(async () => {
    setEnviandoCola(true)
    const r = await enviarPagosPendientes()
    setEnviandoCola(false)
    if (r.enviados > 0) message.success(`${r.enviados} pago(s) enviados`)
    if (r.conflictos > 0) message.error(`${r.conflictos} pago(s) rechazados por el servidor: revísalos`)
    if (r.faltan > 0 && r.enviados === 0 && r.conflictos === 0) message.warning('Todavía no hay conexión')
    fetchData()
  }, [fetchData])
  useEffect(() => {
    void recargarCola()
    window.addEventListener(COLA_CAMBIO, recargarCola)
    iniciarEnvioDePagos(r => {
      if (r.enviados > 0) message.success(`${r.enviados} pago(s) guardados sin internet ya se enviaron`)
      if (r.conflictos > 0) message.error(`${r.conflictos} pago(s) rechazados por el servidor: revísalos`)
      fetchData()
    })
    if (navigator.onLine) void enviarPagosPendientes().then(() => { void recargarCola(); fetchData() })   // restos de una sesión anterior
    return () => window.removeEventListener(COLA_CAMBIO, recargarCola)
  }, [recargarCola, fetchData])

  // Devolver la plata a quien adelantó un gasto: con efectivo de la caja (resta del cajón hoy) o por transferencia.
  const handleReembolsar = useCallback(async (g: PorReembolsar, medio: 'caja' | 'transferencia') => {
    const { error } = await supabase.rpc('reembolsar_gasto', { p_gasto_id: g.id, p_medio: medio })
    if (error) { message.error(error.message); return }
    message.success(`Reembolsado a ${g.pagado_por_nombre ?? 'quien lo pagó'}${medio === 'caja' ? ' · sale del efectivo de la caja' : ''}`)
    fetchData()
  }, [fetchData])

  // Aporte a la caja: si la base no alcanzó y alguien pone más efectivo, el efectivo esperado lo suma.
  const handleAporte = useCallback(async () => {
    const monto = parseFloat(aporteMonto)
    if (!monto || monto <= 0) { message.error('Escribe cuánto efectivo se puso'); return }
    const { error } = await supabase.rpc('registrar_aporte_caja', { p_monto: monto, p_aportado_por: aportePor.trim() || null })
    if (error) { message.error(error.message); return }
    setAporteMonto(''); setAportePor('')
    message.success('Aporte registrado: suma al efectivo esperado de la caja')
  }, [aporteMonto, aportePor])

  // Ingredientes existentes, para vincular cada producto de la compra a su stock
  const loadIngredientes = useCallback(() => {
    supabase.from('ingredientes').select('id, nombre, unidad_medida').order('nombre')
      .then(({ data }) => setIngredientesOpts(data ?? []))
  }, [])
  useEffect(() => { loadIngredientes() }, [loadIngredientes])

  // % de propina sugerida configurado en Marca, para prellenar el campo de propina
  useEffect(() => {
    supabase.from('restaurant_config').select('propina_sugerida_pct').maybeSingle()
      .then(({ data }) => setPropinaSugeridaPct(data?.propina_sugerida_pct ?? null))
  }, [])

  const updateProvItem = useCallback((idx: number, patch: Partial<ProvItem>) => {
    setProvItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }, [])

  // Compra dictada: llena proveedor y productos; todo queda editable antes de guardar.
  const fillPurchaseFromVoice = useCallback((r: { concepto?: string; items: { nombre_producto: string; cantidad: number; unidad?: string; precio_unitario: number }[] }) => {
    if (!r.items?.length) { message.warning('No entendí ningún producto'); return }
    if (r.concepto) setGastoConcepto(r.concepto)
    setProvItems(r.items.map(it => {
      const ing = matchName(it.nombre_producto, ingredientesOpts, o => o.nombre)
      return {
        ingrediente_id:  ing?.id ?? '',
        nombre_producto: ing?.nombre ?? it.nombre_producto,
        cantidad:        String(it.cantidad ?? ''),
        unidad:          ing?.unidad_medida ?? it.unidad ?? '',
        precio_unitario: String(it.precio_unitario ?? ''),
      }
    }))
  }, [ingredientesOpts])

  const provTotal = provItems.reduce((s, it) => s + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_unitario) || 0), 0)

  const handleAgregarCompraProveedor = useCallback(async () => {
    if (!gastoConcepto.trim()) { message.error('Escribe el concepto (ej: nombre del proveedor)'); return }
    const items = provItems.filter(it => it.nombre_producto.trim() && parseFloat(it.cantidad) > 0 && parseFloat(it.precio_unitario) >= 0)
    if (items.length === 0) { message.error('Agrega al menos un producto con cantidad y precio'); return }
    setSavingGasto(true)
    const { data, error } = await supabase.rpc('registrar_compra_proveedor', {
      p_concepto: gastoConcepto.trim(),
      p_items: items.map(it => ({
        ingrediente_id:  it.ingrediente_id || null,
        nombre_producto: it.nombre_producto.trim(),
        cantidad:        parseFloat(it.cantidad),
        unidad:          it.unidad.trim() || null,
        precio_unitario: parseFloat(it.precio_unitario),
      })),
    })
    setSavingGasto(false)
    if (error) { message.error('Error: ' + error.message); return }
    // La base crea el proveedor y los ingredientes que no existían; se avisa qué quedó nuevo.
    const res = (data ?? {}) as { proveedor_creado?: boolean; ingredientes_creados?: { nombre: string }[] }
    const creados = res.ingredientes_creados ?? []
    const nuevos: string[] = []
    if (res.proveedor_creado) nuevos.push(`proveedor "${gastoConcepto.trim()}"`)
    if (creados.length > 0) nuevos.push(`${creados.length === 1 ? 'ingrediente' : 'ingredientes'} ${creados.map(c => `"${c.nombre}"`).join(', ')}`)
    setGastoConcepto(''); setProvItems([{ ...PROV_ITEM_EMPTY }]); setShowGastoForm(false)
    message.success(nuevos.length > 0 ? `Compra registrada · stock actualizado · se creó ${nuevos.join(' y ')}` : 'Compra registrada · stock actualizado')
    loadIngredientes()
    fetchData()
  }, [gastoConcepto, provItems, fetchData, loadIngredientes])

  const handleEliminarGasto = useCallback(async (id: string) => {
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { message.error('Error: ' + error.message); return }
    setGastos(prev => prev.filter(g => g.id !== id))
  }, [])

  useEffect(() => {
    fetchData()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    // Filtrado por restaurant_id: evita que caja reciba cambios de pedidos de otros restaurantes.
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      channel = supabase
        .channel('cashier-panel-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, fetchData)
        .subscribe()
    })
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [fetchData])

  // Abrir modal de cobro. kind='inicial' -> cobrar_orden_inicial (Plan B, antes
  // de cocina, no toca status). kind='final' -> cobrar_orden (flujo de siempre).
  const openPay = useCallback((order: Order, kind: 'inicial' | 'final' = 'final') => {
    setPayingOrder(order)
    setPayingKind(kind)
    setPayMethod('efectivo')
    setAmountPaid(String(Math.round(order.total)))
    setPropinaInput('')
    setPropinaRespuesta(null)
  }, [])

  // Calcular cambio
  // "Monto recibido" es TODO el efectivo físico que entrega el cliente (venta +
  // propina juntos) — el cambio y la validación de pago suficiente deben
  // descontar la propina también, si no, la propina se cuenta como vuelto.
  const propinaNum = parseFloat(propinaInput) || 0
  const totalConPropina = payingOrder ? payingOrder.total + propinaNum : 0

  const cambio = payingOrder && payMethod === 'efectivo' && parseFloat(amountPaid) >= totalConPropina
    ? parseFloat(amountPaid) - totalConPropina
    : 0

  const pagoInsuficiente = payingOrder && payMethod === 'efectivo'
    && amountPaid !== '' && parseFloat(amountPaid) < totalConPropina

  // Pedido de mesa marcado listo desde Caja: aviso push a los meseros (y al que lo tomó).
  const avisarMeseros = (order: Order) => {
    if (!order.table_num || esRappi(order)) return
    pushNotificationService.notify(
      ['waiter'], `Pedido ${orderRef(order)} listo`, `Pedido ${orderRef(order)} listo para entregar — Mesa ${order.table_num}`, '/',
      undefined, order.user_id ? [order.user_id] : undefined,
    )
  }

  // Orden ya pagada antes de cocina (Plan B) y ahora lista: solo se completa,
  // sin volver a pedir el pago.
  const handleCompletarPagada = useCallback(async (order: Order) => {
    setProcessing(true)
    try {
      // Rappi nace con payment_method='rappi', que cobrar_orden rechaza como
      // argumento. La función conserva el método ya guardado en la orden
      // (COALESCE), así que aquí basta con mandar uno válido.
      const { error } = await supabase.rpc('cobrar_orden', {
        p_order_id:       order.id,
        p_payment_method: esRappi(order) ? 'efectivo' : (order.payment_method ?? 'efectivo'),
        p_amount_paid:    order.amount_paid ?? order.total,
      })
      if (error) throw error
      avisarMeseros(order)
      message.success('Pedido completado')
      fetchData()
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al completar'}`)
    } finally {
      setProcessing(false)
    }
  }, [fetchData])

  // "Dividir cuenta": las personas pagan por partes. Al quedar cubierta la cuenta se hace lo mismo
  // que tras un cobro normal: antes de cocina avisa a cocina; con el pedido listo lo completa.
  const handleSplitFinished = useCallback(async () => {
    if (!splitOrder) return
    const { order, kind } = splitOrder
    try {
      if (kind === 'inicial') {
        const dest = order.table_num ? `Mesa ${order.table_num}` : (order.customer_name || 'Pedido')
        pushNotificationService.notify(['kitchen'], 'Nuevo pedido', `${dest} — ${order.items.length} producto(s)`, '/')
        message.success('Cuenta cobrada · enviado a cocina')
      } else {
        const { error } = await supabase.rpc('cobrar_orden', { p_order_id: order.id, p_payment_method: 'mixto', p_amount_paid: order.total })
        if (error) throw error
        avisarMeseros(order)
        message.success('Cuenta cobrada · pedido completado')
      }
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al completar el pedido'}`)
    }
    setSplitOrder(null)
    fetchData()
    reciboTrasCobro(order.id)
  }, [splitOrder, fetchData, reciboTrasCobro])

  // Cobrar
  const handleCobrar = useCallback(async () => {
    if (!payingOrder) return
    if (payMethod === 'efectivo' && parseFloat(amountPaid) < payingOrder.total) {
      message.error('El monto recibido es menor al total')
      return
    }
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc(
        payingKind === 'inicial' ? 'cobrar_orden_inicial' : 'cobrar_orden',
        {
          p_order_id:       payingOrder.id,
          p_payment_method: payMethod,
          p_amount_paid:    payMethod === 'efectivo' ? parseFloat(amountPaid) : payingOrder.total,
          p_propina:        parseFloat(propinaInput) || 0,
        }
      )
      if (error) throw error
      if (payingKind === 'inicial') {
        // Ya pagado: pasa a cocina. Aviso push por si la pantalla de cocina está apagada.
        const dest = payingOrder.table_num ? `Mesa ${payingOrder.table_num}` : (payingOrder.customer_name || 'Pedido')
        pushNotificationService.notify(['kitchen'], 'Nuevo pedido', `${dest} — ${payingOrder.items.length} producto(s)`, '/')
      } else {
        avisarMeseros(payingOrder)
      }
      message.success(
        payMethod === 'efectivo' && data.change > 0
          ? `Cobrado · Cambio: $${Math.round(data.change).toLocaleString('es-CO')}`
          : payingKind === 'inicial' ? 'Cobrado · enviado a cocina' : 'Cobrado exitosamente'
      )
      const cobradaId = payingOrder.id
      setPayingOrder(null)
      fetchData()
      reciboTrasCobro(cobradaId)
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al cobrar'}`)
    } finally {
      setProcessing(false)
    }
  }, [payingOrder, payingKind, payMethod, amountPaid, propinaInput, fetchData, reciboTrasCobro])

  // Corte de caja
  const handleCorte = useCallback(async () => {
    setCortingLoading(true)
    try {
      // Desglose de productos ANTES del corte (mientras las órdenes del día siguen visibles)
      const { data: prods } = await supabase.rpc('get_corte_productos')
      const { data, error } = await supabase.rpc('hacer_corte_caja', { p_notas: null })
      if (error) throw error
      setCorteResult(data)
      setCorteProductos((prods as CorteProducto[]) ?? [])
      // Ayudas para cuadrar el conteo físico: transferencias del día y mesas con pagos mixtos.
      const [{ data: trf }, { data: mixtas }, { data: pagosDia }] = await Promise.all([
        supabase.rpc('get_transferencias_dia'),
        supabase.rpc('get_mesas_mixtas_dia'),
        supabase.from('order_payments')
          .select('comensal, payment_method, monto, propina, referencia, transferencia_verificada, paid_at, orders!inner(order_number_today, table_num, tipo_pedido, customer_name, status)')
          .is('anulado_at', null).gte('paid_at', ventanaHoy().desde).lt('paid_at', ventanaHoy().hasta).order('paid_at'),
      ])
      setTransferencias((trf ?? []) as TransferenciaDia[])
      setMesasMixtas((mixtas ?? []) as MesaMixta[])
      setPagosCorte(((pagosDia ?? []) as unknown as { comensal: string | null; payment_method: string; monto: number; propina: number; referencia: string | null; transferencia_verificada: boolean; paid_at: string; orders: { order_number_today: number | null; table_num: number | null; tipo_pedido: string; customer_name: string | null; status: string } | null }[])
        .filter(p => p.orders && p.orders.status !== 'cancelled' && !esRappi(p.orders))
        .map(p => ({
          comensal: p.comensal,
          mesa: `${p.orders!.table_num ? `Mesa ${p.orders!.table_num}` : p.orders!.tipo_pedido === 'LLEVAR' ? 'Llevar' : 'Domicilio'}${p.orders!.customer_name ? ` · ${p.orders!.customer_name}` : ''}`,
          metodo: p.payment_method, monto: Number(p.monto), propina: Number(p.propina), referencia: p.referencia,
          verificada: p.transferencia_verificada,
          hora: new Date(p.paid_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }),
        })))
      setConteo({})
      setShowCorte(true)
      fetchData()
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error en corte'}`)
    } finally {
      setCortingLoading(false)
    }
  }, [fetchData])

  // Base de caja: efectivo con el que arranca el cajón hoy (punto de partida del arqueo)
  const handleGuardarBase = useCallback(async () => {
    const monto = parseFloat(baseInput)
    if (isNaN(monto) || monto < 0) { message.error('Escribe cuánto efectivo hay en la caja'); return }
    setSavingBase(true)
    const { data, error } = await supabase.rpc('registrar_base_caja', { p_monto: monto })
    setSavingBase(false)
    if (error) { message.error('Error: ' + error.message); return }
    setBaseHoy(Number(data?.monto ?? monto))
    setEditandoBase(false)
    message.success('Base de caja registrada')
  }, [baseInput])

  const handleCorteMensual = useCallback(async () => {
    setLoadingMensual(true)
    const { data, error } = await supabase.rpc('get_corte_mensual')
    setLoadingMensual(false)
    if (error) { message.error('Error: ' + error.message); return }
    const corte = data as CorteMensual
    try {
      const { from, to } = rangoGastosBogota(corte.desde, corte.hasta)
      const { data: gm, error: gmErr } = await supabase.from('gastos').select('id, concepto, monto, categoria, created_at')
        .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).limit(2000)
      setGastosMes(gmErr ? [] : ((gm ?? []) as { id: string; concepto: string; monto: number; categoria: string | null; created_at: string }[]))
    } catch { setGastosMes([]) }
    setCorteMensual(corte)
  }, [])

  // Descargar el corte mensual en Excel (resumen del mes + desglose por día)
  const handleDescargarExcelMensual = useCallback(async () => {
    if (!corteMensual) return
    try {
      const { data: cfg } = await supabase
        .from('restaurant_config').select('display_name').maybeSingle()
      await descargarCorteMensualExcel({
        restauranteNombre: cfg?.display_name ?? 'Restaurante',
        corte: corteMensual,
        gastos: gastosMes,
        etiquetas,
      })
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al generar Excel'}`)
    }
  }, [corteMensual, gastosMes, etiquetas])

  // Conteo físico de efectivo (arqueo): cantidad de billetes/monedas por denominación
  const denominacionesConteo = DENOMINACIONES
    .map(valor => ({ valor, cantidad: parseInt(conteo[valor] || '0', 10) || 0 }))
    .filter(d => d.cantidad > 0)
    .map(d => ({ ...d, subtotal: d.valor * d.cantidad }))
  const totalContado = denominacionesConteo.reduce((s, d) => s + d.subtotal, 0)

  // Descargar el corte en Excel
  const handleDescargarExcel = useCallback(async () => {
    if (!corteResult) return
    try {
      const { data: cfg } = await supabase
        .from('restaurant_config').select('display_name').maybeSingle()

      // Guardar el conteo en el corte ya creado, para que quede en el historial
      // y no solo en el Excel descargado esa vez.
      if (denominacionesConteo.length > 0 && corteResult.corte_id) {
        await supabase.from('cortes_caja')
          .update({ denominaciones: denominacionesConteo })
          .eq('id', corteResult.corte_id)
      }

      await descargarCorteExcel({
        restauranteNombre: cfg?.display_name ?? 'Restaurante',
        totales: {
          total_efectivo:      Number(corteResult.total_efectivo),
          total_transferencia: Number(corteResult.total_transferencia),
          total_tarjeta:       Number(corteResult.total_tarjeta ?? 0),
          gastos_de_caja:      Number(corteResult.gastos_pagados_de_caja ?? 0),
          gastos_adelantados:  Number(corteResult.gastos_adelantados ?? 0),
          reembolsos_de_caja:  Number(corteResult.reembolsos_de_caja ?? 0),
          aportes_a_caja:      Number(corteResult.aportes_a_caja ?? 0),
          total_general:       Number(corteResult.total_general),
          total_ordenes:       Number(corteResult.total_ordenes),
          total_gastos:        Number(corteResult.total_gastos ?? 0),
          total_neto:          Number(corteResult.total_neto ?? corteResult.total_general),
          total_propinas:      Number(corteResult.total_propinas ?? 0),
          base_caja:           Number(corteResult.base_caja ?? 0),
          efectivo_esperado:   Number(corteResult.efectivo_esperado_cajon ?? corteResult.total_efectivo),
          fecha:               corteResult.fecha,
        },
        productos: corteProductos,
        gastos: gastos.map(g => ({ concepto: g.concepto, monto: Number(g.monto), categoria: g.categoria })),
        etiquetas,
        denominaciones: denominacionesConteo,
        pagos: pagosCorte,
      })
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al generar Excel'}`)
    }
  }, [corteResult, corteProductos, gastos, denominacionesConteo, pagosCorte, etiquetas])

  const totalDia = daySummary.total_efectivo + daySummary.total_transferencia + daySummary.total_tarjeta
  const netoDia  = totalDia - totalGastosHoy

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-[var(--w-accent)] border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Encabezado de módulo */}
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v.01M18 15v.01"/></svg>}
        title="Caja"
        subtitle="Controla tus cobros y operaciones"
      />
      {/* Pagos cobrados sin internet: siguen guardados aquí hasta que se envíen */}
      {colaPagos.length > 0 && (
        <div className="bg-[var(--w-warning-bg)] border border-[var(--w-warning)] rounded-[var(--w-r-lg)] p-4" role="status">
          <p className="text-sm font-bold text-[color:var(--w-warning-text)]">
            {colaPagos.filter(p => p.estado === 'pendiente').length > 0 &&
              `${colaPagos.filter(p => p.estado === 'pendiente').length} pago(s) guardados sin internet: se envían solos al volver la conexión.`}
            {colaPagos.some(p => p.estado === 'conflicto') &&
              ` ${colaPagos.filter(p => p.estado === 'conflicto').length} rechazado(s) por el servidor: revísalos con el administrador.`}
          </p>
          <ul className="mt-1 text-xs text-[color:var(--w-warning-text)] list-disc pl-4">
            {colaPagos.map(p => <li key={p.idem}>{p.resumen}{p.estado === 'conflicto' ? ` — ${p.motivo}` : ''}</li>)}
          </ul>
          {colaPagos.some(p => p.estado === 'pendiente') && (
            <button onClick={enviarCola} disabled={enviandoCola}
              className="mt-2 min-h-[44px] px-4 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-warning-text)] bg-[var(--w-warning-bg)] border border-[var(--w-warning)]">
              {enviandoCola ? 'Enviando…' : 'Enviar ahora'}
            </button>
          )}
        </div>
      )}

      {/* Base de caja: efectivo con el que arranca el cajón (punto de partida del corte) */}
      <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-4 flex flex-wrap items-center gap-3 justify-between" style={FX.soft}>
        <div>
          <p className="text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider">Base de caja de hoy</p>
          {baseHoy !== null && !editandoBase ? (
            <p className="text-2xl font-bold text-[color:var(--w-text)]">{fmt(baseHoy)}</p>
          ) : (
            <p className="text-sm text-[color:var(--w-text-2)]">¿Con cuánto efectivo arranca la caja hoy?</p>
          )}
        </div>
        {baseHoy !== null && !editandoBase ? (
          <button onClick={() => { setBaseInput(String(baseHoy)); setEditandoBase(true) }}
            className="px-4 py-2 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-text)]" style={FX.soft}>
            Cambiar
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <input type="number" min={0} inputMode="numeric" value={baseInput}
              onChange={e => setBaseInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleGuardarBase() }}
              placeholder="Ej: 100000" aria-label="Base de caja"
              className="w-36 bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm font-bold text-[color:var(--w-text)] outline-none" style={FX.field} />
            <button onClick={handleGuardarBase} disabled={savingBase}
              className="px-4 py-2 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)]" style={{ ...FX.cta, opacity: savingBase ? 0.6 : 1 }}>
              {savingBase ? 'Guardando…' : 'Guardar base'}
            </button>
            {baseHoy !== null && (
              <button onClick={() => setEditandoBase(false)} className="min-h-[44px] text-sm font-bold text-[color:var(--w-text-2)] px-2">Cancelar</button>
            )}
          </div>
        )}
      </div>

      {/* Resumen del día (Rappi no cuenta: precios distintos al menú físico) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Efectivo hoy',       val: fmt(daySummary.total_efectivo),     tone: 'success' as const, icon: IC.cash },
          { label: 'Transferencias hoy', val: fmt(daySummary.total_transferencia), tone: 'info' as const,    icon: IC.card },
          ...(daySummary.total_tarjeta > 0 ? [{ label: 'Tarjeta hoy', val: fmt(daySummary.total_tarjeta), tone: 'info' as const, icon: IC.card }] : []),
          { label: 'Propinas hoy',       val: fmt(daySummary.total_propinas),      tone: 'warning' as const, icon: IC.star },
          { label: 'Gastos hoy',         val: fmt(totalGastosHoy),                 tone: 'danger' as const,  icon: IC.down },
          { label: `Neto del día · ${daySummary.total_ordenes} órdenes`, val: fmt(netoDia), tone: 'accent' as const, icon: IC.up },
        ].map(s => <StatCard key={s.label} label={s.label} value={s.val} tone={s.tone} icon={s.icon} />)}
      </div>

      <p className="text-xs font-bold text-[color:var(--w-text-2)] -mt-3">
        Pedidos Rappi: {daySummary.ordenes_rappi} {daySummary.ordenes_rappi === 1 ? 'orden' : 'órdenes'} — $0 (dinero en Rappi app)
      </p>

      {/* Gastos del día */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[color:var(--w-text)]" style={{ fontFamily: 'var(--w-font)' }}>
            Gastos del día
            <span className="ml-2 text-sm font-normal text-[color:var(--w-text-3)]">({gastos.length})</span>
          </h2>
          <button onClick={() => setShowGastoForm(v => !v)}
            className="px-4 py-2 rounded-[var(--w-r-lg)] text-sm font-bold"
            style={showGastoForm ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)', ...FX.cta } : { background: 'var(--w-surface)', color: 'var(--w-text)', ...FX.soft }}>
            + Agregar gasto
          </button>
        </div>

        {showGastoForm && (
          <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-4 mb-4" style={FX.card}>
            {/* Modo: gasto simple vs compra a proveedor con detalle */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setGastoModo('simple')}
                className="px-3 py-1.5 rounded-[var(--w-r-md)] text-xs font-bold"
                style={gastoModo === 'simple' ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)' } : { background: 'var(--w-surface-sunken)', color: 'var(--w-text-2)' }}>
                Gasto simple
              </button>
              <button onClick={() => setGastoModo('proveedor')}
                className="px-3 py-1.5 rounded-[var(--w-r-md)] text-xs font-bold"
                style={gastoModo === 'proveedor' ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)' } : { background: 'var(--w-surface-sunken)', color: 'var(--w-text-2)' }}>
                Compra a proveedor
              </button>
            </div>

            {gastoModo === 'simple' ? (
              <div className="flex flex-wrap gap-3 items-end">
                {/* ¿En qué se gastó? Permite sumar gastos por categoría en el corte diario y mensual. El admin edita la lista. */}
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase">¿En qué se gastó?</label>
                    {profile.role === 'admin' && (
                      <button type="button" onClick={() => setShowCategorias(true)}
                        className="text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-accent-text)] bg-transparent border-none cursor-pointer min-h-[32px]">
                        Editar categorías
                      </button>
                    )}
                  </div>
                  <select value={categoriaActual} onChange={e => setGastoCategoria(e.target.value)} disabled={categorias.length === 0}
                    className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm font-bold text-[color:var(--w-text)] outline-none" style={FX.field}>
                    {categorias.length === 0 && <option value="">Sin categorías (el gasto queda sin categoría)</option>}
                    {categorias.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                {/* ¿Con qué plata se pagó? Define si el gasto resta del efectivo de la caja o queda "por reembolsar". */}
                <div className="w-full flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">Se pagó con</label>
                    <select value={gastoFuente} onChange={e => setGastoFuente(e.target.value as FuenteGasto)}
                      className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm font-bold text-[color:var(--w-text)] outline-none" style={FX.field}>
                      {(Object.keys(FUENTE_LABEL) as FuenteGasto[]).map(f => <option key={f} value={f}>{FUENTE_LABEL[f]}</option>)}
                    </select>
                  </div>
                  {gastoFuente === 'propio' && (
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">¿Quién puso la plata?</label>
                      <input value={gastoPagadoPor} onChange={e => setGastoPagadoPor(e.target.value)} maxLength={80} placeholder="Ej: Angela"
                        className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">Concepto</label>
                  <div className="flex gap-2">
                    <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                      placeholder="Ej: Domicilio de insumos"
                      className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setGastoConcepto(limpiarTranscripcion(r.transcript))} />
                  </div>
                </div>
                <div className="w-32">
                  <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">Monto</label>
                  <input type="number" min={0} value={gastoMonto} onChange={e => setGastoMonto(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
                </div>
                <button onClick={handleAgregarGasto} disabled={savingGasto}
                  className="px-4 py-2.5 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)]" style={{ ...FX.cta, opacity: savingGasto ? 0.6 : 1 }}>
                  {savingGasto ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <VoiceButton kind="purchase" label="Dictar compra" onResult={fillPurchaseFromVoice}
                    context={() => ({ ingredients: ingredientesOpts.map(o => o.nombre) })} />
                </div>
                <div className="mb-3">
                  <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">Proveedor / concepto</label>
                  <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                    placeholder="Ej: Distribuidora La Cosecha"
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
                </div>

                <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-2">Productos que trajo</label>
                <div className="flex flex-col gap-2 mb-3">
                  {provItems.map((it, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] p-2" style={FX.field}>
                      <select
                        value={it.ingrediente_id}
                        onChange={e => {
                          const ing = ingredientesOpts.find(o => o.id === e.target.value)
                          updateProvItem(idx, { ingrediente_id: e.target.value, nombre_producto: ing?.nombre ?? it.nombre_producto, unidad: ing?.unidad_medida ?? it.unidad })
                        }}
                        className="text-xs bg-[var(--w-surface-sunken)] rounded-lg px-2 py-1.5 text-[color:var(--w-text)] outline-none">
                        <option value="">Producto nuevo (escribir)…</option>
                        {ingredientesOpts.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      </select>
                      {!it.ingrediente_id && (
                        <input value={it.nombre_producto} onChange={e => updateProvItem(idx, { nombre_producto: e.target.value })}
                          placeholder="Nombre del producto" className="flex-1 min-w-[100px] text-xs bg-[var(--w-surface-sunken)] rounded-lg px-2 py-1.5 text-[color:var(--w-text)] outline-none" />
                      )}
                      <input type="number" min={0} step="0.01" value={it.cantidad} onChange={e => updateProvItem(idx, { cantidad: e.target.value })}
                        placeholder="Cantidad" className="w-20 text-xs bg-[var(--w-surface-sunken)] rounded-lg px-2 py-1.5 text-[color:var(--w-text)] outline-none" />
                      <input value={it.unidad} onChange={e => updateProvItem(idx, { unidad: e.target.value })}
                        placeholder="kg / litro / und" title="Obligatoria si el producto es nuevo: kg, gramo, litro, ml, pieza (und) o paquete" className="w-20 text-xs bg-[var(--w-surface-sunken)] rounded-lg px-2 py-1.5 text-[color:var(--w-text)] outline-none" />
                      <input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={e => updateProvItem(idx, { precio_unitario: e.target.value })}
                        placeholder="Precio unit." className="w-24 text-xs bg-[var(--w-surface-sunken)] rounded-lg px-2 py-1.5 text-[color:var(--w-text)] outline-none" />
                      <span className="text-xs font-bold text-[color:var(--w-text)] w-20 text-right">
                        ${Math.round((parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_unitario) || 0)).toLocaleString('es-CO')}
                      </span>
                      <button onClick={() => setProvItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                        className="text-[color:var(--w-text-3)] hover:text-[color:var(--w-danger-text)] text-sm px-1">✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setProvItems(prev => [...prev, { ...PROV_ITEM_EMPTY }])}
                  className="text-xs font-bold text-[color:var(--w-accent-text)] mb-3">+ Agregar producto</button>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[color:var(--w-text)]">Total: ${Math.round(provTotal).toLocaleString('es-CO')}</span>
                  <button onClick={handleAgregarCompraProveedor} disabled={savingGasto}
                    className="px-4 py-2.5 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)]" style={{ ...FX.cta, opacity: savingGasto ? 0.6 : 1 }}>
                    {savingGasto ? 'Guardando…' : 'Guardar compra · sube stock'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {gastos.length === 0 ? (
          <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-6 text-center" style={FX.field}>
            <p className="text-sm text-[color:var(--w-text-3)]">Sin gastos registrados hoy</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map(g => (
              <div key={g.id} className="flex items-center justify-between bg-[var(--w-surface)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.soft}>
                <div>
                  <p className="font-semibold text-[color:var(--w-text)] text-sm">{g.concepto}</p>
                  <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
                    {new Date(g.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    {` · ${categoriaLabel(g.categoria, etiquetas)}`}
                    {g.fuente === 'propio' && ` · lo pagó ${g.pagado_por_nombre ?? 'otra persona'} (no sale del cajón)`}
                    {g.fuente === 'transferencia' && ' · transferencia del negocio'}
                    {g.fuente === 'tarjeta' && ' · tarjeta del negocio'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[color:var(--w-danger-text)]">${Math.round(Number(g.monto)).toLocaleString('es-CO')}</span>
                  <button onClick={() => handleEliminarGasto(g.id)} className="min-h-[44px] text-[color:var(--w-text-3)] hover:text-[color:var(--w-danger-text)] text-sm">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Por reembolsar: gastos que alguien adelantó con su plata. El saldo se ve siempre para que nadie pierda la cuenta. */}
      {porReembolsar.length > 0 && (
        <div className="bg-[var(--w-warning-bg)] border border-[var(--w-warning)] rounded-[var(--w-r-lg)] p-4">
          <p className="text-sm font-bold text-[color:var(--w-warning-text)]">
            Por reembolsar: {fmt(porReembolsar.reduce((s, g) => s + Number(g.monto), 0))}
            <span className="font-normal"> · {[...new Set(porReembolsar.map(g => g.pagado_por_nombre ?? 'Otra persona'))].join(', ')}</span>
          </p>
          <div className="flex flex-col gap-2 mt-2">
            {porReembolsar.map(g => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2">
                <span className="text-sm text-[color:var(--w-text)]"><b>{g.concepto}</b> · {fmt(g.monto)} · {g.pagado_por_nombre ?? 'otra persona'}</span>
                <span className="flex gap-2">
                  <button onClick={() => handleReembolsar(g, 'caja')} className="min-h-[44px] px-3 rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-warning-text)] bg-[var(--w-warning-bg)] border border-[var(--w-warning)]">Pagar con efectivo de la caja</button>
                  <button onClick={() => handleReembolsar(g, 'transferencia')} className="min-h-[44px] px-3 rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-warning-text)] bg-[var(--w-warning-bg)] border border-[var(--w-warning)]">Por transferencia</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aporte a la caja: efectivo que alguien pone porque la base no alcanzó (suma al efectivo esperado) */}
      <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-4 flex flex-wrap items-end gap-3" style={FX.soft}>
        <div className="flex-1 min-w-[140px]">
          <p className="text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-1">Aporte a la caja</p>
          <input type="number" min={0} inputMode="numeric" value={aporteMonto} onChange={e => setAporteMonto(e.target.value)} placeholder="Monto"
            aria-label="Monto del aporte" className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm font-bold text-[color:var(--w-text)] outline-none" style={FX.field} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <input value={aportePor} onChange={e => setAportePor(e.target.value)} maxLength={80} placeholder="¿Quién lo puso? (opcional)"
            aria-label="Quién aportó" className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
        </div>
        <button onClick={handleAporte} className="min-h-[44px] px-4 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)]" style={FX.cta}>Registrar aporte</button>
      </div>

      {/* Pedidos esperando cobro ANTES de pasar a cocina (Plan B) */}
      {pendingPayment.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[color:var(--w-warning-text)]" style={{ fontFamily: 'var(--w-font)' }}>
              Pedidos por cobrar antes de cocina
              <span className="ml-2 text-sm font-normal text-[color:var(--w-text-3)]">({pendingPayment.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {pendingPayment.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-5 border-2 border-[var(--w-warning)]" style={FX.card}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[color:var(--w-text)] text-lg">
                      {destinoPedido(order)}
                      {order.customer_name && <span className="text-[color:var(--w-accent-text)]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[color:var(--w-text-3)]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    {order.notes && <p className="text-xs text-[color:var(--w-text-2)] italic mt-1">{order.notes}</p>}
                  </div>
                  <span className="text-2xl font-bold text-[color:var(--w-accent-text)]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
                <OrderProgress status={order.status} />
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[color:var(--w-text-2)]">{item.quantity}× {item.name}</span>
                      <span className="text-[color:var(--w-text-3)]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
                {(pagadoPorOrden[order.id] ?? 0) > 0 && (
                  <p className="text-xs font-bold text-[color:var(--w-warning-text)] mb-2">
                    Cobrado {fmt(pagadoPorOrden[order.id])} · falta {fmt(order.total - pagadoPorOrden[order.id])}
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => (pagadoPorOrden[order.id] ?? 0) > 0 ? setSplitOrder({ order, kind: 'inicial' }) : openPay(order, 'inicial')}
                  className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-on-accent)] text-sm"
                  style={{ backgroundColor: 'var(--w-warning)' }}
                >
                  {(pagadoPorOrden[order.id] ?? 0) > 0
                    ? `Seguir cobrando · falta ${fmt(order.total - pagadoPorOrden[order.id])}`
                    : `Cobrar y enviar a cocina · ${fmt(order.total)}`}
                </motion.button>
                {!(pagadoPorOrden[order.id] > 0) && (
                  <button onClick={() => setSplitOrder({ order, kind: 'inicial' })}
                    className="w-full min-h-[44px] mt-2 rounded-[var(--w-r-lg)] text-xs font-bold text-[color:var(--w-text)]" style={FX.soft}>
                    Dividir cuenta
                  </button>
                )}
                <div className="flex gap-2 mt-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setEditingOrder(order)}
                    className="flex-1 py-2 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-warning-text)] bg-[var(--w-warning-bg)] border border-[var(--w-warning)] text-xs"
                  >
                    ✏️ Editar
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    disabled={cancellingOrder === order.id}
                    onClick={async () => {
                      if (!window.confirm('¿Cancelar este pedido?')) return
                      setCancellingOrder(order.id)
                      try {
                        const { error } = await supabase.rpc('cancelar_orden', { p_order_id: order.id })
                        if (error) { alert('Error: ' + error.message); return }
                        setPendingPayment(prev => prev.filter(o => o.id !== order.id))
                      } catch (err: any) {
                        alert('Error: ' + err.message)
                      } finally {
                        setCancellingOrder(null)
                      }
                    }}
                    className="flex-1 py-2 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-danger-text)] bg-[var(--w-danger-bg)] border border-[var(--w-danger)] text-xs"
                  >
                    {cancellingOrder === order.id ? '⏳' : '🗑️ Cancelar'}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pedidos en cocina */}
      {cookingOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[color:var(--w-warning-text)]" style={{ fontFamily: 'var(--w-font)' }}>
              En cocina
              <span className="ml-2 text-sm font-normal text-[color:var(--w-text-3)]">({cookingOrders.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {cookingOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-5 border-2 border-[var(--w-warning)]" style={FX.card}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[color:var(--w-text)] text-lg">
                      {destinoPedido(order)}
                      {order.customer_name && <span className="text-[color:var(--w-accent-text)]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[color:var(--w-text-3)]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className="text-xs font-bold mt-0.5 text-[color:var(--w-warning-text)]">Preparándose en cocina</p>
                  </div>
                  <span className="text-2xl font-bold text-[color:var(--w-accent-text)]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
                <OrderProgress status={order.status} />
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.filter((it: any) => !it.cancelled).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[color:var(--w-text-2)]">{item.quantity}× {item.name}</span>
                      <span className="text-[color:var(--w-text-3)]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={cancellingOrder === order.id}
                  onClick={async () => {
                    if (!window.confirm('¿Cancelar este pedido? Ya está en preparación.')) return
                    setCancellingOrder(order.id)
                    try {
                      const { error } = await supabase.rpc('cancelar_orden', { p_order_id: order.id })
                      if (error) { alert('Error: ' + error.message); return }
                      setCooking(prev => prev.filter(o => o.id !== order.id))
                    } catch (err: any) {
                      alert('Error: ' + err.message)
                    } finally {
                      setCancellingOrder(null)
                    }
                  }}
                  className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-danger-text)] bg-[var(--w-danger-bg)] border border-[var(--w-danger)] text-sm"
                >
                  {cancellingOrder === order.id ? '⏳ Cancelando...' : '🗑️ Cancelar pedido'}
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Órdenes listas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[color:var(--w-text)]" style={{ fontFamily: 'var(--w-font)' }}>
            Órdenes para cobrar
            <span className="ml-2 text-sm font-normal text-[color:var(--w-text-3)]">({readyOrders.length})</span>
          </h2>
          <button onClick={fetchData} className="p-2.5 rounded-[var(--w-r-lg)] text-[color:var(--w-text-2)]" style={FX.soft}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        {readyOrders.length === 0 ? (
          <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-12 text-center" style={FX.field}>
            <p className="text-4xl mb-3"></p>
            <p className="font-bold text-[color:var(--w-text)]">Todo al día</p>
            <p className="text-sm text-[color:var(--w-text-3)] mt-1">Sin órdenes pendientes de cobro</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readyOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-5" style={FX.card}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[color:var(--w-text)] text-lg">
                      {destinoPedido(order)}
                      {order.customer_name && <span className="text-[color:var(--w-accent-text)]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[color:var(--w-text-3)]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${order.delivered_at ? 'text-[color:var(--w-success-text)]' : 'text-[color:var(--w-warning-text)]'}`}>
                      {order.delivered_at ? '✓ Entregado al mesero' : 'Esperando que el mesero lo recoja'}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-[color:var(--w-accent-text)]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>

                <OrderProgress status={order.status} />

                {/* Items */}
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[color:var(--w-text-2)]">{item.quantity}× {item.name}</span>
                      <span className="text-[color:var(--w-text-3)]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <p className="text-xs text-[color:var(--w-text-3)]">+{order.items.length - 4} platos más</p>
                  )}
                  {order.notes && (
                    <p className="text-xs text-[color:var(--w-text-2)] italic mt-1">{order.notes}</p>
                  )}
                </div>

                {order.paid_at && (
                  <p className="text-xs font-bold text-[color:var(--w-text-2)] mb-2">
                    Pagado · {esRappi(order) ? 'Rappi' : order.payment_method === 'mixto' ? 'Mixto' : order.payment_method === 'transferencia' ? 'Transferencia' : order.payment_method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
                  </p>
                )}
                {order.paid_at ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleCompletarPagada(order)}
                    disabled={processing}
                    className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-success-text)] bg-[var(--w-success-bg)] border border-[var(--w-success)] text-sm"
                    style={{ opacity: processing ? 0.6 : 1 }}
                  >
                    ✓ Ya pagado · Completar pedido
                  </motion.button>
                ) : (
                  <>
                    {(pagadoPorOrden[order.id] ?? 0) > 0 && (
                      <p className="text-xs font-bold text-[color:var(--w-warning-text)] mb-2">
                        Cobrado {fmt(pagadoPorOrden[order.id])} · falta {fmt(order.total - pagadoPorOrden[order.id])}
                      </p>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => (pagadoPorOrden[order.id] ?? 0) > 0 ? setSplitOrder({ order, kind: 'final' }) : openPay(order)}
                      className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)] text-sm"
                      style={FX.cta}
                    >
                      {(pagadoPorOrden[order.id] ?? 0) > 0
                        ? `Seguir cobrando · falta ${fmt(order.total - pagadoPorOrden[order.id])}`
                        : `Cobrar ${fmt(order.total)}`}
                    </motion.button>
                    {!(pagadoPorOrden[order.id] > 0) && (
                      <button onClick={() => setSplitOrder({ order, kind: 'final' })}
                        className="w-full min-h-[44px] mt-2 rounded-[var(--w-r-lg)] text-xs font-bold text-[color:var(--w-text)]" style={FX.soft}>
                        Dividir cuenta
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => setTicket({ tipo: order.paid_at ? 'recibo' : 'precuenta', orderId: order.id })}
                  className="w-full min-h-[44px] mt-2 rounded-[var(--w-r-lg)] text-xs font-bold text-[color:var(--w-text)]" style={FX.soft}>
                  🖨 {order.paid_at ? 'Recibo' : 'Pre-cuenta'}
                </button>
                <div className="flex gap-2 mt-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setEditingOrder(order)}
                    className="flex-1 py-2 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-warning-text)] bg-[var(--w-warning-bg)] border border-[var(--w-warning)] text-xs"
                  >
                    ✏️ Editar
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    disabled={cancellingOrder === order.id}
                    onClick={async () => {
                      if (!window.confirm('¿Cancelar este pedido?')) return
                      setCancellingOrder(order.id)
                      try {
                        const { error } = await supabase.rpc('cancelar_orden', { p_order_id: order.id })
                        if (error) { alert('Error: ' + error.message); return }
                        setReady(prev => prev.filter(o => o.id !== order.id))
                      } catch (err: any) {
                        alert('Error: ' + err.message)
                      } finally {
                        setCancellingOrder(null)
                      }
                    }}
                    className="flex-1 py-2 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-danger-text)] bg-[var(--w-danger-bg)] border border-[var(--w-danger)] text-xs"
                  >
                    {cancellingOrder === order.id ? '⏳' : '🗑️ Cancelar'}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Corte de caja: diario y mensual */}
      <div className="pt-4 border-t border-[var(--w-border)] grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Para revisar qué se vendió y para quién ANTES de hacer el corte */}
        <button
          onClick={() => setShowHistory(true)}
          className="w-full sm:col-span-2 py-3.5 rounded-[var(--w-r-lg)] font-bold text-sm text-[color:var(--w-text)]"
          style={FX.card}
        >
          Historial de ventas de hoy · qué se vendió y para quién
        </button>
        {/* Cada pago de hoy: verificar transferencias, corregir el método o anular (admin) */}
        <button
          onClick={() => setShowPagos(true)}
          className="w-full sm:col-span-2 py-3.5 rounded-[var(--w-r-lg)] font-bold text-sm text-[color:var(--w-text)]"
          style={FX.card}
        >
          Pagos de hoy · verificar transferencias y corregir
        </button>
        <button
          onClick={handleCorte}
          disabled={cortingLoading || daySummary.total_ordenes === 0}
          className={`w-full py-3.5 rounded-[var(--w-r-lg)] font-bold text-sm text-[color:var(--w-text)] ${cortingLoading || daySummary.total_ordenes === 0 ? 'opacity-50' : ''}`}
          style={FX.card}
        >
          {cortingLoading ? 'Generando corte...' : `Hacer corte de caja · ${daySummary.total_ordenes} órdenes`}
        </button>
        <button
          onClick={handleCorteMensual}
          disabled={loadingMensual}
          className={`w-full py-3.5 rounded-[var(--w-r-lg)] font-bold text-sm text-[color:var(--w-text)] ${loadingMensual ? 'opacity-50' : ''}`}
          style={FX.card}
        >
          {loadingMensual ? 'Calculando...' : 'Corte mensual · ventas del mes'}
        </button>
      </div>

      <AnimatePresence>
        {showHistory && <SalesHistory onClose={() => setShowHistory(false)} />}
        {cierreTicket && <TicketModal tipo="cierre" preparado={cierreTicket} onClose={() => setCierreTicket(null)} />}
        {ticket && <TicketModal tipo={ticket.tipo} orderId={ticket.orderId} automatico={ticket.automatico} onClose={() => setTicket(null)} />}
        {showPagos && (
          <PagosDelDia esAdmin={profile.role === 'admin'} onClose={() => setShowPagos(false)} onChanged={fetchData} />
        )}
        {splitOrder && (
          <SplitPayModal
            key={splitOrder.order.id}
            order={splitOrder.order}
            propinaSugeridaPct={propinaSugeridaPct}
            onClose={() => { setSplitOrder(null); fetchData() }}
            onFinished={handleSplitFinished}
          />
        )}
      </AnimatePresence>

      {/* ── Modal cobro ── */}
      <AnimatePresence>
        {payingOrder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--w-overlay)] z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => !processing && setPayingOrder(null)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-6 w-full max-w-sm" style={FX.card}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-xs font-bold text-[color:var(--w-accent-text)] uppercase tracking-wider">Cobrar orden</p>
                  <h3 className="font-bold text-[color:var(--w-text)] text-lg mt-0.5">
                    {destinoPedido(payingOrder)}
                    {payingOrder.customer_name && <span className="text-[color:var(--w-accent-text)]"> · {payingOrder.customer_name}</span>}
                  </h3>
                </div>
                <span className="text-2xl font-bold text-[color:var(--w-accent-text)]">${Math.round(payingOrder.total).toLocaleString('es-CO')}</span>
              </div>

              {/* Items en el modal */}
              <div className="bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] p-3 mb-4 max-h-32 overflow-y-auto" style={FX.field}>
                {payingOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-[color:var(--w-text-2)]">{item.quantity}× {item.name}</span>
                    <span className="text-[color:var(--w-text-3)]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>

              {/* Varias personas pagan distinto: cada una con su método (efectivo, transferencia o tarjeta) */}
              <button type="button"
                onClick={() => { setSplitOrder({ order: payingOrder, kind: payingKind }); setPayingOrder(null) }}
                className="w-full min-h-[44px] mb-3 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-text)]" style={FX.soft}>
                Dividir cuenta · varias personas
              </button>

              {/* Método de pago */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(['efectivo', 'transferencia'] as PaymentMethod[]).map(m => (
                  <button key={m}
                    onClick={() => { setPayMethod(m); if (m === 'transferencia') setAmountPaid(String(Math.round(payingOrder.total))) }}
                    className="py-3 rounded-[var(--w-r-lg)] text-sm font-bold capitalize"
                    style={payMethod === m ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)', ...FX.cta } : { background: 'var(--w-surface)', color: 'var(--w-text-2)', ...FX.soft }}
                  >
                    {m === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </button>
                ))}
              </div>

              {/* Campo monto (solo efectivo) */}
              {payMethod === 'efectivo' && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-2">
                    Monto recibido
                  </label>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    min={payingOrder.total}
                    step="0.01"
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-lg font-bold text-[color:var(--w-text)] outline-none"
                    style={FX.field}
                    autoFocus
                  />
                  {/* Cambio */}
                  {cambio > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-3 bg-[var(--w-success-bg)] border border-[var(--w-success)] rounded-[var(--w-r-lg)] px-4 py-3 flex items-center justify-between"
                    >
                      <span className="text-sm font-bold text-[color:var(--w-success-text)]">Cambio</span>
                      <span className="text-2xl font-bold text-[color:var(--w-success-text)]">{fmt(cambio)}</span>
                    </motion.div>
                  )}
                  {pagoInsuficiente && (
                    <p className="mt-2 text-xs text-[color:var(--w-danger-text)] font-medium">
                      Falta {fmt(totalConPropina - parseFloat(amountPaid))}
                    </p>
                  )}
                </div>
              )}

              {payMethod === 'transferencia' && (
                <div className="mb-4 bg-[var(--w-info-bg)] border border-[var(--w-info)] rounded-[var(--w-r-lg)] px-4 py-3">
                  <p className="text-sm font-bold text-[color:var(--w-info-text)]">Confirmar transferencia</p>
                  <p className="text-xs text-[color:var(--w-info-text)] mt-0.5">
                    {propinaNum > 0
                      ? `Venta: ${fmt(payingOrder.total)} + Propina: ${fmt(propinaNum)} = ${fmt(totalConPropina)}`
                      : `Total: ${fmt(payingOrder.total)}`}
                  </p>
                </div>
              )}

              {/* Propina: hay que responder sí/no explícitamente, para que nunca quede
                  al aire si el cliente dejó propina o no. Si dice que sí, se separa
                  del resto del dinero (columna aparte, no cuenta como venta). */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-2">¿El cliente dejó propina?</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button type="button"
                    onClick={() => { setPropinaRespuesta('si'); if (!propinaInput || propinaInput === '0') setPropinaInput(propinaSugeridaPct ? Math.round(payingOrder.total * propinaSugeridaPct / 100).toString() : '') }}
                    className="py-2.5 rounded-[var(--w-r-md)] text-sm font-bold"
                    style={propinaRespuesta === 'si' ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)' } : { background: 'var(--w-surface)', color: 'var(--w-text-2)', ...FX.soft }}>
                    Sí
                  </button>
                  <button type="button"
                    onClick={() => { setPropinaRespuesta('no'); setPropinaInput('0') }}
                    className="py-2.5 rounded-[var(--w-r-md)] text-sm font-bold"
                    style={propinaRespuesta === 'no' ? { background: 'var(--w-text-2)', color: 'var(--w-on-accent)' } : { background: 'var(--w-surface)', color: 'var(--w-text-2)', ...FX.soft }}>
                    No
                  </button>
                </div>
                {propinaRespuesta === 'si' && (
                  <>
                    {!!propinaSugeridaPct && (
                      <button type="button"
                        onClick={() => setPropinaInput(Math.round(payingOrder.total * propinaSugeridaPct / 100).toString())}
                        className="text-xs font-bold text-[color:var(--w-accent-text)] mb-2 block">
                        Sugerida {propinaSugeridaPct}% · {fmt(payingOrder.total * propinaSugeridaPct / 100)}
                      </button>
                    )}
                    <input type="number" min={0} value={propinaInput} onChange={e => setPropinaInput(e.target.value)}
                      placeholder="Monto de la propina" autoFocus
                      className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-2.5 text-sm font-bold text-[color:var(--w-text)] outline-none" style={FX.field} />
                  </>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setPayingOrder(null)}
                  disabled={processing}
                  className="flex-1 py-3 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-text-2)]"
                  style={FX.card}
                >
                  Cancelar
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCobrar}
                  disabled={processing || !!pagoInsuficiente || !propinaRespuesta}
                  className={`flex-1 py-3 rounded-[var(--w-r-lg)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)] ${processing || pagoInsuficiente || !propinaRespuesta ? 'opacity-60' : ''}`}
                  style={FX.cta}
                >
                  {processing ? 'Procesando...' : !propinaRespuesta ? 'Responde la propina' : 'Cobrar'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal corte de caja ── */}
      <AnimatePresence>
        {showCorte && corteResult && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--w-overlay)] z-50 flex items-center justify-center p-4"
            onClick={() => setShowCorte(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-6 w-full max-w-sm overscroll-contain" style={{ ...FX.card, maxHeight: '90vh', overflowY: 'auto' }}
            >
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-[var(--w-r-lg)] bg-[var(--w-success-bg)] border border-[var(--w-success)] flex items-center justify-center text-3xl mx-auto mb-3" style={FX.cta}>
                 
                </div>
                <h3 className="font-bold text-[color:var(--w-text)] text-xl">Corte de Caja</h3>
                <p className="text-xs text-[color:var(--w-text-3)]">
                  {new Date().toLocaleDateString('es', { dateStyle: 'full' })}
                </p>
              </div>

              <div className="flex flex-col gap-3 mb-5">
                {[
                  { label: 'Efectivo',      val: corteResult.total_efectivo },
                  { label: 'Transferencia', val: corteResult.total_transferencia },
                  ...(Number(corteResult.total_tarjeta ?? 0) > 0 ? [{ label: 'Tarjeta', val: corteResult.total_tarjeta }] : []),
                  { label: 'Órdenes',       val: corteResult.total_ordenes, isCurrency: false },
                  { label: 'Pedidos Rappi', val: `${daySummary.ordenes_rappi} — $0 (dinero en Rappi app)`, isCurrency: false },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.field}>
                    <span className="text-sm text-[color:var(--w-text-2)]">{item.label}</span>
                    <span className="font-bold text-[color:var(--w-text)]">
                      {item.isCurrency === false ? item.val : fmt(item.val)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-[var(--w-accent)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.cta}>
                  <span className="text-sm font-bold text-[color:var(--w-on-accent)]">Ganancias (ventas)</span>
                  <span className="text-xl font-bold text-[color:var(--w-on-accent)]">{fmt(corteResult.total_general)}</span>
                </div>
                {Number(corteResult.total_propinas ?? 0) > 0 && (
                  <div className="flex justify-between items-center bg-[var(--w-info-bg)] border border-[var(--w-info)] rounded-[var(--w-r-lg)] px-4 py-3">
                    <span className="text-sm font-bold text-[color:var(--w-info-text)]">Propinas (no es venta)</span>
                    <span className="font-bold text-[color:var(--w-info-text)]">{fmt(corteResult.total_propinas)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-[var(--w-danger-bg)] border border-[var(--w-danger)] rounded-[var(--w-r-lg)] px-4 py-3">
                  <span className="text-sm font-bold text-[color:var(--w-danger-text)]">Gastos del día</span>
                  <span className="font-bold text-[color:var(--w-danger-text)]">−{fmt(corteResult.total_gastos)}</span>
                </div>
                <GastosDesglose gastos={gastos} periodo="dia" etiquetas={etiquetas} />
                <div className="flex justify-between items-center bg-[var(--w-success-bg)] border border-[var(--w-success)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.cta}>
                  <span className="text-sm font-bold text-[color:var(--w-on-accent)]">Beneficio neto</span>
                  <span className="text-xl font-bold text-[color:var(--w-on-accent)]">{fmt(corteResult.total_neto ?? corteResult.total_general)}</span>
                </div>
                <div className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.field}>
                  <span className="text-sm text-[color:var(--w-text-2)]">Base de caja</span>
                  <span className="font-bold text-[color:var(--w-text)]">{fmt(corteResult.base_caja)}</span>
                </div>
                {/* Explicación del efectivo esperado: cada renglón que entra o sale del cajón */}
                {[
                  { label: '+ Aportes a la caja', val: corteResult.aportes_a_caja, sign: '+' },
                  { label: '− Gastos pagados con efectivo de la caja', val: corteResult.gastos_pagados_de_caja, sign: '−' },
                  { label: '− Reembolsos pagados de la caja', val: corteResult.reembolsos_de_caja, sign: '−' },
                ].filter(x => Number(x.val ?? 0) > 0).map(x => (
                  <div key={x.label} className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] px-4 py-2" style={FX.field}>
                    <span className="text-xs text-[color:var(--w-text-2)]">{x.label}</span>
                    <span className="font-bold text-sm text-[color:var(--w-text)]">{x.sign}{fmt(x.val)}</span>
                  </div>
                ))}
                {Number(corteResult.gastos_adelantados ?? 0) > 0 && (
                  <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-warning-text)] px-1">
                    Gastos adelantados con dinero propio: {fmt(corteResult.gastos_adelantados)} · cuentan como gasto del negocio pero no salen del cajón (quedan por reembolsar).
                  </p>
                )}
                <div className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.field}>
                  <span className="text-sm text-[color:var(--w-text-2)]">Efectivo esperado en caja<br /><span className="text-[length:var(--w-fs-caption)]">base + aportes + efectivo + propinas en efectivo − gastos de caja − reembolsos</span></span>
                  <span className="font-bold text-[color:var(--w-text)]">{fmt(corteResult.efectivo_esperado_cajon)}</span>
                </div>
              </div>

              {/* Transferencias del día: se marcan una por una contra la app del banco */}
              {transferencias.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-[color:var(--w-text-2)] uppercase tracking-wider mb-2">
                    Transferencias del día ({transferencias.filter(t => t.verificada).length}/{transferencias.length} verificadas)
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {transferencias.map(t => (
                      <label key={t.pago_id} className="flex items-center gap-3 bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 min-h-[44px] cursor-pointer" style={FX.field}>
                        <input type="checkbox" checked={t.verificada} className="w-5 h-5 accent-[var(--w-success)]"
                          onChange={async e => {
                            const v = e.target.checked
                            setTransferencias(prev => prev.map(x => x.pago_id === t.pago_id ? { ...x, verificada: v } : x))
                            const { error } = await supabase.rpc('marcar_transferencia', { p_pago_id: t.pago_id, p_verificada: v })
                            if (error) { message.error(error.message); setTransferencias(prev => prev.map(x => x.pago_id === t.pago_id ? { ...x, verificada: !v } : x)) }
                          }} />
                        <span className="flex-1 text-xs text-[color:var(--w-text)]">
                          {t.mesa ? `Mesa ${t.mesa}` : t.tipo === 'LLEVAR' ? 'Llevar' : 'Domicilio'}{t.cliente ? ` · ${t.cliente}` : ''}{t.comensal ? ` · ${t.comensal}` : ''}
                          {t.referencia ? ` · ref ${t.referencia}` : ''}
                        </span>
                        <span className="font-bold text-sm text-[color:var(--w-text)]">{fmt(t.monto)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Si el conteo físico no cuadra, estas son las mesas con varios pagos: ahí suele estar el error */}
              {mesasMixtas.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-[color:var(--w-text-2)] uppercase tracking-wider mb-2">Mesas con pagos mixtos hoy</p>
                  <div className="flex flex-col gap-1.5">
                    {mesasMixtas.map(m => (
                      <div key={m.order_id} className="bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2" style={FX.field}>
                        <p className="text-xs font-bold text-[color:var(--w-text)]">
                          {m.mesa ? `Mesa ${m.mesa}` : m.tipo}{m.cliente ? ` · ${m.cliente}` : ''} · {fmt(m.total)}
                        </p>
                        <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-2)]">
                          {m.pagos.map(p => `${p.comensal ?? 'Pago'}: ${fmt(p.monto)} ${p.metodo}`).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conteo físico de efectivo (arqueo): cuántos billetes/monedas hay de cada denominación.
                  El efectivo esperado en el cajón incluye las propinas pagadas en efectivo, no solo
                  las ventas — si no, el conteo "no cuadra" solo porque hay propinas de por medio. */}
              <div className="mb-5">
                <p className="text-xs font-bold text-[color:var(--w-text-2)] uppercase tracking-wider mb-2">
                  Conteo de efectivo (opcional)
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {DENOMINACIONES.map(valor => (
                    <div key={valor} className="flex items-center gap-2 bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-2 py-1.5" style={FX.field}>
                      <span className="text-xs text-[color:var(--w-text-2)] w-14 shrink-0">${valor.toLocaleString('es-CO')}</span>
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={conteo[valor] ?? ''}
                        onChange={e => setConteo(prev => ({ ...prev, [valor]: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[color:var(--w-text)] outline-none text-right"
                      />
                    </div>
                  ))}
                </div>
                {Number(corteResult.total_propinas_efectivo ?? 0) > 0 && (
                  <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)] mb-2">
                    Incluye {fmt(corteResult.total_propinas_efectivo)} de propinas en efectivo — recuerda separarlas, no son venta del restaurante.
                  </p>
                )}
                {denominacionesConteo.length > 0 && (() => {
                  const efectivoEsperado = Number(corteResult.efectivo_esperado_cajon ?? corteResult.total_efectivo)
                  const diferencia = totalContado - efectivoEsperado
                  return (
                    <div className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2 text-xs" style={FX.field}>
                      <span className="text-[color:var(--w-text-2)]">Contado: {fmt(totalContado)} · Esperado: {fmt(efectivoEsperado)}</span>
                      <span className={`font-bold ${Math.abs(diferencia) < 0.01 ? 'text-[color:var(--w-success-text)]' : 'text-[color:var(--w-danger-text)]'}`}>
                        {Math.abs(diferencia) < 0.01 ? '✓ Cuadra' : `Diferencia: ${diferencia < 0 ? '−' : ''}${fmt(Math.abs(diferencia))}`}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {corteProductos.length > 0 && (
                <p className="text-xs text-[color:var(--w-text-2)] text-center mb-3">
                  {corteProductos.length} productos vendidos hoy · se incluyen en el Excel
                </p>
              )}

              {/* Botones fijos al fondo: siempre alcanzables aunque el corte sea largo */}
              <div className="sticky bottom-0 -mx-6 -mb-6 px-6 pb-6 pt-3 bg-[var(--w-surface)] rounded-b-[var(--w-r-xl)]">
                <button
                  onClick={handleDescargarExcel}
                  className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-on-accent)] mb-3 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--w-success)', ...FX.cta }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 18, height: 18 }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Descargar Excel
                </button>

                <button
                  onClick={() => armarCierre(corteResult, denominacionesConteo.length > 0 ? totalContado : null).then(setCierreTicket).catch(e => message.error(`No se pudo preparar el cierre: ${e instanceof Error ? e.message : 'error'}`))}
                  className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-text)] mb-3"
                  style={FX.card}
                >
                  🖨 Imprimir cierre (con el conteo, si lo hiciste)
                </button>

                <button
                  onClick={() => setShowCorte(false)}
                  className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-text)]"
                  style={FX.card}
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showCategorias && (
          <CategoriasGastoEditor
            key="categorias-gasto-editor"
            filas={filasCategorias}
            usaSugeridas={usaSugeridas}
            onClose={() => setShowCategorias(false)}
            onChanged={recargarCategorias}
          />
        )}

        {editingOrder && (
          <EditOrderModal
            key={editingOrder.id}
            order={editingOrder}
            onClose={() => setEditingOrder(null)}
            onSaved={() => { setEditingOrder(null); fetchData() }}
          />
        )}

        {/* ── Modal corte mensual ── */}
        {corteMensual && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--w-overlay)] z-50 flex items-center justify-center p-4"
            onClick={() => setCorteMensual(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-6 w-full max-w-md" style={{ ...FX.card, maxHeight: '88vh', overflowY: 'auto' }}
            >
              <div className="text-center mb-5">
                <h3 className="font-bold text-[color:var(--w-text)] text-xl">Corte mensual</h3>
                <p className="text-xs text-[color:var(--w-text-3)]">
                  {(m => m.charAt(0).toUpperCase() + m.slice(1))(new Date(corteMensual.desde + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }))}
                  {' · '}del {Number(corteMensual.desde.slice(8))} al {Number(corteMensual.hasta.slice(8))} · sin Rappi
                </p>
              </div>
              <div className="flex flex-col gap-3 mb-5">
                {[
                  { label: 'Efectivo',      val: fmt(corteMensual.total_efectivo) },
                  { label: 'Transferencia', val: fmt(corteMensual.total_transferencia) },
                  ...(Number(corteMensual.total_tarjeta ?? 0) > 0 ? [{ label: 'Tarjeta', val: fmt(corteMensual.total_tarjeta) }] : []),
                  { label: 'Órdenes',       val: String(corteMensual.total_ordenes) },
                ].map(it => (
                  <div key={it.label} className="flex justify-between items-center bg-[var(--w-surface-sunken)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.field}>
                    <span className="text-sm text-[color:var(--w-text-2)]">{it.label}</span>
                    <span className="font-bold text-[color:var(--w-text)]">{it.val}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-[var(--w-accent)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.cta}>
                  <span className="text-sm font-bold text-[color:var(--w-on-accent)]">Ventas del mes</span>
                  <span className="text-xl font-bold text-[color:var(--w-on-accent)]">{fmt(corteMensual.total_general)}</span>
                </div>
                {Number(corteMensual.total_propinas) > 0 && (
                  <div className="flex justify-between items-center bg-[var(--w-info-bg)] border border-[var(--w-info)] rounded-[var(--w-r-lg)] px-4 py-3">
                    <span className="text-sm font-bold text-[color:var(--w-info-text)]">Propinas (no es venta)</span>
                    <span className="font-bold text-[color:var(--w-info-text)]">{fmt(corteMensual.total_propinas)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-[var(--w-danger-bg)] border border-[var(--w-danger)] rounded-[var(--w-r-lg)] px-4 py-3">
                  <span className="text-sm font-bold text-[color:var(--w-danger-text)]">Gastos del mes</span>
                  <span className="font-bold text-[color:var(--w-danger-text)]">−{fmt(corteMensual.total_gastos)}</span>
                </div>
                <GastosDesglose gastos={gastosMes} periodo="mes" etiquetas={etiquetas} />
                <div className="flex justify-between items-center bg-[var(--w-success-bg)] border border-[var(--w-success)] rounded-[var(--w-r-lg)] px-4 py-3" style={FX.cta}>
                  <span className="text-sm font-bold text-[color:var(--w-on-accent)]">Beneficio neto del mes</span>
                  <span className="text-xl font-bold text-[color:var(--w-on-accent)]">{fmt(corteMensual.total_neto)}</span>
                </div>
              </div>

              {corteMensual.dias.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-[color:var(--w-text-2)] uppercase tracking-wider mb-2">Por día</p>
                  <div className="flex flex-col gap-1">
                    {corteMensual.dias.map(d => (
                      <div key={d.fecha} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2" style={FX.field}>
                        <span className="text-[color:var(--w-text)] font-semibold capitalize">
                          {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}
                          {Number(d.gastos) > 0 && (
                            <span className="block text-[length:var(--w-fs-caption)] font-normal normal-case text-[color:var(--w-danger-text)]">Gastos −{fmt(Number(d.gastos))}</span>
                          )}
                        </span>
                        <span className="text-[color:var(--w-text-3)] text-xs">{d.ordenes} órd.</span>
                        <span className="font-bold text-[color:var(--w-text)] text-right">{fmt(d.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleDescargarExcelMensual}
                className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-on-accent)] mb-3 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--w-success)', ...FX.cta }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 18, height: 18 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Descargar Excel
              </button>

              <button onClick={() => setCorteMensual(null)} className="w-full py-3 rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-text)]" style={FX.card}>
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

CashierPanel.displayName = 'CashierPanel'
