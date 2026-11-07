/**
 * SalesHistory.tsx
 * Historial de ventas y gastos del día para revisar ANTES de hacer el corte de caja:
 * qué se vendió y para quién fue cada venta, y cuánto se gastó y en qué. Usa las mismas
 * reglas del corte (pedidos completados y pagados ese día en hora de Colombia; Rappi aparte,
 * no cuenta como venta; gastos del mismo día en hora de Colombia). Solo lee: no modifica nada.
 */
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Modal } from '../ui/Modal'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import { GastosDesglose, type GastoDetalle } from './GastosDesglose'
import { TicketModal } from '../print/TicketModal'
import { totalGastos } from '../../services/gastosResumen'
import { useCategoriasGasto } from '../../hooks/useCategoriasGasto'
import {
  dayBoundsBogota, filterOrders, forWhom, itemsSummary, parseItems, productTotals, summarize,
  type PayFilter, type SaleOrder,
} from '../../services/salesHistory'

const FX = {
  card:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  soft:  { boxShadow: 'var(--w-shadow-sm)' },
  field: { border: '1px solid var(--w-border)' },
} as const

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—')
const orderRef = (o: { id: string; order_number_today?: number | null }) => `#${o.order_number_today ?? o.id.slice(0, 8)}`

const METODO: Record<string, { label: string; color: string }> = {
  efectivo:      { label: 'Efectivo',      color: 'var(--w-success-text)' },
  transferencia: { label: 'Transferencia', color: 'var(--w-info)' },
  tarjeta:       { label: 'Tarjeta',       color: 'var(--w-info)' },
  mixto:         { label: 'Pago mixto',    color: 'var(--w-info)' },
  rappi:         { label: 'Rappi',         color: 'var(--w-text-3)' },
}

const FILTERS: { key: PayFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' }, { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' }, { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'mixto', label: 'Mixtos' }, { key: 'rappi', label: 'Rappi' },
]

// ─── Una venta ───────────────────────────────────────────────────────────────

interface SaleCardProps {
  order:    SaleOrder
  takenBy?: string
  open:     boolean
  onToggle: () => void
  onRecibo: () => void
}

const SaleCard = forwardRef<HTMLDivElement, SaleCardProps>(({ order, takenBy, open, onToggle, onRecibo }, ref) => {
  // Cuenta dividida con varios métodos => "Pago mixto"; si no, el método del pedido.
  const distintos = new Set((order.pagos ?? []).map(p => p.payment_method)).size
  const metodo = METODO[distintos > 1 ? 'mixto' : (order.payment_method ?? '')] ?? { label: order.payment_method ?? 'Sin método', color: 'var(--w-text-3)' }
  return (
    <div ref={ref} className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)]" style={FX.soft}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full text-left p-3.5 bg-transparent border-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 font-bold text-[color:var(--w-text)] text-sm">{forWhom(order)}</p>
            <p className="m-0 text-xs text-[color:var(--w-text-3)]">{orderRef(order)} · pagó {hora(order.paid_at)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="m-0 font-bold text-[color:var(--w-accent-text)]">{fmt(Number(order.total))}</p>
            <p className="m-0 text-[length:var(--w-fs-caption)] font-bold" style={{ color: metodo.color }}>{metodo.label}</p>
          </div>
        </div>
        {!open && <p className="m-0 mt-1.5 text-xs text-[color:var(--w-text-2)] truncate">{itemsSummary(order.items) || 'Sin productos'}</p>}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          <div className="flex flex-col gap-1.5 border-t border-[var(--w-surface-sunken)] pt-2.5">
            {order.items.length === 0 && <p className="m-0 text-xs text-[color:var(--w-text-3)]">Sin productos registrados.</p>}
            {order.items.map((it, i) => (
              <div key={i}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-[color:var(--w-text)]">{it.quantity}× {it.name}</span>
                  <span className="text-[color:var(--w-text-2)] shrink-0">{fmt(it.price * it.quantity)}</span>
                </div>
                {it.notes && <p className="m-0 text-xs text-[color:var(--w-text-3)]">{it.notes}</p>}
              </div>
            ))}
          </div>
          {(order.pagos?.length ?? 0) > 1 && (
            <div className="mt-2 border-t border-[var(--w-surface-sunken)] pt-2">
              {order.pagos!.map((p, i) => (
                <p key={i} className="m-0 text-xs text-[color:var(--w-text-2)]">
                  {(p as { comensal?: string | null }).comensal || `Pago ${i + 1}`}: {fmt(Number(p.monto))} · {METODO[p.payment_method]?.label ?? p.payment_method}
                </p>
              ))}
            </div>
          )}
          {order.notes && <p className="m-0 mt-2 text-xs italic text-[color:var(--w-text-2)]">Nota del pedido: {order.notes}</p>}
          {Number(order.propina) > 0 && <p className="m-0 mt-2 text-xs text-[color:var(--w-text-2)]">Propina: {fmt(Number(order.propina))}</p>}
          {takenBy && <p className="m-0 mt-1 text-xs text-[color:var(--w-text-2)]">Tomó el pedido: {takenBy}</p>}
          <button type="button" onClick={onRecibo} className="w-full min-h-[44px] mt-3 rounded-[var(--w-r-lg)] text-xs font-bold text-[color:var(--w-text)] border-none cursor-pointer" style={FX.soft}>
            🖨 Recibo (imprimir / PDF / WhatsApp)
          </button>
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
  const [reciboId, setReciboId] = useState<string | null>(null)
  const [gastos, setGastos]     = useState<GastoDetalle[]>([])
  const { etiquetas }           = useCategoriasGasto()

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

      // Pagos de cada pedido (cuentas divididas): el dinero se suma por lo que se pagó con cada método.
      if (list.length > 0) {
        const { data: pagos } = await supabase.from('order_payments')
          .select('order_id, comensal, payment_method, monto').is('anulado_at', null).in('order_id', list.map(o => o.id))
        const porPedido = new Map<string, { comensal: string | null; payment_method: string; monto: number }[]>()
        for (const p of pagos ?? []) {
          const arr = porPedido.get(p.order_id as string) ?? []
          arr.push({ comensal: p.comensal as string | null, payment_method: p.payment_method as string, monto: Number(p.monto) })
          porPedido.set(p.order_id as string, arr)
        }
        for (const o of list) o.pagos = porPedido.get(o.id)
      }
      setOrders(list)
      setOpenId(null)

      // Gastos del mismo día (hora de Colombia). Si fallan, las ventas se siguen mostrando.
      const { data: gd, error: gErr } = await supabase.from('gastos')
        .select('id, concepto, monto, categoria, created_at')
        .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false })
      if (gErr) { setGastos([]); message.warning('No se pudieron cargar los gastos del día') }
      else setGastos(((gd ?? []) as { id: string; concepto: string; monto: number; categoria: string | null; created_at: string }[]))

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
  const gastosDia = useMemo(() => totalGastos(gastos), [gastos])
  const shown    = useMemo(() => filterOrders(orders, filter), [orders, filter])
  const products = useMemo(() => productTotals(shown), [shown])
  const isToday  = date === hoyBogota()

  const chip = (active: boolean) => `min-h-[44px] px-3 rounded-[var(--w-r-pill)] text-xs font-bold border-none cursor-pointer ${active ? 'bg-[var(--w-text)] text-[color:var(--w-on-accent)]' : 'bg-[var(--w-surface)] text-[color:var(--w-text-2)]'}`

  return (
    <>
      <Modal open onClose={onClose} title="Ventas y gastos del día">
      <div className="flex flex-col gap-3">

        <div className="flex items-center gap-2">
          <input type="date" value={date} max={hoyBogota()} onChange={e => e.target.value && setDate(e.target.value)}
            aria-label="Día" className="flex-1 min-w-0 min-h-[44px] rounded-[var(--w-r-md)] px-3 text-sm text-[color:var(--w-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)]" />
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l: 'Ventas', v: String(summary.count) },
            { l: 'Efectivo', v: fmt(summary.efectivo) },
            { l: 'Transferencia', v: fmt(summary.transferencia) },
          ].map(x => (
            <div key={x.l} className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] py-2.5 px-1" style={FX.soft}>
              <p className="m-0 text-[length:var(--w-fs-caption)] font-bold uppercase tracking-wider text-[color:var(--w-text-3)]">{x.l}</p>
              <p className="m-0 font-bold text-[color:var(--w-text)] text-sm">{x.v}</p>
            </div>
          ))}
        </div>
        <p className="m-0 text-xs text-[color:var(--w-text-2)] text-center">
          Total {fmt(summary.total)}{summary.tarjeta > 0 && ` · tarjeta ${fmt(summary.tarjeta)}`}{summary.propinas > 0 && ` · propinas ${fmt(summary.propinas)}`}
          {summary.rappi > 0 && ` · ${summary.rappi} de Rappi (no suman)`}
          {isToday && ' · es lo que va a incluir el corte de hoy'}
        </p>

        {/* Gastos del día y lo que queda: las mismas cuentas del corte (ventas − gastos; la propina no es venta). */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-[var(--w-danger-bg)] border border-[var(--w-danger)] rounded-[var(--w-r-lg)] py-2.5 px-1">
            <p className="m-0 text-[length:var(--w-fs-caption)] font-bold uppercase tracking-wider text-[color:var(--w-danger-text)]">Gastos{gastos.length > 0 && ` (${gastos.length})`}</p>
            <p className="m-0 font-bold text-[color:var(--w-danger-text)] text-sm">{gastosDia > 0 ? '−' : ''}{fmt(gastosDia)}</p>
          </div>
          <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] py-2.5 px-1" style={FX.soft}>
            <p className="m-0 text-[length:var(--w-fs-caption)] font-bold uppercase tracking-wider text-[color:var(--w-text-3)]">Neto (ventas − gastos)</p>
            <p className="m-0 font-bold text-[color:var(--w-text)] text-sm">{fmt(summary.total - gastosDia)}</p>
          </div>
        </div>
        <GastosDesglose gastos={gastos} periodo="dia" etiquetas={etiquetas} />

        <Tabs label="Vista" value={view} onChange={setView} items={[{ key: 'ventas', label: 'Por venta' }, { key: 'productos', label: 'Por producto' }]} />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => <button key={f.key} type="button" className={chip(filter === f.key)} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>

        {loading && orders.length === 0 ? (
          <p className="m-0 py-8 text-center text-sm text-[color:var(--w-text-3)]">Cargando…</p>
        ) : shown.length === 0 ? (
          <p className="m-0 py-8 text-center text-sm text-[color:var(--w-text-3)]">
            {orders.length === 0 ? (isToday ? 'Todavía no hay ventas pagadas hoy.' : 'No hubo ventas pagadas ese día.') : 'No hay ventas con ese filtro.'}
          </p>
        ) : view === 'ventas' ? (
          <div className="flex flex-col gap-2.5">
            {shown.map(o => (
              <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <SaleCard order={o} takenBy={o.user_id ? staff[o.user_id] : undefined}
                  open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} onRecibo={() => setReciboId(o.id)} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filter === 'rappi' && <p className="m-0 text-xs text-[color:var(--w-text-3)]">Los productos de Rappi no se suman en esta vista.</p>}
            {products.map(p => (
              <div key={p.producto} className="flex items-center justify-between gap-3 bg-[var(--w-surface)] rounded-[var(--w-r-md)] px-3.5 py-2.5" style={FX.soft}>
                <span className="text-sm text-[color:var(--w-text)] min-w-0 truncate">{p.cantidad}× {p.producto}</span>
                <span className="text-sm font-bold text-[color:var(--w-text-2)] shrink-0">{fmt(p.subtotal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </Modal>
      {reciboId && <TicketModal tipo="recibo" orderId={reciboId} onClose={() => setReciboId(null)} />}
    </>
  )
}
