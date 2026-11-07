/**
 * VentasView.tsx — módulo "Ventas" (solo lectura).
 * Usa las mismas reglas del corte de caja que SalesHistory: pedidos completados y pagados
 * en el periodo (hora de Colombia), Rappi no cuenta como venta. No escribe nada.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import { formatCOP } from '../../config/billing'
import {
  dayBoundsBogota, esRappi, parseItems, productTotals, summarize, type SaleOrder,
} from '../../services/salesHistory'
import { Tabs } from '../ui/Tabs'
import { Card } from '../ui/Card'
import { StatePanel } from '../ui/StatePanel'
import { Button } from '../ui/Button'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'

type Periodo = 'hoy' | 'semana' | 'mes'
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' },
]
const DIAS: Record<Periodo, number> = { hoy: 1, semana: 7, mes: 30 }
const SUBTITULO: Record<Periodo, string> = { hoy: 'Hoy', semana: 'Últimos 7 días', mes: 'Últimos 30 días' }
const PAGE = 1000

/** Suma días a una fecha YYYY-MM-DD (sin zona horaria: solo calendario). */
const sumarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diaBogota = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const horaBogota = (iso: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Bogota' }).format(new Date(iso)))
const etiquetaDia = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const METODOS = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta', label: 'Tarjeta' },
] as const

interface Barra { etiqueta: string; valor: number }

const svg = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const IC = {
  chart: svg('M4 20V10M10 20V4M16 20v-8M22 20H2'),
  cart: svg('M3 4h2l2.4 11h11L21 7H6M9 20h.01M18 20h.01'),
  ticket: svg('M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6'),
  star: svg('M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 17.8 5.7 21.2 7 14.2 2 9.4l7-.9z'),
}

/** Gráfico de barras en SVG puro. Sin librerías. */
function Grafico({ barras }: { barras: Barra[] }) {
  const max = Math.max(...barras.map(b => b.valor), 1)
  const W = 100, H = 56, gap = 1.2
  const bw = (W - gap * (barras.length - 1)) / barras.length
  // Con muchas barras solo se rotulan algunas para que no se amontonen en el celular.
  const paso = Math.ceil(barras.length / 6)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 160 }} role="img"
        aria-label={`Ventas: ${barras.map(b => `${b.etiqueta} ${formatCOP(b.valor)}`).join(', ')}`}>
        {barras.map((b, i) => {
          const h = (b.valor / max) * (H - 2)
          return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, b.valor > 0 ? 0.8 : 0)} rx={0.8}
            fill={b.valor > 0 ? 'var(--w-accent)' : 'var(--w-surface-sunken)'}><title>{`${b.etiqueta}: ${formatCOP(b.valor)}`}</title></rect>
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
        {barras.map((b, i) => (i % paso === 0 ? <span key={i}>{b.etiqueta}</span> : null))}
      </div>
    </div>
  )
}

export default function VentasView() {
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hoy = hoyBogota()
  const desde = sumarDias(hoy, -(DIAS[periodo] - 1))

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const from = dayBoundsBogota(desde).from
      const to = dayBoundsBogota(hoy).to
      const todos: SaleOrder[] = []
      for (let ini = 0; ; ini += PAGE) {
        const { data, error: err } = await supabase.from('orders')
          .select('id, order_number_today, user_id, table_num, customer_name, items, total, tipo_pedido, payment_method, propina, paid_at, created_at, notes')
          .eq('status', 'completed').gte('paid_at', from).lt('paid_at', to)
          .order('paid_at', { ascending: false }).range(ini, ini + PAGE - 1)
        if (err) throw err
        todos.push(...(data ?? []).map(o => ({ ...o, items: parseItems(o.items) }) as SaleOrder))
        if (!data || data.length < PAGE) break
      }
      // Pagos de cuentas divididas (mismo criterio del corte).
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
      setOrders(todos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error desconocido')
    } finally { setLoading(false) }
  }, [desde, hoy])

  useEffect(() => { void cargar() }, [cargar])

  const resumen = useMemo(() => summarize(orders), [orders])
  const platos = useMemo(() => productTotals(orders).slice(0, 5), [orders])
  const ticket = resumen.count > 0 ? resumen.total / resumen.count : 0

  const barras = useMemo<Barra[]>(() => {
    const validas = orders.filter(o => !esRappi(o) && o.paid_at)
    if (periodo === 'hoy') {
      const horas = Array.from({ length: 24 }, (_, h) => ({ etiqueta: `${h}h`, valor: 0 }))
      for (const o of validas) horas[horaBogota(o.paid_at!)].valor += summarize([o]).total
      return horas
    }
    const dias = Array.from({ length: DIAS[periodo] }, (_, i) => sumarDias(desde, i))
    const mapa = new Map(dias.map(d => [d, 0]))
    for (const o of validas) {
      const d = diaBogota(o.paid_at!)
      if (mapa.has(d)) mapa.set(d, (mapa.get(d) ?? 0) + summarize([o]).total)
    }
    return dias.map(d => ({ etiqueta: etiquetaDia(d), valor: mapa.get(d) ?? 0 }))
  }, [orders, periodo, desde])

  const totalMetodos = resumen.efectivo + resumen.transferencia + resumen.tarjeta
  const sinVentas = !loading && !error && resumen.count === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 flex flex-col gap-5 [&>header]:mb-0" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={IC.chart}
        title="Ventas"
        subtitle={`${SUBTITULO[periodo]} · pedidos pagados, sin Rappi`}
        actions={<>
          <Tabs label="Periodo" items={PERIODOS} value={periodo} onChange={setPeriodo} />
          <Button variant="secondary" onClick={() => void cargar()} loading={loading}>Actualizar</Button>
        </>}
      />

      {error ? (
        <StatePanel kind="error" text={error} action={<Button onClick={() => void cargar()}>Reintentar</Button>} />
      ) : loading && orders.length === 0 ? (
        <StatePanel kind="loading" />
      ) : sinVentas ? (
        <StatePanel kind="empty" title="Sin ventas en este periodo" text="Cuando se cobren pedidos, aquí verás las cifras." />
      ) : (
        <>
          <section aria-label="Resumen" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Ventas totales" value={formatCOP(resumen.total)} icon={IC.chart} />
            <StatCard label="Pedidos" value={String(resumen.count)} tone="info" icon={IC.cart} />
            <StatCard label="Ticket promedio" value={formatCOP(ticket)} tone="success" icon={IC.ticket} />
            <StatCard label="Propinas (no son venta)" value={formatCOP(resumen.propinas)} tone="warning" icon={IC.star} />
          </section>

          <Card className="flex flex-col gap-3">
            <h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>
              {periodo === 'hoy' ? 'Ventas por hora' : 'Ventas por día'}
            </h2>
            <Grafico barras={barras} />
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card className="flex flex-col gap-3">
              <h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>Platos más vendidos</h2>
              {platos.length === 0 ? (
                <StatePanel kind="empty" text="No hay productos registrados en estas ventas." />
              ) : (
                <ol className="m-0 p-0 list-none flex flex-col gap-2">
                  {platos.map((p, i) => (
                    <li key={p.producto} className="flex items-center gap-3 min-h-[44px]">
                      <span className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)] text-[length:var(--w-fs-caption)] font-bold">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-[length:var(--w-fs-body)] text-[color:var(--w-text)]">{p.producto}</span>
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
              <h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>Por método de pago</h2>
              {totalMetodos === 0 ? (
                <StatePanel kind="empty" text="No hay pagos registrados con método." />
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-3">
                  {METODOS.map(m => {
                    const v = resumen[m.key]
                    const pct = Math.round((v / totalMetodos) * 100)
                    return (
                      <li key={m.key} className="flex flex-col gap-1">
                        <div className="flex justify-between gap-2 text-[length:var(--w-fs-body)]">
                          <span className="text-[color:var(--w-text)]">{m.label}</span>
                          <span className="font-semibold text-[color:var(--w-text)]">{formatCOP(v)} · {pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--w-surface-sunken)] overflow-hidden" aria-hidden>
                          <div className="h-full rounded-full bg-[var(--w-accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
