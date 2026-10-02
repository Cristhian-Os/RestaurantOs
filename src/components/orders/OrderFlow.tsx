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
import { BARRA_NOTE } from '../../lib/destino'
import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { offlineService } from '../../services/offlineService'
import { pushNotificationService } from '../../services/pushNotificationService'
import { inventoryService } from '../../services/inventoryService'
import message from 'antd/es/message'
import type { Dish, DishCategory, DishOptionGroup, ItemSel } from '../../types'
import type { RecetaShortage } from '../../types/inventory'
import type { Profile } from '../../pages/Dashboard'
import { CategoryIcon } from '../CategoryIcon'
import { useMenuConfig } from '../../hooks/useMenuConfig'
import {
  type MenuConfig, defaultSel, describeSel, flavorsNeeded, hasOptions, lineNotes, orderCategories,
  groupUnits, selIsValid, selectedLabels, toggleIn, unitPriceFor, visibleOptions,
} from '../../services/menuOptions'

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
  uid:       string
  dish:      Dish
  quantity:  number
  notes:     string
  optsText:  string   // resumen de opciones elegidas (tamaño, sabores, toppings, adicionales); vacío si no aplica
  unitPrice: number   // precio unitario real (según tamaño y toppings, o dish.price si no aplica)
  size:      string | null   // nombre del tamaño elegido (server lo revalida contra dishes.sizes)
  toppings:  string[]        // toppings elegidos (server recalcula su precio)
  sel?:      ItemSel         // selección del constructor, para poder reabrirlo al editar
}

// ¿Este plato requiere abrir el selector de opciones antes de agregarlo?
// (tamaños, sabores/opciones, adicionales o toppings) + si se le agotó un
// ingrediente de receta con cambio que ofrecer.
export function needsCustomization(dish: Dish, hasShortage = false): boolean {
  return hasOptions(dish) || hasShortage
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

export interface BuilderResult {
  qty:       number
  unitPrice: number
  optsText:  string
  size:      string | null
  toppings:  string[]
  sel:       ItemSel
  comment:   string
}

// ─── Constructor de producto (tamaño, sabores, queso/helado, toppings,
//     adicionales, cantidad y comentario). El mismo modal arma un producto
//     nuevo o edita uno que ya está en un pedido (initial). ──────────────
export const DishOptionsModal = memo(({ dish, menu, shortages, initial, confirmLabel, onConfirm, onConfirmMany, onClose }: {
  dish:          Dish
  menu:          MenuConfig
  shortages:     RecetaShortage[]
  initial?:      { qty: number; sel?: ItemSel; previousNotes?: string | null }
  confirmLabel?: string
  onConfirm:     (r: BuilderResult) => void
  /** Al armar un producto nuevo con varias unidades: una entrada por cada selección distinta. */
  onConfirmMany?: (rs: BuilderResult[]) => void
  onClose:       () => void
}) => {
  const optionGroups = dish.options ?? []
  const sizes = dish.sizes ?? []
  const hasSizes = !!dish.has_sizes && sizes.length > 0
  const tags = dish.tags ?? []

  // Al armar un producto NUEVO cada unidad se elige por separado (dos cholaos pueden llevar
  // sabores o toppings distintos). Al editar una línea que ya está en un pedido se mantiene
  // como siempre: una sola selección para toda la cantidad.
  const perUnit = !initial
  const [units, setUnits]     = useState<ItemSel[]>(() => [{ ...defaultSel(dish), ...(initial?.sel ?? {}) }])
  const [active, setActive]   = useState(0)
  const [editQty, setEditQty] = useState(initial?.qty ?? 1)
  const act = Math.min(active, units.length - 1)
  const sel = units[act]
  const setSel = (fn: (s: ItemSel) => ItemSel) => setUnits(us => us.map((u, i) => (i === act ? fn(u) : u)))
  const qty = perUnit ? units.length : editQty
  const comment = sel.comment ?? ''

  const addUnit = () => {
    if (units.length >= 50) return
    setUnits([...units, structuredClone(sel)])  // la nueva empieza igual que la que se está viendo
    setActive(units.length)
  }
  const removeUnit = () => {
    if (units.length <= 1) return
    setUnits(units.slice(0, -1))
    setActive(Math.min(act, units.length - 2))
  }

  const chosenFlavors = Object.values(sel.helado ?? {}).flat()
  const toppings = (dish.toppings ?? []).filter(t => !menu.toppingsOff.includes(t.nombre) || sel.toppings?.includes(t.nombre))
  const unitPrice = unitPriceFor(dish, sel)
  const optionsValid = units.every(u => selIsValid(dish, u))
  const totalPrice = perUnit ? units.reduce((sum, u) => sum + unitPriceFor(dish, u), 0) : unitPrice * qty

  const toggleFlavor = (gi: number, flavor: string, max: number) => setSel(s => {
    const k = String(gi)
    const cur = s.helado?.[k] ?? []
    if (cur.includes(flavor)) return { ...s, helado: { ...s.helado, [k]: cur.filter(f => f !== flavor) } }
    if (cur.length >= max) return s
    return { ...s, helado: { ...s.helado, [k]: [...cur, flavor] } }
  })

  const pickOption = (g: DishOptionGroup, gi: number, label: string) => setSel(s => {
    const k = String(gi)
    if (g.multiple) {
      const next = toggleIn(s.opcionMulti?.[k], label)
      const stillNeedsHelado = (g.opciones ?? []).some(op => next.includes(op.label) && (op.helado ?? 0) > 0)
      return { ...s, opcionMulti: { ...s.opcionMulti, [k]: next }, helado: stillNeedsHelado ? s.helado : { ...s.helado, [k]: [] } }
    }
    return { ...s, opcion: { ...s.opcion, [k]: label }, helado: { ...s.helado, [k]: [] } }
  })

  const toResult = (u: ItemSel, n: number): BuilderResult => {
    const c = (u.comment ?? '').trim()
    return {
      qty: n, unitPrice: unitPriceFor(dish, u), size: hasSizes ? (u.size ?? null) : null, toppings: u.toppings ?? [],
      optsText: describeSel(dish, u, shortages),
      sel: { ...u, comment: c || undefined },
      comment: c,
    }
  }

  const confirm = () => {
    if (!optionsValid) return
    if (!perUnit) { onConfirm(toResult(sel, qty)); return }
    // Unidades con la misma selección = una línea con cantidad; las distintas, líneas aparte.
    const results = groupUnits(units).map(g => toResult(g.sel, g.qty))
    if (onConfirmMany) onConfirmMany(results)
    else results.forEach(onConfirm)
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
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 42 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#D8DAE4] rounded-t-3xl p-6"
        style={{ maxHeight: '88vh', overflowY: 'auto', ...S.neoOut }}
      >
        <div className="w-9 h-1 rounded-full bg-[#CDD0DC] mx-auto mb-5" />
        <h3 className="font-bold text-[#2D3561] mb-1">{dish.name}</h3>
        <p className="text-xs text-[#9CA3AF] mb-4">{initial ? 'Cambia lo que necesites y guarda' : 'Elige las opciones para agregar al pedido'}</p>
        {initial?.previousNotes && (
          <p className="text-xs text-[#6B7280] mb-4 rounded-xl px-3 py-2 bg-[#CDD0DC]">Pedido original: {initial.previousNotes}</p>
        )}

        {perUnit && units.length > 1 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Unidad {act + 1} de {units.length}</p>
            <div className="flex flex-wrap gap-2">
              {units.map((u, i) => (
                <button key={i} onClick={() => setActive(i)} aria-label={`Unidad ${i + 1}`} style={chipStyle(i === act)}>
                  {i + 1}{selIsValid(dish, u) ? '' : ' ⚠'}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#9CA3AF] mt-2">Cada unidad se elige por separado. Las nuevas empiezan igual que la que estabas viendo.</p>
          </div>
        )}

        {hasSizes && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Tamaño</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => (
                <button key={s.nombre} onClick={() => setSel(p => ({ ...p, size: s.nombre }))} style={chipStyle(sel.size === s.nombre)}>
                  {s.nombre} · ${Math.round(s.precio).toLocaleString('es-CO')}
                </button>
              ))}
            </div>
          </div>
        )}

        {optionGroups.map((g, gi) => {
          const need = flavorsNeeded(g, gi, sel)
          const flavorOptions = g.tipo === 'jugo'
            ? visibleOptions(menu.jugoFlavors, menu.jugoOff, chosenFlavors)
            : visibleOptions(menu.heladoFlavors, menu.heladoOff, chosenFlavors)
          const picked = sel.helado?.[String(gi)] ?? []
          return (
            <div key={gi} className="mb-5">
              <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                {g.nombre}{(g.tipo === 'helado' || g.tipo === 'jugo') ? ` · elige ${need}` : ''}
              </p>
              {g.tipo === 'opcion' && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {(g.opciones ?? []).map(o => (
                    <button key={o.label} onClick={() => pickOption(g, gi, o.label)}
                      style={chipStyle(selectedLabels(g, gi, sel).includes(o.label))}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {need > 0 && (
                flavorOptions.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">(No hay sabores disponibles ahora)</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {flavorOptions.map(f => {
                      const on = picked.includes(f)
                      const full = picked.length >= need
                      return (
                        <button key={f} onClick={() => toggleFlavor(gi, f, need)}
                          disabled={!on && full}
                          style={{ ...chipStyle(on), opacity: !on && full ? 0.45 : 1 }}>
                          {on ? '✓ ' : ''}{f}
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )
        })}

        {toppings.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Toppings</p>
            <div className="flex flex-wrap gap-2">
              {toppings.map(t => {
                const on = !!sel.toppings?.includes(t.nombre)
                return (
                  <button key={t.nombre} onClick={() => setSel(s => ({ ...s, toppings: toggleIn(s.toppings, t.nombre) }))} style={chipStyle(on)}>
                    {on ? '✓ ' : '+ '}{t.nombre}{Number(t.precio) > 0 ? ` · $${Math.round(t.precio).toLocaleString('es-CO')}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Adicionales</p>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <button key={t} onClick={() => setSel(s => ({ ...s, extras: toggleIn(s.extras, t) }))} style={chipStyle(!!sel.extras?.includes(t))}>
                  {sel.extras?.includes(t) ? '✓ ' : '+ '}{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {shortages.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-[#DC2626] uppercase tracking-wider mb-2">Ingrediente agotado</p>
            <div className="flex flex-wrap gap-2">
              {shortages.map(s => s.sustituto_nombre ? (
                <button key={s.ingrediente_id} onClick={() => setSel(p => ({ ...p, swaps: toggleIn(p.swaps, s.ingrediente_id) }))}
                  style={chipStyle(!!sel.swaps?.includes(s.ingrediente_id))}>
                  {sel.swaps?.includes(s.ingrediente_id) ? '✓ ' : ''}Cambiar {s.ingrediente_nombre} → {s.sustituto_nombre}
                </button>
              ) : (
                <span key={s.ingrediente_id}
                  className="text-xs font-bold px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626' }}>
                  Se acabó {s.ingrediente_nombre} (sin cambio configurado)
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5">
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Comentario</p>
          <textarea value={comment} onChange={e => setSel(s => ({ ...s, comment: e.target.value }))}
            placeholder="Ej: sin azúcar, poco hielo..." rows={2} maxLength={200}
            className="w-full bg-[#CDD0DC] rounded-xl px-3 py-2 text-sm text-[#2D3561] outline-none resize-none placeholder-[#9CA3AF]"
            style={S.neoIn} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl px-2 py-1.5 bg-[#CDD0DC]" style={S.neoIn}>
            <button onClick={() => (perUnit ? removeUnit() : setEditQty(q => Math.max(1, q - 1)))} aria-label="Menos"
              className="w-9 h-9 rounded-xl font-bold text-lg text-[#2D3561] bg-[#D8DAE4]" style={S.neoOutSm}>−</button>
            <span className="min-w-[1.75rem] text-center font-bold text-[#2D3561]">{qty}</span>
            <button onClick={() => (perUnit ? addUnit() : setEditQty(q => Math.min(50, q + 1)))} aria-label="Más"
              className="w-9 h-9 rounded-xl font-bold text-lg text-white bg-[#FF5722]" style={S.coral}>+</button>
          </div>
          <button
            onClick={confirm}
            disabled={!optionsValid}
            className="flex-1 py-4 rounded-2xl font-bold text-white bg-[#FF5722]"
            style={{ ...S.coral, opacity: optionsValid ? 1 : 0.5 }}
          >
            {optionsValid
              ? `${confirmLabel ?? 'Agregar al pedido'} · $${Math.round(totalPrice).toLocaleString('es-CO')}`
              : units.length > 1 ? 'Elige las opciones de cada unidad' : 'Elige las opciones'}
          </button>
        </div>
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
  const [barra, setBarra]             = useState(false) // pedido en el local sin mesa
  const [tipoPedido, setTipo]       = useState<TipoPedido>('LOCAL')
  const [customerName, setCustomerName] = useState('')
  // Menú
  const [dishes, setDishes]         = useState<Dish[]>([])
  const [cart, setCart]             = useState<CartItem[]>([])
  const [search, setSearch]         = useState('')
  const [activeCategory, setCategory] = useState<DishCategory | 'all'>('all')
  const menu                        = useMenuConfig()
  const [shortages, setShortages]   = useState<RecetaShortage[]>([])
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
  const fetchDishes = useCallback(() => {
    supabase.from('dishes').select('*').eq('available', true)
      .neq('availability_status', 'discontinued').order('sort_order').order('name')
      .then(({ data }) => { setDishes(data || []); setLoadingDishes(false) })
  }, [])

  useEffect(() => { fetchDishes() }, [fetchDishes])

  // Refrescar el menú en vivo si el admin edita platos/categorías en otra pestaña
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (!rid) return
      ch = supabase.channel('order-flow-dishes-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${rid}` }, fetchDishes)
        .subscribe()
    })
    return () => { if (ch) supabase.removeChannel(ch) }
  }, [fetchDishes])

  // Ingredientes de receta agotados (con o sin cambio configurado) — se
  // refresca solo/a si otro pedido descuenta stock mientras el mesero
  // tiene el menú abierto.
  const fetchShortages = useCallback(() => {
    inventoryService.getRecetaShortages().then(setShortages).catch(() => {})
  }, [])

  useEffect(() => { fetchShortages() }, [fetchShortages])

  useEffect(() => {
    const ch = supabase.channel('order-flow-shortages-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredientes' }, fetchShortages)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchShortages])

  // Platos filtrados
  const filteredDishes = useMemo(() => {
    let list = dishes
    if (activeCategory !== 'all') list = list.filter(d => d.category === activeCategory)
    else {
      // "Todo": agrupados en el orden de categorías del restaurante (sort estable)
      const pos = new Map(menu.categories.map((c, i) => [c.value, i]))
      list = [...list].sort((a, b) => (pos.get(a.category) ?? 1e9) - (pos.get(b.category) ?? 1e9))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
    }
    return list
  }, [dishes, activeCategory, search, menu.categories])

  // Mismo orden de categorías que el menú del cliente (Menú → Configurar)
  const categories = useMemo(() =>
    orderCategories(Array.from(new Set(dishes.map(d => d.category))), menu.categories) as DishCategory[]
  , [dishes, menu.categories])

  // Platos con al menos un ingrediente de receta agotado ahora mismo
  const shortageProductIds = useMemo(() => new Set(shortages.map(s => s.producto_id)), [shortages])

  // Etiqueta/emoji de categoría: prioriza lo configurado por el negocio,
  // cae a las 5 categorías clásicas, y por último muestra el valor crudo.
  const catMeta = useMemo(() => new Map(menu.categories.map(c => [c.value, c])), [menu.categories])
  const catLabel = useCallback((c: string) => catMeta.get(c)?.label ?? CATEGORY_LABELS[c] ?? c, [catMeta])
  // Emoji custom elegido por el negocio (MenuManager) si existe; si no, ícono de línea por defecto.
  const catIcon = useCallback((c: string) =>
    catMeta.get(c)?.emoji || <CategoryIcon category={c} size={28} />, [catMeta])

  // Carrito helpers
  const getQty     = (id: string) => cart.filter(i => i.dish.id === id).reduce((s, i) => s + i.quantity, 0)
  const cartTotal  = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0)

  const addDishToCart = useCallback((dish: Dish, r?: BuilderResult) => {
    setCart(prev => {
      // Lo armado en el constructor siempre es una línea nueva: cada línea
      // puede tener una selección distinta (tamaño, sabores, toppings...).
      if (r) {
        return [...prev, {
          uid: crypto.randomUUID(), dish, quantity: r.qty, notes: r.comment, optsText: r.optsText,
          unitPrice: r.unitPrice, size: r.size, toppings: r.toppings, sel: r.sel,
        }]
      }
      // Nunca se suma a una línea existente: cada unidad es su propia línea
      // para poder darle notas distintas.
      return [...prev, { uid: crypto.randomUUID(), dish, quantity: 1, notes: '', optsText: '', unitPrice: dish.price, size: null, toppings: [] }]
    })
  }, [])

  // Varias selecciones distintas del mismo plato (cada unidad elegida por separado): una línea por selección.
  const addDishLines = useCallback((dish: Dish, rs: BuilderResult[]) => {
    setCart(prev => [...prev, ...rs.map(r => ({
      uid: crypto.randomUUID(), dish, quantity: r.qty, notes: r.comment, optsText: r.optsText,
      unitPrice: r.unitPrice, size: r.size, toppings: r.toppings, sel: r.sel,
    }))])
  }, [])

  // Botón "+" del grid: si el plato requiere elegir opciones (tamaño, sabores, adicionales,
  // o se le agotó un ingrediente) abre el selector antes de agregar; si no, se agrega directo.
  const handleAddClick = useCallback((dish: Dish) => {
    if (needsCustomization(dish, shortageProductIds.has(dish.id))) setCustomizingDish(dish)
    else addDishToCart(dish)
  }, [addDishToCart, shortageProductIds])

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
    if (tipoPedido === 'LOCAL' && !selectedMesa && !barra) { message.warning('Selecciona una mesa o Barra'); return }

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
        toppings: i.toppings,
        notes:    lineNotes(i.optsText, i.notes) || null,
        sel:      { ...(i.sel ?? {}), comment: i.notes.trim() || undefined },
      }))

      if (isOnline) {
        const { data, error } = await supabase.rpc('crear_orden_completa', {
          p_mesa_id:        selectedMesa?.id ?? null,
          p_items:          items,
          p_tipo_pedido:    tipoPedido,
          p_notes:          (barra && !selectedMesa ? [BARRA_NOTE, orderNotes].filter(Boolean).join(' · ') : orderNotes) || null,
          p_table_num:      selectedMesa?.numero ?? null,
          p_customer_name:  customerName.trim() || null,
        })
        if (error) throw error
        // Número secuencial del día (lo asigna un trigger en la base); si aún no existe, sin número.
        const { data: num } = await supabase.from('orders').select('order_number_today').eq('id', data.order_id).maybeSingle()
        const ref = num?.order_number_today ? `#${num.order_number_today}` : ''
        const dest = (selectedMesa?.numero ? `Mesa ${selectedMesa.numero}` : barra ? BARRA_NOTE : 'Mostrador') + (customerName.trim() ? ` · ${customerName.trim()}` : '')
        if (tipoPedido === 'RAPPI') {
          // Rappi nace pagado: va directo a cocina, no pasa por cobro.
          message.success('Pedido Rappi enviado a cocina')
          pushNotificationService.notify(['kitchen', 'admin'], 'Nuevo pedido Rappi', `${dest} — ${items.length} ítem(s)`, '/')
        } else {
          // Plan B: el pedido no pasa a cocina hasta que Caja lo cobre.
          message.success(`Pedido enviado a caja para cobro — Total: $${Math.round(cartTotal).toLocaleString('es-CO')}`)
          pushNotificationService.notify(['cashier', 'admin'], 'Pedido por cobrar', `${dest} — ${items.length} ítem(s) · $${Math.round(cartTotal).toLocaleString('es-CO')}`, '/')
        }
        // Confirmación push a quien tomó el pedido (llega aunque cierre la app).
        pushNotificationService.notify(
          [], `Pedido ${ref}`.trim(), `Pedido ${ref} listo para ir a cocina — ${dest}`.replace('  ', ' '), '/',
          undefined, [profile.id],
        )
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
          customer_name: customerName.trim() || undefined,
          notes: orderNotes || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        message.warning('Sin conexión — Orden guardada localmente')
      }

      // Reset
      setCart([])
      setStep('mesa')
      setMesa(null); setBarra(false)
      setOrderNotes('')
      setCustomerName('')
    } catch (e) {
      message.error(`${e instanceof Error ? e.message : 'Error al enviar orden'}`)
    } finally {
      setSubmitting(false)
    }
  }, [cart, tipoPedido, selectedMesa, barra, isOnline, cartTotal, orderNotes, customerName, onOrderCreated, profile.id])

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
                    Selecciona una mesa o Barra
                  </p>
                  {loadingMesas ? (
                    <div className="text-center py-4 text-[#9CA3AF] text-sm">Cargando mesas...</div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => { setMesa(null); setBarra(true) }}
                        className="col-span-4 p-3 rounded-2xl text-center font-bold transition-all"
                        style={barra && !selectedMesa
                          ? { background: 'var(--accent)', color: 'white', ...S.coral }
                          : { background: 'var(--bg)', color: 'var(--text-primary)', ...S.neoOutSm }}>
                        Barra / sin mesa
                      </button>
                      {mesas.map(mesa => (
                        <button key={mesa.id}
                          onClick={() => { setMesa(mesa); setBarra(false) }}
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
                          <div className="text-[0.625rem] font-medium">
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

              {/* Nombre del comensal: además de la mesa, para identificar el pedido */}
              <div className="mt-5">
                <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">
                  Nombre del comensal (opcional)
                </p>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Ej: María"
                  maxLength={120}
                  className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
                  style={S.neoIn}
                />
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (tipoPedido === 'LOCAL' && !selectedMesa && !barra) {
                  message.warning('Selecciona una mesa o Barra')
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
                          ? `desde $${Math.round(Math.min(...dish.sizes.map(s => s.precio))).toLocaleString('es-CO')}`
                          : `$${Math.round(dish.price).toLocaleString('es-CO')}`}
                      </p>
                      {needsCustomization(dish, shortageProductIds.has(dish.id)) && (
                        <p className="text-[0.625rem] font-bold -mt-1" style={{ color: shortageProductIds.has(dish.id) ? '#DC2626' : '#FF5722' }}>
                          {dish.has_sizes ? 'Elige tamaño al agregar'
                            : shortageProductIds.has(dish.id) ? '⚠️ Ingrediente agotado — revisar al agregar'
                            : 'Elige opciones al agregar'}
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
                    <span>${Math.round(cartTotal).toLocaleString('es-CO')}</span>
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
                  menu={menu}
                  shortages={shortages.filter(s => s.producto_id === customizingDish.id)}
                  onConfirm={r => { addDishToCart(customizingDish, r); setCustomizingDish(null) }}
                  onConfirmMany={rs => { addDishLines(customizingDish, rs); setCustomizingDish(null) }}
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
                {tipoPedido === 'LOCAL' && selectedMesa ? `Mesa ${selectedMesa.numero}` : tipoPedido === 'LOCAL' && barra ? BARRA_NOTE : tipoPedido}
                {customerName.trim() && ` · ${customerName.trim()}`}
              </p>

              {/* Items */}
              <div className="flex flex-col gap-3 mb-4">
                {cart.map(item => (
                  <div key={item.uid} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="min-w-[1.5rem] text-lg font-bold leading-none text-[#FF5722]">
                          {item.quantity}
                        </span>
                        <span className="text-sm font-medium text-[#2D3561]">{item.dish.name}</span>
                      </div>
                      <span className="text-sm font-bold text-[#2D3561]">
                        ${Math.round(item.unitPrice * item.quantity).toLocaleString('es-CO')}
                      </span>
                    </div>
                    {item.optsText && (
                      <p className="text-xs font-bold text-[#FF5722]">{item.optsText}</p>
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
                <span className="text-2xl font-bold text-[#FF5722]">${Math.round(cartTotal).toLocaleString('es-CO')}</span>
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
                : `Confirmar orden · $${Math.round(cartTotal).toLocaleString('es-CO')}`
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
