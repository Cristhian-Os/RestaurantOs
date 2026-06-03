/**
 * ClientMenuSection.tsx — v3 (con platos custom)
 * Menú digital real con datos de la BD + carrito + self-ordering + custom dishes
 */
import { useState, useCallback, useMemo, memo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase }        from '../services/supabaseClient'
import { DishCard }        from './DishCard'
import { CustomDishBuilder } from './CustomDishBuilder'
import { ScrollReveal, ScrollRevealList, ScrollRevealItem } from './ScrollReveal'
import type { Dish, DishCategory } from '../types'

const CATEGORY_LABELS: Record<DishCategory, string> = {
  entrada:   '🥗 Entradas',
  principal: '🍽️ Principales',
  postre:    '🍰 Postres',
  bebida:    '🥤 Bebidas',
  especial:  '⭐ Especiales',
}

interface CartItem { dish: Dish; quantity: number }
interface CustomDish {
  name: string
  description?: string
  price: number
  ingredients: Record<string, number>
}

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoIn:   { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
}

export const ClientMenuSection = memo(() => {
  const [dishes,            setDishes]       = useState<Dish[]>([])
  const [loading,           setLoading]      = useState(true)
  const [cart,              setCart]         = useState<CartItem[]>([])
  const [activeCategory,    setCategory]     = useState<DishCategory | 'all'>('all')
  const [search,            setSearch]       = useState('')
  const [tableNum,          setTableNum]     = useState('')
  const [submitting,        setSubmitting]   = useState(false)
  const [submitted,         setSubmitted]    = useState(false)
  const [showCustomBuilder, setShowCustom]   = useState(false)

  // Cargar menú real desde Supabase
  useEffect(() => {
    supabase
      .from('dishes')
      .select('*')
      .eq('available', true)
      .neq('availability_status', 'discontinued')
      .order('sort_order').order('name')
      .then(({ data }) => { setDishes(data || []); setLoading(false) })
  }, [])

  const filteredDishes = useMemo(() => {
    let list = dishes
    if (activeCategory !== 'all') list = list.filter(d => d.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
    }
    return list
  }, [dishes, activeCategory, search])

  const availableCategories = useMemo(() =>
    Array.from(new Set(dishes.map(d => d.category))) as DishCategory[],
    [dishes])

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)
  const totalPrice = cart.reduce((s, i) => s + i.dish.price * i.quantity, 0)

  const handleAdd = useCallback((dish: Dish) => {
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === dish.id)
      return ex
        ? prev.map(i => i.dish.id === dish.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { dish, quantity: 1 }]
    })
  }, [])

  const handleRemove = useCallback((dishId: string) => {
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === dishId)
      if (!ex) return prev
      if (ex.quantity <= 1) return prev.filter(i => i.dish.id !== dishId)
      return prev.map(i => i.dish.id === dishId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }, [])

  const getQuantity = useCallback((id: string) =>
    cart.find(i => i.dish.id === id)?.quantity ?? 0, [cart])

  // Manejar creación de plato custom
  const handleCustomDishCreated = useCallback((customDish: CustomDish) => {
    // Crear un "plato virtual" con ID único basado en timestamp
    const virtualDish: Dish = {
      id: `custom-${Date.now()}`,
      name: customDish.name,
      description: customDish.description || 'Plato personalizado',
      price: customDish.price,
      category: 'especial',
      image_url: undefined,
      available: true,
      availability_status: 'available',
      tags: ['custom'],
      sort_order: 999,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_sizes: false,
      // Guardar ingredientes en el objeto custom para referencia
      _customIngredients: customDish.ingredients,
    } as any

    setCart(prev => {
      const exists = prev.find(i => i.dish.id === virtualDish.id)
      return exists
        ? prev.map(i => i.dish.id === virtualDish.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { dish: virtualDish, quantity: 1 }]
    })
  }, [])

  // Self-ordering: el cliente envía su propio pedido (con soporte para platos custom)
  const handleOrder = useCallback(async () => {
    if (cart.length === 0) return
    if (!tableNum.trim()) { alert('Ingresa tu número de mesa'); return }
    setSubmitting(true)
    try {
      // Separar el carrito en items normales (del catálogo) y platos custom
      const itemsNormales = cart
        .filter(i => !i.dish.id.startsWith('custom-'))
        .map(i => ({
          id: i.dish.id, name: i.dish.name,
          price: i.dish.price, quantity: i.quantity,
        }))

      const platosCustom = cart
        .filter(i => i.dish.id.startsWith('custom-'))
        .map(i => ({
          name: i.dish.name,
          description: i.dish.description,
          quantity: i.quantity,
          ingredients: i.dish._customIngredients || {},
        }))

      // Una sola RPC atómica: crea la orden, descuenta stock de ambos tipos
      const { error } = await supabase.rpc('crear_orden_con_custom', {
        p_items_normales: itemsNormales,
        p_platos_custom:  platosCustom,
        p_tipo_pedido:    'LOCAL',
        p_table_num:      parseInt(tableNum),
        p_mesa_id:        null,
        p_notes:          null,
      })
      if (error) throw error

      setSubmitted(true)
      setCart([])
    } catch (e) {
      console.error('Error al enviar pedido:', e)
      alert(`Error al enviar pedido: ${(e as Error).message || 'Llama al mesero.'}`)
    } finally {
      setSubmitting(false)
    }
  }, [cart, tableNum])

  if (submitted) return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center text-4xl"
        style={{ boxShadow: '8px 8px 16px rgba(16,185,129,0.3),-8px -8px 16px rgba(255,255,255,0.75)' }}>
        ✅
      </div>
      <h2 className="text-xl font-bold text-[#2D3561]">¡Pedido enviado!</h2>
      <p className="text-sm text-[#9CA3AF] text-center">Tu orden ya está en cocina. En breve llega a tu mesa.</p>
      <button onClick={() => setSubmitted(false)}
        className="px-6 py-2.5 rounded-2xl text-sm font-bold text-white bg-[#FF5722]" style={S.coral}>
        Pedir más
      </button>
    </motion.div>
  )

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <ScrollReveal delay={0} y={20}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Nuestro Menú
          </h2>
          {totalItems > 0 && (
            <div className="flex items-center gap-2 bg-[#D8DAE4] px-4 py-2 rounded-2xl" style={S.neoOutSm}>
              <span className="text-xs text-[#9CA3AF]">Carrito</span>
              <span className="text-sm font-bold text-[#FF5722]">{totalItems}</span>
              <span className="text-xs text-[#6B7280]">·</span>
              <span className="text-sm font-bold text-[#2D3561]">${totalPrice.toFixed(2)}</span>
            </div>
          )}
        </div>
      </ScrollReveal>

      {/* Buscador */}
      <div className="bg-[#D8DAE4] rounded-2xl px-4 py-3 flex items-center gap-3" style={S.neoIn}>
        <span className="text-[#9CA3AF]">🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar plato..."
          className="flex-1 bg-transparent text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]" />
        {search && <button onClick={() => setSearch('')} className="text-[#9CA3AF] text-xs">✕</button>}
      </div>

      {/* Botón para crear plato custom */}
      <ScrollReveal delay={0.08} y={16}>
        <motion.button
          onClick={() => setShowCustom(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 text-sm"
          style={S.coral}
        >
          🎨 Crear mi propio plato (con ingredientes disponibles)
        </motion.button>
      </ScrollReveal>

      {/* Modal CustomDishBuilder */}
      <AnimatePresence>
        {showCustomBuilder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCustom(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <CustomDishBuilder
                onDishCreated={handleCustomDishCreated}
                onClose={() => setShowCustom(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categorías */}
      <ScrollReveal delay={0.1} y={16}>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setCategory('all')}
            className="shrink-0 px-4 py-2 rounded-2xl text-xs font-bold"
            style={activeCategory === 'all'
              ? { background: '#FF5722', color: 'white', ...S.coral }
              : { background: '#D8DAE4', color: '#6B7280', ...S.neoOutSm }}>
            🍴 Todo
          </button>
          {availableCategories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className="shrink-0 px-4 py-2 rounded-2xl text-xs font-bold"
              style={activeCategory === cat
                ? { background: '#FF5722', color: 'white', ...S.coral }
                : { background: '#D8DAE4', color: '#6B7280', ...S.neoOutSm }}>
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </ScrollReveal>

      {/* Grid de platos */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#D8DAE4] rounded-3xl h-52 animate-pulse" style={S.neoOut} />
          ))}
        </div>
      ) : filteredDishes.length === 0 ? (
        <div className="bg-[#D8DAE4] rounded-3xl p-12 text-center" style={S.neoIn}>
          <p className="text-3xl mb-2">🍽️</p>
          <p className="text-sm font-bold text-[#2D3561]">Sin platos encontrados</p>
        </div>
      ) : (
        <ScrollRevealList stagger={0.06} className="grid grid-cols-2 gap-4">
          {filteredDishes.map(dish => (
            <ScrollRevealItem key={dish.id}>
              <DishCard dish={dish} onAdd={handleAdd} quantity={getQuantity(dish.id)} />
            </ScrollRevealItem>
          ))}
        </ScrollRevealList>
      )}

      {/* Carrito + self-ordering */}
      <AnimatePresence>
        {totalItems > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }} className="mt-4">
            <div className="bg-[#D8DAE4] rounded-3xl p-5" style={S.neoOut}>
              <h3 className="font-bold text-[#2D3561] mb-3">🛒 Tu pedido</h3>

              {cart.map(item => (
                <div key={item.dish.id} className="flex items-center justify-between py-2 border-b border-[#E0E3EC] last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleRemove(item.dish.id)}
                        className="w-6 h-6 rounded-lg text-xs font-bold text-[#6B7280]" style={S.neoOutSm}>−</button>
                      <span className="text-sm font-bold text-[#FF5722] w-5 text-center">{item.quantity}</span>
                      <button onClick={() => handleAdd(item.dish)}
                        className="w-6 h-6 rounded-lg text-xs font-bold text-white bg-[#FF5722]" style={S.coral}>+</button>
                    </div>
                    <span className="text-sm text-[#6B7280]">{item.dish.name}</span>
                  </div>
                  <span className="text-sm font-bold text-[#2D3561]">
                    ${(item.dish.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between pt-3 mt-1">
                <span className="text-sm font-bold text-[#2D3561]">Total</span>
                <span className="text-xl font-bold text-[#FF5722]">${totalPrice.toFixed(2)}</span>
              </div>

              {/* Número de mesa para self-ordering */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                  Tu número de mesa
                </label>
                <input type="number" value={tableNum} onChange={e => setTableNum(e.target.value)}
                  placeholder="Ej: 5"
                  className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                  style={S.neoIn} />
              </div>

              <motion.button whileTap={{ scale: 0.97 }} onClick={handleOrder}
                disabled={submitting || !tableNum}
                className={`w-full py-3.5 rounded-2xl font-bold text-white bg-[#FF5722] mt-4 text-sm ${submitting || !tableNum ? 'opacity-60' : ''}`}
                style={S.coral}>
                {submitting ? '⏳ Enviando...' : '✅ Enviar pedido a cocina'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

ClientMenuSection.displayName = 'ClientMenuSection'
