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
import { CategoryIcon } from '../CategoryIcon'

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
interface CategoryMeta {
  label: string
  emoji: string
}

interface CartItem {
  uid:       string
  dish:      Dish
  quantity:  number
  notes:     string
  optsText:  string   // resumen de opciones elegidas (tamaño, sabores, adicionales); vacío si no aplica
  unitPrice: number   // precio unitario real (según tamaño elegido, o dish.price si no aplica)
  size:      string | null   // nombre del tamaño elegido (server lo revalida contra dishes.sizes)
}

// ¿Este plato requiere abrir el selector de opciones antes de agregarlo?
// (mismo criterio que usa el menú del cliente: tamaños, sabores/opciones, o adicionales)
function needsCustomization(dish: Dish): boolean {
  return !!dish.has_sizes || (dish.options?.length ?? 0) > 0 || (dish.tags?.length ?? 0) > 0
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

// ─── Selector de opciones (tamaño, sabores de helado, adicionales) ──
const DishOptionsModal = memo(({ dish, flavors, onConfirm, onClose }: {
  dish:      Dish
  flavors:   string[]
  onConfirm: (unitPrice: number, optsText: string, size: string | null) => void
  onClose:   () => void
}) => {
  const optionGroups = dish.options ?? []
  const sizes = dish.sizes ?? []
  const hasSizes = !!dish.has_sizes && sizes.length > 0
  const tags = dish.tags ?? []

  const [size, setSize] = useState(hasSizes ? sizes[0].nombre : '')
  const [heladoSel, setHeladoSel] = useState<Record<number, string[]>>({})
  const [opcionSel, setOpcionSel] = useState<Record<number, string>>({})
  const [extras, setExtras] = useState<string[]>([])

  const unitPrice = hasSizes
    ? (sizes.find(s => s.nombre === size)?.precio ?? sizes[0].precio)
    : dish.price

  const toggleExtra = (t: string) =>
    setExtras(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const toggleFlavor = (gi: number, flavor: string, max: number) =>
    setHeladoSel(prev => {
      const cur = prev[gi] ?? []
      if (cur.includes(flavor)) return { ...prev, [gi]: cur.filter(f => f !== flavor) }
      if (cur.length >= max) return prev
      return { ...prev, [gi]: [...cur, flavor] }
    })

  const heladoNeeded = (g: typeof optionGroups[number], gi: number): number => {
    if (g.tipo === 'helado') return g.cantidad ?? 1
    if (g.tipo === 'opcion') {
      const chosen = (g.opciones ?? []).find(o => o.label === opcionSel[gi])
      return chosen?.helado ?? 0
    }
    return 0
  }

  const optionsValid = optionGroups.every((g, gi) => {
    if (g.tipo === 'opcion' && !opcionSel[gi]) return false
    const need = heladoNeeded(g, gi)
    if (need > 0) return (heladoSel[gi]?.length ?? 0) >= 1 && (heladoSel[gi]?.length ?? 0) <= need
    return true
  })

  const buildOptsText = () => {
    const parts: string[] = []
    if (hasSizes) parts.push(`Tamaño: ${size}`)
    optionGroups.forEach((g, gi) => {
      if (g.tipo === 'helado') {
        const sel = heladoSel[gi] ?? []
        if (sel.length) parts.push(`${g.nombre}: ${sel.join(', ')}`)
      } else if (g.tipo === 'opcion') {
        const label = opcionSel[gi]
        if (!label) return
        const sel = heladoSel[gi] ?? []
        parts.push(sel.length ? `${label} (${sel.join(', ')})` : label)
      }
    })
    if (extras.length) parts.push(`Adicionales: ${extras.join(', ')}`)
    return parts.join(' · ')
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 0.9rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
    ...(active
      ? { background: 'var(--accent)', color: 'white', ...S.coral }
      : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 42 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#D8DAE4] rounded-t-3xl p-6"
        style={{ maxHeight: '85vh', overflowY: 'auto', ...S.neoOut }}
      >
        <div className="w-9 h-1 rounded-full bg-[#CDD0DC] mx-auto mb-5" />
        <h3 className="font-bold text-[#2D3561] mb-1">{dish.name}</h3>
        <p className="text-xs text-[#9CA3AF] mb-4">Elige las opciones para agregar al pedido</p>

        {hasSizes && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Tamaño</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => (
                <button key={s.nombre} onClick={() => setSize(s.nombre)} style={chipStyle(size === s.nombre)}>
                  {s.nombre} · ${s.precio.toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        )}

        {optionGroups.map((g, gi) => {
          const need = heladoNeeded(g, gi)
          return (
            <div key={gi} className="mb-5">
              <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                {g.nombre}{g.tipo === 'helado' ? ` · elige ${need}` : ''}
              </p>
              {g.tipo === 'opcion' && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {(g.opciones ?? []).map(o => (
                    <button key={o.label}
                      onClick={() => { setOpcionSel(p => ({ ...p, [gi]: o.label })); setHeladoSel(p => ({ ...p, [gi]: [] })) }}
                      style={chipStyle(opcionSel[gi] === o.label)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {need > 0 && (
                flavors.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">(Aún no hay sabores configurados en Menú → Configurar)</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {flavors.map(f => {
                      const sel = (heladoSel[gi] ?? []).includes(f)
                      const full = (heladoSel[gi]?.length ?? 0) >= need
                      return (
                        <button key={f} onClick={() => toggleFlavor(gi, f, need)}
                          disabled={!sel && full}
                          style={{ ...chipStyle(sel), opacity: !sel && full ? 0.45 : 1 }}>
                          {sel ? '✓ ' : ''}{f}
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )
        })}

        {tags.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Adicionales</p>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <button key={t} onClick={() => toggleExtra(t)} style={chipStyle(extras.includes(t))}>
                  {extras.includes(t) ? '✓ ' : '+ '}{t}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => optionsValid && onConfirm(unitPrice, buildOptsText(), hasSizes ? size : null)}
          disabled={!optionsValid}
          className="w-full py-4 rounded-2xl font-bold text-white bg-[#FF5722]"
          style={{ ...S.coral, opacity: optionsValid ? 1 : 0.5 }}
        >
          {optionsValid ? `Agregar al pedido · $${unitPrice.toFixed(2)}` : 'Elige las opciones'}
        </button>
      </motion.div>
    </motion.div>
  )
})
DishOptionsModal.displayName = 'DishOptionsModal'

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
  const [catMeta, setCatMeta]       = useState<Record<string, CategoryMeta>>({})
  const [flavors, setFlavors]       = useState<string[]>([])
  const [customizingDish, setCustomizingDish] = useState<Dish | null>(null)
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

  // Cargar categorías personalizadas y sabores de helado del negocio
  useEffect(() => {
    supabase.from('restaurant_config').select('modules_enabled').single()
      .then(({ data }) => {
        const mods = data?.modules_enabled as
          { categories?: { value: string; label: string; emoji?: string }[]; helado_flavors?: string[] } | null
        const cats = mods?.categories
        if (Array.isArray(cats)) {
          const map: Record<string, CategoryMeta> = {}
          for (const c of cats) if (c?.value) map[c.value] = { label: c.label, emoji: c.emoji || '' }
          setCatMeta(map)
        }
        if (Array.isArray(mods?.helado_flavors)) setFlavors(mods!.helado_flavors!)
      })
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

  // Etiqueta/emoji de categoría: prioriza lo configurado por el negocio,
  // cae a las 5 categorías clásicas, y por último muestra el valor crudo.
  const catLabel = useCallback((c: string) => catMeta[c]?.label ?? CATEGORY_LABELS[c] ?? c, [catMeta])
  // Emoji custom elegido por el negocio (MenuManager) si existe; si no, ícono de línea por defecto.
  const catIcon = useCallback((c: string) =>
    catMeta[c]?.emoji || <CategoryIcon category={c} size={28} />, [catMeta])

  // Carrito helpers
  const getQty     = (id: string) => cart.filter(i => i.dish.id === id).reduce((s, i) => s + i.quantity, 0)
  const cartTotal  = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0)

  const addDishToCart = useCallback((dish: Dish, unitPrice = dish.price, optsText = '', size: string | null = null) => {
    setCart(prev => {
      // Los platos con opciones (tamaño, sabores, adicionales) siempre agregan una línea nueva,
      // porque cada línea puede tener una selección distinta.
      if (needsCustomization(dish)) {
        return [...prev, { uid: crypto.randomUUID(), dish, quantity: 1, notes: '', optsText, unitPrice, size }]
      }
      const ex = prev.find(i => i.dish.id === dish.id)
      return ex
        ? prev.map(i => i.uid === ex.uid ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { uid: crypto.randomUUID(), dish, quantity: 1, notes: '', optsText: '', unitPrice, size: null }]
    })
  }, [])

  // Botón "+" del grid: si el plato requiere elegir opciones (tamaño, sabores, adicionales)
  // abre el selector antes de agregar; si no, se agrega directo.
  const handleAddClick = useCallback((dish: Dish) => {
    if (needsCustomization(dish)) setCustomizingDish(dish)
    else addDishToCart(dish)
  }, [addDishToCart])

  const removeFromCart = useCallback((dishId: string) => {
    setCart(prev => {
      const idx = prev.map(i => i.dish.id).lastIndexOf(dishId)
      if (idx === -1) return prev
      const item = prev[idx]
      if (item.quantity <= 1) return prev.filter((_, i) => i !== idx)
      return prev.map((i, ix) => ix === idx ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }, [])

  const updateNotes = useCallback((uid: string, notes: string) => {
    setCart(prev => prev.map(i => i.uid === uid ? { ...i, notes } : i))
  }, [])

  // Enviar orden
  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) { message.warning('Agrega al menos un plato'); return }
    if (tipoPedido === 'LOCAL' && !selectedMesa) { message.warning('Selecciona una mesa'); return }

    setSubmitting(true)
    try {
      // Si el plato vende por tamaños, el servidor necesita el nombre del tamaño para
      // recalcular el precio (crear_orden_completa nunca confía en el precio del cliente).
      const items = cart.map(i => ({
        id:       i.dish.id,
        name:     i.dish.name,
        price:    i.unitPrice,
        quantity: i.quantity,
        size:     i.size,
        notes:    [i.optsText || null, i.notes || null].filter(Boolean).join(' · ') || null,
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
                  {catLabel(cat)}
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
                      {/* Ícono/imagen */}
                      <div className="w-full h-20 rounded-xl flex items-center justify-center text-3xl text-[#9CA3AF]" style={S.neoIn}>
                        {dish.image_url
                          ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover rounded-xl" loading="lazy" />
                          : catIcon(dish.category)
                        }
                      </div>
                      <p className="text-xs font-bold text-[#2D3561] leading-tight line-clamp-2">{dish.name}</p>
                      <p className="text-sm font-bold text-[#FF5722]">
                        {dish.has_sizes && dish.sizes?.length
                          ? `desde $${Math.min(...dish.sizes.map(s => s.precio)).toFixed(2)}`
                          : `$${dish.price.toFixed(2)}`}
                      </p>
                      {needsCustomization(dish) && (
                        <p className="text-[10px] font-bold text-[#FF5722] -mt-1">
                          {dish.has_sizes ? 'Elige tamaño al agregar' : 'Elige opciones al agregar'}
                        </p>
                      )}

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
                          onClick={() => handleAddClick(dish)}
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

            {/* Selector de opciones (sabores de helado, etc.) al agregar un plato con opciones */}
            <AnimatePresence>
              {customizingDish && (
                <DishOptionsModal
                  dish={customizingDish}
                  flavors={flavors}
                  onConfirm={(unitPrice, optsText, size) => { addDishToCart(customizingDish, unitPrice, optsText, size); setCustomizingDish(null) }}
                  onClose={() => setCustomizingDish(null)}
                />
              )}
            </AnimatePresence>
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
                  <div key={item.uid} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#FF5722] text-white text-xs font-bold flex items-center justify-center" style={S.coral}>
                          {item.quantity}
                        </span>
                        <span className="text-sm font-medium text-[#2D3561]">{item.dish.name}</span>
                      </div>
                      <span className="text-sm font-bold text-[#2D3561]">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                    {item.optsText && (
                      <p className="text-xs font-bold text-[#FF5722] pl-8">{item.optsText}</p>
                    )}
                    {/* Nota por plato */}
                    <input
                      value={item.notes}
                      onChange={e => updateNotes(item.uid, e.target.value)}
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
