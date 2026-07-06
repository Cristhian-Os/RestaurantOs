/**
 * TableMap.tsx v2
 * - Click en mesa muestra pedido activo, tiempo de espera, estado de pago
 * - Meseros también ven alertas de pedido listo
 * - Admin puede cambiar estado de mesa
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import type { Profile } from '../../pages/Dashboard'

const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
} as const

interface Mesa {
  id: string; numero: number; capacidad: number
  estado: 'libre' | 'ocupada' | 'reservada' | 'cuenta'; zona: string; activa: boolean
}
interface OrderItem { name: string; quantity: number; notes?: string }
interface ActiveOrder {
  id: string; mesa_id: string; total: number; status: string
  created_at: string; items: OrderItem[]; paid_at?: string | null
  customer_name?: string | null
}

// Semi-transparent backgrounds work on both light & dark themes
const ESTADO_CONFIG = {
  libre:    { label: 'Libre',          bg: 'var(--bg)',                         text: 'var(--green)', dot: 'var(--green)' },
  ocupada:  { label: 'Ocupada',        bg: 'rgba(245,158,11,0.15)',             text: '#D97706', dot: 'var(--amber)' },
  reservada:{ label: 'Reservada',      bg: 'rgba(139,92,246,0.15)',             text: '#7C3AED', dot: '#8B5CF6' },
  cuenta:   { label: 'Pide la cuenta', bg: 'rgba(239,68,68,0.15)',              text: '#DC2626', dot: '#EF4444' },
}

function elapsed(createdAt: string) {
  const s = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  const m = Math.floor(s / 60), h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m ${s % 60}s`
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [t, setT] = useState(elapsed(createdAt))
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  useEffect(() => {
    const id = setInterval(() => setT(elapsed(createdAt)), 1000)
    return () => clearInterval(id)
  }, [createdAt])
  const isUrgent = secs > 900
  return (
    <span style={{ color: isUrgent ? '#DC2626' : '#D97706', fontWeight: 700, fontSize: '0.875rem' }}>
      {t}{isUrgent ? ' · urgente' : ''}
    </span>
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'En espera',
  cooking:   'En cocina',
  ready:     'Listo para entregar',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

export const TableMap = memo<{ profile: Profile; onSelectMesa?: (m: Mesa) => void }>(({ profile }) => {
  const [mesas,        setMesas]       = useState<Mesa[]>([])
  const [activeOrders, setActiveOrders]= useState<ActiveOrder[]>([])
  const [readyOrders,  setReadyOrders] = useState<Set<string>>(new Set())
  const [loading,      setLoading]     = useState(true)
  const [selected,     setSelected]    = useState<Mesa | null>(null)
  const [zona,         setZona]        = useState('all')
  const [showAddForm,  setShowAddForm] = useState(false)
  const [newNumero,    setNewNumero]   = useState('')
  const [newCapacidad, setNewCapacidad]= useState('4')
  const [newZona,      setNewZona]     = useState('principal')
  const [savingMesa,   setSavingMesa]  = useState(false)
  const [editCapacidad,setEditCapacidad] = useState('')
  const isAdmin = profile.role === 'admin'

  const fetchData = useCallback(async () => {
    const [mr, or] = await Promise.all([
      supabase.from('mesas').select('*').eq('activa', true).order('numero'),
      supabase.from('orders').select('id,mesa_id,total,status,created_at,items,paid_at,customer_name')
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
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const ch = supabase.channel('tablemap-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
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
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

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

  const handleUpdateCapacidad = useCallback(async (mesa: Mesa) => {
    const capacidad = parseInt(editCapacidad, 10)
    if (!capacidad || capacidad < 1) { message.error('Capacidad inválida'); return }
    if (capacidad === mesa.capacidad) return
    const { error } = await supabase.from('mesas').update({ capacidad }).eq('id', mesa.id)
    if (error) { message.error('Error: ' + error.message); return }
    setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, capacidad } : m))
    setSelected(prev => prev?.id === mesa.id ? { ...prev, capacidad } : prev)
    message.success('Capacidad actualizada')
  }, [editCapacidad])

  useEffect(() => {
    if (selected) setEditCapacidad(String(selected.capacidad))
  }, [selected])

  const zonas = ['all', ...Array.from(new Set(mesas.map(m => m.zona)))]
  const filtered = zona === 'all' ? mesas : mesas.filter(m => m.zona === zona)
  const selectedOrder = selected ? activeOrders.find(o => o.mesa_id === selected.id) : null

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--bg-surface)', borderTopColor: 'var(--accent)', animation: 'rs 0.8s linear infinite' }} />
      <style>{'@keyframes rs{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '1.5rem', color: 'var(--text-primary)', margin: 0 }}>Mesas</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
            {mesas.filter(m => m.estado === 'ocupada').length} ocupadas · {mesas.filter(m => m.estado === 'libre').length} libres
            {readyOrders.size > 0 && <span style={{ color: 'var(--green)', fontWeight: 700, marginLeft: 8 }}>· {readyOrders.size} listas</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isAdmin && (
            <button onClick={() => setShowAddForm(v => !v)}
              style={{ padding: '0.625rem 1rem', borderRadius: '0.75rem', border: 'none', backgroundColor: showAddForm ? 'var(--accent)' : 'var(--bg)', color: showAddForm ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'inherit', ...(showAddForm ? S.coral : S.neoOutSm) }}>
              + Agregar mesa
            </button>
          )}
          <button onClick={fetchData} title="Refrescar" aria-label="Refrescar" style={{ padding: '0.625rem', borderRadius: '0.75rem', border: 'none', backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...S.neoOutSm }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
        </div>
      </div>

      {/* Formulario agregar mesa (solo admin) */}
      {isAdmin && showAddForm && (
        <div style={{ backgroundColor: 'var(--bg)', borderRadius: '1.25rem', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', ...S.neoOut }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>Número</label>
            <input type="number" min={1} max={100} placeholder={String(siguienteNumero)} value={newNumero}
              onChange={e => setNewNumero(e.target.value)}
              style={{ width: 90, padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', ...S.neoIn }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>Capacidad</label>
            <input type="number" min={1} value={newCapacidad} onChange={e => setNewCapacidad(e.target.value)}
              style={{ width: 90, padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', ...S.neoIn }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>Zona</label>
            <input type="text" value={newZona} onChange={e => setNewZona(e.target.value)}
              style={{ width: 130, padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', ...S.neoIn }} />
          </div>
          <button onClick={handleAddMesa} disabled={savingMesa}
            style={{ padding: '0.625rem 1.25rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: savingMesa ? 'default' : 'pointer', opacity: savingMesa ? 0.6 : 1, fontFamily: 'inherit', ...S.coral }}>
            {savingMesa ? 'Creando…' : 'Crear mesa'}
          </button>
        </div>
      )}

      {/* Filtro zonas */}
      {zonas.length > 2 && (
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
          {zonas.map(z => (
            <button key={z} onClick={() => setZona(z)}
              style={{
                flexShrink: 0, padding: '0.5rem 0.875rem', borderRadius: '9999px',
                border: 'none', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                ...(zona === z ? { background: 'var(--accent)', color: '#fff', ...S.coral } : { backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm })
              }}>
              {z === 'all' ? 'Todas' : z}
            </button>
          ))}
        </div>
      )}

      {/* Grid mesas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.75rem' }}>
        {filtered.map(mesa => {
          const cfg = ESTADO_CONFIG[mesa.estado]
          const order = activeOrders.find(o => o.mesa_id === mesa.id)
          const isReady = readyOrders.has(mesa.id)
          const isSelected = selected?.id === mesa.id
          return (
            <motion.button key={mesa.id} whileTap={{ scale: 0.95 }}
              onClick={() => setSelected(isSelected ? null : mesa)}
              style={{
                backgroundColor: cfg.bg,
                borderRadius: '1.25rem', border: 'none', cursor: 'pointer',
                padding: '0.875rem 0.5rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
                fontFamily: 'inherit', position: 'relative',
                outline: isSelected ? `3px solid #FF5722` : 'none',
                outlineOffset: 2,
                ...(isReady ? { boxShadow: 'var(--shadow-out)' } : S.neoOut),
              }}>
              {isReady && (
                <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                  borderRadius: '50%', backgroundColor: 'var(--green)', color: '#fff',
                  fontSize: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  ✓
                </div>
              )}
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cfg.dot }} />
              <p style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>
                {mesa.numero}
              </p>
              <p style={{ fontSize: '0.625rem', color: cfg.text, fontWeight: 700, margin: 0 }}>
                {cfg.label}
              </p>
              {order && (
                <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', margin: 0 }}>
                  ${order.total.toLocaleString('es')}
                </p>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Panel detalle mesa seleccionada */}
      <AnimatePresence>
        {selected && (
          <motion.div key={selected.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25 }}
            style={{ backgroundColor: 'var(--bg)', borderRadius: '1.5rem', padding: '1.5rem', ...S.neoOut }}>

            {/* Mesa header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>
                  Mesa {selected.numero}
                  <span style={{ marginLeft: 8, fontSize: '0.75rem', backgroundColor: ESTADO_CONFIG[selected.estado].bg,
                    color: ESTADO_CONFIG[selected.estado].text, padding: '0.25rem 0.625rem', borderRadius: '9999px', fontWeight: 700 }}>
                    {ESTADO_CONFIG[selected.estado].label}
                  </span>
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                  Zona: {selected.zona} · Cap: {selected.capacidad}
                </p>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.25rem', padding: 4 }}>
                ✕
              </button>
            </div>

            {/* Pedido activo */}
            {selectedOrder ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {/* Info general del pedido */}
                <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '1rem', padding: '0.875rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', ...S.neoIn }}>
                  <div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Estado</p>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem', margin: 0 }}>{STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Tiempo</p>
                    <ElapsedTimer createdAt={selectedOrder.created_at} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Total</p>
                    <p style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1rem', margin: 0 }}>${selectedOrder.total.toLocaleString('es')}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Pago</p>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, color: selectedOrder.paid_at ? 'var(--green)' : '#D97706' }}>
                      {selectedOrder.paid_at ? 'Pagado' : 'Pendiente'}
                    </p>
                  </div>
                  {selectedOrder.customer_name && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Cliente</p>
                      <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem', margin: 0 }}>{selectedOrder.customer_name}</p>
                    </div>
                  )}
                </div>

                {/* Items del pedido */}
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pedido</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {selectedOrder.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', ...S.neoIn }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: 6 }}>{item.quantity}×</span>
                          {item.name}
                        </span>
                        {item.notes && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerta si está listo */}
                {selectedOrder.status === 'ready' && (
                  <div style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: '1rem', padding: '0.75rem 1rem', border: '2px solid #10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}></span>
                    <p style={{ fontWeight: 700, color: 'var(--green)', margin: 0 }}>¡Este pedido está listo para entregar!</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '1.5rem', margin: 0 }}></p>
                <p style={{ fontWeight: 600, margin: '0.5rem 0 0' }}>Sin pedido activo</p>
              </div>
            )}

            {/* Cambiar estado (solo admin) */}
            {isAdmin && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Cambiar estado</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem' }}>
                  {(['libre','ocupada','reservada','cuenta'] as Mesa['estado'][]).map(e => (
                    <button key={e} onClick={() => handleChangeEstado(selected, e)}
                      style={{
                        padding: '0.5rem', borderRadius: '0.75rem', border: 'none',
                        fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit',
                        ...(selected.estado === e
                          ? { background: 'var(--accent)', color: '#fff', ...S.coral }
                          : { backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm })
                      }}>
                      {ESTADO_CONFIG[e].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editar capacidad + eliminar mesa (solo admin) */}
            {isAdmin && (
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capacidad</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" min={1} value={editCapacidad} onChange={e => setEditCapacidad(e.target.value)}
                      style={{ width: 80, padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', ...S.neoIn }} />
                    <button onClick={() => handleUpdateCapacidad(selected)}
                      style={{ padding: '0.5rem 0.875rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', ...S.neoOutSm }}>
                      Guardar
                    </button>
                  </div>
                </div>
                <button onClick={() => handleDeleteMesa(selected)}
                  style={{ padding: '0.5rem 0.875rem', borderRadius: '0.625rem', border: 'none', backgroundColor: 'rgba(239,68,68,0.12)', color: '#DC2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Eliminar mesa
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
TableMap.displayName = 'TableMap'
