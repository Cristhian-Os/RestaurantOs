/**
 * TableMap.tsx
 * ─────────────────────────────────────────────────────────────
 * Mapa visual de mesas con estado en tiempo real.
 * Admin y meseros pueden ver el estado de todas las mesas.
 * El admin puede cambiar el estado manualmente.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import type { Profile } from '../../pages/Dashboard'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  neoIn:   { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
} as const

interface Mesa {
  id:        string
  numero:    number
  capacidad: number
  estado:    'libre' | 'ocupada' | 'reservada' | 'cuenta'
  zona:      string
  activa:    boolean
}

interface ActiveOrder {
  id:         string
  mesa_id:    string
  total:      number
  status:     string
  created_at: string
  items:      Array<{ name: string; quantity: number }>
}

const ESTADO_CONFIG = {
  libre:    { label: 'Libre',         color: '#E8EAF0', text: '#10B981', dot: 'bg-emerald-400', border: 'border-emerald-200' },
  ocupada:  { label: 'Ocupada',       color: '#FEF3C7', text: '#D97706', dot: 'bg-amber-400',   border: 'border-amber-300'  },
  reservada:{ label: 'Reservada',     color: '#EDE9FE', text: '#7C3AED', dot: 'bg-violet-400',  border: 'border-violet-200' },
  cuenta:   { label: 'Pide la cuenta',color: '#FEE2E2', text: '#DC2626', dot: 'bg-red-400',     border: 'border-red-300'    },
}

interface TableMapProps {
  profile: Profile
  onSelectMesa?: (mesa: Mesa) => void
}

export const TableMap = memo<TableMapProps>(({ profile, onSelectMesa }) => {
  const [mesas,        setMesas]        = useState<Mesa[]>([])
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedMesa, setSelected]     = useState<Mesa | null>(null)
  const [filterZona,   setFilterZona]   = useState<string>('all')

  const isAdmin = profile.role === 'admin'

  const fetchData = useCallback(async () => {
    const [mesasRes, ordersRes] = await Promise.all([
      supabase.from('mesas').select('*').eq('activa', true).order('numero'),
      supabase.from('orders').select('id, mesa_id, total, status, created_at, items')
        .not('mesa_id', 'is', null)
        .not('status', 'in', '("completed","cancelled")')
    ])
    if (!mesasRes.error) setMesas(mesasRes.data || [])
    if (!ordersRes.error) {
      setActiveOrders((ordersRes.data || []).map(o => ({
        ...o,
        items: (() => { try { return JSON.parse(typeof o.items === 'string' ? o.items : JSON.stringify(o.items)) } catch { return [] } })()
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('tablemap-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const handleChangeEstado = useCallback(async (mesa: Mesa, newEstado: Mesa['estado']) => {
    if (!isAdmin) return
    const { error } = await supabase
      .from('mesas').update({ estado: newEstado }).eq('id', mesa.id)
    if (error) message.error('Error al actualizar mesa: ' + error.message)
    else { message.success(`Mesa ${mesa.numero} → ${ESTADO_CONFIG[newEstado].label}`); fetchData() }
  }, [isAdmin, fetchData])

  const getOrderForMesa = (mesaId: string) =>
    activeOrders.find(o => o.mesa_id === mesaId)

  const zonas = ['all', ...Array.from(new Set(mesas.map(m => m.zona))).sort()]
  const filteredMesas = filterZona === 'all' ? mesas : mesas.filter(m => m.zona === filterZona)

  const stats = {
    libres:    mesas.filter(m => m.estado === 'libre').length,
    ocupadas:  mesas.filter(m => m.estado === 'ocupada').length,
    cuenta:    mesas.filter(m => m.estado === 'cuenta').length,
    reservadas:mesas.filter(m => m.estado === 'reservada').length,
  }

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            🗺️ Mapa de Mesas
          </h2>
          <p className="text-sm text-[#9CA3AF] mt-0.5">
            {mesas.length} mesas · actualización en tiempo real
          </p>
        </div>
        <button onClick={fetchData} className="p-2.5 rounded-2xl text-[#6B7280]" style={S.neoOutSm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Libres',     val: stats.libres,    color: 'text-emerald-600' },
          { label: 'Ocupadas',   val: stats.ocupadas,  color: 'text-amber-600'   },
          { label: 'Cuenta',     val: stats.cuenta,    color: 'text-red-600'     },
          { label: 'Reservadas', val: stats.reservadas,color: 'text-violet-600'  },
        ].map(s => (
          <div key={s.label} className="bg-[#E8EAF0] rounded-2xl p-3 text-center" style={S.neoOutSm}>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-[#9CA3AF] font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtro por zona */}
      {zonas.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {zonas.map(z => (
            <button key={z}
              onClick={() => setFilterZona(z)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold capitalize"
              style={filterZona === z ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}
            >
              {z === 'all' ? '📍 Todas' : z}
            </button>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
            <span className="text-xs text-[#6B7280]">{v.label}</span>
          </div>
        ))}
      </div>

      {/* Grid de mesas */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {filteredMesas.map(mesa => {
          const cfg   = ESTADO_CONFIG[mesa.estado]
          const order = getOrderForMesa(mesa.id)
          const isSelected = selectedMesa?.id === mesa.id

          return (
            <motion.button
              key={mesa.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setSelected(isSelected ? null : mesa)
                onSelectMesa?.(mesa)
              }}
              className={`relative p-3 rounded-2xl text-left transition-all border-2 ${cfg.border} ${isSelected ? 'ring-2 ring-[#FF5722]' : ''}`}
              style={{
                background: cfg.color,
                boxShadow: isSelected
                  ? '8px 8px 16px rgba(255,87,34,0.3),-8px -8px 16px rgba(255,255,255,0.75)'
                  : S.neoOutSm.boxShadow
              }}
            >
              {/* Dot de estado */}
              <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${cfg.dot} ${mesa.estado === 'ocupada' ? 'animate-pulse' : ''}`} />

              {/* Número */}
              <p className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {mesa.numero}
              </p>

              {/* Info */}
              <p className="text-[10px] font-bold mt-1" style={{ color: cfg.text }}>
                {cfg.label}
              </p>
              <p className="text-[10px] text-[#9CA3AF]">👥 {mesa.capacidad}</p>

              {/* Total si hay orden activa */}
              {order && (
                <p className="text-xs font-bold text-[#FF5722] mt-1">
                  ${order.total.toFixed(2)}
                </p>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Panel de mesa seleccionada */}
      <AnimatePresence>
        {selectedMesa && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.3 }}
            className="bg-[#E8EAF0] rounded-3xl p-5" style={S.neoOut}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#2D3561] text-lg">Mesa {selectedMesa.numero}</h3>
                <p className="text-xs text-[#9CA3AF]">{selectedMesa.zona} · {selectedMesa.capacidad} personas</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9CA3AF] p-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Orden activa en esta mesa */}
            {(() => {
              const order = getOrderForMesa(selectedMesa.id)
              if (!order) return (
                <p className="text-sm text-[#9CA3AF] mb-4">Sin orden activa</p>
              )
              return (
                <div className="bg-[#E0E3EC] rounded-2xl p-4 mb-4" style={S.neoIn}>
                  <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Orden activa</p>
                  <div className="flex flex-col gap-1 mb-2">
                    {order.items.slice(0, 4).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-[#6B7280]">{item.quantity}× {item.name}</span>
                      </div>
                    ))}
                    {order.items.length > 4 && (
                      <p className="text-xs text-[#9CA3AF]">+{order.items.length - 4} más...</p>
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[#C5CAD8]">
                    <span className="text-xs text-[#9CA3AF]">
                      {new Date(order.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-bold text-[#FF5722]">${order.total.toFixed(2)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Cambiar estado (solo admin) */}
            {isAdmin && (
              <div>
                <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                  Cambiar estado
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ESTADO_CONFIG) as Mesa['estado'][]).map(estado => (
                    <button key={estado}
                      onClick={() => handleChangeEstado(selectedMesa, estado)}
                      disabled={selectedMesa.estado === estado}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        selectedMesa.estado === estado ? 'opacity-40' : ''
                      }`}
                      style={selectedMesa.estado === estado ? S.neoIn : S.neoOutSm}
                    >
                      <span className={`${ESTADO_CONFIG[estado].dot.replace('bg-', 'text-').replace('-400', '-600')}`}>●</span>
                      {' '}{ESTADO_CONFIG[estado].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

TableMap.displayName = 'TableMap'
