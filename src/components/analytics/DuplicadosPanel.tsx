import { useEffect, useState } from 'react'
import Alert from 'antd/es/alert'
import { StatePanel } from '../ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { agruparPosiblesDuplicados, VENTANA_DUPLICADO_MIN, type PedidoComparable } from '../../services/pedidosDuplicados'
import { itemsSummary, parseItems } from '../../services/salesHistory'

type Fila = PedidoComparable & { total: number }
const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const hora = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

/** Pedidos de los últimos 7 días que parecen el mismo enviado dos veces. Solo avisa: nunca borra ni cancela. */
export function DuplicadosPanel() {
  const [grupos, setGrupos] = useState<Fila[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data, error: e } = await supabase.from('orders')
          .select('id, order_number_today, table_num, customer_name, tipo_pedido, items, total, created_at, status')
          .neq('status', 'cancelled').gte('created_at', desde).order('created_at', { ascending: false }).limit(1500)
        if (e) throw e
        if (vivo) setGrupos(agruparPosiblesDuplicados((data ?? []) as unknown as Fila[]))
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error desconocido')
      }
    })()
    return () => { vivo = false }
  }, [])

  if (error) return <StatePanel kind="error" text={error} />
  if (grupos === null) return <StatePanel kind="loading" />
  if (grupos.length === 0) return <Alert type="success" message="Sin pedidos repetidos en los últimos 7 días" />
  return (
    <div className="space-y-3">
      {grupos.map(g => (
        <Alert key={g.map(p => p.id).join('-')} type="warning"
          message={`${g.length} pedidos iguales con menos de ${VENTANA_DUPLICADO_MIN} minutos de diferencia · ${g[0].table_num ? `Mesa ${g[0].table_num}` : (g[0].customer_name || g[0].tipo_pedido || 'Pedido')}`}
          description={
            <div>
              <p className="m-0">{itemsSummary(parseItems(g[0].items))}</p>
              {g.map(p => (
                <p key={p.id} className="m-0 text-xs">#{p.order_number_today ?? p.id.slice(0, 6)} · {hora(p.created_at)} · {cop(Number(p.total))}</p>
              ))}
              <p className="m-0 mt-1 text-xs">Puede ser un pedido repetido por error o dos pedidos iguales de verdad. Confírmalo con quien lo tomó.</p>
            </div>
          } />
      ))}
    </div>
  )
}
