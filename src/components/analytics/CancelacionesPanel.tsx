import { useEffect, useMemo, useState } from 'react'
import { Card } from '../ui/Card'
import { StatePanel } from '../ui/StatePanel'
import { Tabs } from '../ui/Tabs'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import { dayBoundsBogota, itemsSummary, parseItems } from '../../services/salesHistory'

interface Cancelado {
  id: string; order_number_today: number | null; customer_name: string | null; table_num: number | null
  total: number; tipo_pedido: string | null; items: unknown
  cancelado_motivo: string | null; cancelado_por: string | null; cancelado_at: string | null; updated_at: string
}

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const SIN_MOTIVO = 'Sin motivo guardado'
const cuando = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

/** Fecha (AAAA-MM-DD, hora de Colombia) de hace n días. */
function haceDias(n: number): string {
  const [y, m, d] = hoyBogota().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

/** Pedidos cancelados con su motivo, quién canceló y cuándo (auditoría). Solo lee. */
export function CancelacionesPanel() {
  const [dias, setDias] = useState<'7' | '30'>('7')
  const [lista, setLista] = useState<Cancelado[] | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setLista(null); setError(null)
    void (async () => {
      try {
        const from = dayBoundsBogota(haceDias(Number(dias) - 1)).from
        const to = dayBoundsBogota(hoyBogota()).to
        const { data, error: e } = await supabase.from('orders')
          .select('id, order_number_today, customer_name, table_num, total, tipo_pedido, items, cancelado_motivo, cancelado_por, cancelado_at, updated_at')
          .eq('status', 'cancelled').gte('updated_at', from).lt('updated_at', to).order('updated_at', { ascending: false }).limit(500)
        if (e) throw e
        const filas = (data ?? []) as unknown as Cancelado[]
        const ids = [...new Set(filas.map(f => f.cancelado_por).filter((x): x is string => !!x))]
        let map: Record<string, string> = {}
        if (ids.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
          map = Object.fromEntries((profs ?? []).filter(p => p.full_name).map(p => [p.id, p.full_name as string]))
        }
        if (vivo) { setNombres(map); setLista(filas) }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error desconocido')
      }
    })()
    return () => { vivo = false }
  }, [dias])

  const resumen = useMemo(() => {
    const porMotivo = new Map<string, number>()
    const porPersona = new Map<string, number>()
    let monto = 0
    for (const c of lista ?? []) {
      monto += Number(c.total)
      const mot = c.cancelado_motivo?.split(':')[0].trim() || SIN_MOTIVO
      porMotivo.set(mot, (porMotivo.get(mot) ?? 0) + 1)
      const quien = c.cancelado_por ? (nombres[c.cancelado_por] ?? 'Personal') : 'Cliente o sin registro'
      porPersona.set(quien, (porPersona.get(quien) ?? 0) + 1)
    }
    const orden = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return { monto, porMotivo: orden(porMotivo), porPersona: orden(porPersona) }
  }, [lista, nombres])

  return (
    <section className="mb-8">
      <h2 className="text-[length:var(--w-fs-title)] font-bold text-[color:var(--w-text)] mb-1">Pedidos cancelados</h2>
      <p className="text-sm text-[color:var(--w-text-2)] mb-4">Quién canceló, cuándo y por qué. Las cancelaciones anteriores a esta función no tienen motivo guardado.</p>
      <div className="mb-4 max-w-full overflow-x-auto">
        <Tabs label="Periodo" value={dias} onChange={setDias} items={[{ key: '7', label: 'Últimos 7 días' }, { key: '30', label: 'Últimos 30 días' }]} />
      </div>

      {error && <StatePanel kind="error" text={error} />}
      {!error && lista === null && <StatePanel kind="loading" />}
      {lista && lista.length === 0 && <StatePanel kind="empty" title="Sin cancelaciones" text="No se canceló ningún pedido en este periodo." />}
      {lista && lista.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card><p className="m-0 text-xs text-[color:var(--w-text-3)]">Cancelados</p><p className="m-0 text-xl font-bold text-[color:var(--w-text)]">{lista.length}</p></Card>
            <Card><p className="m-0 text-xs text-[color:var(--w-text-3)]">Valor de lo cancelado</p><p className="m-0 text-xl font-bold text-[color:var(--w-text)]">{cop(resumen.monto)}</p></Card>
            <Card>
              <p className="m-0 text-xs text-[color:var(--w-text-3)] mb-1">Quién canceló</p>
              {resumen.porPersona.map(([n, c]) => <p key={n} className="m-0 text-sm text-[color:var(--w-text)]">{n}: <b>{c}</b></p>)}
            </Card>
          </div>
          <Card className="mb-4">
            <p className="m-0 text-xs text-[color:var(--w-text-3)] mb-1">Motivos</p>
            {resumen.porMotivo.map(([n, c]) => <p key={n} className="m-0 text-sm text-[color:var(--w-text)]">{n}: <b>{c}</b></p>)}
          </Card>
          <div className="flex flex-col gap-2">
            {lista.map(c => (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="m-0 text-sm font-bold text-[color:var(--w-text)]">
                    #{c.order_number_today ?? c.id.slice(0, 8)} · {c.table_num ? `Mesa ${c.table_num}` : (c.customer_name || c.tipo_pedido || 'Pedido')}
                  </p>
                  <p className="m-0 shrink-0 text-sm font-bold text-[color:var(--w-text)]">{cop(Number(c.total))}</p>
                </div>
                <p className="m-0 mt-1 text-xs text-[color:var(--w-text-2)]">{itemsSummary(parseItems(c.items)) || 'Sin productos'}</p>
                <p className="m-0 mt-1.5 text-sm text-[color:var(--w-danger-text)]">Motivo: {c.cancelado_motivo ?? SIN_MOTIVO.toLowerCase()}</p>
                <p className="m-0 text-xs text-[color:var(--w-text-3)]">
                  {c.cancelado_por ? `Canceló: ${nombres[c.cancelado_por] ?? 'personal'}` : 'Canceló: cliente o sin registro'} · {cuando(c.cancelado_at ?? c.updated_at)}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
