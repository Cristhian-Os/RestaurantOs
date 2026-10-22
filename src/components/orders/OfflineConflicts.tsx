/**
 * OfflineConflicts.tsx — pedidos tomados sin internet que el servidor rechazó al sincronizar
 * (por ejemplo «Ya no hay suficiente…»). Se ven aquí para reintentarlos o descartarlos;
 * nunca desaparecen solos. Solo muestra los de la persona con sesión abierta.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import message from 'antd/es/message'
import Modal from 'antd/es/modal'
import { supabase } from '../../services/supabaseClient'
import { offlineService, OFFLINE_CAMBIO, type OfflineOrder } from '../../services/offlineService'

const resumenItems = (o: OfflineOrder): string => {
  try {
    const items = (typeof o.items === 'string' ? JSON.parse(o.items) : o.items) as { name?: string; quantity?: number }[]
    return Array.isArray(items) ? items.map(i => `${i.quantity ?? 1}× ${i.name ?? 'Producto'}`).join(', ') : ''
  } catch { return '' }
}

export function OfflineConflicts() {
  const [lista, setLista] = useState<OfflineOrder[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const lock = useRef(false)

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      const todos = await offlineService.listConflicts()
      setLista(todos.filter(o => o.user_id === uid))
    } catch { setLista([]) }
  }, [])

  useEffect(() => {
    void cargar()
    window.addEventListener(OFFLINE_CAMBIO, cargar)
    return () => window.removeEventListener(OFFLINE_CAMBIO, cargar)
  }, [cargar])

  const reintentar = async (o: OfflineOrder) => {
    if (lock.current) return
    lock.current = true; setOcupado(o.id)
    try {
      const r = await offlineService.retryOrder(o.id)
      if (r.synced.length > 0) message.success('Pedido enviado')
      else if (r.conflicts.length > 0) message.error('El servidor volvió a rechazarlo: ' + (r.conflicts[0].conflict_reason ?? ''))
      else message.warning('Todavía no se pudo enviar (sin conexión). Sigue guardado.')
    } catch (e) { message.error(e instanceof Error ? e.message : 'No se pudo reintentar') }
    finally { lock.current = false; setOcupado(null); void cargar() }
  }

  const descartar = (o: OfflineOrder) => {
    Modal.confirm({
      title: '¿Descartar este pedido?',
      content: 'Se borra de este equipo y no se enviará a cocina. Avisa al cliente si hace falta.',
      okText: 'Sí, descartar', cancelText: 'No', okButtonProps: { danger: true },
      onOk: async () => {
        try { await offlineService.discardOrder(o.id); message.success('Pedido descartado') }
        catch (e) { message.error(e instanceof Error ? e.message : 'No se pudo descartar') }
      },
    })
  }

  if (lista.length === 0) return null

  return (
    <div className="bg-red-50 border border-red-300 rounded-2xl p-4" role="alert">
      <p className="text-sm font-bold text-red-700">
        {lista.length} pedido(s) tomados sin internet fueron rechazados por el servidor
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {lista.map(o => (
          <li key={o.id} className="bg-white/70 rounded-xl px-3 py-2 text-xs text-[#2D3561]">
            <p className="font-bold">
              {o.table_num ? `Mesa ${o.table_num}` : (o.notes?.includes('Barra') ? 'Barra' : o.tipo_pedido ?? 'Pedido')}
              {o.customer_name ? ` · ${o.customer_name}` : ''} · ${Math.round(Number(o.total)).toLocaleString('es-CO')}
            </p>
            <p className="text-[#6B7280]">{resumenItems(o)}</p>
            <p className="text-red-600 font-semibold mt-0.5">Motivo: {o.conflict_reason}</p>
            <div className="flex gap-2 mt-1.5">
              <button onClick={() => void reintentar(o)} disabled={ocupado === o.id}
                className="min-h-[36px] px-3 rounded-lg font-bold text-white bg-amber-600 disabled:opacity-60">
                {ocupado === o.id ? 'Enviando…' : 'Reintentar'}
              </button>
              <button onClick={() => descartar(o)} disabled={ocupado === o.id}
                className="min-h-[36px] px-3 rounded-lg font-bold text-red-700 bg-red-100 disabled:opacity-60">
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
