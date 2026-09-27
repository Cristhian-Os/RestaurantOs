/**
 * CashierPanel.tsx
 * ─────────────────────────────────────────────────────────────
 * Panel completo de caja:
 *  • Órdenes listas para cobrar con Realtime
 *  • Modal de cobro: efectivo (con cambio) o transferencia
 *  • Resumen del día
 *  • Corte de caja
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { descargarCorteExcel, type CorteProducto } from '../../services/corteExcel'
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
  mesa_id:    string | null
  table_num:  number | null
  items:      Array<{ id: string; name: string; price: number; quantity: number; notes?: string }>
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
  const [daySummary,   setSummary]   = useState<DaySummary>({ total_efectivo: 0, total_transferencia: 0, total_ordenes: 0, total_propinas: 0 })
  const [loading,      setLoading]   = useState(true)
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
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [editItems,     setEditItems]     = useState<any[]>([])
  const [savingEdit,    setSavingEdit]    = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const inicioDia = new Date(new Date().setHours(0,0,0,0)).toISOString()
    const parseItems = (o: any): Order => ({
      ...o,
      items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
    })
    const [pendingRes, ordersRes, cookingRes, completedRes, gastosRes] = await Promise.all([
      // Plan B: pedidos recién creados (mesero o QR) esperando cobro ANTES de pasar a cocina.
      supabase.from('orders').select('*').eq('status', 'pending').is('paid_at', null).order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'ready').order('created_at', { ascending: true }),
      supabase.from('orders').select('*').eq('status', 'cooking').order('created_at', { ascending: true }),
      supabase.from('orders').select('total, payment_method, propina')
        .eq('status', 'completed')
        .gte('created_at', inicioDia),
      supabase.from('gastos').select('id, concepto, monto, created_at')
        .gte('created_at', inicioDia).order('created_at', { ascending: false }),
    ])

    if (!pendingRes.error) setPendingPayment((pendingRes.data || []).map(parseItems))

    if (!ordersRes.error) {
      setReady((ordersRes.data || []).map(parseItems))
    }

    if (!cookingRes.error) setCooking((cookingRes.data || []).map(parseItems))

    if (!completedRes.error) {
      const orders = completedRes.data || []
      setSummary({
        total_efectivo:      orders.filter(o => o.payment_method === 'efectivo').reduce((s,o) => s + o.total, 0),
        total_transferencia: orders.filter(o => o.payment_method === 'transferencia').reduce((s,o) => s + o.total, 0),
        total_ordenes:       orders.length,
        total_propinas:      orders.reduce((s,o) => s + Number(o.propina || 0), 0),
      })
    }

    if (!gastosRes.error) setGastos(gastosRes.data || [])

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

  // Orden ya pagada antes de cocina (Plan B) y ahora lista: solo se completa,
  // sin volver a pedir el pago.
  const handleCompletarPagada = useCallback(async (order: Order) => {
    setProcessing(true)
    try {
      const { error } = await supabase.rpc('cobrar_orden', {
        p_order_id:       order.id,
        p_payment_method: order.payment_method ?? 'efectivo',
        p_amount_paid:    order.amount_paid ?? order.total,
      })
      if (error) throw error
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
      {/* Resumen del día */}
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
            <p className="text-[10px] text-[#9CA3AF] font-medium mt-0.5">{s.label}</p>
            {s.label === 'Neto del día' && (
              <p className="text-[10px] text-[#9CA3AF]">{daySummary.total_ordenes} órdenes</p>
            )}
          </div>
        ))}
      </div>

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
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase mb-1">Concepto</label>
                  <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                    placeholder="Ej: Domicilio de insumos"
                    className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
                </div>
                <div className="w-32">
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase mb-1">Monto</label>
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
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase mb-1">Proveedor / concepto</label>
                  <input value={gastoConcepto} onChange={e => setGastoConcepto(e.target.value)}
                    placeholder="Ej: Distribuidora La Cosecha"
                    className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
                </div>

                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase mb-2">Productos que trajo</label>
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
                  <p className="text-[11px] text-[#9CA3AF]">{new Date(g.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
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
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      #{order.id.slice(0,8)} · {new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    {order.notes && <p className="text-xs text-[#6B7280] italic mt-1">{order.notes}</p>}
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
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
                    onClick={() => {
                      setEditingOrderId(order.id)
                      setEditItems(order.items || [])
                    }}
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
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      #{order.id.slice(0,8)} · {new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className="text-xs font-bold mt-0.5 text-amber-600">Preparándose en cocina</p>
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>
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
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      #{order.id.slice(0,8)} · {new Date(order.created_at).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' })}
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${order.delivered_at ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {order.delivered_at ? '✓ Entregado al mesero' : 'Esperando que el mesero lo recoja'}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${Math.round(order.total).toLocaleString('es-CO')}</span>
                </div>

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
                    onClick={() => {
                      setEditingOrderId(order.id)
                      setEditItems(order.items || [])
                    }}
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

      {/* Botón corte de caja */}
      <div className="pt-4 border-t border-[#D1D5E0]">
        <button
          onClick={handleCorte}
          disabled={cortingLoading || daySummary.total_ordenes === 0}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm text-[#2D3561] ${cortingLoading || daySummary.total_ordenes === 0 ? 'opacity-50' : ''}`}
          style={S.neoOut}
        >
          {cortingLoading ? 'Generando corte...' : `Hacer corte de caja · ${daySummary.total_ordenes} órdenes`}
        </button>
      </div>

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
                    onClick={() => { setPayMethod(m); if (m === 'transferencia') setAmountPaid(payingOrder.total.toFixed(2)) }}
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
                      <span className="text-2xl font-bold text-emerald-600">${cambio.toFixed(2)}</span>
                    </motion.div>
                  )}
                  {pagoInsuficiente && (
                    <p className="mt-2 text-xs text-red-500 font-medium">
                      Falta ${(totalConPropina - parseFloat(amountPaid)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {payMethod === 'transferencia' && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                  <p className="text-sm font-bold text-blue-700">Confirmar transferencia</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {propinaNum > 0
                      ? `Venta: $${payingOrder.total.toFixed(2)} + Propina: $${propinaNum.toFixed(2)} = $${totalConPropina.toFixed(2)}`
                      : `Total: $${payingOrder.total.toFixed(2)}`}
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
                        Sugerida {propinaSugeridaPct}% · ${Math.round(payingOrder.total * propinaSugeridaPct / 100).toFixed(2)}
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
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center bg-[#CDD0DC] rounded-2xl px-4 py-3" style={S.neoIn}>
                    <span className="text-sm text-[#6B7280]">{item.label}</span>
                    <span className="font-bold text-[#2D3561]">
                      {item.isCurrency === false ? item.val : `$${Number(item.val).toFixed(2)}`}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center bg-[#FF5722] rounded-2xl px-4 py-3" style={S.coral}>
                  <span className="text-sm font-bold text-white">Ganancias (ventas)</span>
                  <span className="text-xl font-bold text-white">${Number(corteResult.total_general).toFixed(2)}</span>
                </div>
                {Number(corteResult.total_propinas ?? 0) > 0 && (
                  <div className="flex justify-between items-center bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3">
                    <span className="text-sm font-bold text-purple-600">Propinas (no es venta)</span>
                    <span className="font-bold text-purple-600">${Number(corteResult.total_propinas).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <span className="text-sm font-bold text-red-600">Gastos del día</span>
                  <span className="font-bold text-red-600">−${Number(corteResult.total_gastos ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-500 rounded-2xl px-4 py-3" style={S.green}>
                  <span className="text-sm font-bold text-white">Beneficio neto</span>
                  <span className="text-xl font-bold text-white">${Number(corteResult.total_neto ?? corteResult.total_general).toFixed(2)}</span>
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
                  <p className="text-[11px] text-[#9CA3AF] mb-2">
                    Incluye ${Number(corteResult.total_propinas_efectivo).toFixed(2)} de propinas en efectivo — recuerda separarlas, no son venta del restaurante.
                  </p>
                )}
                {denominacionesConteo.length > 0 && (() => {
                  const efectivoEsperado = Number(corteResult.efectivo_esperado_cajon ?? corteResult.total_efectivo)
                  const diferencia = totalContado - efectivoEsperado
                  return (
                    <div className="flex justify-between items-center bg-[#CDD0DC] rounded-xl px-3 py-2 text-xs" style={S.neoIn}>
                      <span className="text-[#6B7280]">Contado: ${totalContado.toFixed(2)} · Esperado: ${efectivoEsperado.toFixed(2)}</span>
                      <span className={`font-bold ${Math.abs(diferencia) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {Math.abs(diferencia) < 0.01 ? '✓ Cuadra' : `Diferencia: $${diferencia.toFixed(2)}`}
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

        {editingOrderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}
            onClick={() => !savingEdit && setEditingOrderId(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ background: '#F5F5F5', borderRadius: '1.25rem', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <h3 style={{ fontWeight: 600, fontSize: '1.25rem', margin: '0 0 1rem', color: '#2D3561' }}>Editar pedido</h3>

              {editItems.length === 0 ? (
                <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem 0' }}>Sin items</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {editItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: '#fff', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #D1D5E0' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, margin: '0 0 0.25rem', color: '#2D3561', fontSize: '0.9375rem' }}>{item.name}</p>
                        <p style={{ color: '#9CA3AF', margin: 0, fontSize: '0.8125rem' }}>${(item.price * item.quantity).toLocaleString('es-CO')}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F5F5F5', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #D1D5E0' }}>
                        <button onClick={() => { const newItems = [...editItems]; newItems[i] = { ...newItems[i], quantity: Math.max(0, newItems[i].quantity - 1) }; setEditItems(newItems) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.5rem', color: '#2D3561' }}>−</button>
                        <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 600, color: '#2D3561' }}>{item.quantity}</span>
                        <button onClick={() => { const newItems = [...editItems]; newItems[i] = { ...newItems[i], quantity: newItems[i].quantity + 1 }; setEditItems(newItems) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.5rem', color: '#2D3561' }}>+</button>
                      </div>
                      <button onClick={() => setEditItems(editItems.filter((_, idx) => idx !== i))} style={{ background: '#FF5722', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer', fontWeight: 600 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: '#CDD0DC', padding: '1rem', borderRadius: '0.875rem', marginBottom: '1.5rem', border: '1px solid #D1D5E0' }}>
                <p style={{ margin: 0, color: '#9CA3AF', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Total nuevo</p>
                <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#FF5722' }}>${editItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString('es-CO')}</p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!editingOrderId) return
                    if (editItems.length === 0) { alert('Agrega al menos 1 item'); return }
                    setSavingEdit(true)
                    try {
                      const { error } = await supabase.rpc('editar_pedido_cliente', {
                        p_order_id: editingOrderId,
                        p_items: editItems.map(it => ({ id: it.id, quantity: it.quantity })),
                      })
                      if (error) throw error
                      alert('Pedido actualizado')
                      await fetchData()
                      setEditingOrderId(null)
                    } catch (err: any) {
                      alert('Error: ' + err.message)
                    } finally {
                      setSavingEdit(false)
                    }
                  }}
                  style={{ flex: 1, padding: '0.9rem', border: 'none', borderRadius: '0.875rem', background: '#FF5722', color: '#fff', fontFamily: 'sans-serif', fontWeight: 700, cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.7 : 1 }}>
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  disabled={savingEdit}
                  onClick={() => setEditingOrderId(null)}
                  style={{ flex: 1, padding: '0.9rem', border: '1px solid #D1D5E0', borderRadius: '0.875rem', background: '#F5F5F5', color: '#2D3561', fontFamily: 'sans-serif', fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

CashierPanel.displayName = 'CashierPanel'
