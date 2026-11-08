/**
 * PedidosMesaPanel — "Pedidos de mesa" para mesero, cajero y administrador.
 * Muestra lo que los comensales piden por el QR de la mesa (hay que ACEPTAR o RECHAZAR),
 * las llamadas "Llamar al mesero" / "Pedir la cuenta" y el código de 4 dígitos de cada mesa abierta.
 * Todo pasa por funciones del servidor (mesa_pedidos_pendientes, mesa_pedido_aceptar, mesa_pedido_rechazar,
 * mesa_llamadas_pendientes, mesa_llamada_atender). Se refresca cada 8 s y al instante con tiempo real.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { pushNotificationService } from '../../services/pushNotificationService'
import { playOrderSound } from '../../services/orderSounds'
import { formatCOP } from '../../config/billing'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

interface Linea { name: string; quantity: number; price: number; notes?: string | null; size?: string | null }
interface Pendiente { id: string; table_num: number; nombre: string | null; items: Linea[]; total: number; created_at: string }
interface Llamada { id: string; table_num: number; tipo: 'mesero' | 'cuenta'; created_at: string }
interface MesaAbierta { id: string; numero: number; codigo_mesa: string | null; estado: string }

const MOTIVOS = ['Se acabó el plato', 'Cocina no puede ahora', 'Hablemos en la mesa']

function hace(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 1 ? 'ahora' : `hace ${m} min`
}

/** Cuenta de pendientes + llamadas, para una insignia en el menú. Se refresca cada 8 s. */
export function usePedidosMesaCount(activo = true): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    const leer = async () => {
      const [p, l] = await Promise.all([supabase.rpc('mesa_pedidos_pendientes'), supabase.rpc('mesa_llamadas_pendientes')])
      if (vivo) setN((Array.isArray(p.data) ? p.data.length : 0) + (Array.isArray(l.data) ? l.data.length : 0))
    }
    void leer()
    const t = setInterval(() => { void leer() }, 8000)
    return () => { vivo = false; clearInterval(t) }
  }, [activo])
  return n
}

export function PedidosMesaPanel() {
  const [pend, setPend] = useState<Pendiente[]>([])
  const [llam, setLlam] = useState<Llamada[]>([])
  const [mesas, setMesas] = useState<MesaAbierta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const oidos = useRef<Set<string> | null>(null)

  const cargar = useCallback(async () => {
    const [p, l, m] = await Promise.all([
      supabase.rpc('mesa_pedidos_pendientes'),
      supabase.rpc('mesa_llamadas_pendientes'),
      supabase.from('mesas').select('id, numero, codigo_mesa, estado').in('estado', ['ocupada', 'cuenta']).order('numero'),
    ])
    if (p.error || l.error) { setError('No se pudieron cargar los pedidos de mesa. Revisa tu conexión.'); setCargando(false); return }
    setError(null)
    const pl = (p.data ?? []) as Pendiente[]
    const ll = (l.data ?? []) as Llamada[]
    setPend(pl); setLlam(ll); setMesas((m.data ?? []) as MesaAbierta[])
    // Suena solo lo que llega después de abrir la pantalla
    const ids = [...pl.map(x => `p:${x.id}`), ...ll.map(x => `l:${x.id}`)]
    if (oidos.current === null) oidos.current = new Set(ids)
    else {
      const nuevo = ids.filter(i => !oidos.current!.has(i))
      if (nuevo.length) { nuevo.forEach(i => oidos.current!.add(i)); playOrderSound(nuevo.some(i => i.startsWith('p:')) ? 'LOCAL' : 'LLEVAR') }
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => { void cargar() }, 8000)
    let canal: ReturnType<typeof supabase.channel> | null = null
    let muerto = false
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (muerto || !rid) return
      canal = supabase.channel(`pedidos-mesa-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_mesa_pendientes', filter: `restaurant_id=eq.${rid}` }, () => { void cargar() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'llamadas_mesa', filter: `restaurant_id=eq.${rid}` }, () => { void cargar() })
        .subscribe()
    })
    return () => { muerto = true; clearInterval(t); if (canal) void supabase.removeChannel(canal) }
  }, [cargar])

  const aceptar = async (p: Pendiente) => {
    setOcupado(p.id)
    const { data, error: e } = await supabase.rpc('mesa_pedido_aceptar', { p_id: p.id })
    setOcupado(null)
    const r = data as { ok: boolean; ya?: boolean; error?: string } | null
    if (e || !r?.ok) {
      message.error(r?.error === 'expirada' ? 'Este pedido ya expiró (más de 30 min). Pídele al cliente que lo envíe otra vez.' : e?.message ?? 'No se pudo aceptar el pedido')
    } else if (r.ya) {
      message.info('Ese pedido ya estaba aceptado')
    } else {
      message.success(`Mesa ${p.table_num}: pedido aceptado y enviado a caja para cobro`)
      void pushNotificationService.notify(['cashier', 'admin'], 'Pedido por cobrar', `Mesa ${p.table_num} (QR) — ${p.items.length} ítem(s) · ${formatCOP(p.total)}`, '/')
    }
    void cargar()
  }

  const rechazar = async (p: Pendiente) => {
    setOcupado(p.id)
    const { error: e } = await supabase.rpc('mesa_pedido_rechazar', { p_id: p.id, p_motivo: motivo.trim() || null })
    setOcupado(null)
    if (e) message.error(e.message)
    else { message.success(`Mesa ${p.table_num}: pedido rechazado`); setRechazando(null); setMotivo('') }
    void cargar()
  }

  const atender = async (l: Llamada) => {
    const { error: e } = await supabase.rpc('mesa_llamada_atender', { p_id: l.id })
    if (e) message.error(e.message)
    void cargar()
  }

  const card = 'rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-[color:var(--w-text)]">Pedidos de mesa</h2>
        <p className="text-sm text-[color:var(--w-text-3)]">Lo que piden los clientes con el QR. Acepta para que siga su camino, igual que un pedido tuyo.</p>
      </div>

      {error && <div role="alert" className="rounded-[var(--w-r-md)] border border-[var(--w-danger)] bg-[var(--w-danger-bg)] p-3 text-sm text-[color:var(--w-danger-text)]">{error}</div>}

      <section aria-label="Pedidos esperando" className="space-y-3">
        <h3 className="text-base font-bold text-[color:var(--w-text)]">Esperando respuesta {pend.length > 0 && <Badge tone="warning">{pend.length}</Badge>}</h3>
        {cargando ? <p className="text-sm text-[color:var(--w-text-3)]">Cargando…</p>
          : pend.length === 0 ? <p className={`${card} text-sm text-[color:var(--w-text-3)]`}>No hay pedidos esperando.</p>
          : pend.map(p => (
            <article key={p.id} className={card}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg font-extrabold text-[color:var(--w-text)]">Mesa {p.table_num} quiere pedir</span>
                <span className="ml-auto text-xs text-[color:var(--w-text-3)]">{hace(p.created_at)}</span>
              </div>
              {p.nombre && <p className="mb-1 text-sm text-[color:var(--w-text-2)]">Cliente: {p.nombre}</p>}
              <ul className="mb-3 space-y-1 text-sm text-[color:var(--w-text)]">
                {p.items.map((i, k) => (
                  <li key={k}>
                    <strong>{i.quantity}×</strong> {i.name}{i.size ? ` (${i.size})` : ''}
                    {i.notes && <span className="block text-xs text-[color:var(--w-text-3)]">Nota: {i.notes}</span>}
                  </li>
                ))}
              </ul>
              <p className="mb-3 text-sm font-bold text-[color:var(--w-accent-text)]">Total {formatCOP(p.total)}</p>
              {rechazando === p.id ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS.map(m => <button key={m} type="button" onClick={() => setMotivo(m)} className="min-h-[36px] rounded-[var(--w-r-pill)] border border-[var(--w-border)] px-3 text-xs text-[color:var(--w-text-2)]">{m}</button>)}
                  </div>
                  <input value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 200))} placeholder="Motivo (opcional, lo ve el cliente)" aria-label="Motivo del rechazo"
                    className="min-h-[44px] w-full rounded-[var(--w-r-md)] border border-[var(--w-border)] bg-[var(--w-surface-sunken)] px-3 text-sm text-[color:var(--w-text)]" />
                  <div className="flex gap-2">
                    <Button variant="danger" className="flex-1" loading={ocupado === p.id} onClick={() => void rechazar(p)}>Rechazar pedido</Button>
                    <Button variant="ghost" onClick={() => { setRechazando(null); setMotivo('') }}>Volver</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button className="flex-1" loading={ocupado === p.id} onClick={() => void aceptar(p)}>Aceptar</Button>
                  <Button variant="secondary" disabled={ocupado === p.id} onClick={() => { setRechazando(p.id); setMotivo('') }}>Rechazar</Button>
                </div>
              )}
            </article>
          ))}
      </section>

      <section aria-label="Llamadas de mesas" className="space-y-3">
        <h3 className="text-base font-bold text-[color:var(--w-text)]">Llamadas {llam.length > 0 && <Badge tone="danger">{llam.length}</Badge>}</h3>
        {llam.length === 0 ? <p className={`${card} text-sm text-[color:var(--w-text-3)]`}>Nadie está llamando.</p>
          : llam.map(l => (
            <div key={l.id} className={`${card} flex items-center gap-3`}>
              <div className="flex-1">
                <p className="font-bold text-[color:var(--w-text)]">{l.tipo === 'cuenta' ? `Mesa ${l.table_num} pide la cuenta` : `Mesa ${l.table_num} llama al mesero`}</p>
                <p className="text-xs text-[color:var(--w-text-3)]">{hace(l.created_at)}</p>
              </div>
              <Button variant="secondary" onClick={() => void atender(l)}>Atendida</Button>
            </div>
          ))}
      </section>

      <section aria-label="Códigos de mesas abiertas" className="space-y-3">
        <h3 className="text-base font-bold text-[color:var(--w-text)]">Código de mesas abiertas</h3>
        <p className="text-xs text-[color:var(--w-text-3)]">Si otra persona escanea una mesa ya abierta, dale este código de 4 dígitos. Se borra al cerrar la mesa.</p>
        {mesas.length === 0 ? <p className={`${card} text-sm text-[color:var(--w-text-3)]`}>No hay mesas abiertas.</p>
          : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {mesas.map(m => (
                <div key={m.id} className={`${card} text-center`}>
                  <p className="text-sm text-[color:var(--w-text-2)]">Mesa {m.numero}</p>
                  <p className="text-2xl font-extrabold tracking-[0.25em] text-[color:var(--w-text)]">{m.codigo_mesa ?? '----'}</p>
                </div>
              ))}
            </div>}
      </section>
    </div>
  )
}
