/**
 * SalesHistory.tsx
 * Historial de ventas del día para revisar ANTES de hacer el corte de caja:
 * qué se vendió y para quién fue cada venta. Usa las mismas reglas del corte
 * (pedidos completados y pagados ese día en hora de Colombia; Rappi aparte,
 * no cuenta como venta). Solo lee: no modifica nada.
 */
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import {
  dayBoundsBogota, filterOrders, forWhom, itemsSummary, parseItems, productTotals, summarize,
  type PayFilter, type SaleOrder,
} from '../../services/salesHistory'

const S = {
  neoOut:   { boxShadow: 'var(--shadow-out)' },
  neoOutSm: { boxShadow: 'var(--shadow-out-sm)' },
  neoIn:    { boxShadow: 'var(--shadow-in)' },
} as const

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—')
const orderRef = (o: { id: string; order_number_today?: number | null }) => `#${o.order_number_today ?? o.id.slice(0, 8)}`

const METODO: Record<string, { label: string; color: string }> = {
  efectivo:      { label: 'Efectivo',      color: '#059669' },
  transferencia: { label: 'Transferencia', color: '#2563EB' },
  rappi:         { label: 'Rappi',         color: '#9CA3AF' },
}

const FILTERS: { key: PayFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' }, { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' }, { key: 'rappi', label: 'Rappi' },
]

// ─── Una venta ───────────────────────────────────────────────────────────────

interface SaleCardProps {
  order:    SaleOrder
  takenBy?: string
  open:     boolean
  onToggle: () => void
}

const SaleCard = forwardRef<HTMLDivElement, SaleCardProps>(({ order, takenBy, open, onToggle }, ref) => {
  const metodo = METODO[order.payment_method ?? ''] ?? { label: order.payment_method ?? 'Sin método', color: '#9CA3AF' }
  return (
    <div ref={ref} className="bg-[#D8DAE4] rounded-2xl" style={S.neoOutSm}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full text-left p-3.5 bg-transparent border-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 font-bold text-[#2D3561] text-sm">{forWhom(order)}</p>
            <p className="m-0 text-xs text-[#9CA3AF]">{orderRef(order)} · pagó {hora(order.paid_at)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="m-0 font-bold text-[#FF5722]">{fmt(Number(order.total))}</p>
            <p className="m-0 text-[0.6875rem] font-bold" style={{ color: metodo.color }}>{metodo.label}</p>
          </div>
        </div>
        {!open && <p className="m-0 mt-1.5 text-xs text-[#6B7280] truncate">{itemsSummary(order.items) || 'Sin productos'}</p>}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          <div className="flex flex-col gap-1.5 border-t border-[#CDD0DC] pt-2.5">
            {order.items.length === 0 && <p className="m-0 text-xs text-[#9CA3AF]">Sin productos registrados.</p>}
            {order.items.map((it, i) => (
              <div key={i}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-[#2D3561]">{it.quantity}× {it.name}</span>
                  <span className="text-[#6B7280] shrink-0">{fmt(it.price * it.quantity)}</span>
                </div>
                {it.notes && <p className="m-0 text-xs text-[#9CA3AF]">{it.notes}</p>}
              </div>
            ))}
          </div>
          {order.notes && <p className="m-0 mt-2 text-xs italic text-[#6B7280]">Nota del pedido: {order.notes}</p>}
          {Number(order.propina) > 0 && <p className="m-0 mt-2 text-xs text-[#6B7280]">Propina: {fmt(Number(order.propina))}</p>}
          {takenBy && <p className="m-0 mt-1 text-xs text-[#6B7280]">Tomó el pedido: {takenBy}</p>}
        </div>
      )}
    </div>
  )
})
SaleCard.displayName = 'SaleCard'

// ─── Modal ───────────────────────────────────────────────────────────────────

export function SalesHistory({ onClose }: { onClose: () => void }) {
  const [date, setDate]         = useState(hoyBogota())
  const [orders, setOrders]     = useState<SaleOrder[]>([])
  const [staff, setStaff]       = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<'ventas' | 'productos'>('ventas')
  const [filter, setFilter]     = useState<PayFilter>('todas')
  const [openId, setOpenId]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = dayBoundsBogota(date)
      const { data, error } = await supabase.from('orders')
        .select('id, order_number_today, user_id, table_num, customer_name, items, total, tipo_pedido, payment_method, propina, paid_at, created_at, notes')
        .eq('status', 'completed').gte('paid_at', from).lt('paid_at', to)
        .order('paid_at', { ascending: false })
      if (error) throw error
      const list: SaleOrder[] = (data ?? []).map(o => ({ ...o, items: parseItems(o.items) }))
      setOrders(list)
      setOpenId(null)

      // Quién tomó el pedido (solo personal; los pedidos del QR traen el usuario del cliente).
      const ids = [...new Set(list.map(o => o.user_id).filter((x): x is string => !!x))]
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', ids).in('role', ['waiter', 'cashier', 'admin'])
        setStaff(Object.fromEntries((profs ?? []).filter(p => p.full_name).map(p => [p.id, p.full_name as string])))
      } else setStaff({})
    } catch (e) {
      message.error('No se pudo cargar el historial: ' + (e instanceof Error ? e.message : 'error desconocido'))
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { void load() }, [load])

  const summary  = useMemo(() => summarize(orders), [orders])
  const shown    = useMemo(() => filterOrders(orders, filter), [orders, filter])
  const products = useMemo(() => productTotals(shown), [shown])
  const isToday  = date === hoyBogota()

  const tab = (active: boolean) => `flex-1 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer ${active ? 'bg-[#FF5722] text-white' : 'bg-transparent text-[#6B7280]'}`
  const chip = (active: boolean) => `px-3 py-1.5 rounded-xl text-xs font-bold border-none cursor-pointer ${active ? 'bg-[#2D3561] text-white' : 'bg-[#D8DAE4] text-[#6B7280]'}`

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#CDD0DC] w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3" style={S.neoOut}>

        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 font-bold text-[#2D3561] text-lg">Historial de ventas</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-xl border-none cursor-pointer bg-[#D8DAE4] text-[#6B7280] text-lg" style={S.neoOutSm}>✕</button>
        </div>

        <div className="flex items-center gap-2">
          <input type="date" value={date} max={hoyBogota()} onChange={e => e.target.value && setDate(e.target.value)}
            aria-label="Día" className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm text-[#2D3561] bg-[#D8DAE4] border-none outline-none" style={S.neoIn} />
          <button type="button" onClick={() => void load()} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-bold border-none cursor-pointer bg-[#D8DAE4] text-[#2D3561] disabled:opacity-50" style={S.neoOutSm}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l: 'Ventas', v: String(summary.count) },
            { l: 'Efectivo', v: fmt(summary.efectivo) },
            { l: 'Transferencia', v: fmt(summary.transferencia) },
          ].map(x => (
            <div key={x.l} className="bg-[#D8DAE4] rounded-2xl py-2.5 px-1" style={S.neoOutSm}>
              <p className="m-0 text-[0.625rem] font-bold uppercase tracking-wider text-[#9CA3AF]">{x.l}</p>
              <p className="m-0 font-bold text-[#2D3561] text-sm">{x.v}</p>
            </div>
          ))}
        </div>
        <p className="m-0 text-xs text-[#6B7280] text-center">
          Total {fmt(summary.total)}{summary.propinas > 0 && ` · propinas ${fmt(summary.propinas)}`}
          {summary.rappi > 0 && ` · ${summary.rappi} de Rappi (no suman)`}
          {isToday && ' · es lo que va a incluir el corte de hoy'}
        </p>

        <div className="flex gap-1 p-1 rounded-2xl bg-[#D8DAE4]" style={S.neoIn}>
          <button type="button" className={tab(view === 'ventas')} onClick={() => setView('ventas')}>Por venta</button>
          <button type="button" className={tab(view === 'productos')} onClick={() => setView('productos')}>Por producto</button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => <button key={f.key} type="button" className={chip(filter === f.key)} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>

        {loading && orders.length === 0 ? (
          <p className="m-0 py-8 text-center text-sm text-[#9CA3AF]">Cargando…</p>
        ) : shown.length === 0 ? (
          <p className="m-0 py-8 text-center text-sm text-[#9CA3AF]">
            {orders.length === 0 ? (isToday ? 'Todavía no hay ventas pagadas hoy.' : 'No hubo ventas pagadas ese día.') : 'No hay ventas con ese filtro.'}
          </p>
        ) : view === 'ventas' ? (
          <div className="flex flex-col gap-2.5">
            {shown.map(o => (
              <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <SaleCard order={o} takenBy={o.user_id ? staff[o.user_id] : undefined}
                  open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filter === 'rappi' && <p className="m-0 text-xs text-[#9CA3AF]">Los productos de Rappi no se suman en esta vista.</p>}
            {products.map(p => (
              <div key={p.producto} className="flex items-center justify-between gap-3 bg-[#D8DAE4] rounded-xl px-3.5 py-2.5" style={S.neoOutSm}>
                <span className="text-sm text-[#2D3561] min-w-0 truncate">{p.cantidad}× {p.producto}</span>
                <span className="text-sm font-bold text-[#6B7280] shrink-0">{fmt(p.subtotal)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
