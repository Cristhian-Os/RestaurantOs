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
}

interface DaySummary {
  total_efectivo:     number
  total_transferencia:number
  total_ordenes:      number
}

interface Gasto {
  id:         string
  concepto:   string
  monto:      number
  created_at: string
}

type PaymentMethod = 'efectivo' | 'transferencia'

interface CashierPanelProps { profile: Profile }

export const CashierPanel = memo<CashierPanelProps>(({ profile }) => {
  const [readyOrders,  setReady]     = useState<Order[]>([])
  const [daySummary,   setSummary]   = useState<DaySummary>({ total_efectivo: 0, total_transferencia: 0, total_ordenes: 0 })
  const [loading,      setLoading]   = useState(true)
  const [payingOrder,  setPayingOrder] = useState<Order | null>(null)
  const [payMethod,    setPayMethod] = useState<PaymentMethod>('efectivo')
  const [amountPaid,   setAmountPaid]= useState('')
  const [processing,   setProcessing]= useState(false)
  const [showCorte,    setShowCorte] = useState(false)
  const [corteResult,  setCorteResult] = useState<any>(null)
  const [corteProductos, setCorteProductos] = useState<CorteProducto[]>([])
  const [cortingLoading, setCortingLoading] = useState(false)
  const [gastos,        setGastos]       = useState<Gasto[]>([])
  const [showGastoForm, setShowGastoForm]= useState(false)
  const [gastoConcepto, setGastoConcepto]= useState('')
  const [gastoMonto,    setGastoMonto]   = useState('')
  const [savingGasto,   setSavingGasto]  = useState(false)

  const fetchData = useCallback(async () => {
    const inicioDia = new Date(new Date().setHours(0,0,0,0)).toISOString()
    const [ordersRes, completedRes, gastosRes] = await Promise.all([
      supabase.from('orders').select('*').eq('status', 'ready').order('created_at', { ascending: true }),
      supabase.from('orders').select('total, payment_method')
        .eq('status', 'completed')
        .gte('created_at', inicioDia),
      supabase.from('gastos').select('id, concepto, monto, created_at')
        .gte('created_at', inicioDia).order('created_at', { ascending: false }),
    ])

    if (!ordersRes.error) {
      setReady((ordersRes.data || []).map(o => ({
        ...o,
        items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
      })))
    }

    if (!completedRes.error) {
      const orders = completedRes.data || []
      setSummary({
        total_efectivo:      orders.filter(o => o.payment_method === 'efectivo').reduce((s,o) => s + o.total, 0),
        total_transferencia: orders.filter(o => o.payment_method === 'transferencia').reduce((s,o) => s + o.total, 0),
        total_ordenes:       orders.length,
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

  const handleEliminarGasto = useCallback(async (id: string) => {
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { message.error('Error: ' + error.message); return }
    setGastos(prev => prev.filter(g => g.id !== id))
  }, [])

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('cashier-panel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  // Abrir modal de cobro
  const openPay = useCallback((order: Order) => {
    setPayingOrder(order)
    setPayMethod('efectivo')
    setAmountPaid(order.total.toFixed(2))
  }, [])

  // Calcular cambio
  const cambio = payingOrder && payMethod === 'efectivo' && parseFloat(amountPaid) >= payingOrder.total
    ? parseFloat(amountPaid) - payingOrder.total
    : 0

  const pagoInsuficiente = payingOrder && payMethod === 'efectivo'
    && amountPaid !== '' && parseFloat(amountPaid) < payingOrder.total

  // Cobrar
  const handleCobrar = useCallback(async () => {
    if (!payingOrder) return
    if (payMethod === 'efectivo' && parseFloat(amountPaid) < payingOrder.total) {
      message.error('El monto recibido es menor al total')
      return
    }
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc('cobrar_orden', {
        p_order_id:       payingOrder.id,
        p_payment_method: payMethod,
        p_amount_paid:    payMethod === 'efectivo' ? parseFloat(amountPaid) : payingOrder.total,
      })
      if (error) throw error
      message.success(
        payMethod === 'efectivo' && data.change > 0
          ? `Cobrado · Cambio: $${data.change.toFixed(2)}`
          : 'Cobrado exitosamente'
      )
      setPayingOrder(null)
      fetchData()
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al cobrar'}`)
    } finally {
      setProcessing(false)
    }
  }, [payingOrder, payMethod, amountPaid, fetchData])

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
      setShowCorte(true)
      fetchData()
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error en corte'}`)
    } finally {
      setCortingLoading(false)
    }
  }, [fetchData])

  // Descargar el corte en Excel
  const handleDescargarExcel = useCallback(async () => {
    if (!corteResult) return
    try {
      const { data: cfg } = await supabase
        .from('restaurant_config').select('display_name').maybeSingle()
      await descargarCorteExcel({
        restauranteNombre: cfg?.display_name ?? 'Restaurante',
        totales: {
          total_efectivo:      Number(corteResult.total_efectivo),
          total_transferencia: Number(corteResult.total_transferencia),
          total_general:       Number(corteResult.total_general),
          total_ordenes:       Number(corteResult.total_ordenes),
          total_gastos:        Number(corteResult.total_gastos ?? 0),
          total_neto:          Number(corteResult.total_neto ?? corteResult.total_general),
          fecha:               corteResult.fecha,
        },
        productos: corteProductos,
        gastos: gastos.map(g => ({ concepto: g.concepto, monto: Number(g.monto) })),
      })
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al generar Excel'}`)
    }
  }, [corteResult, corteProductos, gastos])

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Efectivo hoy',       val: `$${daySummary.total_efectivo.toFixed(2)}`,     color: 'text-emerald-600' },
          { label: 'Transferencias hoy', val: `$${daySummary.total_transferencia.toFixed(2)}`, color: 'text-blue-600'    },
          { label: 'Gastos hoy',         val: `$${totalGastosHoy.toFixed(2)}`,                 color: 'text-red-500'     },
          { label: 'Neto del día',       val: `$${netoDia.toFixed(2)}`,                        color: 'text-[#FF5722]'   },
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
          <div className="bg-[#D8DAE4] rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end" style={S.neoOut}>
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
                  <span className="font-bold text-red-500">${Number(g.monto).toFixed(2)}</span>
                  <button onClick={() => handleEliminarGasto(g.id)} className="text-[#9CA3AF] hover:text-red-500 text-sm">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
                  </div>
                  <span className="text-2xl font-bold text-[#FF5722]">${order.total.toFixed(2)}</span>
                </div>

                {/* Items */}
                <div className="flex flex-col gap-1 mb-4">
                  {order.items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                      <span className="text-[#9CA3AF]">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <p className="text-xs text-[#9CA3AF]">+{order.items.length - 4} platos más</p>
                  )}
                  {order.notes && (
                    <p className="text-xs text-[#6B7280] italic mt-1">{order.notes}</p>
                  )}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openPay(order)}
                  className="w-full py-3 rounded-2xl font-bold text-white bg-[#FF5722] text-sm"
                  style={S.coral}
                >
                  Cobrar ${order.total.toFixed(2)}
                </motion.button>
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
                <span className="text-2xl font-bold text-[#FF5722]">${payingOrder.total.toFixed(2)}</span>
              </div>

              {/* Items en el modal */}
              <div className="bg-[#CDD0DC] rounded-2xl p-3 mb-4 max-h-32 overflow-y-auto" style={S.neoIn}>
                {payingOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                    <span className="text-[#9CA3AF]">${(item.price * item.quantity).toFixed(2)}</span>
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
                      Falta ${(payingOrder.total - parseFloat(amountPaid)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {payMethod === 'transferencia' && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                  <p className="text-sm font-bold text-blue-700">Confirmar transferencia</p>
                  <p className="text-xs text-blue-600 mt-0.5">Total: ${payingOrder.total.toFixed(2)}</p>
                </div>
              )}

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
                  disabled={processing || !!pagoInsuficiente}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${processing || pagoInsuficiente ? 'opacity-60' : ''}`}
                  style={S.coral}
                >
                  {processing ? 'Procesando...' : 'Cobrar'}
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
                <div className="flex justify-between items-center bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <span className="text-sm font-bold text-red-600">Gastos del día</span>
                  <span className="font-bold text-red-600">−${Number(corteResult.total_gastos ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-500 rounded-2xl px-4 py-3" style={S.green}>
                  <span className="text-sm font-bold text-white">Beneficio neto</span>
                  <span className="text-xl font-bold text-white">${Number(corteResult.total_neto ?? corteResult.total_general).toFixed(2)}</span>
                </div>
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
      </AnimatePresence>
    </div>
  )
})

CashierPanel.displayName = 'CashierPanel'
