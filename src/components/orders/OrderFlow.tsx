/**
 * OrderFlow.tsx
 * ─────────────────────────────────────────────────────────────
 * Flujo completo de pedido:
 *   1. Seleccionar mesa
 *   2. Agregar platos del menú (búsqueda + categorías)
 *   3. Ajustar cantidades y notas por plato
 *   4. Confirmar y enviar
 *
 * Reemplaza al OrderForm anterior.
 */
import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { offlineService } from '../../services/offlineService'
import { pushNotificationService } from '../../services/pushNotificationService'
import message from 'antd/es/message'
import type { Dish, DishCategory } from '../../types'
import type { Profile } from '../../pages/Dashboard'

// ─── Estilos neomórficos ──────────────────────────────────────
const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
  green:   { boxShadow: 'var(--shadow-green)' },
} as const

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

const CATEGORY_LABELS: Record<DishCategory, string> = {
  entrada:   'Entradas',
  principal: 'Principales',
  postre:    'Postres',
  bebida:    'Bebidas',
  especial:  'Especiales',
}

// ─── Tipos ────────────────────────────────────────────────────
interface CartItem {
  dish:     Dish
  quantity: number
  notes:    string
}

interface Mesa {
  id:       string
  numero:   number
  capacidad:number
  estado:   'libre' | 'ocupada' | 'reservada' | 'cuenta'
  zona:     string
}

type TipoPedido = 'LOCAL' | 'LLEVAR' | 'DOMICILIO' | 'RAPPI'
type Step = 'mesa' | 'menu' | 'confirm'

interface OrderFlowProps {
  profile:        Profile
  onOrderCreated?: (orderId: string, total: number) => void
}

// ─── Componente principal ─────────────────────────────────────
export const OrderFlow = memo<OrderFlowProps>(({ profile, onOrderCreated }) => {
  // Steps
  const [step, setStep]             = useState<Step>('mesa')
  // Mesa & tipo
  const [mesas, setMesas]           = useState<Mesa[]>([])
  const [selectedMesa, setMesa]     = useState<Mesa | null>(null)
  const [tipoPedido, setTipo]       = useState<TipoPedido>('LOCAL')
  // Menú
  const [dishes, setDishes]         = useState<Dish[]>([])
  const [cart, setCart]             = useState<CartItem[]>([])
  const [search, setSearch]         = useState('')
  const [activeCategory, setCategory] = useState<DishCategory | 'all'>('all')
  // UI
  const [loadingMesas,  setLoadingMesas]  = useState(true)
  const [loadingDishes, setLoadingDishes] = useState(true)
  const [submitting, setSubmitting]       = useState(false)
  const [isOnline, setIsOnline]           = useState(navigator.onLine)
  const [orderNotes, setOrderNotes]       = useState('')

  // Conectividad
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Cargar mesas
  useEffect(() => {
    supabase.from('mesas').select('*').eq('activa', true).order('numero')
      .then(({ data }) => { setMesas(data || []); setLoadingMesas(false) })
  }, [])

  // Cargar platos
  useEffect(() => {
    supabase.from('dishes').select('*').eq('available', true)
      .neq('availability_status', 'discontinued').order('sort_order').order('name')
      .then(({ data }) => { setDishes(data || []); setLoadingDishes(false) })
  }, [])

  // Platos filtrados
  const filteredDishes = useMemo(() => {
    let list = dishes
    if (activeCategory !== 'all') list = list.filter(d => d.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
    }
    return list
  }, [dishes, activeCategory, search])

  const categories = useMemo(() => {
    const cats = new Set(dishes.map(d => d.category))
    return Array.from(cats) as DishCategory[]
  }, [dishes])

  // Carrito helpers
  const getQty     = (id: string) => cart.find(i => i.dish.id === id)?.quantity ?? 0
  const cartTotal  = cart.reduce((s, i) => s + i.dish.price * i.quantity, 0)
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0)

  const addToCart = useCallback((dish: Dish) => {
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === dish.id)
      return ex
        ? prev.map(i => i.dish.id === dish.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { dish, quantity: 1, notes: '' }]
    })
  }, [])

  const removeFromCart = useCallback((dishId: string) => {
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === dishId)
      if (!ex) return prev
      if (ex.quantity <= 1) return prev.filter(i => i.dish.id !== dishId)
      return prev.map(i => i.dish.id === dishId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }, [])

  const updateNotes = useCallback((dishId: string, notes: string) => {
    setCart(prev => prev.map(i => i.dish.id === dishId ? { ...i, notes } : i))
  }, [])

  // Enviar orden
  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) { message.warning('Agrega al menos un plato'); return }
    if (tipoPedido === 'LOCAL' && !selectedMesa) { message.warning('Selecciona una mesa'); return }

    setSubmitting(true)
    try {
      const items = cart.map(i => ({
        id:       i.dish.id,
        name:     i.dish.name,
        price:    i.dish.price,
        quantity: i.quantity,
        notes:    i.notes || null,
      }))

      if (isOnline) {
        const { data, error } = await supabase.rpc('crear_orden_completa', {
          p_mesa_id:     selectedMesa?.id ?? null,
          p_items:       items,
          p_tipo_pedido: tipoPedido,
          p_notes:       orderNotes || null,
          p_table_num:   selectedMesa?.numero ?? null,
        })
        if (error) throw error
        message.success(`Orden enviada a cocina — Total: $${cartTotal.toFixed(2)}`)
        const dest = selectedMesa?.numero ? `Mesa ${selectedMesa.numero}` : 'Mostrador'
        pushNotificationService.notify(['kitchen', 'admin'], 'Nuevo pedido', `${dest} — ${items.length} ítem(s)`, '/')
        onOrderCreated?.(data.order_id, data.total)
      } else {
        const { data: { user: offlineUser } } = await supabase.auth.getUser()
        // BUG FIX #8: user!.id lanzaba excepción si la sesión expiraba offline.
        // Ahora usamos un fallback seguro.
        const offlineUserId = offlineUser?.id ?? 'offline-anonymous'
        await offlineService.saveOrderLocally({
          id: crypto.randomUUID(),
          user_id: offlineUserId,
          items: JSON.stringify(items),
          total: cartTotal,
          status: 'pending',
          tipo_pedido: tipoPedido,
          table_num: selectedMesa?.numero ?? null,
          notes: orderNotes || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        message.warning('Sin conexión — Orden guardada localmente')
      }

      // Reset
      setCart([])
      setStep('mesa')
      setMesa(null)
      setOrderNotes('')
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al enviar orden'}`)
    } finally {
      setSubmitting(false)
    }
  }, [cart, tipoPedido, selectedMesa, isOnline, cartTotal, orderNotes, onOrderCreated])

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Indicador offline */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs font-medium text-amber-700 flex items-center gap-2">
          Modo offline — Las órdenes se sincronizarán al recuperar conexión
        </div>
      )}

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-2">
        {(['mesa','menu','confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s ? 'bg-[#FF5722] text-white' :
                (['mesa','menu','confirm'].indexOf(step) > i) ? 'bg-emerald-500 text-white' :
                'bg-[#CDD0DC] text-[#9CA3AF]'
              }`}
              style={step === s ? S.coral : S.neoOutSm}
            >
              {(['mesa','menu','confirm'].indexOf(step) > i) ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-bold ${step === s ? 'text-[#2D3561]' : 'text-[#9CA3AF]'}`}>
              {s === 'mesa' ? 'Mesa' : s === 'menu' ? 'Platos' : 'Confirmar'}
            </span>
            {i < 2 && <div className="w-6 h-px bg-[#D1D5E0]" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Mesa & tipo ── */}
      <AnimatePresence mode="wait">
        {step === 'mesa' && (
          <motion.div key="step-mesa"
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3, ease: EASE }}
            className="space-y-4"
          >
            <div className="bg-[#D8DAE4] rounded-3xl p-6" style={S.neoOut}>
              <h3 className="font-bold text-[#2D3561] mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Tipo de pedido
              </h3>

              {/* Tipo de pedido */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { val: 'LOCAL',     label: 'En mesa',   show: true },
                  { val: 'LLEVAR',    label: 'Para llevar', show: true },
                  { val: 'DOMICILIO', label: 'Domicilio',  show: true },
                  { val: 'RAPPI',     label: 'Rappi',      show: ['admin','cashier'].includes(profile.role) },
                ].filter(o => o.show).map(opt => (
                  <button key={opt.val}
                    onClick={() => { setTipo(opt.val as TipoPedido); if (opt.val !== 'LOCAL') setMesa(null) }}
                    className="py-3 rounded-2xl text-sm font-bold transition-all"
                    style={tipoPedido === opt.val
                      ? { background: 'var(--accent)', color: 'white', ...S.coral }
                      : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Mapa de mesas */}
              {tipoPedido === 'LOCAL' && (
                <div>
                  <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">
                    Selecciona una mesa
                  </p>
                  {loadingMesas ? (
                    <div className="text-center py-4 text-[#9CA3AF] text-sm">Cargando mesas...</div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {mesas.map(mesa => (
                        <button key={mesa.id}
                          onClick={() => setMesa(mesa)}
                          className={`p-3 rounded-2xl text-center transition-all ${
                            mesa.estado === 'ocupada' ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={mesa.estado === 'ocupada'}
                          style={selectedMesa?.id === mesa.id
                            ? { background: 'var(--accent)', color: 'white', ...S.coral }
                            : mesa.estado === 'libre'
                              ? { background: 'var(--bg)', color: 'var(--text-primary)', ...S.neoOutSm }
                              : { background: '#FEE2E2', color: '#DC2626', ...S.neoOutSm }}
                        >
                          <div className="text-lg font-bold">{mesa.numero}</div>
                          <div className="text-[10px] font-medium">
                            {mesa.estado === 'libre' ? `${mesa.capacidad}` :
                             mesa.estado === 'ocupada' ? 'Ocupada' : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedMesa && (
                    <div className="mt-3 text-xs text-emerald-600 font-bold">
                      Mesa {selectedMesa.numero} · {selectedMesa.zona} · {selectedMesa.capacidad} personas
                    </div>
                  )}
                </div>
              )}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (tipoPedido === 'LOCAL' && !selectedMesa) {
                  message.warning('Selecciona una mesa')
                  return
                }
                setStep('menu')
              }}
              className="w-full py-4 rounded-2xl font-bold text-white bg-[#FF5722]"
              style={S.coral}
            >
              Continuar → Elegir platos
            </motion.button>
          </motion.div>
        )}

        {/* ── STEP 2: Menú ── */}
        {step === 'menu' && (
          <motion.div key="step-menu"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: EASE }}
            className="space-y-4"
          >
            {/* Buscador */}
            <div className="bg-[#D8DAE4] rounded-2xl px-4 py-3 flex items-center gap-3" style={S.neoIn}>
              <span className="text-[#9CA3AF]"></span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar plato..."
                className="flex-1 bg-transparent text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-[#9CA3AF] text-xs">✕</button>
              )}
            </div>

            {/* Categorías */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setCategory('all')}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
                style={activeCategory === 'all' ? { background: 'var(--accent)', color: 'white', ...S.coral } : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}
              >
                Todo
              </button>
              {categories.map(cat => (
                <button key={cat}
                  onClick={() => setCategory(cat)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={activeCategory === cat ? { background: 'var(--accent)', color: 'white', ...S.coral } : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Grid de platos */}
            {loadingDishes ? (
              <div className="text-center py-8 text-[#9CA3AF]">Cargando menú...</div>
            ) : filteredDishes.length === 0 ? (
              <div className="bg-[#D8DAE4] rounded-3xl p-8 text-center" style={S.neoIn}>
                <p className="text-2xl mb-2"></p>
                <p className="text-sm font-bold text-[#2D3561]">Sin platos encontrados</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredDishes.map(dish => {
                  const qty = getQty(dish.id)
                  return (
                    <div key={dish.id} className="bg-[#D8DAE4] rounded-2xl p-3 flex flex-col gap-2" style={S.neoOut}>
                      {/* Emoji/imagen */}
                      <div className="w-full h-20 rounded-xl flex items-center justify-center text-3xl" style={S.neoIn}>
                        {dish.image_url
                          ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover rounded-xl" loading="lazy" />
                          : { entrada:'', principal:'', postre:'', bebida:'', especial:'' }[dish.category]
                        }
                      </div>
                      <p className="text-xs font-bold text-[#2D3561] leading-tight line-clamp-2">{dish.name}</p>
                      <p className="text-sm font-bold text-[#FF5722]">${dish.price.toFixed(2)}</p>

                      {/* Controles de cantidad */}
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => removeFromCart(dish.id)}
                          disabled={qty === 0}
                          className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center transition-all ${qty === 0 ? 'opacity-30' : ''}`}
                          style={S.neoOutSm}
                        >
                          −
                        </button>
                        <span className="text-sm font-bold text-[#2D3561] min-w-[20px] text-center">{qty}</span>
                        <button
                          onClick={() => addToCart(dish)}
                          className="w-8 h-8 rounded-xl font-bold text-sm text-white bg-[#FF5722] flex items-center justify-center"
                          style={S.coral}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Barra flotante del carrito */}
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.div
                  initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="sticky bottom-4 z-10"
                >
                  <button
                    onClick={() => setStep('confirm')}
                    className="w-full py-4 rounded-2xl font-bold text-white bg-[#FF5722] flex items-center justify-between px-6"
                    style={S.coral}
                  >
                    <span>Ver pedido ({cartCount})</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button onClick={() => setStep('mesa')} className="w-full py-3 rounded-2xl text-sm font-bold text-[#6B7280]" style={S.neoOut}>
              ← Volver
            </button>
          </motion.div>
        )}

        {/* ── STEP 3: Confirmar ── */}
        {step === 'confirm' && (
          <motion.div key="step-confirm"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: EASE }}
            className="space-y-4"
          >
            <div className="bg-[#D8DAE4] rounded-3xl p-6" style={S.neoOut}>
              <h3 className="font-bold text-[#2D3561] mb-1">Resumen del pedido</h3>
              <p className="text-xs text-[#9CA3AF] mb-4">
                {tipoPedido === 'LOCAL' && selectedMesa ? `Mesa ${selectedMesa.numero}` : tipoPedido}
              </p>

              {/* Items */}
              <div className="flex flex-col gap-3 mb-4">
                {cart.map(item => (
                  <div key={item.dish.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#FF5722] text-white text-xs font-bold flex items-center justify-center" style={S.coral}>
                          {item.quantity}
                        </span>
                        <span className="text-sm font-medium text-[#2D3561]">{item.dish.name}</span>
                      </div>
                      <span className="text-sm font-bold text-[#2D3561]">
                        ${(item.dish.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                    {/* Nota por plato */}
                    <input
                      value={item.notes}
                      onChange={e => updateNotes(item.dish.id, e.target.value)}
                      placeholder="Nota (ej: sin cebolla)..."
                      maxLength={100}
                      className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-xs text-[#2D3561] outline-none placeholder-[#9CA3AF]"
                      style={S.neoIn}
                    />
                  </div>
                ))}
              </div>

              {/* Nota general */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                  Nota general (opcional)
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Ej: alérgico al maní, celebración de cumpleaños..."
                  maxLength={500}
                  rows={2}
                  className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none resize-none placeholder-[#9CA3AF]"
                  style={S.neoIn}
                />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-4 border-t border-[#D1D5E0]">
                <span className="font-bold text-[#2D3561]">Total</span>
                <span className="text-2xl font-bold text-[#FF5722]">${cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full py-4 rounded-2xl font-bold text-white bg-[#FF5722] ${submitting ? 'opacity-70' : ''}`}
              style={S.coral}
            >
              {submitting
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Enviando a cocina...
                  </span>
                : `Confirmar orden · $${cartTotal.toFixed(2)}`
              }
            </motion.button>

            <button onClick={() => setStep('menu')} className="w-full py-3 rounded-2xl text-sm font-bold text-[#6B7280]" style={S.neoOut}>
              ← Editar platos
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

OrderFlow.displayName = 'OrderFlow'
