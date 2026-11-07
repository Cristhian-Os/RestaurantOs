/**
 * TableMap.tsx v3 — pantalla Mesas con la composición de la lámina "Mesas".
 * - Plano de mesas con forma (cuadrada / alargada), sillas según capacidad y estado por color
 * - Filtro por estado (píldoras), selector de zona, leyenda y totales
 * - Panel de la mesa seleccionada: personas, tiempo en mesa, pedido, total, mesero y acciones
 * - Acciones reutilizan lógica existente: cambiar estado de mesa (handleChangeEstado) e ir a Caja
 * Los datos salen de las tablas mesas y orders; no hay posición (x,y) guardada, el plano se acomoda solo.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { Button } from '../ui/Button'
import { ModuleHeader } from '../tasks/ModuleHeader'
import type { Profile, NavView } from '../../pages/Dashboard'

const FX = {
  card:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  soft:  { boxShadow: 'var(--w-shadow-sm)' },
  field: { border: '1px solid var(--w-border)' },
  cta:   { boxShadow: 'var(--w-shadow-terra)' },
} as const

type Estado = 'libre' | 'ocupada' | 'reservada' | 'cuenta'
interface Mesa {
  id: string; numero: number; capacidad: number
  estado: Estado; zona: string; activa: boolean
}
interface OrderItem { name: string; quantity: number; notes?: string }
interface ActiveOrder {
  id: string; mesa_id: string; total: number; status: string
  created_at: string; items: OrderItem[]; paid_at?: string | null
  customer_name?: string | null; user_id?: string | null
}

// Libre = verde, Ocupada = naranja (texto blanco), Reservada = azul, En atención (pide la cuenta) = amarillo
const ESTADO_CONFIG: Record<Estado, { label: string; fill: string; edge: string; legend: string; dot: string; ink: string; badgeBg: string; badgeText: string }> = {
  libre:     { label: 'Disponible',   fill: 'var(--w-success-bg)', edge: 'var(--w-success)',  legend: 'var(--w-success)', dot: 'var(--w-success)',  ink: 'var(--w-text)',      badgeBg: 'var(--w-success-bg)', badgeText: 'var(--w-success-text)' },
  ocupada:   { label: 'Ocupada',      fill: 'var(--w-accent)',     edge: 'var(--w-accent-press)', legend: 'var(--w-accent)', dot: 'var(--w-on-accent)', ink: 'var(--w-on-accent)', badgeBg: 'var(--w-accent-soft)', badgeText: 'var(--w-accent-text)' },
  reservada: { label: 'Reservada',    fill: 'var(--w-info-bg)',    edge: 'var(--w-info)',     legend: 'var(--w-info)',    dot: 'var(--w-info)',     ink: 'var(--w-text)',      badgeBg: 'var(--w-info-bg)',    badgeText: 'var(--w-info-text)' },
  cuenta:    { label: 'En atención',  fill: 'var(--w-warning-bg)', edge: 'var(--w-warning)',  legend: 'var(--w-warning)', dot: 'var(--w-warning)',  ink: 'var(--w-text)',      badgeBg: 'var(--w-warning-bg)', badgeText: 'var(--w-warning-text)' },
}
const ESTADOS = Object.keys(ESTADO_CONFIG) as Estado[]

const STATUS_LABELS: Record<string, string> = {
  pending:   'En espera',
  cooking:   'En cocina',
  ready:     'Listo para entregar',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

const pad = (n: number) => String(n).padStart(2, '0')
const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const minutosDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))

/** Tiempo en mesa HH:MM:SS, se actualiza cada segundo. */
function Reloj({ desde }: { desde: string }) {
  const calc = () => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 1000))
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  }
  const [t, setT] = useState(calc)
  useEffect(() => {
    setT(calc())
    const id = setInterval(() => setT(calc()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t}</span>
}

const ico = (d: string, size = 18) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)
const I = {
  mesa:    ico('M4 9h16M6 9v11M18 9v11M3 5h18v4H3z', 24),
  capas:   ico('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5', 18),
  ojo:     ico('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z'),
  cuenta:  ico('M9 12l2 2 4-4M12 21a9 9 0 100-18 9 9 0 000 18z'),
  liberar: ico('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9'),
  gente:   ico('M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a2.5 2.5 0 100-5M18 14.5c2 .7 3 2.5 3 5.5', 16),
  reloj:   ico('M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2', 16),
  check:   ico('M5 12l5 5 9-10', 16),
  refrescar: ico('M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5'),
  chevron: ico('M6 9l6 6 6-6', 18),
  cerrar:  ico('M6 6l12 12M18 6L6 18', 18),
  mas:     ico('M12 5v14M5 12h14'),
}

/** Mesa dibujada: cuerpo con forma + sillas alrededor según la capacidad. */
const MesaTile = memo(({ mesa, order, ready, selected, dim, onClick }: {
  mesa: Mesa; order?: ActiveOrder; ready: boolean; selected: boolean; dim: boolean; onClick: () => void
}) => {
  const cfg = ESTADO_CONFIG[mesa.estado]
  const ancha = mesa.capacidad >= 5
  const silla: React.CSSProperties = { position: 'absolute', background: cfg.edge, opacity: 0.55, borderRadius: 3 }
  const sillasAncha = (n: number, arriba: boolean) =>
    <span style={{ position: 'absolute', left: '12%', right: '12%', top: arriba ? 1 : undefined, bottom: arriba ? undefined : 1, height: 6, display: 'flex', justifyContent: 'space-evenly' }}>
      {Array.from({ length: n }, (_, i) => <span key={i} style={{ width: '12%', height: 6, background: cfg.edge, opacity: 0.55, borderRadius: 3 }} />)}
    </span>
  const nSillas = Math.min(mesa.capacidad, 4)
  const min = order ? minutosDesde(order.created_at) : null
  return (
    <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onClick}
      aria-label={`Mesa ${mesa.numero}, ${cfg.label}, ${mesa.capacidad} personas`} aria-pressed={selected}
      style={{
        position: 'relative', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
        gridColumn: ancha ? 'span 2' : undefined, aspectRatio: ancha ? '2.15 / 1' : '1 / 1',
        opacity: dim ? 0.25 : 1, transition: 'opacity var(--w-dur-fast)', fontFamily: 'inherit',
      }}>
      {selected && (
        <span style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', zIndex: 2, whiteSpace: 'nowrap',
          background: 'var(--w-text)', color: 'var(--w-bg)', fontSize: 'var(--w-fs-caption)', fontWeight: 700, padding: '2px 10px', borderRadius: 'var(--w-r-pill)' }}>
          {cfg.label}
        </span>
      )}
      {/* sillas */}
      {ancha ? (<>{sillasAncha(Math.min(Math.ceil(mesa.capacidad / 2), 5), true)}{sillasAncha(Math.min(Math.floor(mesa.capacidad / 2), 5), false)}</>) : (<>
        {nSillas >= 1 && <span style={{ ...silla, left: 1, top: '30%', width: 6, height: '40%' }} />}
        {nSillas >= 2 && <span style={{ ...silla, right: 1, top: '30%', width: 6, height: '40%' }} />}
        {nSillas >= 3 && <span style={{ ...silla, top: 1, left: '30%', height: 6, width: '40%' }} />}
        {nSillas >= 4 && <span style={{ ...silla, bottom: 1, left: '30%', height: 6, width: '40%' }} />}
      </>)}
      {/* cuerpo de la mesa */}
      <span style={{
        position: 'absolute', inset: 9, borderRadius: 'var(--w-r-md)', background: cfg.fill, color: cfg.ink,
        border: `2px solid ${cfg.edge}`, boxShadow: selected ? '0 0 0 3px var(--w-accent-soft), var(--w-shadow-md)' : 'var(--w-shadow-sm)',
        outline: selected ? '2px solid var(--w-accent)' : 'none', outlineOffset: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 0,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, boxShadow: '0 0 0 2px rgba(255,255,255,.55)' }} />
        <span style={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.1 }}>{mesa.numero}</span>
        <span style={{ fontSize: '0.65rem', lineHeight: 1.1, opacity: 0.85, fontWeight: 600 }}>
          {mesa.capacidad}p{min !== null ? ` · ${min >= 60 ? `${Math.floor(min / 60)}h${pad(min % 60)}` : `${min}m`}` : ''}
        </span>
      </span>
      {ready && (
        <span style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--w-success)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }} aria-label="Pedido listo">✓</span>
      )}
    </motion.button>
  )
})
MesaTile.displayName = 'MesaTile'

const Planta = ({ style }: { style: React.CSSProperties }) => (
  <svg aria-hidden viewBox="0 0 32 32" width={30} height={30} style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
    <circle cx="16" cy="16" r="13" fill="var(--w-success)" opacity={0.28} />
    <circle cx="11" cy="12" r="6" fill="var(--w-success)" opacity={0.55} />
    <circle cx="20" cy="14" r="6" fill="var(--w-success)" opacity={0.7} />
    <circle cx="15" cy="21" r="6" fill="var(--w-success)" opacity={0.5} />
  </svg>
)

export const TableMap = memo<{ profile: Profile; onNavigate?: (v: NavView) => void; onSelectMesa?: (m: Mesa) => void }>(({ profile, onNavigate }) => {
  const [mesas,        setMesas]       = useState<Mesa[]>([])
  const [activeOrders, setActiveOrders]= useState<ActiveOrder[]>([])
  const [meseros,      setMeseros]     = useState<Record<string, string>>({})
  const [readyOrders,  setReadyOrders] = useState<Set<string>>(new Set())
  const [loading,      setLoading]     = useState(true)
  const [selected,     setSelected]    = useState<Mesa | null>(null)
  const [zona,         setZona]        = useState('all')
  const [filtro,       setFiltro]      = useState<'all' | Estado>('all')
  const [detalle,      setDetalle]     = useState(false)
  const [abierto,      setAbierto]     = useState(false)
  const [, setTick]                    = useState(0)
  const [showAddForm,  setShowAddForm] = useState(false)
  const [newNumero,    setNewNumero]   = useState('')
  const [newCapacidad, setNewCapacidad]= useState('4')
  const [newZona,      setNewZona]     = useState('principal')
  const [savingMesa,   setSavingMesa]  = useState(false)
  const [editNumero,   setEditNumero]  = useState('')
  const [editZona,     setEditZona]    = useState('')
  const [editCapacidad,setEditCapacidad] = useState('')
  const [savingEdit,   setSavingEdit]  = useState(false)
  const isAdmin = profile.role === 'admin'

  const fetchData = useCallback(async () => {
    const [mr, or] = await Promise.all([
      supabase.from('mesas').select('*').eq('activa', true).order('numero'),
      supabase.from('orders').select('id,mesa_id,total,status,created_at,items,paid_at,customer_name,user_id')
        .not('mesa_id', 'is', null)
        .not('status', 'in', '(completed,cancelled)')
    ])
    if (!mr.error) setMesas(mr.data || [])
    if (!or.error) {
      const orders = (or.data || []).map(o => ({
        ...o,
        items: (() => { try { return JSON.parse(typeof o.items === 'string' ? o.items : JSON.stringify(o.items)) } catch { return [] } })()
      }))
      setActiveOrders(orders)
      // Detectar pedidos listos para alerta
      const readySet = new Set(orders.filter(o => o.status === 'ready').map(o => o.mesa_id))
      setReadyOrders(readySet as Set<string>)
      // Nombre del mesero (si el perfil es legible para este usuario; si no, simplemente no se muestra)
      const ids = Array.from(new Set(orders.map(o => o.user_id).filter(Boolean))) as string[]
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        if (profs) setMeseros(Object.fromEntries(profs.map(p => [p.id as string, (p.full_name as string) || ''])))
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    // Filtrado por restaurant_id: sin esto, un mesero de un restaurante recibia
    // la alerta de "mesa lista" de pedidos de OTRO restaurante.
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel('tablemap-v2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas', filter: `restaurant_id=eq.${rid}` }, fetchData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, (payload) => {
          fetchData()
          // Alerta al mesero cuando un pedido pasa a "ready"
          const newRow = payload.new as { status?: string; table_num?: number }
          if (newRow?.status === 'ready') {
            const mesa = newRow?.table_num
            message.open({
              type: 'success',
              content: `¡Mesa ${mesa ?? '?'} — pedido listo para entregar!`,
              duration: 8,
              style: { fontWeight: 700, fontSize: '1rem' },
            })
            // Vibrar si el dispositivo lo soporta
            if ('vibrate' in navigator) navigator.vibrate([300, 100, 300])
          }
        })
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [fetchData])

  // Refresca los minutos que se ven en las mesas
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const handleChangeEstado = useCallback(async (mesa: Mesa, estado: Mesa['estado']) => {
    const { error } = await supabase.from('mesas').update({ estado }).eq('id', mesa.id)
    if (error) { message.error('Error: ' + error.message); return }
    setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, estado } : m))
    setSelected(prev => prev?.id === mesa.id ? { ...prev, estado } : prev)
  }, [])

  const siguienteNumero = mesas.length ? Math.max(...mesas.map(m => m.numero)) + 1 : 1

  const handleAddMesa = useCallback(async () => {
    const numero = parseInt(newNumero || String(siguienteNumero), 10)
    const capacidad = parseInt(newCapacidad, 10)
    if (!numero || numero < 1 || numero > 100) { message.error('Número de mesa inválido (1-100)'); return }
    if (!capacidad || capacidad < 1) { message.error('Capacidad inválida'); return }
    setSavingMesa(true)
    const { data, error } = await supabase.from('mesas')
      .insert({ numero, capacidad, zona: newZona.trim() || 'principal', estado: 'libre', activa: true })
      .select().single()
    setSavingMesa(false)
    if (error) { message.error(error.code === '23505' ? `Ya existe la mesa ${numero}` : 'Error: ' + error.message); return }
    setMesas(prev => [...prev, data as Mesa].sort((a, b) => a.numero - b.numero))
    setShowAddForm(false)
    setNewNumero(''); setNewCapacidad('4')
    message.success(`Mesa ${numero} creada`)
  }, [newNumero, newCapacidad, newZona, siguienteNumero])

  const handleDeleteMesa = useCallback(async (mesa: Mesa) => {
    if (activeOrders.some(o => o.mesa_id === mesa.id)) { message.error('No se puede eliminar: tiene un pedido activo'); return }
    if (!window.confirm(`¿Eliminar la mesa ${mesa.numero}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('mesas').delete().eq('id', mesa.id)
    if (error) { message.error('Error: ' + error.message); return }
    setMesas(prev => prev.filter(m => m.id !== mesa.id))
    setSelected(prev => prev?.id === mesa.id ? null : prev)
    message.success(`Mesa ${mesa.numero} eliminada`)
  }, [activeOrders])

  const handleUpdateMesa = useCallback(async (mesa: Mesa) => {
    const numero = parseInt(editNumero, 10)
    const capacidad = parseInt(editCapacidad, 10)
    const zonaTrim = editZona.trim()
    if (!numero || numero < 1 || numero > 100) { message.error('Número de mesa inválido (1-100)'); return }
    if (!capacidad || capacidad < 1) { message.error('Capacidad inválida'); return }
    if (!zonaTrim) { message.error('La zona no puede estar vacía'); return }
    if (numero === mesa.numero && capacidad === mesa.capacidad && zonaTrim === mesa.zona) return

    setSavingEdit(true)
    const { error } = await supabase.from('mesas')
      .update({ numero, capacidad, zona: zonaTrim }).eq('id', mesa.id)
    setSavingEdit(false)
    if (error) { message.error(error.code === '23505' ? `Ya existe la mesa ${numero}` : 'Error: ' + error.message); return }
    setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, numero, capacidad, zona: zonaTrim } : m).sort((a, b) => a.numero - b.numero))
    setSelected(prev => prev?.id === mesa.id ? { ...prev, numero, capacidad, zona: zonaTrim } : prev)
    message.success('Mesa actualizada')
  }, [editNumero, editZona, editCapacidad])

  useEffect(() => {
    if (selected) {
      setEditNumero(String(selected.numero))
      setEditZona(selected.zona)
      setEditCapacidad(String(selected.capacidad))
    }
  }, [selected])

  const zonas = Array.from(new Set(mesas.map(m => m.zona)))
  const delZona = zona === 'all' ? mesas : mesas.filter(m => m.zona === zona)
  const selectedOrder = selected ? activeOrders.find(o => o.mesa_id === selected.id) : null
  const cuenta = (e: Estado) => mesas.filter(m => m.estado === e).length

  const seleccionar = (m: Mesa) => {
    const quitar = selected?.id === m.id
    setSelected(quitar ? null : m)
    setDetalle(false); setAbierto(false)
  }

  // Liberar mesa = mismo cambio de estado que ya existía; no deja liberar si hay un pedido sin cobrar.
  const liberar = (m: Mesa) => {
    if (selectedOrder && !selectedOrder.paid_at) { message.warning('La mesa tiene un pedido sin cobrar. Cóbralo en Caja antes de liberarla.'); return }
    void handleChangeEstado(m, 'libre')
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--w-surface-sunken)', borderTopColor: 'var(--w-accent)', animation: 'rs 0.8s linear infinite' }} />
      <style>{'@keyframes rs{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  const pildoras: { key: 'all' | Estado; label: string }[] = [
    { key: 'all', label: 'Todas' }, { key: 'libre', label: 'Disponibles' }, { key: 'ocupada', label: 'Ocupadas' },
    { key: 'reservada', label: 'Reservadas' }, { key: 'cuenta', label: 'En atención' },
  ]
  const totales = [
    { label: 'Total mesas', n: mesas.length, icon: I.mesa, color: 'var(--w-text-2)' },
    { label: 'Disponibles', n: cuenta('libre'), icon: I.check, color: ESTADO_CONFIG.libre.legend },
    { label: 'Ocupadas', n: cuenta('ocupada'), icon: I.gente, color: ESTADO_CONFIG.ocupada.legend },
    { label: 'Reservadas', n: cuenta('reservada'), icon: I.cuenta, color: ESTADO_CONFIG.reservada.legend },
  ]
  const etiqueta: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--w-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }
  const campo: React.CSSProperties = { padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--w-surface-sunken)', color: 'var(--w-text)', fontFamily: 'inherit', ...FX.field }
  const nombreMesero = selectedOrder?.user_id ? meseros[selectedOrder.user_id] : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: 'var(--w-font)', minWidth: 0 }}>
      {/* Encabezado + filtros por estado */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between [&>header]:mb-0">
        <ModuleHeader icon={I.mesa} title="Mesas" subtitle="Gestiona la distribución y el estado de las mesas de tu restaurante." />
        <div role="tablist" aria-label="Filtrar por estado" className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {pildoras.map(p => {
            const on = filtro === p.key
            return (
              <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => setFiltro(p.key)}
                className="shrink-0"
                style={{
                  minHeight: 40, padding: '0 1rem', borderRadius: 'var(--w-r-pill)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
                  fontSize: 'var(--w-fs-label)', whiteSpace: 'nowrap',
                  ...(on ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)', border: '1px solid var(--w-accent)' }
                         : { background: 'var(--w-surface)', color: 'var(--w-text-2)', ...FX.card }),
                }}>
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Formulario agregar mesa (solo admin) */}
      {isAdmin && showAddForm && (
        <div style={{ backgroundColor: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', ...FX.card }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--w-text-3)', fontWeight: 700 }}>Número</label>
            <input type="number" min={1} max={100} placeholder={String(siguienteNumero)} value={newNumero}
              onChange={e => setNewNumero(e.target.value)} style={{ ...campo, width: 90 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--w-text-3)', fontWeight: 700 }}>Capacidad</label>
            <input type="number" min={1} value={newCapacidad} onChange={e => setNewCapacidad(e.target.value)} style={{ ...campo, width: 90 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--w-text-3)', fontWeight: 700 }}>Zona</label>
            <input type="text" value={newZona} onChange={e => setNewZona(e.target.value)} style={{ ...campo, width: 130 }} />
          </div>
          <button onClick={handleAddMesa} disabled={savingMesa}
            style={{ padding: '0.625rem 1.25rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--w-accent)', color: 'var(--w-on-accent)', fontWeight: 700, fontSize: '0.8125rem', cursor: savingMesa ? 'default' : 'pointer', opacity: savingMesa ? 0.6 : 1, fontFamily: 'inherit', ...FX.cta }}>
            {savingMesa ? 'Creando…' : 'Crear mesa'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Plano + leyenda y totales */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section style={{ backgroundColor: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '0.75rem', ...FX.card }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {zonas.length > 1 ? (
                <label className="inline-flex items-center gap-2" style={{ minHeight: 40, padding: '0 0.75rem', borderRadius: 'var(--w-r-pill)', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', fontWeight: 700, fontSize: 'var(--w-fs-label)', maxWidth: '100%' }}>
                  <span style={{ color: 'var(--w-accent-text)', display: 'flex' }}>{I.capas}</span>
                  <select aria-label="Zona" value={zona} onChange={e => { setZona(e.target.value); setSelected(null) }}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 700, cursor: 'pointer', minWidth: 0, maxWidth: '55vw' }}>
                    <option value="all">Todas las zonas</option>
                    {zonas.map(z => <option key={z} value={z}>{capitalizar(z)}</option>)}
                  </select>
                </label>
              ) : (
                <span className="inline-flex items-center gap-2" style={{ minHeight: 40, padding: '0 0.75rem', borderRadius: 'var(--w-r-pill)', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', fontWeight: 700, fontSize: 'var(--w-fs-label)' }}>
                  <span style={{ color: 'var(--w-accent-text)', display: 'flex' }}>{I.capas}</span>{capitalizar(zonas[0] ?? 'principal')}
                </span>
              )}
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button size="sm" variant={showAddForm ? 'secondary' : 'primary'} icon={I.mas} onClick={() => setShowAddForm(v => !v)}>Agregar mesa</Button>
                )}
                <Button size="sm" variant="secondary" onClick={fetchData} title="Refrescar" aria-label="Refrescar" className="!px-0 w-[36px]">{I.refrescar}</Button>
              </div>
            </div>

            {/* Plano: las mesas se acomodan solas (no hay posición guardada) */}
            <div style={{
              position: 'relative', borderRadius: 'var(--w-r-md)', background: 'var(--w-surface-sunken)', overflow: 'hidden',
              backgroundImage: 'linear-gradient(var(--w-border) 1px, transparent 1px), linear-gradient(90deg, var(--w-border) 1px, transparent 1px)',
              backgroundSize: '28px 28px', padding: '2rem 1.25rem 1.25rem 1.5rem', minHeight: 200,
            }}>
              <span aria-hidden style={{ position: 'absolute', left: 0, top: '38%', width: 12, height: 64, borderRight: '3px solid var(--w-border-strong)', borderTopRightRadius: 64, borderBottomRightRadius: 64, opacity: 0.7 }} />
              <Planta style={{ top: 4, left: 6 }} />
              <Planta style={{ bottom: 4, right: 6 }} />
              {delZona.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--w-text-3)', fontWeight: 600, padding: '2rem 0', margin: 0 }}>
                  {mesas.length === 0 ? 'Aún no hay mesas creadas.' : 'No hay mesas en esta zona.'}
                </p>
              ) : (
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gridAutoFlow: 'dense', gap: '0.5rem' }}>
                  {delZona.map(mesa => (
                    <MesaTile key={mesa.id} mesa={mesa}
                      order={activeOrders.find(o => o.mesa_id === mesa.id)}
                      ready={readyOrders.has(mesa.id)}
                      selected={selected?.id === mesa.id}
                      dim={filtro !== 'all' && mesa.estado !== filtro}
                      onClick={() => seleccionar(mesa)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Leyenda + totales */}
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '0.75rem 1rem', ...FX.card }}>
            <div className="flex flex-wrap gap-x-4 gap-y-2" style={{ fontSize: 'var(--w-fs-label)', color: 'var(--w-text-2)' }}>
              {ESTADOS.map(k => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: ESTADO_CONFIG[k].legend }} />{ESTADO_CONFIG[k].label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:flex sm:gap-5">
              {totales.map(t => (
                <div key={t.label} style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--w-text-3)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: t.color, display: 'flex' }}>{t.icon}</span>{t.label}
                  </p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.125rem', color: 'var(--w-text)' }}>{t.n}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Panel de la mesa seleccionada */}
        <aside className="w-full lg:w-[320px] lg:shrink-0">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div key="vacio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ backgroundColor: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '1.25rem', textAlign: 'center', color: 'var(--w-text-3)', ...FX.card }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Toca una mesa para ver su pedido y las acciones.</p>
              </motion.div>
            ) : (
              <motion.div key={selected.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}
                style={{ backgroundColor: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '1rem', ...FX.card }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--w-accent-text)', display: 'flex' }}>{I.mesa}</span>
                      <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem', color: 'var(--w-text)' }}>Mesa {selected.numero}</h3>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.65rem', borderRadius: 'var(--w-r-pill)', background: ESTADO_CONFIG[selected.estado].badgeBg, color: ESTADO_CONFIG[selected.estado].badgeText }}>
                        {ESTADO_CONFIG[selected.estado].label}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button type="button" className="lg:hidden" aria-expanded={abierto} aria-label={abierto ? 'Ocultar acciones' : 'Mostrar acciones'} onClick={() => setAbierto(v => !v)}
                      style={{ width: 40, height: 40, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: abierto ? 'rotate(180deg)' : 'none' }}>{I.chevron}</button>
                    <button type="button" aria-label="Cerrar panel" onClick={() => setSelected(null)}
                      style={{ width: 40, height: 40, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.cerrar}</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, color: 'var(--w-text-2)', fontSize: 'var(--w-fs-label)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{I.gente}{selected.capacidad} {selected.capacidad === 1 ? 'persona' : 'personas'} · {capitalizar(selected.zona)}</span>
                  {selectedOrder && (
                    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ paddingTop: 2, display: 'flex' }}>{I.reloj}</span>
                      <span>Tiempo en mesa:<br /><strong style={{ color: 'var(--w-text)', fontSize: '1.125rem' }}><Reloj desde={selectedOrder.created_at} /></strong></span>
                    </span>
                  )}
                  {selectedOrder && (
                    <span style={{ fontWeight: 700, color: 'var(--w-text)' }}>Total: <span style={{ color: 'var(--w-accent-text)' }}>${selectedOrder.total.toLocaleString('es')}</span></span>
                  )}
                  {nombreMesero && <span>Mesero: <strong style={{ color: 'var(--w-text)' }}>{nombreMesero}</strong></span>}
                </div>

                {/* Acciones rápidas (en celular se despliegan con la flecha) */}
                <div className={abierto ? 'block' : 'hidden lg:block'}>
                  <p style={{ ...etiqueta, margin: '1rem 0 0.5rem' }}>Acciones rápidas</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button className="w-full" icon={I.ojo} onClick={() => setDetalle(v => !v)}>{detalle ? 'Ocultar detalles' : 'Ver detalles'}</Button>
                    {isAdmin && onNavigate && selectedOrder && (
                      <Button variant="secondary" className="w-full" icon={I.cuenta} onClick={() => onNavigate('cashier')}>Cerrar cuenta</Button>
                    )}
                    {isAdmin && selected.estado !== 'libre' && (
                      <Button variant="secondary" className="w-full" icon={I.liberar} onClick={() => liberar(selected)}>Liberar mesa</Button>
                    )}
                  </div>

                  {detalle && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '1rem' }}>
                      {selectedOrder ? (<>
                        <div style={{ backgroundColor: 'var(--w-surface-sunken)', borderRadius: '1rem', padding: '0.875rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', ...FX.field }}>
                          <div><p style={etiqueta}>Estado</p><p style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: '0.875rem', margin: 0 }}>{STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status}</p></div>
                          <div><p style={etiqueta}>Pago</p><p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, color: selectedOrder.paid_at ? 'var(--w-success-text)' : 'var(--w-warning-text)' }}>{selectedOrder.paid_at ? 'Pagado' : 'Pendiente'}</p></div>
                          {selectedOrder.customer_name && (
                            <div style={{ gridColumn: '1/-1' }}><p style={etiqueta}>Cliente</p><p style={{ fontWeight: 600, color: 'var(--w-text)', fontSize: '0.875rem', margin: 0 }}>{selectedOrder.customer_name}</p></div>
                          )}
                        </div>
                        <div>
                          <p style={{ ...etiqueta, marginBottom: '0.5rem' }}>Pedido</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            {selectedOrder.items.map((item, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: 'var(--w-surface-sunken)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', ...FX.field }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--w-text)', fontWeight: 600, minWidth: 0 }}>
                                  <span style={{ color: 'var(--w-accent-text)', fontWeight: 700, marginRight: 6 }}>{item.quantity}×</span>{item.name}
                                </span>
                                {item.notes && <span style={{ fontSize: '0.7rem', color: 'var(--w-text-3)', textAlign: 'right' }}>{item.notes}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                        {selectedOrder.status === 'ready' && (
                          <div style={{ backgroundColor: 'var(--w-success-bg)', borderRadius: '1rem', padding: '0.75rem 1rem', border: '2px solid var(--w-success)' }}>
                            <p style={{ fontWeight: 700, color: 'var(--w-success-text)', margin: 0 }}>¡Este pedido está listo para entregar!</p>
                          </div>
                        )}
                      </>) : (
                        <p style={{ textAlign: 'center', color: 'var(--w-text-3)', fontWeight: 600, margin: '0.5rem 0' }}>Sin pedido activo</p>
                      )}

                      {/* Cambiar estado (solo admin) */}
                      {isAdmin && (
                        <div>
                          <p style={{ ...etiqueta, marginBottom: '0.5rem' }}>Cambiar estado</p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.5rem' }}>
                            {ESTADOS.map(e => (
                              <button key={e} onClick={() => handleChangeEstado(selected, e)}
                                style={{
                                  padding: '0.6rem 0.5rem', minHeight: 44, borderRadius: '0.75rem', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                                  ...(selected.estado === e
                                    ? { background: 'var(--w-accent)', color: 'var(--w-on-accent)', ...FX.cta }
                                    : { backgroundColor: 'var(--w-surface)', color: 'var(--w-text-2)', ...FX.card })
                                }}>
                                {ESTADO_CONFIG[e].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Editar mesa (número, zona, capacidad) + eliminar (solo admin) */}
                      {isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <p style={etiqueta}>Editar mesa</p>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.625rem', color: 'var(--w-text-3)' }}>Número</label>
                              <input type="number" min={1} max={100} value={editNumero} onChange={e => setEditNumero(e.target.value)} style={{ ...campo, width: 70 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 90px', minWidth: 0 }}>
                              <label style={{ fontSize: '0.625rem', color: 'var(--w-text-3)' }}>Zona</label>
                              <input type="text" value={editZona} onChange={e => setEditZona(e.target.value)} style={{ ...campo, width: '100%', minWidth: 0 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.625rem', color: 'var(--w-text-3)' }}>Capacidad</label>
                              <input type="number" min={1} value={editCapacidad} onChange={e => setEditCapacidad(e.target.value)} style={{ ...campo, width: 70 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <Button size="sm" onClick={() => handleUpdateMesa(selected)} loading={savingEdit}>Guardar cambios</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteMesa(selected)}>Eliminar mesa</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  )
})
TableMap.displayName = 'TableMap'
