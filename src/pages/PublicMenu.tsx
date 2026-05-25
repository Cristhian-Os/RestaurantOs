/**
 * PublicMenu.tsx v3
 * - Nombre del cliente (junto con la mesa)
 * - Toppings / adicionales por plato (desde dish.tags como opciones)
 * - Notas por item (comentarios del cliente)
 * - Tamaños si aplica
 * - Mismo plato 2 veces → cada uno con su propia personalización
 */
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import type { Dish, DishCategory } from '../types'

const S = {
  out:   { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  outSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  in:    { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

const CATEGORY_LABELS: Record<DishCategory | 'all', string> = {
  all: '✨ Todo', especial: '⭐ Especiales', principal: '🍽️ Principales',
  postre: '🍰 Postres', bebida: '🥤 Bebidas', entrada: '🥗 Entradas',
}

const SIZES = ['Pequeño', 'Mediano', 'Grande']

function fmtCOP(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

// Cada item del carrito tiene su propio UUID para poder tener el mismo plato 2 veces
interface CartItem {
  uid:     string   // UUID único del item (no el del plato)
  dish:    Dish
  qty:     number
  notes:   string
  size:    string   // '' = sin tamaño
  extras:  string[] // toppings/adicionales seleccionados
}

// Modal de personalización de un plato
const CustomizeModal = memo(({ dish, onAdd, onClose }: {
  dish: Dish
  onAdd: (item: Omit<CartItem, 'uid'>) => void
  onClose: () => void
}) => {
  const [qty,    setQty]    = useState(1)
  const [notes,  setNotes]  = useState('')
  const [size,   setSize]   = useState('')
  const [extras, setExtras] = useState<string[]>([])

  const toggleExtra = (e: string) =>
    setExtras(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])

  const hasOptions = (dish.tags ?? []).length > 0

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:80, backgroundColor:'rgba(45,53,97,0.5)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'flex-end', justifyContent:'center', fontFamily:'Nunito,sans-serif' }}>
      <motion.div
        initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
        transition={{ type:'spring', stiffness:400, damping:35 }}
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, backgroundColor:'#D8DAE4', borderRadius:'1.5rem 1.5rem 0 0',
          padding:'1.5rem', maxHeight:'85vh', overflowY:'auto',
          boxShadow:'0 -8px 32px rgba(130,142,170,0.4)' }}>

        <div style={{ width:40, height:4, borderRadius:2, backgroundColor:'#CDD0DC', margin:'0 auto 1.25rem' }} />

        {/* Imagen y nombre */}
        <div style={{ display:'flex', gap:'0.875rem', marginBottom:'1.25rem', alignItems:'center' }}>
          <div style={{ width:64, height:64, borderRadius:'1rem', overflow:'hidden', flexShrink:0,
            backgroundColor:'#CDD0DC', display:'flex', alignItems:'center', justifyContent:'center', ...S.in }}>
            {dish.image_url
              ? <img src={dish.image_url} alt={dish.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <span style={{ fontSize:'2rem' }}>🍽️</span>
            }
          </div>
          <div>
            <p style={{ fontWeight:700, color:'#2D3561', fontSize:'1.0625rem', margin:0 }}>{dish.name}</p>
            {dish.description && <p style={{ fontSize:'0.8125rem', color:'#8B92AA', margin:0, marginTop:2 }}>{dish.description}</p>}
            <p style={{ fontWeight:700, color:'#FF5722', margin:0, marginTop:4 }}>{fmtCOP(dish.price)} c/u</p>
          </div>
        </div>

        {/* Tamaño */}
        <div style={{ marginBottom:'1rem' }}>
          <p style={{ fontSize:'0.75rem', fontWeight:700, color:'#8B92AA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
            Tamaño (opcional)
          </p>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            {SIZES.map(s => (
              <button key={s} onClick={() => setSize(size === s ? '' : s)}
                style={{
                  flex:1, padding:'0.5rem', borderRadius:'0.75rem', border:'none',
                  fontWeight:700, fontSize:'0.8125rem', cursor:'pointer', fontFamily:'inherit',
                  ...(size === s ? { background:'#FF5722', color:'#fff', ...S.coral }
                    : { backgroundColor:'#D8DAE4', color:'#5A617A', ...S.outSm })
                }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Toppings / adicionales */}
        {hasOptions && (
          <div style={{ marginBottom:'1rem' }}>
            <p style={{ fontSize:'0.75rem', fontWeight:700, color:'#8B92AA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
              Adicionales / Toppings
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
              {(dish.tags ?? []).map(tag => (
                <button key={tag} onClick={() => toggleExtra(tag)}
                  style={{
                    padding:'0.375rem 0.75rem', borderRadius:'9999px', border:'none',
                    fontWeight:700, fontSize:'0.8125rem', cursor:'pointer', fontFamily:'inherit',
                    ...(extras.includes(tag) ? { background:'#FF5722', color:'#fff', ...S.coral }
                      : { backgroundColor:'#D8DAE4', color:'#5A617A', ...S.outSm })
                  }}>
                  {extras.includes(tag) ? '✓ ' : '+ '}{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comentario / notas */}
        <div style={{ marginBottom:'1.25rem' }}>
          <p style={{ fontSize:'0.75rem', fontWeight:700, color:'#8B92AA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
            Comentario / Nota (opcional)
          </p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Sin cebolla, término medio, alergia a nueces..."
            rows={2} maxLength={200}
            style={{ width:'100%', backgroundColor:'#CDD0DC', borderRadius:'0.875rem', padding:'0.75rem',
              border:'none', outline:'none', resize:'none', fontSize:'0.875rem', color:'#2D3561',
              fontFamily:'inherit', ...S.in }} />
        </div>

        {/* Cantidad + botón */}
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', backgroundColor:'#CDD0DC', borderRadius:'1rem', padding:'0.5rem 0.75rem', ...S.in }}>
            <button onClick={() => setQty(q => Math.max(1, q-1))}
              style={{ width:28, height:28, borderRadius:'0.5rem', border:'none', backgroundColor:'#D8DAE4',
                fontWeight:700, fontSize:'1rem', cursor:'pointer', ...S.outSm }}>−</button>
            <span style={{ fontWeight:700, color:'#2D3561', minWidth:24, textAlign:'center' }}>{qty}</span>
            <button onClick={() => setQty(q => q+1)}
              style={{ width:28, height:28, borderRadius:'0.5rem', border:'none', backgroundColor:'#FF5722',
                color:'#fff', fontWeight:700, fontSize:'1rem', cursor:'pointer', ...S.coral }}>+</button>
          </div>
          <motion.button whileTap={{ scale:0.97 }}
            onClick={() => { onAdd({ dish, qty, notes, size, extras }); onClose() }}
            style={{ flex:1, padding:'0.875rem', backgroundColor:'#FF5722', borderRadius:'1rem',
              border:'none', color:'#fff', fontWeight:700, fontSize:'0.9375rem', cursor:'pointer',
              fontFamily:'inherit', ...S.coral }}>
            ✅ Agregar {qty > 1 ? `×${qty}` : ''} · {fmtCOP(dish.price * qty)}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
})
CustomizeModal.displayName = 'CustomizeModal'

export default function PublicMenu() {
  const [dishes,   setDishes]   = useState<Dish[]>([])
  const [loading,  setLoading]  = useState(true)
  const [bizName,  setBizName]  = useState('RestaurantOS')
  const [cat,      setCat]      = useState<DishCategory | 'all'>('all')
  const [search,   setSearch]   = useState('')
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [mesa,     setMesa]     = useState('')
  const [clientName, setClientName] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [sent,     setSent]     = useState(false)
  const [sending,  setSending]  = useState(false)
  const [customizing, setCustomizing] = useState<Dish | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('mesa'); if (m) setMesa(m)
  }, [])

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

  const filtered = useMemo(() => {
    let list = dishes
    if (cat !== 'all') list = list.filter(d => d.category === cat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
    }
    return list
  }, [dishes, cat, search])

  const categories = useMemo(() =>
    ['all', ...Array.from(new Set(dishes.map(d => d.category)))] as (DishCategory | 'all')[]
  , [dishes])

  const cartTotal = cart.reduce((s, i) => s + i.dish.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const addToCart = useCallback((item: Omit<CartItem, 'uid'>) => {
    const uid = crypto.randomUUID()
    setCart(prev => [...prev, { uid, ...item }])
  }, [])

  const removeCartItem = useCallback((uid: string) => {
    setCart(prev => prev.filter(i => i.uid !== uid))
  }, [])

  const sendOrder = useCallback(async () => {
    if (!mesa.trim() || cart.length === 0) return
    setSending(true)
    try {
      const items = cart.map(i => ({
        id: i.dish.id, name: i.dish.name, price: i.dish.price,
        quantity: i.qty,
        notes: [i.size && `Tamaño: ${i.size}`, ...(i.extras.length ? [`Adicionales: ${i.extras.join(', ')}`] : []), i.notes].filter(Boolean).join(' | ') || null,
      }))
      await supabase.from('orders').insert({
        table_num:     parseInt(mesa),
        items:         JSON.stringify(items),
        total:         cartTotal,
        tipo_pedido:   'LOCAL',
        status:        'pending',
        customer_name: clientName.trim() || null,
        notes:         clientName.trim() ? `Cliente: ${clientName.trim()}` : null,
        user_id:       (await supabase.auth.getUser()).data.user?.id ?? '00000000-0000-0000-0000-000000000000',
      })
      setSent(true); setCart([]); setShowCart(false)
    } finally { setSending(false) }
  }, [cart, mesa, clientName, cartTotal])

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#D8DAE4', fontFamily:'Nunito,sans-serif' }}>
      {/* Header */}
      <header style={{ backgroundColor:'#D8DAE4', padding:'1rem 1.25rem', display:'flex',
        justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:20, ...S.out }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <div style={{ width:40, height:40, borderRadius:'0.75rem', overflow:'hidden', flexShrink:0, ...S.outSm }}>
            <img src="/logo.jpg" alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          </div>
          <div>
            <h1 style={{ fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:'1rem', color:'#2D3561', margin:0 }}>{bizName}</h1>
            {mesa && <p style={{ fontSize:'0.7rem', color:'#FF5722', fontWeight:700, margin:0 }}>Mesa {mesa}</p>}
          </div>
        </div>
        {cartCount > 0 && (
          <motion.button initial={{ scale:0 }} animate={{ scale:1 }} whileTap={{ scale:0.95 }}
            onClick={() => setShowCart(true)}
            style={{ padding:'0.625rem 1rem', backgroundColor:'#FF5722', borderRadius:'1rem',
              border:'none', color:'#fff', fontWeight:700, fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', ...S.coral }}>
            🛒 {cartCount} · {fmtCOP(cartTotal)}
          </motion.button>
        )}
      </header>

      <div style={{ padding:'1.25rem', maxWidth:640, margin:'0 auto' }}>
        <AnimatePresence>
          {sent && (
            <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ backgroundColor:'#ECFDF5', border:'2px solid #A7F3D0', borderRadius:'1rem',
                padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <span style={{ fontSize:'1.5rem' }}>🎉</span>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700, color:'#065F46', margin:0 }}>¡Pedido enviado a cocina!</p>
                <p style={{ fontSize:'0.8125rem', color:'#6B7280', margin:0 }}>En breve lo estaremos preparando.</p>
              </div>
              <button onClick={() => setSent(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:'1rem' }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buscador */}
        <div style={{ position:'relative', marginBottom:'1rem' }}>
          <span style={{ position:'absolute', left:'1rem', top:'50%', transform:'translateY(-50%)', color:'#8B92AA' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..." style={{ width:'100%', backgroundColor:'#CDD0DC', borderRadius:'1rem',
              paddingLeft:'2.75rem', paddingRight:'1rem', paddingTop:'0.75rem', paddingBottom:'0.75rem',
              border:'none', outline:'none', fontSize:'0.875rem', color:'#2D3561', fontFamily:'inherit', ...S.in }} />
        </div>

        {/* Filtros categoría */}
        <div style={{ display:'flex', gap:'0.5rem', overflowX:'auto', paddingBottom:'0.25rem', marginBottom:'1.25rem' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{ flexShrink:0, padding:'0.5rem 0.875rem', borderRadius:'9999px', border:'none',
                fontWeight:700, fontSize:'0.8125rem', cursor:'pointer', fontFamily:'inherit',
                ...(cat === c ? { background:'#FF5722', color:'#fff', ...S.coral }
                  : { backgroundColor:'#D8DAE4', color:'#5A617A', ...S.outSm }) }}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Grid platos */}
        {loading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem' }}>
            {[...Array(6)].map((_,i) => <div key={i} style={{ height:200, borderRadius:'1.5rem', backgroundColor:'#CDD0DC', animation:'pulse 1.5s ease infinite' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
            <p style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>🍦</p>
            <p style={{ color:'#8B92AA', fontWeight:600 }}>No encontramos ese plato</p>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem' }}>
            {filtered.map(dish => {
              const inCart = cart.filter(i => i.dish.id === dish.id).reduce((s, i) => s + i.qty, 0)
              return (
                <motion.div key={dish.id} layout
                  style={{ backgroundColor:'#D8DAE4', borderRadius:'1.5rem', padding:'1rem', ...S.out }}>
                  <div style={{ width:'100%', height:80, borderRadius:'1rem', backgroundColor:'#CDD0DC',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.25rem',
                    marginBottom:'0.75rem', overflow:'hidden', ...S.in }}>
                    {dish.image_url
                      ? <img src={dish.image_url} alt={dish.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'1rem' }} />
                      : (dish.category === 'bebida' ? '🥤' : dish.category === 'postre' ? '🍰' : dish.category === 'especial' ? '⭐' : '🍽️')
                    }
                  </div>
                  <p style={{ fontWeight:700, color:'#2D3561', fontSize:'0.875rem', marginBottom:'0.25rem', lineHeight:1.3 }}>{dish.name}</p>
                  {dish.description && (
                    <p style={{ fontSize:'0.7rem', color:'#8B92AA', marginBottom:'0.5rem', lineHeight:1.4,
                      overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2 as unknown as number, WebkitBoxOrient:'vertical' as unknown as 'vertical' }}>
                      {dish.description}
                    </p>
                  )}
                  <p style={{ fontWeight:700, color:'#FF5722', fontSize:'1rem', marginBottom:'0.75rem' }}>{fmtCOP(dish.price)}</p>
                  <motion.button whileTap={{ scale:0.95 }}
                    onClick={() => setCustomizing(dish)}
                    style={{ width:'100%', padding:'0.625rem', borderRadius:'0.875rem', border:'none',
                      backgroundColor:'#FF5722', color:'#fff', fontWeight:700, fontSize:'0.8125rem',
                      cursor:'pointer', fontFamily:'inherit', position:'relative', ...S.coral }}>
                    {inCart > 0 ? `✓ En pedido (${inCart}) · + Agregar` : '+ Agregar'}
                  </motion.button>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal personalización */}
      <AnimatePresence>
        {customizing && (
          <CustomizeModal dish={customizing} onAdd={addToCart} onClose={() => setCustomizing(null)} />
        )}
      </AnimatePresence>

      {/* Modal carrito */}
      <AnimatePresence>
        {showCart && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setShowCart(false)}
            style={{ position:'fixed', inset:0, zIndex:50, backgroundColor:'rgba(45,53,97,0.5)',
              backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
            <motion.div
              initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
              transition={{ type:'spring', stiffness:400, damping:35 }}
              onClick={e => e.stopPropagation()}
              style={{ width:'100%', maxWidth:480, backgroundColor:'#D8DAE4', borderRadius:'1.5rem 1.5rem 0 0',
                padding:'1.5rem', maxHeight:'85vh', overflowY:'auto',
                boxShadow:'0 -8px 32px rgba(130,142,170,0.4)' }}>
              <div style={{ width:40, height:4, borderRadius:2, backgroundColor:'#CDD0DC', margin:'0 auto 1.25rem' }} />
              <h3 style={{ fontWeight:700, color:'#2D3561', fontSize:'1.125rem', marginBottom:'1rem', fontFamily:'DM Sans,sans-serif' }}>🛒 Tu pedido</h3>

              {/* Items */}
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', marginBottom:'1rem' }}>
                {cart.map(item => (
                  <div key={item.uid} style={{ backgroundColor:'#CDD0DC', borderRadius:'0.875rem', padding:'0.75rem 1rem', ...S.in }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-start', flex:1 }}>
                        <span style={{ width:22, height:22, borderRadius:'0.375rem', backgroundColor:'#FF5722',
                          color:'#fff', fontSize:'0.75rem', fontWeight:700, display:'flex', alignItems:'center',
                          justifyContent:'center', flexShrink:0, marginTop:1 }}>{item.qty}</span>
                        <div>
                          <p style={{ fontWeight:600, color:'#2D3561', fontSize:'0.875rem', margin:0 }}>{item.dish.name}</p>
                          {item.size && <p style={{ fontSize:'0.7rem', color:'#8B92AA', margin:0 }}>📏 {item.size}</p>}
                          {item.extras.length > 0 && <p style={{ fontSize:'0.7rem', color:'#8B92AA', margin:0 }}>➕ {item.extras.join(', ')}</p>}
                          {item.notes && <p style={{ fontSize:'0.7rem', color:'#8B92AA', margin:0 }}>📝 {item.notes}</p>}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <p style={{ fontWeight:700, color:'#2D3561', fontSize:'0.875rem', margin:0 }}>{fmtCOP(item.dish.price * item.qty)}</p>
                        <button onClick={() => removeCartItem(item.uid)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', fontSize:'1rem', padding:0 }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Nombre del cliente + mesa */}
              <div style={{ display:'grid', gridTemplateColumns: mesa ? '1fr' : '1fr 1fr', gap:'0.75rem', marginBottom:'1rem' }}>
                {!mesa && (
                  <div>
                    <label style={{ display:'block', fontSize:'0.7rem', fontWeight:700, color:'#8B92AA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.375rem' }}>
                      Mesa *
                    </label>
                    <input type="number" value={mesa} onChange={e => setMesa(e.target.value)}
                      placeholder="Nº" style={{ width:'100%', backgroundColor:'#CDD0DC', borderRadius:'0.875rem',
                        padding:'0.75rem 1rem', border:'none', outline:'none', fontSize:'1rem',
                        color:'#2D3561', fontFamily:'inherit', fontWeight:600, textAlign:'center', ...S.in }} />
                  </div>
                )}
                <div style={{ gridColumn: mesa ? '1/-1' : 'auto' }}>
                  <label style={{ display:'block', fontSize:'0.7rem', fontWeight:700, color:'#8B92AA', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.375rem' }}>
                    Tu nombre (opcional)
                  </label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                    placeholder="Ej: María"
                    style={{ width:'100%', backgroundColor:'#CDD0DC', borderRadius:'0.875rem',
                      padding:'0.75rem 1rem', border:'none', outline:'none', fontSize:'0.9375rem',
                      color:'#2D3561', fontFamily:'inherit', ...S.in }} />
                </div>
              </div>

              {/* Total */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                paddingTop:'1rem', borderTop:'1px solid #CDD0DC', marginBottom:'1rem' }}>
                <span style={{ fontWeight:700, color:'#2D3561' }}>Total</span>
                <span style={{ fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:'1.5rem', color:'#FF5722' }}>
                  {fmtCOP(cartTotal)}
                </span>
              </div>

              <motion.button whileTap={{ scale:0.97 }}
                onClick={sendOrder}
                disabled={sending || !mesa.trim()}
                style={{ width:'100%', padding:'1rem', borderRadius:'1rem', border:'none',
                  backgroundColor: !mesa.trim() ? '#CDD0DC' : '#FF5722',
                  color: !mesa.trim() ? '#8B92AA' : '#fff',
                  fontWeight:700, fontSize:'1rem', cursor: !mesa.trim() ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit',
                  ...(!mesa.trim() ? S.in : S.coral) }}>
                {sending ? 'Enviando...' : !mesa.trim() ? 'Ingresa tu mesa' : `✅ Pedir · ${fmtCOP(cartTotal)}`}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
}
