/**
 * PublicMenu.tsx — Menú público para clientes
 * Accessible en /menu sin necesidad de login
 * El cliente escanea el QR → ve el menú → puede pedir desde su mesa
 */
import { useState, useMemo, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import type { Dish, DishCategory } from '../types'

const CATEGORY_LABELS: Record<DishCategory | 'all', string> = {
  all:       '✨ Todo',
  especial:  '⭐ Especiales',
  principal: '🍽️ Principales',
  postre:    '🍰 Postres',
  bebida:    '🥤 Bebidas',
  entrada:   '🥗 Entradas',
}

const S = {
  out:   { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  outSm: { boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  in:    { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
} as const

function fmtCOP(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

interface CartItem { dish: Dish; qty: number }

export default function PublicMenu() {
  const [dishes,   setDishes]   = useState<Dish[]>([])
  const [loading,  setLoading]  = useState(true)
  const [cat,      setCat]      = useState<DishCategory | 'all'>('all')
  const [search,   setSearch]   = useState('')
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [mesa,     setMesa]     = useState('')
  const [showCart, setShowCart] = useState(false)
  const [sent,     setSent]     = useState(false)
  const [sending,  setSending]  = useState(false)

  // Leer número de mesa de la URL (?mesa=3)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('mesa')
    if (m) setMesa(m)
  }, [])

  // Cargar menú desde Supabase (sin auth — RLS permite lectura pública)
  useEffect(() => {
    supabase
      .from('dishes')
      .select('*')
      .eq('available', true)
      .neq('availability_status', 'discontinued')
      .order('sort_order').order('name')
      .then(({ data }) => { setDishes(data || []); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    let list = dishes
    if (cat !== 'all') list = list.filter(d => d.category === cat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
      )
    }
    return list
  }, [dishes, cat, search])

  const categories = useMemo(() =>
    ['all', ...Array.from(new Set(dishes.map(d => d.category)))] as (DishCategory | 'all')[]
  , [dishes])

  const cartTotal = cart.reduce((s, i) => s + i.dish.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const addToCart = (dish: Dish) =>
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === dish.id)
      return ex
        ? prev.map(i => i.dish.id === dish.id ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { dish, qty: 1 }]
    })

  const removeFromCart = (id: string) =>
    setCart(prev => {
      const ex = prev.find(i => i.dish.id === id)
      if (!ex) return prev
      if (ex.qty <= 1) return prev.filter(i => i.dish.id !== id)
      return prev.map(i => i.dish.id === id ? { ...i, qty: i.qty - 1 } : i)
    })

  const sendOrder = async () => {
    if (!mesa.trim() || cart.length === 0) return
    setSending(true)
    try {
      const items = cart.map(i => ({
        id: i.dish.id, name: i.dish.name,
        price: i.dish.price, quantity: i.qty,
      }))
      const total = cartTotal
      await supabase.from('orders').insert({
        user_id: (await supabase.auth.getUser()).data.user?.id ?? '00000000-0000-0000-0000-000000000000',
        table_num: parseInt(mesa),
        items: JSON.stringify(items),
        total,
        tipo_pedido: 'LOCAL',
        status: 'pending',
      })
      setSent(true)
      setCart([])
      setShowCart(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#E8EAF0', fontFamily: '"Nunito", sans-serif' }}>

      {/* ── Header ── */}
      <header style={{
        backgroundColor: '#E8EAF0',
        padding: '1rem 1.25rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 20,
        ...S.out,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '0.75rem', overflow: 'hidden', flexShrink: 0,
            ...S.outSm,
          }}>
            <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1rem', color: '#2D3561', margin: 0 }}>
              Heladería Doña María
            </h1>
            {mesa && (
              <p style={{ fontSize: '0.7rem', color: '#FF5722', fontWeight: 700, margin: 0 }}>
                Mesa {mesa}
              </p>
            )}
          </div>
        </div>

        {/* Botón carrito */}
        {cartCount > 0 && (
          <motion.button
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCart(true)}
            style={{
              position: 'relative', padding: '0.625rem 1rem',
              backgroundColor: '#FF5722', borderRadius: '1rem',
              border: 'none', color: '#fff', fontWeight: 700,
              fontSize: '0.875rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontFamily: 'inherit',
              ...S.coral,
            }}
          >
            🛒 {cartCount} · {fmtCOP(cartTotal)}
          </motion.button>
        )}
      </header>

      <div style={{ padding: '1.25rem', maxWidth: '640px', margin: '0 auto' }}>

        {/* Éxito de envío */}
        <AnimatePresence>
          {sent && (
            <motion.div
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0',
                borderRadius: '1rem', padding: '1rem 1.25rem',
                marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🎉</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, color: '#065F46', margin: 0 }}>¡Pedido enviado a cocina!</p>
                <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>Te avisamos cuando esté listo.</p>
              </div>
              <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '1rem' }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buscador */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>🔍</span>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en el menú..."
            style={{
              width: '100%', backgroundColor: '#E0E3EC', borderRadius: '1rem',
              paddingLeft: '2.75rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem',
              border: 'none', outline: 'none', fontSize: '0.875rem', color: '#2D3561', fontFamily: 'inherit',
              ...S.in,
            }}
          />
        </div>

        {/* Filtros por categoría */}
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', marginBottom: '1.25rem' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{
                flexShrink: 0, padding: '0.5rem 0.875rem',
                borderRadius: '9999px', border: 'none',
                fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                ...(cat === c
                  ? { backgroundColor: '#FF5722', color: '#fff', ...S.coral }
                  : { backgroundColor: '#E8EAF0', color: '#6B7280', ...S.outSm }
                ),
              }}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Grid de platos */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 200, borderRadius: '1.5rem', backgroundColor: '#E0E3EC', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍦</p>
            <p style={{ color: '#9CA3AF', fontWeight: 600 }}>No encontramos ese plato</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {filtered.map(dish => {
              const inCart = cart.find(i => i.dish.id === dish.id)?.qty ?? 0
              return (
                <motion.div key={dish.id} layout
                  style={{ backgroundColor: '#E8EAF0', borderRadius: '1.5rem', padding: '1rem', ...S.out }}>
                  {/* Imagen / emoji */}
                  <div style={{
                    width: '100%', height: '80px', borderRadius: '1rem',
                    backgroundColor: '#E0E3EC', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '2.25rem', marginBottom: '0.75rem',
                    ...S.in,
                  }}>
                    {dish.image_url
                      ? <img src={dish.image_url} alt={dish.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1rem' }} />
                      : (dish.category === 'bebida' ? '🥤' :
                         dish.category === 'postre' ? '🍰' :
                         dish.category === 'especial' ? '⭐' :
                         dish.category === 'entrada' ? '🥗' : '🍽️')
                    }
                  </div>
                  <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '0.875rem', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                    {dish.name}
                  </p>
                  {dish.description && (
                    <p style={{ fontSize: '0.7rem', color: '#9CA3AF', marginBottom: '0.5rem', lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {dish.description}
                    </p>
                  )}
                  <p style={{ fontWeight: 700, color: '#FF5722', fontSize: '1rem', marginBottom: '0.75rem' }}>
                    {fmtCOP(dish.price)}
                  </p>

                  {/* Controles qty */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.375rem' }}>
                    <button onClick={() => removeFromCart(dish.id)} disabled={inCart === 0}
                      style={{
                        width: 32, height: 32, borderRadius: '0.625rem', border: 'none',
                        fontWeight: 700, fontSize: '1.125rem', cursor: inCart === 0 ? 'not-allowed' : 'pointer',
                        backgroundColor: '#E8EAF0', color: '#2D3561', fontFamily: 'inherit',
                        opacity: inCart === 0 ? 0.35 : 1,
                        ...S.outSm,
                      }}>−</button>
                    <span style={{ fontWeight: 700, color: '#2D3561', minWidth: '1.5rem', textAlign: 'center' }}>
                      {inCart}
                    </span>
                    <button onClick={() => addToCart(dish)}
                      style={{
                        width: 32, height: 32, borderRadius: '0.625rem', border: 'none',
                        fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                        backgroundColor: '#FF5722', color: '#fff', fontFamily: 'inherit',
                        ...S.coral,
                      }}>+</button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal carrito ── */}
      <AnimatePresence>
        {showCart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCart(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              backgroundColor: 'rgba(45,53,97,0.5)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: '480px',
                backgroundColor: '#E8EAF0', borderRadius: '1.5rem 1.5rem 0 0',
                padding: '1.5rem', maxHeight: '80vh', overflowY: 'auto',
                boxShadow: '0 -8px 32px rgba(163,177,198,0.5)',
              }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5E0', margin: '0 auto 1.25rem' }} />
              <h3 style={{ fontWeight: 700, color: '#2D3561', fontSize: '1.125rem', marginBottom: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
                🛒 Tu pedido
              </h3>

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
                {cart.map(item => (
                  <div key={item.dish.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: '#E0E3EC', borderRadius: '0.875rem', padding: '0.75rem 1rem',
                    ...S.in,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '0.5rem',
                        backgroundColor: '#FF5722', color: '#fff',
                        fontSize: '0.75rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{item.qty}</span>
                      <p style={{ fontWeight: 600, color: '#2D3561', fontSize: '0.875rem', margin: 0 }}>{item.dish.name}</p>
                    </div>
                    <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '0.875rem', margin: 0 }}>
                      {fmtCOP(item.dish.price * item.qty)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Mesa */}
              {!mesa && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    Número de mesa
                  </label>
                  <input type="number" value={mesa} onChange={e => setMesa(e.target.value)}
                    placeholder="Ej: 3"
                    style={{
                      width: '100%', backgroundColor: '#E0E3EC', borderRadius: '0.875rem',
                      padding: '0.75rem 1rem', border: 'none', outline: 'none',
                      fontSize: '1rem', color: '#2D3561', fontFamily: 'inherit', fontWeight: 600,
                      ...S.in,
                    }} />
                </div>
              )}

              {/* Total + botón */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: '1rem', borderTop: '1px solid #D1D5E0', marginBottom: '1rem',
              }}>
                <span style={{ fontWeight: 700, color: '#2D3561' }}>Total</span>
                <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#FF5722' }}>
                  {fmtCOP(cartTotal)}
                </span>
              </div>

              <motion.button whileTap={{ scale: 0.97 }}
                onClick={sendOrder}
                disabled={sending || !mesa.trim()}
                style={{
                  width: '100%', padding: '1rem',
                  backgroundColor: !mesa.trim() ? '#D1D5E0' : '#FF5722',
                  borderRadius: '1rem', border: 'none',
                  color: !mesa.trim() ? '#9CA3AF' : '#fff',
                  fontWeight: 700, fontSize: '1rem', cursor: !mesa.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  ...(!mesa.trim() ? S.in : S.coral),
                }}>
                {sending ? 'Enviando...' : !mesa.trim() ? 'Ingresa tu número de mesa' : `✅ Pedir · ${fmtCOP(cartTotal)}`}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  )
}
