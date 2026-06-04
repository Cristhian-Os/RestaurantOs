/**
 * PublicMenu.tsx v5 — Warm Editorial + Liquid Glass
 * Estética "cálido gastronómico": hero editorial, paleta tierra,
 * liquid glass (Apple) en la cromática flotante (nav, carrito, modales),
 * tarjetas editoriales sólidas para el contenido. Animaciones GPU.
 * Toda la lógica (datos, carrito, scrollspy, tracking, envío) intacta.
 */
import {
  useState, useEffect, useMemo, useCallback, useRef, memo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import { pushNotificationService } from '../services/pushNotificationService'
import type { Dish, DishCategory } from '../types'

const CATEGORY_LABELS: Record<DishCategory | 'all', string> = {
  all:       'Todo',
  especial:  'Especiales',
  principal: 'Principales',
  postre:    'Postres',
  bebida:    'Bebidas',
  entrada:   'Entradas',
}

// Tinte cálido por categoría — da variedad sin romper la paleta
const CAT_TINT: Record<string, string> = {
  entrada:   'var(--w-olive)',
  principal: 'var(--w-terra)',
  postre:    'var(--w-saffron)',
  bebida:    'var(--w-wine)',
  especial:  'var(--w-terra-dk)',
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

// ── Skeleton card (warm) ──────────────────────────────────────────
const SkeletonCard = memo(() => (
  <div style={{ background: 'var(--w-surface)', borderRadius: '1.25rem', padding: '0.75rem', boxShadow: 'var(--w-shadow-sm)' }}>
    <div className="skeleton" style={{ width: '100%', height: 120, borderRadius: '0.875rem', marginBottom: '0.75rem' }} />
    <div className="skeleton" style={{ width: '70%', height: 16, borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
    <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: '0.5rem', marginBottom: '0.75rem' }} />
    <div className="skeleton" style={{ width: '38%', height: 20, borderRadius: '0.5rem' }} />
  </div>
))
SkeletonCard.displayName = 'SkeletonCard'

// ── Image / editorial fallback ────────────────────────────────────
const DishImage = memo(({ dish, height }: { dish: Dish; height: number }) => {
  if (dish.image_url) {
    return (
      <div style={{ width: '100%', height, borderRadius: '0.875rem', overflow: 'hidden', position: 'relative' }}>
        <img src={dish.image_url} alt={dish.name} loading="lazy" decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  const tint = CAT_TINT[dish.category] ?? 'var(--w-terra)'
  return (
    <div style={{
      width: '100%', height, borderRadius: '0.875rem', overflow: 'hidden', position: 'relative',
      background: `linear-gradient(150deg, color-mix(in oklch, ${tint} 22%, var(--w-surface)) 0%, var(--w-surface) 75%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontFamily: 'var(--w-display)', fontWeight: 600, fontSize: height > 100 ? '3rem' : '2rem', color: tint, opacity: 0.55, lineHeight: 1 }}>
        {dish.name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
})
DishImage.displayName = 'DishImage'

// ── Customize bottom-sheet (liquid glass) ─────────────────────────
const CustomizeModal = memo(({ dish, onAdd, onClose }: {
  dish:    Dish
  onAdd:   (item: Omit<CartItem, 'uid'>) => void
  onClose: () => void
}) => {
  const [qty,    setQty]    = useState(1)
  const [notes,  setNotes]  = useState('')
  const [size,   setSize]   = useState('')
  const [extras, setExtras] = useState<string[]>([])

  const toggleExtra = (e: string) =>
    setExtras(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 0.9rem', borderRadius: '0.75rem', cursor: 'pointer', fontFamily: 'var(--w-sans)',
    fontWeight: 600, fontSize: '0.8125rem', transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
    border: active ? '1px solid transparent' : '1px solid var(--w-line)',
    background: active ? 'var(--w-terra)' : 'var(--w-surface)',
    color: active ? '#fff' : 'var(--w-ink-soft)',
    boxShadow: active ? 'var(--w-shadow-terra)' : 'none',
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'oklch(0.25 0.03 55 / 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 42, mass: 0.85 }}
        onClick={e => e.stopPropagation()}
        className="lg"
        style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', maxHeight: '88vh', overflowY: 'auto' }}>

        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--w-line)', margin: '0 auto 1.25rem' }} />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, flexShrink: 0 }}><DishImage dish={dish} height={72} /></div>
          <div>
            <h3 className="ed-display" style={{ fontSize: '1.375rem', margin: 0 }}>{dish.name}</h3>
            {dish.description && <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0', color: 'var(--w-ink-mut)' }}>{dish.description}</p>}
            <p style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, color: 'var(--w-terra)', margin: '0.375rem 0 0', fontSize: '1rem' }}>{fmtCOP(dish.price)}</p>
          </div>
        </div>

        {dish.has_sizes && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Tamaño</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {SIZES.map(s => (
                <button key={s} onClick={() => setSize(size === s ? '' : s)} style={{ flex: 1, ...chip(size === s) }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {(dish.tags ?? []).length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Adicionales</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(dish.tags ?? []).map(tag => (
                <button key={tag} onClick={() => toggleExtra(tag)} style={{ borderRadius: '9999px', ...chip(extras.includes(tag)) }}>
                  {extras.includes(tag) ? '✓ ' : '+ '}{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Comentario</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Sin cebolla, término medio, alergia a nueces..."
            rows={2} maxLength={200}
            style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem', border: '1px solid var(--w-line)', outline: 'none', resize: 'none', fontSize: '0.875rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', background: 'var(--w-bg)', borderRadius: '1rem', padding: '0.5rem 0.875rem', border: '1px solid var(--w-line)' }}>
            <button className="w-press" onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 30, height: 30, borderRadius: '0.625rem', border: '1px solid var(--w-line)', background: 'var(--w-surface)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--w-ink)' }}>−</button>
            <span style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, color: 'var(--w-ink)', minWidth: 22, textAlign: 'center' }}>{qty}</span>
            <button className="w-press" onClick={() => setQty(q => q + 1)}
              style={{ width: 30, height: 30, borderRadius: '0.625rem', border: 'none', background: 'var(--w-terra)', color: '#fff', fontWeight: 700, fontSize: '1.125rem' }}>+</button>
          </div>
          <button className="lg-accent w-press"
            onClick={() => { onAdd({ dish, qty, notes, size, extras }); onClose() }}
            style={{ flex: 1, padding: '0.95rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', border: 'none' }}>
            Agregar {qty > 1 ? `×${qty}` : ''} · {fmtCOP(dish.price * qty)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
})
CustomizeModal.displayName = 'CustomizeModal'

// ── Dish card (editorial, solid warm) ─────────────────────────────
const DishCard = memo(({ dish, inCart, onCustomize, index = 0 }: {
  dish:        Dish
  inCart:      number
  onCustomize: () => void
  index?:      number
}) => (
  <div
    className="w-lift w-rise"
    style={{
      background: 'var(--w-surface)', borderRadius: '1.25rem', padding: '0.75rem',
      border: '1px solid var(--w-line)', boxShadow: 'var(--w-shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', cursor: 'pointer',
      animationDelay: `${Math.min(index, 10) * 50}ms`,
    }}
    onClick={onCustomize}>
    <DishImage dish={dish} height={120} />

    <h3 className="ed-display" style={{ fontSize: '1.0625rem', fontWeight: 600, margin: '0.125rem 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as unknown as 'vertical' }}>
      {dish.name}
    </h3>

    {dish.description && (
      <p className="ed-body" style={{ fontSize: '0.75rem', margin: 0, color: 'var(--w-ink-mut)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as unknown as 'vertical' }}>
        {dish.description}
      </p>
    )}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.375rem' }}>
      <span style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, color: 'var(--w-terra)', fontSize: '1.0625rem' }}>{fmtCOP(dish.price)}</span>
      <button className="w-press" aria-label="Agregar"
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: inCart > 0 ? 'var(--w-olive)' : 'var(--w-terra)', color: '#fff',
          fontSize: '1.25rem', fontWeight: 600, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--w-shadow-terra)',
        }}
        onClick={e => { e.stopPropagation(); onCustomize() }}>
        {inCart > 0 ? '✓' : '+'}
      </button>
    </div>

    {inCart > 0 && (
      <div style={{ position: 'absolute', top: '0.625rem', left: '0.625rem', minWidth: 22, height: 22, padding: '0 6px', borderRadius: '9999px', background: 'var(--w-olive)', color: '#fff', fontSize: '0.6875rem', fontWeight: 800, fontFamily: 'var(--w-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--w-shadow-sm)' }}>
        {inCart}
      </div>
    )}
  </div>
))
DishCard.displayName = 'DishCard'

// ── Main ──────────────────────────────────────────────────────────
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
  const [sendError,     setSendError]     = useState<string | null>(null)
  const [customizing,   setCustomizing]   = useState<Dish | null>(null)
  const [orderId,       setOrderId]       = useState<string | null>(null)
  const [orderStatus,   setOrderStatus]   = useState<string | null>(null)
  const [showTracking,  setShowTracking]  = useState(false)

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const scrollingTo = useRef(false)

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
    for (const cat of categories) map.set(cat, dishes.filter(d => d.category === cat))
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
  const canConfirm = mesa.trim() !== '' || clientName.trim() !== ''

  const sendOrder = useCallback(async () => {
    if (!canConfirm || cart.length === 0) return
    setSending(true)
    try {
      const items = cart.map(i => ({
        id: i.dish.id, name: i.dish.name, price: i.dish.price, quantity: i.qty,
        notes: [i.size && `Tamaño: ${i.size}`, ...(i.extras.length ? [`Adicionales: ${i.extras.join(', ')}`] : []), i.notes].filter(Boolean).join(' | ') || null,
      }))
      const tableNum = mesa.trim() ? parseInt(mesa) : null
      const noteParts = [
        clientName.trim() ? `Cliente: ${clientName.trim()}` : null,
        !mesa.trim() ? 'Pedido en mostrador / sin mesa' : null,
      ].filter(Boolean)
      const { data: userData } = await supabase.auth.getUser()
      const { data: newOrder, error } = await supabase.from('orders').insert({
        table_num:     tableNum,
        items:         JSON.stringify(items),
        total:         cartTotal,
        tipo_pedido:   'LOCAL',
        status:        'pending',
        customer_name: clientName.trim() || null,
        notes:         noteParts.length ? noteParts.join(' · ') : null,
        user_id:       userData.user?.id ?? '00000000-0000-0000-0000-000000000000',
      }).select('id').single()

      // Solo confirmamos y vaciamos el carrito si el pedido SE GUARDÓ de verdad
      if (error || !newOrder?.id) {
        throw new Error(error?.message || 'No se pudo registrar el pedido')
      }

      setOrderId(newOrder.id)
      setOrderStatus('pending')
      setShowTracking(true)
      setSent(true)
      setCart([])
      setShowCart(false)
      // Avisar a cocina y admin (push, suena con la app cerrada)
      pushNotificationService.notify(
        ['kitchen', 'admin'],
        'Nuevo pedido',
        tableNum ? `Mesa ${tableNum} hizo un pedido` : `${clientName.trim() || 'Un cliente'} hizo un pedido`,
        '/',
      )
    } catch (e) {
      // Falló (red o servidor): NO perdemos el carrito y avisamos al cliente
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      setSendError(
        offline
          ? 'Parece que no tienes conexión. Tu pedido NO se envió — revisa tu internet e intenta otra vez. Tu carrito sigue aquí.'
          : 'No pudimos enviar tu pedido. Intenta de nuevo o pide ayuda a un mesero. Tu carrito sigue aquí.'
      )
      console.error('Error al enviar pedido:', e)
    } finally { setSending(false) }
  }, [cart, mesa, clientName, cartTotal, canConfirm])

  // ── scrollspy ──────────────────────────────────────────────────
  useEffect(() => {
    if (isSearching) return
    const map = sectionRefs.current
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      entries => {
        if (scrollingTo.current) return
        let best = { cat: '', ratio: 0 }
        entries.forEach(entry => {
          if (entry.intersectionRatio > best.ratio) {
            best = { cat: entry.target.getAttribute('data-cat') ?? '', ratio: entry.intersectionRatio }
          }
        })
        if (best.cat) setActiveCat(best.cat as DishCategory)
      },
      { threshold: [0.1, 0.5], rootMargin: '-15% 0px -55% 0px' }
    )
    map.forEach(el => observerRef.current?.observe(el))
    return () => observerRef.current?.disconnect()
  }, [isSearching, categories])

  const scrollToCategory = (cat: DishCategory | 'all') => {
    if (isSearching) { setActiveCat(cat); return }
    if (cat === 'all') { window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveCat('all'); return }
    const el = sectionRefs.current.get(cat)
    if (!el) return
    scrollingTo.current = true
    setActiveCat(cat)
    const y = el.getBoundingClientRect().top + window.scrollY - 110
    window.scrollTo({ top: y, behavior: 'smooth' })
    setTimeout(() => { scrollingTo.current = false }, 900)
  }

  const setSectionRef = (cat: DishCategory) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(cat, el)
    else    sectionRefs.current.delete(cat)
  }

  const categoryNavItems = [{ key: 'all' as const, label: 'Todo' }, ...categories.map(c => ({ key: c, label: CATEGORY_LABELS[c] ?? c }))]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--w-bg)', fontFamily: 'var(--w-sans)', paddingBottom: '6rem' }}>

      {/* ── Editorial hero ── */}
      <header className="menu-wrap" style={{ position: 'relative', padding: '2.25rem 1.5rem 1.5rem', margin: '0 auto', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <span className="ed-kicker">Menú</span>
            <div style={{ flex: 1, height: 1, background: 'var(--w-line)' }} />
            {mesa && <span className="ed-kicker" style={{ color: 'var(--w-ink-mut)' }}>Mesa {mesa}</span>}
          </div>
          <h1 className="ed-display" style={{ fontSize: 'clamp(2.5rem, 11vw, 4.25rem)', fontWeight: 600, margin: 0 }}>
            {bizName}
          </h1>
          <p className="ed-body" style={{ marginTop: '0.75rem', fontSize: '0.9375rem', color: 'var(--w-ink-mut)', maxWidth: '34ch' }}>
            Elige tus platos favoritos y pide directo desde tu mesa.
          </p>
        </motion.div>
      </header>

      {/* ── Sticky category nav (liquid glass) ── */}
      <div className="menu-wrap" style={{ position: 'sticky', top: 12, zIndex: 30, padding: '0 1rem', margin: '0.5rem auto 1.5rem' }}>
        <div className="lg no-scrollbar" style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', padding: '0.5rem', borderRadius: '1rem' }}>
          {categoryNavItems.map(({ key, label }) => {
            const active = activeCat === key
            return (
              <button key={key} onClick={() => scrollToCategory(key)}
                style={{
                  flexShrink: 0, padding: '0.5rem 0.95rem', borderRadius: '0.75rem',
                  border: 'none', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'var(--w-sans)',
                  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                  background: active ? 'var(--w-terra)' : 'transparent',
                  color: active ? '#fff' : 'var(--w-ink-soft)',
                  boxShadow: active ? 'var(--w-shadow-terra)' : 'none',
                }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="menu-wrap" style={{ padding: '0 1.5rem', margin: '0 auto' }}>

        {/* ── Order tracking ── */}
        <AnimatePresence>
          {showTracking && orderId && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--w-surface)', borderRadius: '1.25rem', border: '1px solid var(--w-line)', boxShadow: 'var(--w-shadow-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <p className="ed-kicker">Tu pedido</p>
                <button onClick={() => setShowTracking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-ink-mut)', fontSize: '1.125rem' }}>✕</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: '1rem' }}>
                {[{ key: 'pending', label: 'Recibido' }, { key: 'cooking', label: 'En cocina' }, { key: 'ready', label: 'Listo' }, { key: 'completed', label: 'Entregado' }].map((step, i, arr) => {
                  const order   = ['pending', 'cooking', 'ready', 'completed']
                  const current = order.indexOf(orderStatus ?? 'pending')
                  const stepIdx = order.indexOf(step.key)
                  const done    = stepIdx <= current
                  const active  = stepIdx === current
                  return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                        <motion.div animate={active ? { scale: [1, 1.18, 1] } : {}} transition={{ repeat: active ? Infinity : 0, duration: 1.6, ease: 'easeInOut' }}
                          style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 800, color: done ? '#fff' : 'var(--w-ink-mut)', background: done ? (active ? 'var(--w-terra)' : 'var(--w-olive)') : 'var(--w-bg)', border: done ? 'none' : '1px solid var(--w-line)' }}>
                          {done && !active ? '✓' : stepIdx + 1}
                        </motion.div>
                        <p style={{ fontSize: '0.625rem', fontWeight: 700, color: done ? 'var(--w-ink)' : 'var(--w-ink-mut)', margin: 0, textAlign: 'center' }}>{step.label}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ flex: 1, height: 2, borderRadius: 2, margin: '0 0.25rem 1.125rem', background: current > stepIdx ? 'var(--w-olive)' : 'var(--w-line)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.875rem 1rem', border: '1px solid var(--w-line)' }}>
                <p style={{ fontWeight: 500, color: 'var(--w-ink)', margin: 0, fontSize: '0.875rem' }}>
                  {orderStatus === 'pending'   && 'Tu pedido fue recibido. Pronto comenzamos a prepararlo.'}
                  {orderStatus === 'cooking'   && 'Estamos preparando tu pedido. Ya casi está.'}
                  {orderStatus === 'ready'     && 'Tu pedido está listo. El mesero te lo llevará enseguida.'}
                  {orderStatus === 'completed' && 'Buen provecho. Esperamos que lo disfrutes.'}
                  {orderStatus === 'cancelled' && 'Tu pedido fue cancelado. Consulta con el mesero.'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success banner ── */}
        <AnimatePresence>
          {sent && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: 'color-mix(in oklch, var(--w-olive) 14%, var(--w-surface))', border: '1px solid var(--w-olive)', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--w-display)', fontWeight: 600, color: 'var(--w-ink)', margin: 0, fontSize: '1.0625rem' }}>Pedido enviado a cocina</p>
                <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0.125rem 0 0', color: 'var(--w-ink-mut)' }}>En breve lo estaremos preparando.</p>
              </div>
              <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-ink-mut)', fontSize: '1.125rem' }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginBottom: '1.75rem' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en el menú..."
            style={{ width: '100%', background: 'var(--w-surface)', borderRadius: '1rem', padding: '0.875rem 1.125rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.9375rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box', boxShadow: 'var(--w-shadow-sm)' }} />
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="menu-grid">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isSearching ? (
          filteredFlat.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <p className="ed-display" style={{ fontSize: '1.5rem', color: 'var(--w-ink-mut)', margin: 0 }}>Sin resultados</p>
              <p className="ed-body" style={{ color: 'var(--w-ink-mut)', marginTop: '0.5rem' }}>No encontramos ese plato.</p>
            </div>
          ) : (
            <div className="menu-grid">
              {filteredFlat.map((dish, i) => {
                const inCart = cart.filter(ci => ci.dish.id === dish.id).reduce((s, ci) => s + ci.qty, 0)
                return <DishCard key={dish.id} dish={dish} inCart={inCart} onCustomize={() => setCustomizing(dish)} index={i} />
              })}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {categories.map(cat => {
              const catDishes = dishesByCategory.get(cat) ?? []
              if (catDishes.length === 0) return null
              return (
                <section key={cat} ref={setSectionRef(cat)} data-cat={cat}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.125rem' }}>
                    <h2 className="ed-display" style={{ fontSize: '1.625rem', fontWeight: 600, margin: 0 }}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </h2>
                    <div style={{ flex: 1, height: 1, background: 'var(--w-line)' }} />
                    <span className="ed-kicker" style={{ color: 'var(--w-ink-mut)' }}>{catDishes.length}</span>
                  </div>
                  <div className="menu-grid">
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

      {/* ── Floating cart (liquid glass accent) ── */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCart(true)}
            className="lg-accent"
            style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1.5rem', border: 'none', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', fontFamily: 'var(--w-sans)', whiteSpace: 'nowrap' }}>
            <motion.span key={cartCount} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}
              style={{ minWidth: 24, height: 24, padding: '0 7px', borderRadius: '9999px', background: '#fff', color: 'var(--w-terra)', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cartCount}
            </motion.span>
            <span>Ver pedido</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{fmtCOP(cartTotal)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Customize modal ── */}
      <AnimatePresence>
        {customizing && <CustomizeModal dish={customizing} onAdd={addToCart} onClose={() => setCustomizing(null)} />}
      </AnimatePresence>

      {/* ── Cart bottom-sheet (liquid glass) ── */}
      <AnimatePresence>
        {showCart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCart(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'oklch(0.25 0.03 55 / 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 480, damping: 42, mass: 0.85 }}
              onClick={e => e.stopPropagation()}
              className="lg"
              style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', maxHeight: '88vh', overflowY: 'auto' }}>

              <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--w-line)', margin: '0 auto 1.25rem' }} />
              <h3 className="ed-display" style={{ fontWeight: 600, fontSize: '1.5rem', margin: '0 0 1.25rem' }}>Tu pedido</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {cart.map(item => (
                  <div key={item.uid} style={{ background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.875rem 1rem', border: '1px solid var(--w-line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: '0.5rem', background: 'var(--w-terra)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{item.qty}</span>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--w-ink)', fontSize: '0.9375rem', margin: 0, fontFamily: 'var(--w-display)' }}>{item.dish.name}</p>
                          {item.size && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>Tamaño: {item.size}</p>}
                          {item.extras.length > 0 && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>+ {item.extras.join(', ')}</p>}
                          {item.notes && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>Nota: {item.notes}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <p style={{ fontWeight: 700, color: 'var(--w-ink)', fontSize: '0.875rem', margin: 0, fontFamily: 'var(--w-sans)' }}>{fmtCOP(item.dish.price * item.qty)}</p>
                        <button onClick={() => removeCartItem(item.uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-wine)', fontSize: '1rem', padding: 0 }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: mesa ? '1fr' : '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {!mesa && (
                  <div>
                    <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>Mesa</label>
                    <input type="number" value={mesa} onChange={e => setMesa(e.target.value)} placeholder="Nº"
                      style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem 1rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '1rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontWeight: 600, textAlign: 'center', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ gridColumn: mesa ? '1 / -1' : undefined }}>
                  <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>Tu nombre</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ej: María"
                    style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem 1rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.9375rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
                </div>
              </div>

              {!canConfirm && (
                <p className="ed-body" style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', marginBottom: '1rem', textAlign: 'center' }}>
                  Ingresa tu <strong style={{ color: 'var(--w-ink)' }}>nombre</strong> o el número de <strong style={{ color: 'var(--w-ink)' }}>mesa</strong> para continuar
                </p>
              )}
              {canConfirm && !mesa.trim() && clientName.trim() && (
                <p style={{ fontSize: '0.75rem', color: 'var(--w-olive)', marginBottom: '1rem', textAlign: 'center', fontWeight: 700 }}>
                  ✓ Pedido a nombre de {clientName.trim()}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '1rem', borderTop: '1px solid var(--w-line)', marginBottom: '1.25rem' }}>
                <span className="ed-kicker">Total</span>
                <span className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', color: 'var(--w-terra)' }}>{fmtCOP(cartTotal)}</span>
              </div>

              {sendError && (
                <div style={{ background: 'color-mix(in oklch, var(--w-wine) 12%, var(--w-surface))', border: '1px solid var(--w-wine)', color: 'var(--w-wine)', borderRadius: '0.875rem', padding: '0.75rem 1rem', marginBottom: '0.875rem', fontSize: '0.8125rem', fontWeight: 500 }}>
                  {sendError}
                </div>
              )}

              <button className="lg-accent w-press"
                onClick={() => { setSendError(null); sendOrder() }} disabled={sending || !canConfirm}
                style={{ width: '100%', padding: '1.05rem', border: 'none', fontWeight: 700, fontSize: '1rem', fontFamily: 'var(--w-sans)', cursor: !canConfirm ? 'not-allowed' : 'pointer', opacity: !canConfirm ? 0.5 : 1 }}>
                {sending ? 'Enviando...' : !canConfirm ? 'Ingresa nombre o mesa' : `Pedir · ${fmtCOP(cartTotal)}`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
