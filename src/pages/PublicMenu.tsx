/**
 * PublicMenu.tsx v4 — Liquid Glass Edition
 * ✓ Floating FAB cart button (fixed bottom-right, animated badge)
 * ✓ Sticky category nav bar with scrollspy (IntersectionObserver)
 * ✓ All dishes shown in sections; search reverts to flat list
 * ✓ Skeleton loading cards
 * ✓ Glass-morphism dish cards
 * ✓ Dark / light theme via CSS custom properties
 * ✓ Real-time order tracking
 * ✓ CustomizeModal (tamaños, toppings, notas, qty)
 */
import {
  useState, useEffect, useMemo, useCallback, useRef, memo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import type { Dish, DishCategory } from '../types'

// ── Theme-aware shadow helpers ────────────────────────────────────
const S = {
  out:   'var(--shadow-out,   8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55))',
  outSm: 'var(--shadow-out-sm,4px 4px 10px rgba(130,142,170,0.5), -4px -4px 10px rgba(255,255,255,0.5))',
  in:    'var(--shadow-in,    inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5))',
  inSm:  'var(--shadow-in-sm, inset 3px 3px 6px rgba(130,142,170,0.45),inset -3px -3px 6px rgba(255,255,255,0.45))',
  coral: 'var(--shadow-coral, 8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45))',
}

const CATEGORY_LABELS: Record<DishCategory | 'all', string> = {
  all:       '✨ Todo',
  especial:  '⭐ Especiales',
  principal: '🍽️ Principales',
  postre:    '🍰 Postres',
  bebida:    '🥤 Bebidas',
  entrada:   '🥗 Entradas',
}

const SIZES = ['Pequeño', 'Mediano', 'Grande']

function fmtCOP(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

interface CartItem {
  uid:    string
  dish:   Dish
  qty:    number
  notes:  string
  size:   string
  extras: string[]
}

// ── Skeleton card ─────────────────────────────────────────────────
const SkeletonCard = memo(() => {
  const bg     = 'var(--bg, #D8DAE4)'
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  return (
    <div style={{ backgroundColor: bg, borderRadius: '1.25rem', padding: '1rem', boxShadow: S.out }}>
      <div className="skeleton" style={{ width: '100%', height: 80, borderRadius: '0.875rem', marginBottom: '0.75rem', backgroundColor: bgSurf }} />
      <div className="skeleton" style={{ width: '75%', height: 14, borderRadius: '0.5rem', marginBottom: '0.375rem', backgroundColor: bgSurf }} />
      <div className="skeleton" style={{ width: '50%', height: 11, borderRadius: '0.5rem', marginBottom: '0.625rem', backgroundColor: bgSurf }} />
      <div className="skeleton" style={{ width: '40%', height: 18, borderRadius: '0.5rem', marginBottom: '0.75rem', backgroundColor: bgSurf }} />
      <div className="skeleton" style={{ width: '100%', height: 34, borderRadius: '0.75rem', backgroundColor: bgSurf }} />
    </div>
  )
})
SkeletonCard.displayName = 'SkeletonCard'

// ── Customize bottom-sheet ────────────────────────────────────────
const CustomizeModal = memo(({ dish, onAdd, onClose }: {
  dish:   Dish
  onAdd:  (item: Omit<CartItem, 'uid'>) => void
  onClose: () => void
}) => {
  const [qty,    setQty]    = useState(1)
  const [notes,  setNotes]  = useState('')
  const [size,   setSize]   = useState('')
  const [extras, setExtras] = useState<string[]>([])

  const bg     = 'var(--bg, #D8DAE4)'
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  const txt    = 'var(--text-primary, #2D3561)'
  const txtMut = 'var(--text-muted, #8B92AA)'
  const acc    = 'var(--accent, #FF5722)'

  const toggleExtra = (e: string) =>
    setExtras(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, backgroundColor: 'rgba(45,53,97,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'Nunito, sans-serif' }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
        onClick={e => e.stopPropagation()}
        className="glass-modal"
        style={{ width: '100%', maxWidth: 480, borderRadius: '1.5rem 1.5rem 0 0', padding: '1.5rem', maxHeight: '88vh', overflowY: 'auto' }}>

        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'var(--divider)', margin: '0 auto 1.25rem' }} />

        {/* Dish header */}
        <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '1rem', overflow: 'hidden', flexShrink: 0, backgroundColor: bgSurf, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: S.in }}>
            {dish.image_url
              ? <img src={dish.image_url} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '2rem' }}>🍽️</span>
            }
          </div>
          <div>
            <p style={{ fontWeight: 700, color: txt, fontSize: '1.0625rem', margin: 0 }}>{dish.name}</p>
            {dish.description && <p style={{ fontSize: '0.8125rem', color: txtMut, margin: '0.125rem 0 0' }}>{dish.description}</p>}
            <p style={{ fontWeight: 700, color: acc, margin: '0.25rem 0 0' }}>{fmtCOP(dish.price)} c/u</p>
          </div>
        </div>

        {/* Sizes */}
        {dish.has_sizes && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: txtMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Tamaño</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {SIZES.map(s => (
                <button key={s} onClick={() => setSize(size === s ? '' : s)}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '0.75rem', border: 'none', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: size === s ? S.coral : S.outSm, backgroundColor: size === s ? acc : bg, color: size === s ? '#fff' : txt }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Extras/toppings */}
        {(dish.tags ?? []).length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: txtMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Adicionales / Toppings</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(dish.tags ?? []).map(tag => (
                <button key={tag} onClick={() => toggleExtra(tag)}
                  style={{ padding: '0.375rem 0.75rem', borderRadius: '9999px', border: 'none', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: extras.includes(tag) ? S.coral : S.outSm, backgroundColor: extras.includes(tag) ? acc : bg, color: extras.includes(tag) ? '#fff' : txt }}>
                  {extras.includes(tag) ? '✓ ' : '+ '}{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: txtMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Comentario (opcional)</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Sin cebolla, término medio, alergia a nueces..."
            rows={2} maxLength={200}
            style={{ width: '100%', backgroundColor: bgSurf, borderRadius: '0.875rem', padding: '0.75rem', border: 'none', outline: 'none', resize: 'none', fontSize: '0.875rem', color: txt, fontFamily: 'inherit', boxShadow: S.in, boxSizing: 'border-box' }} />
        </div>

        {/* Qty + add button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: bgSurf, borderRadius: '1rem', padding: '0.5rem 0.75rem', boxShadow: S.in }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 28, height: 28, borderRadius: '0.5rem', border: 'none', backgroundColor: bg, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: S.outSm, color: txt }}>−</button>
            <span style={{ fontWeight: 700, color: txt, minWidth: 24, textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(q => q + 1)}
              style={{ width: 28, height: 28, borderRadius: '0.5rem', border: 'none', backgroundColor: acc, color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: S.coral }}>+</button>
          </div>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => { onAdd({ dish, qty, notes, size, extras }); onClose() }}
            style={{ flex: 1, padding: '0.875rem', backgroundColor: acc, borderRadius: '1rem', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: S.coral }}>
            ✅ Agregar {qty > 1 ? `×${qty}` : ''} · {fmtCOP(dish.price * qty)}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
})
CustomizeModal.displayName = 'CustomizeModal'

// ── Dish card (Liquid Glass — CSS hover, no JS animation overhead) ──
const DishCard = memo(({ dish, inCart, onCustomize, index = 0 }: {
  dish:        Dish
  inCart:      number
  onCustomize: () => void
  index?:      number
}) => {
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  const txt    = 'var(--text-primary, #2D3561)'
  const txtMut = 'var(--text-muted, #8B92AA)'
  const acc    = 'var(--accent, #FF5722)'

  const FALLBACK_EMOJI: Record<DishCategory | string, string> = {
    bebida: '🥤', postre: '🍰', especial: '⭐', entrada: '🥗', principal: '🍽️',
  }

  return (
    <div
      className="glass-card dish-card dish-enter"
      style={{
        padding: '1rem',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        position: 'relative',
        animationDelay: `${Math.min(index, 10) * 55}ms`,
      }}
      onClick={onCustomize}>
      {/* Image area */}
      <div style={{ width: '100%', height: 82, borderRadius: '0.875rem', overflow: 'hidden', backgroundColor: bgSurf, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: S.in, flexShrink: 0 }}>
        {dish.image_url
          ? <img src={dish.image_url} alt={dish.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: '2.25rem' }}>{FALLBACK_EMOJI[dish.category] ?? '🍽️'}</span>
        }
      </div>
      {/* Name */}
      <p style={{ fontWeight: 700, color: txt, fontSize: '0.875rem', margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as unknown as 'vertical' }}>
        {dish.name}
      </p>
      {/* Description */}
      {dish.description && (
        <p style={{ fontSize: '0.6875rem', color: txtMut, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as unknown as 'vertical' }}>
          {dish.description}
        </p>
      )}
      {/* Price */}
      <p style={{ fontWeight: 700, color: acc, fontSize: '1rem', margin: 0 }}>{fmtCOP(dish.price)}</p>
      {/* Add button */}
      <button
        style={{ width: '100%', padding: '0.5625rem', borderRadius: '0.75rem', border: 'none', backgroundColor: acc, color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: S.coral, transition: 'transform 0.12s ease' }}
        onMouseDown={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)' }}
        onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
      >
        {inCart > 0 ? `✓ En pedido (${inCart})` : '+ Agregar'}
      </button>
      {/* In-cart badge */}
      {inCart > 0 && (
        <div style={{ position: 'absolute', top: '0.625rem', right: '0.625rem', width: 20, height: 20, borderRadius: '50%', backgroundColor: acc, color: '#fff', fontSize: '0.625rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: S.coral }}>
          {inCart}
        </div>
      )}
    </div>
  )
})
DishCard.displayName = 'DishCard'

// ── Main component ────────────────────────────────────────────────
export default function PublicMenu() {
  const [dishes,        setDishes]        = useState<Dish[]>([])
  const [loading,       setLoading]       = useState(true)
  const [bizName,       setBizName]       = useState('RestaurantOS')
  const [activeCat,     setActiveCat]     = useState<DishCategory | 'all'>('all')
  const [search,        setSearch]        = useState('')
  const [cart,          setCart]          = useState<CartItem[]>([])
  const [mesa,          setMesa]          = useState('')
  const [clientName,    setClientName]    = useState('')
  const [showCart,      setShowCart]      = useState(false)
  const [sent,          setSent]          = useState(false)
  const [sending,       setSending]       = useState(false)
  const [customizing,   setCustomizing]   = useState<Dish | null>(null)
  const [orderId,       setOrderId]       = useState<string | null>(null)
  const [orderStatus,   setOrderStatus]   = useState<string | null>(null)
  const [showTracking,  setShowTracking]  = useState(false)

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const scrollingTo  = useRef(false) // prevents observer from firing during programmatic scroll

  // ── theme vars ─────────────────────────────────────────────────
  const bg     = 'var(--bg, #D8DAE4)'
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  const txt    = 'var(--text-primary, #2D3561)'
  const txtSec = 'var(--text-secondary, #5A617A)'
  const txtMut = 'var(--text-muted, #8B92AA)'
  const acc    = 'var(--accent, #FF5722)'

  // ── URL params ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('mesa')
    if (m) setMesa(m)
  }, [])

  // ── data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('dishes').select('*').eq('available', true)
        .neq('availability_status', 'discontinued').order('sort_order').order('name'),
      supabase.from('restaurant_config').select('display_name').single(),
    ]).then(([dr, cr]) => {
      setDishes(dr.data || [])
      if (cr.data?.display_name) setBizName(cr.data.display_name)
      setLoading(false)
    })
  }, [])

  // ── real-time order tracking ───────────────────────────────────
  useEffect(() => {
    if (!orderId) return
    const ch = supabase.channel(`order-track-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const s = (payload.new as { status: string }).status
          if (s) setOrderStatus(s)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orderId])

  // ── derived state ──────────────────────────────────────────────
  const categories = useMemo(() =>
    Array.from(new Set(dishes.map(d => d.category))) as DishCategory[]
  , [dishes])

  const isSearching = search.trim().length > 0

  const filteredFlat = useMemo(() => {
    if (!isSearching) return []
    const q = search.toLowerCase()
    return dishes.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
  }, [dishes, search, isSearching])

  const dishesByCategory = useMemo(() => {
    const map = new Map<DishCategory, Dish[]>()
    for (const cat of categories) {
      map.set(cat, dishes.filter(d => d.category === cat))
    }
    return map
  }, [dishes, categories])

  const cartTotal = cart.reduce((s, i) => s + i.dish.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  // ── cart actions ───────────────────────────────────────────────
  const addToCart = useCallback((item: Omit<CartItem, 'uid'>) => {
    setCart(prev => [...prev, { uid: crypto.randomUUID(), ...item }])
  }, [])

  const removeCartItem = useCallback((uid: string) => {
    setCart(prev => prev.filter(i => i.uid !== uid))
  }, [])

  // ── send order ─────────────────────────────────────────────────
  const sendOrder = useCallback(async () => {
    if (!mesa.trim() || cart.length === 0) return
    setSending(true)
    try {
      const items = cart.map(i => ({
        id: i.dish.id, name: i.dish.name, price: i.dish.price, quantity: i.qty,
        notes: [i.size && `Tamaño: ${i.size}`, ...(i.extras.length ? [`Adicionales: ${i.extras.join(', ')}`] : []), i.notes].filter(Boolean).join(' | ') || null,
      }))
      const { data: newOrder } = await supabase.from('orders').insert({
        table_num:     parseInt(mesa),
        items:         JSON.stringify(items),
        total:         cartTotal,
        tipo_pedido:   'LOCAL',
        status:        'pending',
        customer_name: clientName.trim() || null,
        notes:         clientName.trim() ? `Cliente: ${clientName.trim()}` : null,
        user_id:       (await supabase.auth.getUser()).data.user?.id ?? '00000000-0000-0000-0000-000000000000',
      }).select('id').single()

      if (newOrder?.id) {
        setOrderId(newOrder.id)
        setOrderStatus('pending')
        setShowTracking(true)
      }
      setSent(true); setCart([]); setShowCart(false)
    } finally { setSending(false) }
  }, [cart, mesa, clientName, cartTotal])

  // ── scrollspy setup (only when not searching) ─────────────────
  useEffect(() => {
    if (isSearching) return
    const map = sectionRefs.current

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      entries => {
        if (scrollingTo.current) return
        // pick the section with most intersection ratio
        let best: { cat: string; ratio: number } = { cat: '', ratio: 0 }
        entries.forEach(entry => {
          if (entry.intersectionRatio > best.ratio) {
            best = { cat: entry.target.getAttribute('data-cat') ?? '', ratio: entry.intersectionRatio }
          }
        })
        if (best.cat) setActiveCat(best.cat as DishCategory)
      },
      { threshold: [0.1, 0.5], rootMargin: '-10% 0px -55% 0px' }
    )

    map.forEach(el => observerRef.current?.observe(el))
    return () => observerRef.current?.disconnect()
  }, [isSearching, categories])

  // ── scroll to section ──────────────────────────────────────────
  const scrollToCategory = (cat: DishCategory | 'all') => {
    if (isSearching) { setActiveCat(cat); return }
    if (cat === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setActiveCat('all')
      return
    }
    const el = sectionRefs.current.get(cat)
    if (!el) return
    scrollingTo.current = true
    setActiveCat(cat)
    const y = el.getBoundingClientRect().top + window.scrollY - 120
    window.scrollTo({ top: y, behavior: 'smooth' })
    setTimeout(() => { scrollingTo.current = false }, 1000)
  }

  // ── section ref callback ───────────────────────────────────────
  const setSectionRef = (cat: DishCategory) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(cat, el)
    else    sectionRefs.current.delete(cat)
  }

  // ── render ─────────────────────────────────────────────────────
  const categoryNavItems = [{ key: 'all' as const, label: '✨ Todo' }, ...categories.map(c => ({ key: c, label: CATEGORY_LABELS[c] ?? c }))]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, fontFamily: 'Nunito, sans-serif', paddingBottom: '6rem' }}>

      {/* ── Sticky header ── */}
      <header className="glass-header" style={{ padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', overflow: 'hidden', flexShrink: 0, boxShadow: S.outSm }}>
            <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1rem', color: txt, margin: 0 }}>{bizName}</h1>
            {mesa && <p style={{ fontSize: '0.6875rem', color: acc, fontWeight: 700, margin: 0 }}>Mesa {mesa}</p>}
          </div>
        </div>
        {/* Desktop cart button */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.button initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.95 }} onClick={() => setShowCart(true)}
              style={{ display: 'none', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', backgroundColor: acc, borderRadius: '1rem', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: S.coral }}
              className="desktop-cart-btn">
              🛒 {cartCount} · {fmtCOP(cartTotal)}
            </motion.button>
          )}
        </AnimatePresence>
      </header>

      {/* ── Sticky category nav ── */}
      <div className="glass-header" style={{ position: 'sticky', top: 64, zIndex: 25, padding: '0.625rem 0', borderTop: 'none' }}>
        <div className="no-scrollbar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1.25rem' }}>
          {categoryNavItems.map(({ key, label }) => (
            <button key={key} onClick={() => scrollToCategory(key)}
              style={{
                flexShrink: 0, padding: '0.4375rem 0.875rem', borderRadius: '9999px',
                border: activeCat === key ? 'none' : '1px solid var(--glass-border-sub)',
                fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                boxShadow: activeCat === key ? S.coral : S.outSm,
                backgroundColor: activeCat === key ? acc : 'var(--glass-bg)',
                color: activeCat === key ? '#fff' : txtSec,
                backdropFilter: 'blur(8px)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '1rem 1.25rem', maxWidth: 680, margin: '0 auto' }}>

        {/* ── Order tracking banner ── */}
        <AnimatePresence>
          {showTracking && orderId && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="glass-card no-hover"
              style={{ marginBottom: '1rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: txt, margin: 0 }}>📋 Estado de tu pedido</p>
                <button onClick={() => setShowTracking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: txtMut, fontSize: '1rem' }}>✕</button>
              </div>
              {/* Progress steps */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '0.875rem' }}>
                {[{ key: 'pending', icon: '📝', label: 'Recibido' }, { key: 'cooking', icon: '🍳', label: 'En cocina' }, { key: 'ready', icon: '✅', label: '¡Listo!' }, { key: 'completed', icon: '🎉', label: 'Entregado' }].map((step, i, arr) => {
                  const order   = ['pending', 'cooking', 'ready', 'completed']
                  const current = order.indexOf(orderStatus ?? 'pending')
                  const stepIdx = order.indexOf(step.key)
                  const done    = stepIdx <= current
                  const active  = stepIdx === current
                  return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <motion.div animate={active ? { scale: [1, 1.15, 1] } : {}} transition={{ repeat: active ? Infinity : 0, duration: 1.5 }}
                          style={{ width: 40, height: 40, borderRadius: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem', backgroundColor: done ? (active ? acc : 'var(--green, #10B981)') : bgSurf, boxShadow: done ? (active ? S.coral : 'var(--shadow-green)') : S.inSm }}>
                          {step.icon}
                        </motion.div>
                        <p style={{ fontSize: '0.5625rem', fontWeight: 700, color: done ? txt : txtMut, margin: 0, textAlign: 'center', lineHeight: 1.2 }}>{step.label}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ flex: 1, height: 3, borderRadius: 2, margin: '0 0.25rem 1.25rem', backgroundColor: current > stepIdx ? 'var(--green, #10B981)' : bgSurf }} />
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ backgroundColor: bgSurf, borderRadius: '1rem', padding: '0.75rem 1rem', boxShadow: S.inSm }}>
                <p style={{ fontWeight: 600, color: txt, margin: 0, fontSize: '0.875rem' }}>
                  {orderStatus === 'pending'   && '⏳ Tu pedido fue recibido. Pronto comenzamos a prepararlo.'}
                  {orderStatus === 'cooking'   && '🍳 ¡Estamos preparando tu pedido! Ya casi está.'}
                  {orderStatus === 'ready'     && '🔔 ¡Tu pedido está listo! El mesero te lo llevará enseguida.'}
                  {orderStatus === 'completed' && '🎉 ¡Buen provecho! Esperamos que lo disfrutes.'}
                  {orderStatus === 'cancelled' && '❌ Tu pedido fue cancelado. Consulta con el mesero.'}
                </p>
              </div>
              {orderStatus === 'ready' && (
                <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <p style={{ fontWeight: 800, color: acc, fontSize: '1rem', margin: 0 }}>🛎️ ¡Pide a un mesero que te traiga tu pedido!</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success banner ── */}
        <AnimatePresence>
          {sent && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ backgroundColor: 'var(--tag-green-bg)', border: '2px solid var(--tag-green-text)', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎉</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, color: 'var(--tag-green-text)', margin: 0 }}>¡Pedido enviado a cocina!</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>En breve lo estaremos preparando.</p>
              </div>
              <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: txtMut, fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en el menú..."
            style={{ width: '100%', backgroundColor: bgSurf, borderRadius: '1rem', paddingLeft: '2.75rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, fontFamily: 'inherit', boxShadow: S.in, boxSizing: 'border-box' }} />
        </div>

        {/* ── Content area ── */}
        {loading ? (
          /* Skeleton grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isSearching ? (
          /* Flat search results */
          filteredFlat.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍦</p>
              <p style={{ color: txtMut, fontWeight: 600 }}>No encontramos ese plato</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {filteredFlat.map((dish, i) => {
                const inCart = cart.filter(ci => ci.dish.id === dish.id).reduce((s, ci) => s + ci.qty, 0)
                return <DishCard key={dish.id} dish={dish} inCart={inCart} onCustomize={() => setCustomizing(dish)} index={i} />
              })}
            </div>
          )
        ) : (
          /* Sectioned view for scrollspy */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {categories.map(cat => {
              const catDishes = dishesByCategory.get(cat) ?? []
              if (catDishes.length === 0) return null
              return (
                <section key={cat} ref={setSectionRef(cat)} data-cat={cat}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{CATEGORY_LABELS[cat]?.split(' ')[0]}</span>
                    <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.0625rem', color: txt, margin: 0 }}>
                      {CATEGORY_LABELS[cat]?.split(' ').slice(1).join(' ') ?? cat}
                    </h2>
                    <div style={{ flex: 1, height: 1, backgroundColor: bgSurf, borderRadius: 1 }} />
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: txtMut }}>{catDishes.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    {catDishes.map((dish, i) => {
                      const inCart = cart.filter(ci => ci.dish.id === dish.id).reduce((s, ci) => s + ci.qty, 0)
                      return <DishCard key={dish.id} dish={dish} inCart={inCart} onCustomize={() => setCustomizing(dish)} index={i} />
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Floating FAB cart button ── */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCart(true)}
            style={{ position: 'fixed', bottom: '1.5rem', right: '1.25rem', zIndex: 50, display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.25rem', backgroundColor: acc, borderRadius: '1rem', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: S.coral }}>
            <span style={{ fontSize: '1.25rem' }}>🛒</span>
            <span>{fmtCOP(cartTotal)}</span>
            {/* Count badge */}
            <motion.span
              key={cartCount}
              initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}
              style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, backgroundColor: '#fff', color: acc, borderRadius: '50%', fontSize: '0.6875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(255,87,34,0.4)' }}>
              {cartCount}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Customize modal ── */}
      <AnimatePresence>
        {customizing && (
          <CustomizeModal dish={customizing} onAdd={addToCart} onClose={() => setCustomizing(null)} />
        )}
      </AnimatePresence>

      {/* ── Cart bottom-sheet ── */}
      <AnimatePresence>
        {showCart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCart(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(45,53,97,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
              onClick={e => e.stopPropagation()}
              className="glass-modal"
              style={{ width: '100%', maxWidth: 480, borderRadius: '1.5rem 1.5rem 0 0', padding: '1.5rem', maxHeight: '88vh', overflowY: 'auto' }}>

              {/* Drag handle */}
              <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'var(--divider)', margin: '0 auto 1.25rem' }} />
              <h3 style={{ fontWeight: 700, color: txt, fontSize: '1.125rem', margin: '0 0 1rem', fontFamily: 'DM Sans, sans-serif' }}>🛒 Tu pedido</h3>

              {/* Cart items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {cart.map(item => (
                  <div key={item.uid} style={{ backgroundColor: bgSurf, borderRadius: '0.875rem', padding: '0.75rem 1rem', boxShadow: S.inSm }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '0.375rem', backgroundColor: acc, color: '#fff', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{item.qty}</span>
                        <div>
                          <p style={{ fontWeight: 600, color: txt, fontSize: '0.875rem', margin: 0 }}>{item.dish.name}</p>
                          {item.size && <p style={{ fontSize: '0.6875rem', color: txtMut, margin: 0 }}>📏 {item.size}</p>}
                          {item.extras.length > 0 && <p style={{ fontSize: '0.6875rem', color: txtMut, margin: 0 }}>➕ {item.extras.join(', ')}</p>}
                          {item.notes && <p style={{ fontSize: '0.6875rem', color: txtMut, margin: 0 }}>📝 {item.notes}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <p style={{ fontWeight: 700, color: txt, fontSize: '0.875rem', margin: 0 }}>{fmtCOP(item.dish.price * item.qty)}</p>
                        <button onClick={() => removeCartItem(item.uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '1rem', padding: 0 }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mesa + nombre */}
              <div style={{ display: 'grid', gridTemplateColumns: mesa ? '1fr' : '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                {!mesa && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: txtMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem' }}>Mesa *</label>
                    <input type="number" value={mesa} onChange={e => setMesa(e.target.value)}
                      placeholder="Nº"
                      style={{ width: '100%', backgroundColor: bgSurf, borderRadius: '0.875rem', padding: '0.75rem 1rem', border: 'none', outline: 'none', fontSize: '1rem', color: txt, fontFamily: 'inherit', fontWeight: 600, textAlign: 'center', boxShadow: S.in, boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ gridColumn: mesa ? '1 / -1' : undefined }}>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: txtMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem' }}>Tu nombre (opcional)</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                    placeholder="Ej: María"
                    style={{ width: '100%', backgroundColor: bgSurf, borderRadius: '0.875rem', padding: '0.75rem 1rem', border: 'none', outline: 'none', fontSize: '0.9375rem', color: txt, fontFamily: 'inherit', boxShadow: S.in, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: `1px solid ${bgSurf}`, marginBottom: '1rem' }}>
                <span style={{ fontWeight: 700, color: txt }}>Total</span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: acc }}>{fmtCOP(cartTotal)}</span>
              </div>

              <motion.button whileTap={{ scale: 0.97 }}
                onClick={sendOrder} disabled={sending || !mesa.trim()}
                style={{ width: '100%', padding: '1rem', borderRadius: '1rem', border: 'none', backgroundColor: !mesa.trim() ? bgSurf : acc, color: !mesa.trim() ? txtMut : '#fff', fontWeight: 700, fontSize: '1rem', cursor: !mesa.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: !mesa.trim() ? S.inSm : S.coral }}>
                {sending ? 'Enviando...' : !mesa.trim() ? 'Ingresa tu número de mesa' : `✅ Pedir · ${fmtCOP(cartTotal)}`}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .desktop-cart-btn { display: none !important; }
        @media (min-width: 640px) { .desktop-cart-btn { display: flex !important; } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
