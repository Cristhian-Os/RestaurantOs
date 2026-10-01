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
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { descargarCorteExcel, descargarCorteMensualExcel, type CorteProducto } from '../../services/corteExcel'
import { pushNotificationService } from '../../services/pushNotificationService'
import { hoyBogota } from '../../services/menuOptions'
import { VoiceButton } from '../VoiceButton'
import { matchName } from '../../services/voiceMatch'
import { EditOrderModal, type OrderItemRow } from '../orders/EditOrderModal'
import { SalesHistory } from './SalesHistory'
import message from 'antd/es/message'
import type { Profile } from '../../pages/Dashboard'

const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
  green:   { boxShadow: 'var(--shadow-green)' },
} as const

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
  total_ordenes:      number
  total_propinas:     number
  ordenes_rappi:      number   // solo conteo: el dinero lo paga Rappi por fuera
}

interface CorteMensual {
  mes: string; desde: string; hasta: string
  total_efectivo: number; total_transferencia: number; total_general: number
  total_ordenes: number; total_propinas: number; total_gastos: number; total_neto: number
  dias: { fecha: string; efectivo: number; transferencia: number; total: number; ordenes: number; gastos: number }[]
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
  { key: 'pending',   label: 'Pendiente',  color: '#9CA3AF' },
  { key: 'cooking',   label: 'Cocinando',  color: '#F97316' },
  { key: 'ready',     label: 'Listo',      color: '#10B981' },
  { key: 'completed', label: 'Completado', color: '#3B82F6' },
] as const

// Barra de etapas del pedido; se actualiza sola porque la lista se refresca por Realtime.
const OrderProgress = ({ status }: { status: string }) => {
  const idx = Math.max(0, PROGRESS_STEPS.findIndex(s => s.key === status))
  const current = PROGRESS_STEPS[idx]
  return (
    <div className="mb-3" aria-label={`Estado: ${current.label}`}>
      <div className="flex gap-1">
        {PROGRESS_STEPS.map((s, i) => (
          <div key={s.key} className="flex-1 h-2 rounded-full bg-[#CDD0DC] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              initial={false}
              animate={{ width: i <= idx ? '100%' : '0%', backgroundColor: current.color }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
        ))}
      </div>
      <p className="text-[0.625rem] font-bold mt-1" style={{ color: current.color }}>{current.label}</p>
    </div>
  )
}

interface Gasto {
  id:         string
  concepto:   string
  monto:      number
  created_at: string
}

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
  const [daySummary,   setSummary]   = useState<DaySummary>({ total_efectivo: 0, total_transferencia: 0, total_ordenes: 0, total_propinas: 0, ordenes_rappi: 0 })
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
  const [loadingMensual,setLoadingMensual]= useState(false)
  const [showHistory,  setShowHistory]  = useState(false)

  const fetchData = useCallback(async () => {
    const inicioDia = new Date(new Date().setHours(0,0,0,0)).toISOString()
    const parseItems = (o: any): Order => ({
      ...o,
      items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
    })
    const [pendingRes, ordersRes, cookingRes, completedRes, gastosRes, baseRes] = await Promise.all([
      // Plan B: pedidos recién creados (mesero o QR) esperando cobro ANTES de pasar a cocina.
      supabase.from('orders').select('*').eq('status', 'pending').is('paid_at', null).order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'ready').order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'cooking').order('created_at', { ascending: true }),
      supabase.from('orders').select('total, payment_method, propina, tipo_pedido')
        .eq('status', 'completed')
        .gte('created_at', inicioDia),
      supabase.from('gastos').select('id, concepto, monto, created_at')
        .gte('created_at', inicioDia).order('created_at', { ascending: false }),
      supabase.from('bases_caja').select('monto').eq('fecha', hoyBogota()).maybeSingle(),
    ])

    if (!pendingRes.error) setPendingPayment((pendingRes.data || []).map(parseItems))

    if (!ordersRes.error) {
      setReady((ordersRes.data || []).map(parseItems))
    }

    if (!cookingRes.error) setCooking((cookingRes.data || []).map(parseItems))

    if (!completedRes.error) {
      const all = completedRes.data || []
      const orders = all.filter(o => !esRappi(o))
      setSummary({
        ordenes_rappi:       all.length - orders.length,
        total_efectivo:      orders.filter(o => o.payment_method === 'efectivo').reduce((s,o) => s + Number(o.total), 0),
        total_transferencia: orders.filter(o => o.payment_method === 'transferencia').reduce((s,o) => s + Number(o.total), 0),
        total_ordenes:       orders.length,
        total_propinas:      orders.reduce((s,o) => s + Number(o.propina || 0), 0),
      })
    }

    if (!gastosRes.error) setGastos(gastosRes.data || [])
    if (!baseRes.error) setBaseHoy(baseRes.data ? Number(baseRes.data.monto) : null)

    setLoading(false)
  }, [])

  const totalGastosHoy = gastos.reduce((s, g) => s + Number(g.monto), 0)

  const handleAgregarGasto = useCallback(async () => {
    const monto = parseFloat(gastoMonto)
    if (!gastoConcepto.trim()) { message.error('Escribe el concepto del gasto'); return }
    if (!monto || monto <= 0) { message.error('Monto inválido'); return }
    setSavingGasto(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('gastos').insert({
      concepto: gastoConcepto.trim(), monto, registrado_por: user?.id ?? null,
    })
    setSavingGasto(false)
    if (error) { message.error('Error: ' + error.message); return }
    setGastoConcepto(''); setGastoMonto(''); setShowGastoForm(false)
    message.success('Gasto registrado')
    fetchData()
  }, [gastoConcepto, gastoMonto, fetchData])

  // Ingredientes existentes, para vincular cada producto de la compra a su stock
  useEffect(() => {
    supabase.from('ingredientes').select('id, nombre, unidad_medida').order('nombre')
      .then(({ data }) => setIngredientesOpts(data ?? []))
  }, [])

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
    const { error } = await supabase.rpc('registrar_compra_proveedor', {
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
    setGastoConcepto(''); setProvItems([{ ...PROV_ITEM_EMPTY }]); setShowGastoForm(false)
    message.success('Compra registrada · stock actualizado')
    fetchData()
  }, [gastoConcepto, provItems, fetchData])

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
      setPayingOrder(null)
      fetchData()
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al cobrar'}`)
    } finally {
      setProcessing(false)
    }
  }, [payingOrder, payingKind, payMethod, amountPaid, propinaInput, fetchData])

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
    setCorteMensual(data as CorteMensual)
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
      })
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al generar Excel'}`)
    }
  }, [corteMensual])

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
        gastos: gastos.map(g => ({ concepto: g.concepto, monto: Number(g.monto) })),
        denominaciones: denominacionesConteo,
      })
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al generar Excel'}`)
    }
  }, [corteResult, corteProductos, gastos, denominacionesConteo])

  const totalDia = daySummary.total_efectivo + daySummary.total_transferencia
  const netoDia  = totalDia - totalGastosHoy

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Base de caja: efectivo con el que arranca el cajón (punto de partida del corte) */}
      <div className="bg-[#D8DAE4] rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between" style={S.neoOutSm}>
        <div>
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Base de caja de hoy</p>
          {baseHoy !== null && !editandoBase ? (
            <p className="text-2xl font-bold text-[#2D3561]">{fmt(baseHoy)}</p>
          ) : (
            <p className="text-sm text-[#6B7280]">¿Con cuánto efectivo arranca la caja hoy?</p>
          )}
        </div>
        {baseHoy !== null && !editandoBase ? (
          <button onClick={() => { setBaseInput(String(baseHoy)); setEditandoBase(true) }}
            className="px-4 py-2 rounded-2xl text-sm font-bold text-[#2D3561]" style={S.neoOutSm}>
            Cambiar
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <input type="number" min={0} inputMode="numeric" value={baseInput}
              onChange={e => setBaseInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleGuardarBase() }}
              placeholder="Ej: 100000" aria-label="Base de caja"
              className="w-36 bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm font-bold text-[#2D3561] outline-none" style={S.neoIn} />
            <button onClick={handleGuardarBase} disabled={savingBase}
              className="px-4 py-2 rounded-2xl text-sm font-bold text-white bg-[#FF5722]" style={{ ...S.coral, opacity: savingBase ? 0.6 : 1 }}>
              {savingBase ? 'Guardando…' : 'Guardar base'}
            </button>
            {baseHoy !== null && (
              <button onClick={() => setEditandoBase(false)} className="text-sm font-bold text-[#6B7280] px-2">Cancelar</button>
            )}
          </div>
        )}
      </div>

      {/* Resumen del día (Rappi no cuenta: precios distintos al menú físico) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Efectivo hoy',       val: `$${Math.round(daySummary.total_efectivo).toLocaleString('es-CO')}`,     color: 'text-emerald-600' },
          { label: 'Transferencias hoy', val: `$${Math.round(daySummary.total_transferencia).toLocaleString('es-CO')}`, color: 'text-blue-600'    },
          { label: 'Propinas hoy',       val: `$${Math.round(daySummary.total_propinas).toLocaleString('es-CO')}`,      color: 'text-purple-500'  },
          { label: 'Gastos hoy',         val: `$${Math.round(totalGastosHoy).toLocaleString('es-CO')}`,                 color: 'text-red-500'     },
          { label: 'Neto del día',       val: `$${Math.round(netoDia).toLocaleString('es-CO')}`,                        color: 'text-[#FF5722]'   },
        ].map(s => (
          <div key={s.label} className="bg-[#D8DAE4] rounded-2xl p-4 text-center" style={S.neoOutSm}>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[0.625rem] text-[#9CA3AF] font-medium mt-0.5">{s.label}</p>
            {s.label === 'Neto del día' && (
              <p className="text-[0.625rem] text-[#9CA3AF]">{daySummary.total_ordenes} órdenes</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs font-bold text-[#6B7280] -mt-3">
        Pedidos Rappi: {daySummary.ordenes_rappi} {daySummary.ordenes_rappi === 1 ? 'orden' : 'órdenes'} — $0 (dinero en Rappi app)
      </p>

      {/* Gastos del día */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Gastos del día
            <span className="ml-2 text-sm font-normal text-[#9CA3AF]">({gastos.length})</span>
          </h2>
          <button onClick={() => setShowGastoForm(v => !v)}
            className="px-4 py-2 rounded-2xl text-sm font-bold"
            style={showGastoForm ? { background: 'var(--accent)', color: '#fff', ...S.coral } : { background: '#D8DAE4', color: '#2D3561', ...S.neoOutSm }}>
            + Agregar gasto
          </button>
        </div>

        {showGastoForm && (
          <div className="bg-[#D8DAE4] rounded-2xl p-4 mb-4" style={S.neoOut}>
            {/* Modo: gasto simple vs compra a proveedor con detalle */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setGastoModo('simple')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={gastoModo === 'simple' ? { background: 'var(--accent)', color: '#fff' } : { background: '#CDD0DC', color: '#6B7280' }}>
                Gasto simple
              </button>
              <button onClick={() => setGastoModo('proveedor')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={gastoModo === 'proveedor' ? { background: 'var(--accent)', color: '#fff' } : { background: '#CDD0DC', color: '#6B7280' }}>
                Compra a proveedor
              </button>
            </div>

            {gastoModo === 'simple' ? (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase mb-1">Concepto</label>
                  <div className="flex gap-2">
                    <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                      placeholder="Ej: Domicilio de insumos"
                      className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setGastoConcepto(r.transcript.trim().replace(/.$/, ''))} />
                  </div>
                </div>
                <div className="w-32">
                  <label className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase mb-1">Monto</label>
                  <input type="number" min={0} value={gastoMonto} onChange={e => setGastoMonto(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
                </div>
                <button onClick={handleAgregarGasto} disabled={savingGasto}
                  className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white bg-[#FF5722]" style={{ ...S.coral, opacity: savingGasto ? 0.6 : 1 }}>
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
                  <label className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase mb-1">Proveedor / concepto</label>
                  <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                    placeholder="Ej: Distribuidora La Cosecha"
                    className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
                </div>

                <label className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase mb-2">Productos que trajo</label>
                <div className="flex flex-col gap-2 mb-3">
                  {provItems.map((it, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-center bg-[#CDD0DC] rounded-xl p-2" style={S.neoIn}>
                      <select
                        value={it.ingrediente_id}
                        onChange={e => {
                          const ing = ingredientesOpts.find(o => o.id === e.target.value)
                          updateProvItem(idx, { ingrediente_id: e.target.value, nombre_producto: ing?.nombre ?? it.nombre_producto, unidad: ing?.unidad_medida ?? it.unidad })
                        }}
                        className="text-xs bg-white rounded-lg px-2 py-1.5 text-[#2D3561] outline-none">
                        <option value="">Producto nuevo (escribir)…</option>
                        {ingredientesOpts.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      </select>
                      {!it.ingrediente_id && (
                        <input value={it.nombre_producto} onChange={e => updateProvItem(idx, { nombre_producto: e.target.value })}
                          placeholder="Nombre del producto" className="flex-1 min-w-[100px] text-xs bg-white rounded-lg px-2 py-1.5 text-[#2D3561] outline-none" />
                      )}
                      <input type="number" min={0} step="0.01" value={it.cantidad} onChange={e => updateProvItem(idx, { cantidad: e.target.value })}
                        placeholder="Cantidad" className="w-20 text-xs bg-white rounded-lg px-2 py-1.5 text-[#2D3561] outline-none" />
                      <input value={it.unidad} onChange={e => updateProvItem(idx, { unidad: e.target.value })}
                        placeholder="kg / lb / und" className="w-20 text-xs bg-white rounded-lg px-2 py-1.5 text-[#2D3561] outline-none" />
                      <input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={e => updateProvItem(idx, { precio_unitario: e.target.value })}
                        placeholder="Precio unit." className="w-24 text-xs bg-white rounded-lg px-2 py-1.5 text-[#2D3561] outline-none" />
                      <span className="text-xs font-bold text-[#2D3561] w-20 text-right">
                        ${Math.round((parseFloat(it.cantidad) || 0) * (parseFloat(it.precio_unitario) || 0)).toLocaleString('es-CO')}
                      </span>
                      <button onClick={() => setProvItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                        className="text-[#9CA3AF] hover:text-red-500 text-sm px-1">✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setProvItems(prev => [...prev, { ...PROV_ITEM_EMPTY }])}
                  className="text-xs font-bold text-[#FF5722] mb-3">+ Agregar producto</button>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#2D3561]">Total: ${Math.round(provTotal).toLocaleString('es-CO')}</span>
                  <button onClick={handleAgregarCompraProveedor} disabled={savingGasto}
                    className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white bg-[#FF5722]" style={{ ...S.coral, opacity: savingGasto ? 0.6 : 1 }}>
                    {savingGasto ? 'Guardando…' : 'Guardar compra · sube stock'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {gastos.length === 0 ? (
          <div className="bg-[#D8DAE4] rounded-2xl p-6 text-center" style={S.neoIn}>
            <p className="text-sm text-[#9CA3AF]">Sin gastos registrados hoy</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map(g => (
              <div key={g.id} className="flex items-center justify-between bg-[#D8DAE4] rounded-2xl px-4 py-3" style={S.neoOutSm}>
                <div>
                  <p className="font-semibold text-[#2D3561] text-sm">{g.concepto}</p>
                  <p className="text-[0.6875rem] text-[#9CA3AF]">{new Date(g.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-500">${Math.round(Number(g.monto)).toLocaleString('es-CO')}</span>
                  <button onClick={() => handleEliminarGasto(g.id)} className="text-[#9CA3AF] hover:text-red-500 text-sm">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pedidos esperando cobro ANTES de pasar a cocina (Plan B) */}
      {pendingPayment.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-amber-600" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Pedidos por cobrar antes de cocina
              <span className="ml-2 text-sm font-normal text-[#9CA3AF]">({pendingPayment.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {pendingPayment.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#D8DAE4] rounded-3xl p-5 border-2 border-amber-400" style={S.neoOut}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[#2D3561] text-lg">
                      {order.table_num ? `Mesa ${order.table_num}` : order.tipo_pedido}
                      {order.customer_name && <span className="text-[#FF5722]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    {order.notes && <p className="text-xs text-[#6B7280] italic mt-1">{order.notes}</p>}
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
                <OrderProgress status={order.status} />
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                      <span className="text-[#9CA3AF]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openPay(order, 'inicial')}
                  className="w-full py-3 rounded-2xl font-bold text-white text-sm"
                  style={{ backgroundColor: '#D97706' }}
                >
                  Cobrar y enviar a cocina · ${Math.round(order.total).toLocaleString('es-CO')}
                </motion.button>
                <div className="flex gap-2 mt-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setEditingOrder(order)}
                    className="flex-1 py-2 rounded-2xl font-bold text-white bg-amber-500 text-xs"
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
                    className="flex-1 py-2 rounded-2xl font-bold text-white bg-red-600 text-xs"
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
            <h2 className="text-xl font-bold text-amber-600" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              En cocina
              <span className="ml-2 text-sm font-normal text-[#9CA3AF]">({cookingOrders.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {cookingOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#D8DAE4] rounded-3xl p-5 border-2 border-amber-400" style={S.neoOut}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[#2D3561] text-lg">
                      {order.table_num ? `Mesa ${order.table_num}` : order.tipo_pedido}
                      {order.customer_name && <span className="text-[#FF5722]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className="text-xs font-bold mt-0.5 text-amber-600">Preparándose en cocina</p>
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
                <OrderProgress status={order.status} />
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.filter((it: any) => !it.cancelled).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                      <span className="text-[#9CA3AF]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
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
                  className="w-full py-3 rounded-2xl font-bold text-white bg-red-600 text-sm"
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
          <h2 className="text-xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Órdenes para cobrar
            <span className="ml-2 text-sm font-normal text-[#9CA3AF]">({readyOrders.length})</span>
          </h2>
          <button onClick={fetchData} className="p-2.5 rounded-2xl text-[#6B7280]" style={S.neoOutSm}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        {readyOrders.length === 0 ? (
          <div className="bg-[#D8DAE4] rounded-3xl p-12 text-center" style={S.neoIn}>
            <p className="text-4xl mb-3"></p>
            <p className="font-bold text-[#2D3561]">Todo al día</p>
            <p className="text-sm text-[#9CA3AF] mt-1">Sin órdenes pendientes de cobro</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readyOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#D8DAE4] rounded-3xl p-5" style={S.neoOut}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-[#2D3561] text-lg">
                      {order.table_num ? `Mesa ${order.table_num}` : order.tipo_pedido}
                      {order.customer_name && <span className="text-[#FF5722]"> · {order.customer_name}</span>}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {orderRef(order)} ·{new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${order.delivered_at ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {order.delivered_at ? '✓ Entregado al mesero' : 'Esperando que el mesero lo recoja'}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>

                <OrderProgress status={order.status} />

                {/* Items */}
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                      <span className="text-[#9CA3AF]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <p className="text-xs text-[#9CA3AF]">+{order.items.length - 4} platos más</p>
                  )}
                  {order.notes && (
                    <p className="text-xs text-[#6B7280] italic mt-1">{order.notes}</p>
                  )}
                </div>

                {order.paid_at && (
                  <p className="text-xs font-bold text-[#6B7280] mb-2">
                    Pagado · {esRappi(order) ? 'Rappi' : order.payment_method === 'transferencia' ? 'Transferencia' : order.payment_method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
                  </p>
                )}
                {order.paid_at ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleCompletarPagada(order)}
                    disabled={processing}
                    className="w-full py-3 rounded-2xl font-bold text-white bg-emerald-600 text-sm"
                    style={{ opacity: processing ? 0.6 : 1 }}
                  >
                    ✓ Ya pagado · Completar pedido
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openPay(order)}
                    className="w-full py-3 rounded-2xl font-bold text-white bg-[#FF5722] text-sm"
                    style={S.coral}
                  >
                    Cobrar ${Math.round(order.total).toLocaleString('es-CO')}
                  </motion.button>
                )}
                <div className="flex gap-2 mt-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setEditingOrder(order)}
                    className="flex-1 py-2 rounded-2xl font-bold text-white bg-amber-500 text-xs"
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
                    className="flex-1 py-2 rounded-2xl font-bold text-white bg-red-600 text-xs"
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
      <div className="pt-4 border-t border-[#D1D5E0] grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Para revisar qué se vendió y para quién ANTES de hacer el corte */}
        <button
          onClick={() => setShowHistory(true)}
          className="w-full sm:col-span-2 py-3.5 rounded-2xl font-bold text-sm text-[#2D3561]"
          style={S.neoOut}
        >
          Historial de ventas de hoy · qué se vendió y para quién
        </button>
        <button
          onClick={handleCorte}
          disabled={cortingLoading || daySummary.total_ordenes === 0}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm text-[#2D3561] ${cortingLoading || daySummary.total_ordenes === 0 ? 'opacity-50' : ''}`}
          style={S.neoOut}
        >
          {cortingLoading ? 'Generando corte...' : `Hacer corte de caja · ${daySummary.total_ordenes} órdenes`}
        </button>
        <button
          onClick={handleCorteMensual}
          disabled={loadingMensual}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm text-[#2D3561] ${loadingMensual ? 'opacity-50' : ''}`}
          style={S.neoOut}
        >
          {loadingMensual ? 'Calculando...' : 'Corte mensual · ventas del mes'}
        </button>
      </div>

      <AnimatePresence>
        {showHistory && <SalesHistory onClose={() => setShowHistory(false)} />}
      </AnimatePresence>

      {/* ── Modal cobro ── */}
      <AnimatePresence>
        {payingOrder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => !processing && setPayingOrder(null)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#D8DAE4] rounded-3xl p-6 w-full max-w-sm" style={S.neoOut}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-xs font-bold text-[#FF5722] uppercase tracking-wider">Cobrar orden</p>
                  <h3 className="font-bold text-[#2D3561] text-lg mt-0.5">
                    {payingOrder.table_num ? `Mesa ${payingOrder.table_num}` : payingOrder.tipo_pedido}
                    {payingOrder.customer_name && <span className="text-[#FF5722]"> · {payingOrder.customer_name}</span>}
                  </h3>
                </div>
                <span className="text-2xl font-bold text-[#FF5722]">${Math.round(payingOrder.total).toLocaleString('es-CO')}</span>
              </div>

              {/* Items en el modal */}
              <div className="bg-[#CDD0DC] rounded-2xl p-3 mb-4 max-h-32 overflow-y-auto" style={S.neoIn}>
                {payingOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                    <span className="text-[#9CA3AF]">${Math.round(item.price * item.quantity).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>

              {/* Método de pago */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(['efectivo', 'transferencia'] as PaymentMethod[]).map(m => (
                  <button key={m}
                    onClick={() => { setPayMethod(m); if (m === 'transferencia') setAmountPaid(String(Math.round(payingOrder.total))) }}
                    className="py-3 rounded-2xl text-sm font-bold capitalize"
                    style={payMethod === m ? { background: 'var(--accent)', color: 'white', ...S.coral } : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}
                  >
                    {m === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </button>
                ))}
              </div>

              {/* Campo monto (solo efectivo) */}
              {payMethod === 'efectivo' && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                    Monto recibido
                  </label>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    min={payingOrder.total}
                    step="0.01"
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-lg font-bold text-[#2D3561] outline-none"
                    style={S.neoIn}
                    autoFocus
                  />
                  {/* Cambio */}
                  {cambio > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between"
                    >
                      <span className="text-sm font-bold text-emerald-700">Cambio</span>
                      <span className="text-2xl font-bold text-emerald-600">{fmt(cambio)}</span>
                    </motion.div>
                  )}
                  {pagoInsuficiente && (
                    <p className="mt-2 text-xs text-red-500 font-medium">
                      Falta {fmt(totalConPropina - parseFloat(amountPaid))}
                    </p>
                  )}
                </div>
              )}

              {payMethod === 'transferencia' && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                  <p className="text-sm font-bold text-blue-700">Confirmar transferencia</p>
                  <p className="text-xs text-blue-600 mt-0.5">
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
                <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">¿El cliente dejó propina?</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button type="button"
                    onClick={() => { setPropinaRespuesta('si'); if (!propinaInput || propinaInput === '0') setPropinaInput(propinaSugeridaPct ? Math.round(payingOrder.total * propinaSugeridaPct / 100).toString() : '') }}
                    className="py-2.5 rounded-xl text-sm font-bold"
                    style={propinaRespuesta === 'si' ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}>
                    Sí
                  </button>
                  <button type="button"
                    onClick={() => { setPropinaRespuesta('no'); setPropinaInput('0') }}
                    className="py-2.5 rounded-xl text-sm font-bold"
                    style={propinaRespuesta === 'no' ? { background: '#6B7280', color: 'white' } : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}>
                    No
                  </button>
                </div>
                {propinaRespuesta === 'si' && (
                  <>
                    {!!propinaSugeridaPct && (
                      <button type="button"
                        onClick={() => setPropinaInput(Math.round(payingOrder.total * propinaSugeridaPct / 100).toString())}
                        className="text-xs font-bold text-[#FF5722] mb-2 block">
                        Sugerida {propinaSugeridaPct}% · {fmt(payingOrder.total * propinaSugeridaPct / 100)}
                      </button>
                    )}
                    <input type="number" min={0} value={propinaInput} onChange={e => setPropinaInput(e.target.value)}
                      placeholder="Monto de la propina" autoFocus
                      className="w-full bg-[#CDD0DC] rounded-xl px-4 py-2.5 text-sm font-bold text-[#2D3561] outline-none" style={S.neoIn} />
                  </>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setPayingOrder(null)}
                  disabled={processing}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#6B7280]"
                  style={S.neoOut}
                >
                  Cancelar
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCobrar}
                  disabled={processing || !!pagoInsuficiente || !propinaRespuesta}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${processing || pagoInsuficiente || !propinaRespuesta ? 'opacity-60' : ''}`}
                  style={S.coral}
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
            className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCorte(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#D8DAE4] rounded-3xl p-6 w-full max-w-sm" style={S.neoOut}
            >
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500 flex items-center justify-center text-3xl mx-auto mb-3" style={S.green}>
                 
                </div>
                <h3 className="font-bold text-[#2D3561] text-xl">Corte de Caja</h3>
                <p className="text-xs text-[#9CA3AF]">
                  {new Date().toLocaleDateString('es', { dateStyle: 'full' })}
                </p>
              </div>

              <div className="flex flex-col gap-3 mb-5">
                {[
                  { label: 'Efectivo',      val: corteResult.total_efectivo },
                  { label: 'Transferencia', val: corteResult.total_transferencia },
                  { label: 'Órdenes',       val: corteResult.total_ordenes, isCurrency: false },
                  { label: 'Pedidos Rappi', val: `${daySummary.ordenes_rappi} — $0 (dinero en Rappi app)`, isCurrency: false },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center bg-[#CDD0DC] rounded-2xl px-4 py-3" style={S.neoIn}>
                    <span className="text-sm text-[#6B7280]">{item.label}</span>
                    <span className="font-bold text-[#2D3561]">
                      {item.isCurrency === false ? item.val : fmt(item.val)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-[#FF5722] rounded-2xl px-4 py-3" style={S.coral}>
                  <span className="text-sm font-bold text-white">Ganancias (ventas)</span>
                  <span className="text-xl font-bold text-white">{fmt(corteResult.total_general)}</span>
                </div>
                {Number(corteResult.total_propinas ?? 0) > 0 && (
                  <div className="flex justify-between items-center bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3">
                    <span className="text-sm font-bold text-purple-600">Propinas (no es venta)</span>
                    <span className="font-bold text-purple-600">{fmt(corteResult.total_propinas)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <span className="text-sm font-bold text-red-600">Gastos del día</span>
                  <span className="font-bold text-red-600">−{fmt(corteResult.total_gastos)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-500 rounded-2xl px-4 py-3" style={S.green}>
                  <span className="text-sm font-bold text-white">Beneficio neto</span>
                  <span className="text-xl font-bold text-white">{fmt(corteResult.total_neto ?? corteResult.total_general)}</span>
                </div>
                <div className="flex justify-between items-center bg-[#CDD0DC] rounded-2xl px-4 py-3" style={S.neoIn}>
                  <span className="text-sm text-[#6B7280]">Base de caja</span>
                  <span className="font-bold text-[#2D3561]">{fmt(corteResult.base_caja)}</span>
                </div>
                <div className="flex justify-between items-center bg-[#CDD0DC] rounded-2xl px-4 py-3" style={S.neoIn}>
                  <span className="text-sm text-[#6B7280]">Efectivo esperado en caja<br /><span className="text-[0.6875rem]">base + efectivo + propinas en efectivo</span></span>
                  <span className="font-bold text-[#2D3561]">{fmt(corteResult.efectivo_esperado_cajon)}</span>
                </div>
              </div>

              {/* Conteo físico de efectivo (arqueo): cuántos billetes/monedas hay de cada denominación.
                  El efectivo esperado en el cajón incluye las propinas pagadas en efectivo, no solo
                  las ventas — si no, el conteo "no cuadra" solo porque hay propinas de por medio. */}
              <div className="mb-5">
                <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  Conteo de efectivo (opcional)
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {DENOMINACIONES.map(valor => (
                    <div key={valor} className="flex items-center gap-2 bg-[#CDD0DC] rounded-xl px-2 py-1.5" style={S.neoIn}>
                      <span className="text-xs text-[#6B7280] w-14 shrink-0">${valor.toLocaleString('es-CO')}</span>
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={conteo[valor] ?? ''}
                        onChange={e => setConteo(prev => ({ ...prev, [valor]: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[#2D3561] outline-none text-right"
                      />
                    </div>
                  ))}
                </div>
                {Number(corteResult.total_propinas_efectivo ?? 0) > 0 && (
                  <p className="text-[0.6875rem] text-[#9CA3AF] mb-2">
                    Incluye {fmt(corteResult.total_propinas_efectivo)} de propinas en efectivo — recuerda separarlas, no son venta del restaurante.
                  </p>
                )}
                {denominacionesConteo.length > 0 && (() => {
                  const efectivoEsperado = Number(corteResult.efectivo_esperado_cajon ?? corteResult.total_efectivo)
                  const diferencia = totalContado - efectivoEsperado
                  return (
                    <div className="flex justify-between items-center bg-[#CDD0DC] rounded-xl px-3 py-2 text-xs" style={S.neoIn}>
                      <span className="text-[#6B7280]">Contado: {fmt(totalContado)} · Esperado: {fmt(efectivoEsperado)}</span>
                      <span className={`font-bold ${Math.abs(diferencia) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {Math.abs(diferencia) < 0.01 ? '✓ Cuadra' : `Diferencia: ${diferencia < 0 ? '−' : ''}${fmt(Math.abs(diferencia))}`}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {corteProductos.length > 0 && (
                <p className="text-xs text-[#6B7280] text-center mb-3">
                  {corteProductos.length} productos vendidos hoy · se incluyen en el Excel
                </p>
              )}

              <button
                onClick={handleDescargarExcel}
                className="w-full py-3 rounded-2xl font-bold text-white mb-3 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#1D7A46', ...S.green }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 18, height: 18 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Descargar Excel
              </button>

              <button
                onClick={() => setShowCorte(false)}
                className="w-full py-3 rounded-2xl font-bold text-[#2D3561]"
                style={S.neoOut}
              >
                Cerrar
              </button>
            </motion.div>
          </motion.div>
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
            className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setCorteMensual(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#D8DAE4] rounded-3xl p-6 w-full max-w-md" style={{ ...S.neoOut, maxHeight: '88vh', overflowY: 'auto' }}
            >
              <div className="text-center mb-5">
                <h3 className="font-bold text-[#2D3561] text-xl">Corte mensual</h3>
                <p className="text-xs text-[#9CA3AF]">
                  {(m => m.charAt(0).toUpperCase() + m.slice(1))(new Date(corteMensual.desde + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }))}
                  {' · '}del {Number(corteMensual.desde.slice(8))} al {Number(corteMensual.hasta.slice(8))} · sin Rappi
                </p>
              </div>
              <div className="flex flex-col gap-3 mb-5">
                {[
                  { label: 'Efectivo',      val: fmt(corteMensual.total_efectivo) },
                  { label: 'Transferencia', val: fmt(corteMensual.total_transferencia) },
                  { label: 'Órdenes',       val: String(corteMensual.total_ordenes) },
                ].map(it => (
                  <div key={it.label} className="flex justify-between items-center bg-[#CDD0DC] rounded-2xl px-4 py-3" style={S.neoIn}>
                    <span className="text-sm text-[#6B7280]">{it.label}</span>
                    <span className="font-bold text-[#2D3561]">{it.val}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-[#FF5722] rounded-2xl px-4 py-3" style={S.coral}>
                  <span className="text-sm font-bold text-white">Ventas del mes</span>
                  <span className="text-xl font-bold text-white">{fmt(corteMensual.total_general)}</span>
                </div>
                {Number(corteMensual.total_propinas) > 0 && (
                  <div className="flex justify-between items-center bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3">
                    <span className="text-sm font-bold text-purple-600">Propinas (no es venta)</span>
                    <span className="font-bold text-purple-600">{fmt(corteMensual.total_propinas)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <span className="text-sm font-bold text-red-600">Gastos del mes</span>
                  <span className="font-bold text-red-600">−{fmt(corteMensual.total_gastos)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-500 rounded-2xl px-4 py-3" style={S.green}>
                  <span className="text-sm font-bold text-white">Beneficio neto del mes</span>
                  <span className="text-xl font-bold text-white">{fmt(corteMensual.total_neto)}</span>
                </div>
              </div>

              {corteMensual.dias.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Por día</p>
                  <div className="flex flex-col gap-1">
                    {corteMensual.dias.map(d => (
                      <div key={d.fecha} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm bg-[#CDD0DC] rounded-xl px-3 py-2" style={S.neoIn}>
                        <span className="text-[#2D3561] font-semibold capitalize">
                          {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[#9CA3AF] text-xs">{d.ordenes} órd.</span>
                        <span className="font-bold text-[#2D3561] text-right">{fmt(d.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleDescargarExcelMensual}
                className="w-full py-3 rounded-2xl font-bold text-white mb-3 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#1D7A46', ...S.green }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 18, height: 18 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Descargar Excel
              </button>

              <button onClick={() => setCorteMensual(null)} className="w-full py-3 rounded-2xl font-bold text-[#2D3561]" style={S.neoOut}>
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
