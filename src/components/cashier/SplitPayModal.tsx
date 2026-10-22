/**
 * SplitPayModal.tsx — "Dividir cuenta": cobra un pedido por partes (spec Anexo A, Parte B).
 * Cada persona paga lo suyo con su método (efectivo, transferencia o tarjeta). Cada pago se guarda
 * en el instante en que se confirma (registrar_pago); el pedido queda cobrado al cubrir el total.
 * Tres modos: montos libres, partes iguales y por persona (si el pedido se tomó por persona).
 * Pensado primero para celular: tarjetas apiladas y botones táctiles de 44 px.
 */
import { forwardRef, useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { cn } from '../../lib/cn'
import { destinoPedido } from '../../lib/destino'
import { COLA_CAMBIO, esErrorTransitorio, guardarPagoPendiente, identidadActual, listarPagosPendientes, type PagoPendiente } from '../../services/paymentQueue'

type Metodo = 'efectivo' | 'transferencia' | 'tarjeta'
type Modo = 'libres' | 'iguales' | 'persona'

export interface SplitPayOrder {
  id:            string
  total:         number
  tipo_pedido:   string
  table_num:     number | null
  customer_name: string | null
  items:         { name: string; quantity: number; price: number; cancelled?: boolean; comensal?: string | null }[]
}

interface Pago { id: string; comensal: string | null; payment_method: Metodo; monto: number; propina: number; referencia: string | null }

interface Fila {
  key:        string
  nombre:     string
  monto:      string
  metodo:     Metodo
  recibido:   string   // efectivo que entrega (venta + propina); vacío = justo
  propina:    string
  referencia: string
  idem:       string   // clave de idempotencia: un doble toque nunca duplica el pago
  estado:     'pendiente' | 'cobrando'
  error:      string | null
}

const S = {
  out:   { boxShadow: 'var(--shadow-out)' },
  outSm: { boxShadow: 'var(--shadow-out-sm)' },
  inset: { boxShadow: 'var(--shadow-in)' },
  coral: { boxShadow: 'var(--shadow-coral)' },
} as const

const METODOS: { id: Metodo; label: string }[] = [
  { id: 'efectivo',      label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'tarjeta',       label: 'Tarjeta' },
]

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) ? v : 0 }
// Lectura estricta para validar al cobrar: vacío = null; texto raro = NaN.
const numEstricto = (s: string) => (s.trim() === '' ? null : Number(s))
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

const nuevaFila = (nombre: string, monto: number): Fila => ({
  key: uid(), nombre, monto: String(Math.round(monto)), metodo: 'efectivo',
  recibido: '', propina: '', referencia: '', idem: uid(), estado: 'pendiente', error: null,
})

const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="number" inputMode="numeric" min={0} step={1}
      className={cn('w-full min-h-[44px] bg-[#CDD0DC] rounded-xl px-3 py-2 text-base font-bold text-[#2D3561] outline-none', className)}
      style={S.inset} {...props} />
  ),
)
MoneyInput.displayName = 'MoneyInput'

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">{label}</span>
    {children}
  </label>
)

function filasPorPersona(order: SplitPayOrder, pagos: Pago[]): Fila[] {
  const grupos = new Map<string, number>()
  for (const it of order.items) {
    if (it.cancelled) continue
    const c = (it.comensal ?? '').trim() || 'Sin asignar'
    grupos.set(c, (grupos.get(c) ?? 0) + Number(it.price) * Number(it.quantity))
  }
  for (const p of pagos) {
    if (p.comensal && grupos.has(p.comensal)) grupos.set(p.comensal, (grupos.get(p.comensal) ?? 0) - Number(p.monto))
  }
  return [...grupos.entries()].filter(([, v]) => v > 0).map(([nombre, v]) => nuevaFila(nombre, v))
}

interface Props {
  order:              SplitPayOrder
  propinaSugeridaPct: number | null
  onClose:            () => void      // cerrar (aunque falte cobrar: queda "Pagado X, falta Y")
  onFinished:         () => void      // el pedido quedó cubierto por completo
}

export function SplitPayModal({ order, propinaSugeridaPct, onClose, onFinished }: Props) {
  const [pagos, setPagos]       = useState<Pago[]>([])
  const [cargando, setCargando] = useState(true)
  const [modo, setModo]         = useState<Modo>('libres')
  const [nIguales, setNIguales] = useState('2')
  const [filas, setFilas]       = useState<Fila[]>([])
  // Pagos guardados en el teléfono por falta de internet (se envían solos al volver la conexión)
  const [locales, setLocales]   = useState<PagoPendiente[]>([])

  const cargarLocales = useCallback(async () => {
    try { setLocales((await listarPagosPendientes()).filter(p => p.order_id === order.id)) } catch { setLocales([]) }
  }, [order.id])
  useEffect(() => {
    void cargarLocales()
    window.addEventListener(COLA_CAMBIO, cargarLocales)
    return () => window.removeEventListener(COLA_CAMBIO, cargarLocales)
  }, [cargarLocales])

  const enCola   = locales.filter(p => p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0)
  const pagado = pagos.reduce((s, p) => s + Number(p.monto), 0) + enCola
  const falta  = Math.max(order.total - pagado, 0)
  const asignado = filas.reduce((s, f) => s + num(f.monto), 0)
  const tienePersonas = order.items.some(i => (i.comensal ?? '').trim() !== '')

  const cargarPagos = useCallback(async () => {
    const { data, error } = await supabase.from('order_payments')
      .select('id, comensal, payment_method, monto, propina, referencia')
      .eq('order_id', order.id).is('anulado_at', null).order('paid_at')
    if (error) {
      if (!esErrorTransitorio(error.message)) message.error('No se pudieron leer los pagos: ' + error.message)
      return [] as Pago[]
    }
    const lista = (data ?? []) as Pago[]
    setPagos(lista)
    return lista
  }, [order.id])

  const armar = useCallback((m: Modo, faltaActual: number, lista: Pago[], n: number) => {
    if (m === 'iguales') {
      const cuantas = Math.min(Math.max(Math.round(n) || 2, 1), 20)
      const base = Math.floor(faltaActual / cuantas)
      const resto = faltaActual - base * cuantas
      setFilas(Array.from({ length: cuantas }, (_, i) => nuevaFila(`Persona ${i + 1 + lista.length}`, base + (i === 0 ? resto : 0))))
    } else if (m === 'persona') {
      setFilas(filasPorPersona(order, lista))
    } else {
      setFilas([nuevaFila('', faltaActual)])
    }
  }, [order])

  useEffect(() => {
    cargarPagos().then(async lista => {
      const yaPagado = lista.reduce((s, p) => s + Number(p.monto), 0)
      let sinEnviar = 0
      try {
        sinEnviar = (await listarPagosPendientes()).filter(p => p.order_id === order.id && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0)
      } catch { /* sin cola local: se ignora */ }
      armar('libres', Math.max(order.total - yaPagado - sinEnviar, 0), lista, 2)
      setCargando(false)
    })
  }, [cargarPagos, armar, order.total])

  const cambiarModo = (m: Modo) => { setModo(m); armar(m, falta, pagos, num(nIguales)) }

  const editar = (key: string, patch: Partial<Fila>) =>
    setFilas(prev => prev.map(f => f.key === key ? { ...f, ...patch, error: null } : f))

  // Candado síncrono por fila: un doble toque nunca envía dos veces el mismo cobro.
  const cobrando = useRef(new Set<string>())

  const cobrar = async (f: Fila) => {
    if (cobrando.current.has(f.key)) return
    // Montos en pesos enteros (COP): sin decimales ni texto raro.
    const monto = Number(f.monto)
    const propinaN = numEstricto(f.propina)
    const recibidoN = f.metodo === 'efectivo' ? numEstricto(f.recibido) : null
    if (!Number.isFinite(monto) || monto <= 0) { editar(f.key, { error: 'Escribe cuánto paga' }); return }
    if (!Number.isInteger(monto)) { editar(f.key, { error: 'El monto debe ser en pesos enteros' }); return }
    if (propinaN !== null && (!Number.isInteger(propinaN) || propinaN < 0)) { editar(f.key, { error: 'La propina debe ser en pesos enteros' }); return }
    if (recibidoN !== null && !Number.isInteger(recibidoN)) { editar(f.key, { error: 'El efectivo recibido debe ser en pesos enteros' }); return }
    const propina = propinaN ?? 0
    const recibido = recibidoN
    if (monto > falta) { editar(f.key, { error: `Solo faltan ${fmt(falta)} por cobrar` }); return }
    if (recibido !== null && recibido < monto + propina) { editar(f.key, { error: 'El efectivo recibido no alcanza' }); return }

    cobrando.current.add(f.key)
    setFilas(prev => prev.map(x => x.key === f.key ? { ...x, estado: 'cobrando', error: null } : x))
    const args = {
      p_order_id: order.id, p_comensal: f.nombre.trim() || null, p_metodo: f.metodo, p_monto: monto,
      p_propina: propina, p_recibido: recibido, p_referencia: f.referencia.trim() || null, p_idempotency_key: f.idem,
    }
    // Sin internet: el pago se guarda aquí y se envía solo al volver la conexión (la clave evita duplicarlo).
    const guardarLocal = async () => {
      const id = await identidadActual()
      await guardarPagoPendiente({
        idem: f.idem, order_id: order.id, monto, args, creado: new Date().toISOString(), estado: 'pendiente',
        user_id: id.user_id, restaurant_id: id.restaurant_id,
        resumen: `${f.nombre.trim() || 'Pago'} · ${METODOS.find(m => m.id === f.metodo)?.label} · ${fmt(monto)}`,
      })
      message.warning('Sin internet: pago guardado en este equipo, se envía solo al volver la conexión')
      setFilas(prev => prev.filter(x => x.key !== f.key))
    }
    try {
      if (!navigator.onLine) { await guardarLocal(); return }
      const { data, error, status } = await supabase.rpc('registrar_pago', args)
      if (error) {
        if (esErrorTransitorio(error.message, status)) { await guardarLocal(); return }
        setFilas(prev => prev.map(x => x.key === f.key ? { ...x, estado: 'pendiente', error: error.message } : x))
        return
      }
      const cambio = Number((data as { cambio?: number } | null)?.cambio ?? 0)
      message.success(cambio > 0 ? `Cobrado ${f.nombre.trim() || 'pago'} · Cambio: ${fmt(cambio)}` : `Cobrado ${f.nombre.trim() || 'pago'}`)
      setFilas(prev => prev.filter(x => x.key !== f.key))
      await cargarPagos()
    } catch (e) {
      setFilas(prev => prev.map(x => x.key === f.key ? { ...x, estado: 'pendiente', error: e instanceof Error ? e.message : 'No se pudo cobrar' } : x))
    } finally {
      cobrando.current.delete(f.key)
    }
  }

  if (cargando) return null

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#D8DAE4] rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-lg max-h-[92vh] overflow-y-auto"
        style={S.out}
        role="dialog" aria-label="Dividir cuenta"
      >
        {/* Encabezado y barra de avance */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-[#FF5722] uppercase tracking-wider">Dividir cuenta</p>
            <h3 className="font-bold text-[#2D3561] text-lg mt-0.5">
              {destinoPedido(order)}
              {order.customer_name && <span className="text-[#FF5722]"> · {order.customer_name}</span>}
            </h3>
          </div>
          <span className="text-2xl font-bold text-[#FF5722]">{fmt(order.total)}</span>
        </div>

        <div className="mb-4" aria-live="polite">
          <div className="h-2.5 rounded-full bg-[#CDD0DC] overflow-hidden" style={S.inset}>
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (pagado / Math.max(order.total, 1)) * 100)}%` }} />
          </div>
          <p className="text-sm font-bold mt-1.5 text-[#2D3561]">
            Cobrado {fmt(pagado)} · <span className={falta > 0 ? 'text-[#FF5722]' : 'text-emerald-600'}>{falta > 0 ? `falta ${fmt(falta)}` : 'cuenta completa'}</span>
          </p>
        </div>

        {pagos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {pagos.map(p => (
              <span key={p.id} className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
                ✓ {p.comensal || 'Pago'} · {METODOS.find(m => m.id === p.payment_method)?.label} · {fmt(p.monto)}{p.propina > 0 ? ` (+${fmt(p.propina)} propina)` : ''}
              </span>
            ))}
          </div>
        )}

        {locales.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4" aria-live="polite">
            {locales.map(p => (
              <span key={p.idem} className={cn('text-xs font-semibold rounded-xl px-2.5 py-1.5 border',
                p.estado === 'conflicto' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>
                {p.estado === 'conflicto' ? `⚠ ${p.resumen}: el servidor lo rechazó (${p.motivo}). Revísalo con el administrador.` : `⏳ ${p.resumen} · guardado sin internet, falta enviarlo`}
              </span>
            ))}
          </div>
        )}

        {falta <= 0 ? (
          <div className="text-center py-4">
            {enCola > 0 ? (
              <>
                <p className="text-lg font-bold text-amber-700 mb-1">Cuenta cubierta (con pagos sin enviar)</p>
                <p className="text-xs text-[#6B7280] mb-3">El pedido se cierra solo cuando vuelva el internet y se envíen los pagos guardados.</p>
                <button onClick={onClose} className="w-full min-h-[48px] rounded-2xl font-bold text-white bg-[#FF5722]" style={S.coral}>Cerrar</button>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-emerald-600 mb-3">Cuenta cobrada por completo</p>
                <button onClick={onFinished}
                  className="w-full min-h-[48px] rounded-2xl font-bold text-white bg-[#FF5722]" style={S.coral}>
                  Listo
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Modo de división */}
            <div className="grid grid-cols-3 gap-2 mb-3" role="tablist" aria-label="Cómo dividir">
              {([['libres', 'Montos libres'], ['iguales', 'Partes iguales'], ['persona', 'Por persona']] as [Modo, string][]).map(([m, label]) => (
                <button key={m} role="tab" aria-selected={modo === m}
                  disabled={m === 'persona' && !tienePersonas}
                  title={m === 'persona' && !tienePersonas ? 'Este pedido no se tomó por persona' : undefined}
                  onClick={() => cambiarModo(m)}
                  className={cn('min-h-[44px] rounded-xl text-xs font-bold px-1', modo === m ? 'text-white' : 'text-[#6B7280]', m === 'persona' && !tienePersonas && 'opacity-40')}
                  style={modo === m ? { background: 'var(--accent)', ...S.coral } : { background: 'var(--bg)', ...S.outSm }}>
                  {label}
                </button>
              ))}
            </div>

            {modo === 'iguales' && (
              <div className="flex items-end gap-2 mb-3">
                <div className="w-28"><Campo label="¿Cuántas personas?">
                  <MoneyInput value={nIguales} onChange={e => setNIguales(e.target.value)} />
                </Campo></div>
                <button onClick={() => armar('iguales', falta, pagos, num(nIguales))}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-bold text-[#2D3561]" style={S.outSm}>
                  Dividir
                </button>
              </div>
            )}

            {/* Una tarjeta por persona */}
            <div className="flex flex-col gap-3">
              {filas.map(f => {
                const monto = num(f.monto)
                const propina = Math.max(num(f.propina), 0)
                const cambio = f.metodo === 'efectivo' && f.recibido !== '' && num(f.recibido) >= monto + propina ? num(f.recibido) - monto - propina : 0
                return (
                  <div key={f.key} className="rounded-2xl p-3 bg-[#E3E5EE]" style={S.outSm}>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <Campo label="Persona">
                        <input value={f.nombre} onChange={e => editar(f.key, { nombre: e.target.value })} maxLength={60}
                          placeholder="Persona"
                          className="w-full min-h-[44px] bg-[#CDD0DC] rounded-xl px-3 py-2 text-base text-[#2D3561] outline-none" style={S.inset} />
                      </Campo>
                      <Campo label="Paga">
                        <MoneyInput value={f.monto} onChange={e => editar(f.key, { monto: e.target.value })} />
                      </Campo>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mb-2" role="radiogroup" aria-label="Método de pago">
                      {METODOS.map(m => (
                        <button key={m.id} role="radio" aria-checked={f.metodo === m.id}
                          onClick={() => editar(f.key, { metodo: m.id })}
                          className={cn('min-h-[44px] rounded-xl text-xs font-bold', f.metodo === m.id ? 'text-white' : 'text-[#6B7280]')}
                          style={f.metodo === m.id ? { background: 'var(--accent)', ...S.coral } : { background: 'var(--bg)', ...S.outSm }}>
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <Campo label="Propina (opcional)">
                        <MoneyInput value={f.propina} placeholder="0" onChange={e => editar(f.key, { propina: e.target.value })} />
                      </Campo>
                      {f.metodo === 'efectivo' && (
                        <Campo label="Entrega (efectivo)">
                          <MoneyInput value={f.recibido} placeholder={String(Math.round(monto + propina))} onChange={e => editar(f.key, { recibido: e.target.value })} />
                        </Campo>
                      )}
                      {f.metodo === 'transferencia' && (
                        <Campo label="Referencia (opcional)">
                          <input value={f.referencia} maxLength={60} onChange={e => editar(f.key, { referencia: e.target.value })}
                            placeholder="Últimos dígitos"
                            className="w-full min-h-[44px] bg-[#CDD0DC] rounded-xl px-3 py-2 text-base text-[#2D3561] outline-none" style={S.inset} />
                        </Campo>
                      )}
                    </div>

                    {!!propinaSugeridaPct && monto > 0 && (
                      <button type="button" onClick={() => editar(f.key, { propina: String(Math.round(monto * propinaSugeridaPct / 100)) })}
                        className="text-xs font-bold text-[#FF5722] mb-2 min-h-[44px] sm:min-h-0">
                        Propina sugerida {propinaSugeridaPct}% · {fmt(monto * propinaSugeridaPct / 100)}
                      </button>
                    )}

                    {cambio > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-emerald-700">Cambio</span>
                        <span className="text-lg font-bold text-emerald-600">{fmt(cambio)}</span>
                      </div>
                    )}
                    {f.error && <p role="alert" className="text-xs text-red-600 font-semibold mb-2">{f.error}</p>}

                    <div className="flex gap-2">
                      <button onClick={() => cobrar(f)} disabled={f.estado === 'cobrando' || monto <= 0}
                        className={cn('flex-1 min-h-[48px] rounded-2xl font-bold text-white text-sm bg-[#FF5722]', (f.estado === 'cobrando' || monto <= 0) && 'opacity-60')}
                        style={S.coral}>
                        {f.estado === 'cobrando' ? 'Procesando…' : `Cobrar ${f.nombre.trim() || 'a esta persona'} · ${fmt(monto)}`}
                      </button>
                      {filas.length > 1 && (
                        <button onClick={() => setFilas(prev => prev.filter(x => x.key !== f.key))} aria-label="Quitar persona"
                          className="min-h-[48px] min-w-[48px] rounded-2xl text-[#9CA3AF] font-bold" style={S.outSm}>✕</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {modo !== 'persona' && (
              <button onClick={() => setFilas(prev => [...prev, nuevaFila('', Math.max(falta - asignado, 0))])}
                className="text-sm font-bold text-[#FF5722] min-h-[44px] mt-1">
                + Agregar persona
              </button>
            )}

            <p className={cn('text-xs font-semibold mt-1', Math.abs(asignado - falta) < 1 ? 'text-emerald-600' : 'text-[#6B7280]')}>
              Por cobrar en pantalla: {fmt(asignado)} de {fmt(falta)} que faltan
            </p>
          </>
        )}

        <button onClick={onClose} className="w-full min-h-[48px] rounded-2xl font-bold text-[#6B7280] mt-4" style={S.out}>
          {falta > 0 && pagado > 0 ? 'Cerrar (queda lo que falta por cobrar)' : 'Cerrar'}
        </button>
      </motion.div>
    </motion.div>
  )
}
