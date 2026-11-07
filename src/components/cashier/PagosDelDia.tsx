/**
 * PagosDelDia.tsx — Pagos recibidos hoy, uno por uno (spec Anexo A, Parte B: B2.5 y B2.6).
 *  • Transferencias: se marcan una por una contra la app del banco.
 *  • Corregir el método ("dijo efectivo y pagó por transferencia"): cajero o admin, con motivo.
 *  • Anular un pago: solo admin, con motivo; el pedido vuelve a "falta por cobrar".
 * Después del corte del día nada se edita: el servidor lo rechaza y aquí se muestra el aviso.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import { cn } from '../../lib/cn'

type Metodo = 'efectivo' | 'transferencia' | 'tarjeta'

interface PagoDia {
  id: string; comensal: string | null; payment_method: Metodo; monto: number; propina: number
  referencia: string | null; transferencia_verificada: boolean; paid_at: string
  anulado_at: string | null; anulado_motivo: string | null
  metodo_original: string | null; corregido_motivo: string | null
  orders: { order_number_today: number | null; table_num: number | null; tipo_pedido: string; customer_name: string | null; status: string } | null
}

const FX = {
  card:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  soft:  { boxShadow: 'var(--w-shadow-sm)' },
  field: { border: '1px solid var(--w-border)' },
} as const

const LABEL: Record<Metodo, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

// Colombia no tiene horario de verano: -05:00 todo el año.
export const ventanaHoy = () => {
  const hoy = hoyBogota()
  const sig = new Date(`${hoy}T12:00:00-05:00`)
  sig.setDate(sig.getDate() + 1)
  return { desde: `${hoy}T00:00:00-05:00`, hasta: `${sig.toISOString().slice(0, 10)}T00:00:00-05:00` }
}

const destino = (o: PagoDia['orders']) => {
  if (!o) return 'Pedido'
  const base = o.table_num ? `Mesa ${o.table_num}` : o.tipo_pedido === 'LLEVAR' ? 'Llevar' : o.tipo_pedido === 'DOMICILIO' ? 'Domicilio' : 'Pedido'
  return `${base}${o.customer_name ? ` · ${o.customer_name}` : ''}${o.order_number_today ? ` (#${o.order_number_today})` : ''}`
}

interface Props { esAdmin: boolean; onClose: () => void; onChanged: () => void }

export function PagosDelDia({ esAdmin, onClose, onChanged }: Props) {
  const [pagos, setPagos] = useState<PagoDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [soloTransf, setSoloTransf] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { desde, hasta } = ventanaHoy()
    const { data, error } = await supabase.from('order_payments')
      .select('id, comensal, payment_method, monto, propina, referencia, transferencia_verificada, paid_at, anulado_at, anulado_motivo, metodo_original, corregido_motivo, orders!inner(order_number_today, table_num, tipo_pedido, customer_name, status)')
      .gte('paid_at', desde).lt('paid_at', hasta).order('paid_at')
    if (error) message.error('No se pudieron leer los pagos: ' + error.message)
    setPagos(((data ?? []) as unknown as PagoDia[]).filter(p => p.orders?.status !== 'cancelled'))
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const accion = async (id: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setOcupado(id)
    const { error } = await fn()
    setOcupado(null)
    if (error) { message.error(error.message); return }
    message.success(ok)
    await cargar()
    onChanged()
  }

  const corregir = (p: PagoDia, metodo: Metodo) => {
    if (metodo === p.payment_method) return
    const motivo = window.prompt(`¿Por qué cambia el pago de ${LABEL[p.payment_method]} a ${LABEL[metodo]}?`)
    if (!motivo || motivo.trim().length < 3) return
    accion(p.id, () => supabase.rpc('corregir_pago', { p_pago_id: p.id, p_metodo: metodo, p_motivo: motivo.trim() }), 'Pago corregido')
  }

  const anular = (p: PagoDia) => {
    const motivo = window.prompt(`Anular el pago de ${fmt(p.monto)}. ¿Cuál es el motivo?`)
    if (!motivo || motivo.trim().length < 3) return
    accion(p.id, () => supabase.rpc('anular_pago', { p_pago_id: p.id, p_motivo: motivo.trim() }), 'Pago anulado: el pedido vuelve a caja')
  }

  const verificar = (p: PagoDia) =>
    accion(p.id, () => supabase.rpc('marcar_transferencia', { p_pago_id: p.id, p_verificada: !p.transferencia_verificada }),
      p.transferencia_verificada ? 'Desmarcada' : 'Transferencia verificada')

  const lista = pagos.filter(p => !soloTransf || p.payment_method === 'transferencia')
  const vigentes = pagos.filter(p => !p.anulado_at)
  const porMetodo = (m: Metodo) => vigentes.filter(p => p.payment_method === m).reduce((s, p) => s + Number(p.monto), 0)
  const pendientesVerificar = vigentes.filter(p => p.payment_method === 'transferencia' && !p.transferencia_verificada).length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[var(--w-overlay)] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--w-surface-raised)] rounded-t-[var(--w-r-xl)] sm:rounded-[var(--w-r-xl)] p-5 w-full max-w-lg max-h-[92dvh] overflow-y-auto" style={FX.card}
        role="dialog" aria-label="Pagos de hoy">
        <h3 className="font-bold text-[color:var(--w-text)] text-xl">Pagos de hoy</h3>
        <p className="text-xs text-[color:var(--w-text-3)] mb-3">
          Efectivo {fmt(porMetodo('efectivo'))} · Transferencias {fmt(porMetodo('transferencia'))}
          {porMetodo('tarjeta') > 0 ? ` · Tarjeta ${fmt(porMetodo('tarjeta'))}` : ''}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {[[false, 'Todos'], [true, `Transferencias${pendientesVerificar ? ` (${pendientesVerificar} por verificar)` : ''}`]].map(([v, label]) => (
            <button key={String(label)} onClick={() => setSoloTransf(v as boolean)}
              className={cn('min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold px-1', soloTransf === v ? 'text-[color:var(--w-on-accent)]' : 'text-[color:var(--w-text-2)]')}
              style={soloTransf === v ? { background: 'var(--w-accent)' } : { background: 'var(--w-surface)', ...FX.soft }}>
              {label as string}
            </button>
          ))}
        </div>

        {cargando ? <p className="text-center text-sm text-[color:var(--w-text-3)] py-6">Cargando…</p>
          : lista.length === 0 ? <p className="text-center text-sm text-[color:var(--w-text-3)] py-6">Sin pagos hoy</p>
          : (
          <div className="flex flex-col gap-2">
            {lista.map(p => (
              <div key={p.id} className={cn('rounded-[var(--w-r-lg)] p-3 bg-[var(--w-border)]', p.anulado_at && 'opacity-60')} style={FX.soft}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[color:var(--w-text)] truncate">{destino(p.orders)}</p>
                    <p className="text-xs text-[color:var(--w-text-2)]">
                      {new Date(p.paid_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                      {p.comensal ? ` · ${p.comensal}` : ''}{p.referencia ? ` · ref ${p.referencia}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-base font-bold text-[color:var(--w-text)]', p.anulado_at && 'line-through')}>{fmt(p.monto)}</p>
                    {p.propina > 0 && <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-info-text)]">+{fmt(p.propina)} propina</p>}
                  </div>
                </div>

                {p.anulado_at ? (
                  <p className="text-xs font-semibold text-[color:var(--w-danger-text)] mt-1">Anulado: {p.anulado_motivo}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <select aria-label="Método del pago" value={p.payment_method} disabled={ocupado === p.id}
                      onChange={e => corregir(p, e.target.value as Metodo)}
                      className="min-h-[44px] rounded-[var(--w-r-md)] px-2 text-sm font-bold text-[color:var(--w-text)] bg-[var(--w-surface-sunken)] outline-none" style={FX.field}>
                      {(Object.keys(LABEL) as Metodo[]).map(m => <option key={m} value={m}>{LABEL[m]}</option>)}
                    </select>
                    {p.payment_method === 'transferencia' && (
                      <button onClick={() => verificar(p)} disabled={ocupado === p.id}
                        className={cn('min-h-[44px] px-3 rounded-[var(--w-r-md)] text-xs font-bold', p.transferencia_verificada ? 'text-[color:var(--w-success-text)] bg-[var(--w-success-bg)] border border-[var(--w-success)]' : 'text-[color:var(--w-text)]')}
                        style={p.transferencia_verificada ? undefined : FX.soft}>
                        {p.transferencia_verificada ? '✓ Verificada' : 'Marcar verificada'}
                      </button>
                    )}
                    {esAdmin && (
                      <button onClick={() => anular(p)} disabled={ocupado === p.id}
                        className="min-h-[44px] px-3 rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-danger-text)]" style={FX.soft}>
                        Anular
                      </button>
                    )}
                  </div>
                )}
                {p.metodo_original && !p.anulado_at && (
                  <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-warning-text)] mt-1">Corregido (era {LABEL[p.metodo_original as Metodo] ?? p.metodo_original}): {p.corregido_motivo}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full min-h-[48px] rounded-[var(--w-r-lg)] font-bold text-[color:var(--w-text)] mt-4" style={FX.card}>Cerrar</button>
      </motion.div>
    </motion.div>
  )
}
