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
import { openWompiCheckout } from '../config/billing'

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


function fmtCOP(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

interface CartItem {
  uid:     string
  dish:    Dish
  qty:     number
  notes:   string
  size:    string
  price:   number   // precio unitario ESTIMADO en el cliente, solo para mostrar — el
                     // precio real que se cobra siempre se recalcula en el servidor (create_public_order)
  extras:  string[]
  optsText: string  // resumen de opciones elegidas (sabores de helado, queso/helado…)
  customIngredients?: { id: string; cantidad: number }[]  // solo para "plato personalizado"
}

// ── Interacciones sociales (likes / reseñas) ──────────────────────
// Solo puede dar like o reseñar quien ya pidió ese plato: se verifica en el
// servidor comparando el nombre ingresado contra el nombre de pedidos previos
// (orders.customer_name). No hay cuentas de comensal, así que el nombre ES la identidad.
const NOMBRE_KEY = 'rt_cliente_nombre'

interface DishSocial {
  likes_count:      number
  dislikes_count:   number
  rating_avg:       number | null
  rating_count:     number
  comentarios_count:number
  es_popular:       boolean
}

interface Resena {
  cliente_nombre: string
  rating:         number
  comentario:     string | null
  created_at:     string
}

// Comentarios/respuestas: moderación reactiva (se publican al instante, el
// admin oculta después si hace falta) — a diferencia de las reseñas, que
// quedan pendientes de aprobación. Un solo nivel de anidación (como
// Instagram/YouTube). Editar/borrar el propio comentario se protege con un
// token guardado en este navegador (no hay cuentas, el nombre no basta).
const COMMENT_TOKENS_KEY = 'rt_comment_tokens'
const COMMENT_REPORTED_KEY = 'rt_comment_reported'

function getCommentTokens(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(COMMENT_TOKENS_KEY) ?? '{}') } catch { return {} }
}
function saveCommentToken(id: string, token: string) {
  try {
    const map = getCommentTokens()
    map[id] = token
    localStorage.setItem(COMMENT_TOKENS_KEY, JSON.stringify(map))
  } catch { /* localStorage no disponible */ }
}
function getReportedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(COMMENT_REPORTED_KEY) ?? '[]')) } catch { return new Set() }
}
function markReported(id: string) {
  try {
    const set = getReportedSet()
    set.add(id)
    localStorage.setItem(COMMENT_REPORTED_KEY, JSON.stringify([...set]))
  } catch { /* localStorage no disponible */ }
}

interface Comentario {
  id:             string
  parent_id:      string | null
  cliente_nombre: string
  texto:          string
  estado:         'visible' | 'eliminado'
  created_at:     string
  updated_at:     string
  likes_count:    number
  ya_me_gusta:    boolean
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
const CustomizeModal = memo(({ dish, flavors, jugoFlavors, onAdd, onClose }: {
  dish:        Dish
  flavors:     string[]
  jugoFlavors: string[]
  onAdd:       (item: Omit<CartItem, 'uid'>) => void
  onClose:     () => void
}) => {
  const sizes = dish.sizes ?? []
  const hasSizes = !!dish.has_sizes && sizes.length > 0
  const optionGroups = dish.options ?? []

  const [qty,    setQty]    = useState(1)
  const [notes,  setNotes]  = useState('')
  const [size,   setSize]   = useState(hasSizes ? sizes[0].nombre : '')
  const [extras, setExtras] = useState<string[]>([])
  // Selecciones de opciones, por índice de grupo
  const [heladoSel,  setHeladoSel]  = useState<Record<number, string[]>>({})  // grupos 'helado' y submenú de 'opcion'
  const [opcionSel,  setOpcionSel]  = useState<Record<number, string>>({})    // grupos 'opcion' single-select
  const [opcionMultiSel, setOpcionMultiSel] = useState<Record<number, string[]>>({}) // grupos 'opcion' con multiple:true

  // Labels elegidos del grupo gi, sea single o multiple (ej: queso Y helado a la vez)
  const selectedLabels = (g: typeof optionGroups[number], gi: number): string[] =>
    g.multiple ? (opcionMultiSel[gi] ?? []) : (opcionSel[gi] ? [opcionSel[gi]] : [])

  // Precio unitario: el del tamaño elegido, o el precio único del plato
  const unitPrice = hasSizes
    ? (sizes.find(s => s.nombre === size)?.precio ?? sizes[0].precio)
    : dish.price

  const toggleExtra = (e: string) =>
    setExtras(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])

  // Marca/desmarca un sabor en un grupo (respeta el máximo)
  const toggleFlavor = (gi: number, flavor: string, max: number) =>
    setHeladoSel(prev => {
      const cur = prev[gi] ?? []
      if (cur.includes(flavor)) return { ...prev, [gi]: cur.filter(f => f !== flavor) }
      if (cur.length >= max) return prev   // ya llegó al máximo
      return { ...prev, [gi]: [...cur, flavor] }
    })

  // ¿Cuántos sabores requiere el grupo gi? (helado/jugo directo u opción "Con helado")
  const heladoNeeded = (g: typeof optionGroups[number], gi: number): number => {
    if (g.tipo === 'helado' || g.tipo === 'jugo') return g.cantidad ?? 1
    if (g.tipo === 'opcion') {
      const chosen = (g.opciones ?? []).filter(o => selectedLabels(g, gi).includes(o.label))
      return Math.max(0, ...chosen.map(o => o.helado ?? 0))
    }
    return 0
  }

  // Validación: todos los grupos deben estar completos
  const optionsValid = optionGroups.every((g, gi) => {
    if (g.tipo === 'opcion' && selectedLabels(g, gi).length === 0) return false
    const need = heladoNeeded(g, gi)
    if (need > 0) return (heladoSel[gi]?.length ?? 0) >= 1 && (heladoSel[gi]?.length ?? 0) <= need
    return true
  })

  // Resumen de opciones para el pedido
  const buildOptsText = () => {
    const parts: string[] = []
    optionGroups.forEach((g, gi) => {
      if (g.tipo === 'helado' || g.tipo === 'jugo') {
        const sel = heladoSel[gi] ?? []
        if (sel.length) parts.push(`${g.nombre}: ${sel.join(', ')}`)
      } else if (g.tipo === 'opcion') {
        const labels = selectedLabels(g, gi)
        if (!labels.length) return
        const sel = heladoSel[gi] ?? []
        const base = labels.join(' + ')
        parts.push(sel.length ? `${base} (${sel.join(', ')})` : base)
      }
    })
    return parts.join(' · ')
  }

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
        style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--w-line)', margin: '0 auto 1.25rem' }} />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, flexShrink: 0 }}><DishImage dish={dish} height={72} /></div>
          <div>
            <h3 className="ed-display" style={{ fontSize: '1.375rem', margin: 0 }}>{dish.name}</h3>
            {dish.description && <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0', color: 'var(--w-ink-mut)' }}>{dish.description}</p>}
            <p style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, color: 'var(--w-terra)', margin: '0.375rem 0 0', fontSize: '1rem' }}>
              {hasSizes ? `desde ${fmtCOP(Math.min(...sizes.map(s => s.precio)))}` : fmtCOP(dish.price)}
            </p>
          </div>
        </div>

        {hasSizes && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Tamaño</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {sizes.map(s => (
                <button key={s.nombre} onClick={() => setSize(s.nombre)}
                  style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...chip(size === s.nombre) }}>
                  <span>{s.nombre}</span>
                  <span style={{ fontSize: '0.6875rem', opacity: 0.9 }}>{fmtCOP(s.precio)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Grupos de opciones: sabores de helado, queso/helado, etc. */}
        {optionGroups.map((g, gi) => {
          const need = heladoNeeded(g, gi)
          const flavorOptions = g.tipo === 'jugo' ? jugoFlavors : flavors
          return (
            <div key={gi} style={{ marginBottom: '1.25rem' }}>
              <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>
                {g.nombre}{(g.tipo === 'helado' || g.tipo === 'jugo') ? ` · elige ${need}` : ''}
              </p>
              {g.tipo === 'opcion' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: need > 0 ? '0.875rem' : 0 }}>
                  {(g.opciones ?? []).map(o => (
                    <button key={o.label}
                      onClick={() => {
                        if (g.multiple) {
                          const cur = opcionMultiSel[gi] ?? []
                          const next = cur.includes(o.label) ? cur.filter(x => x !== o.label) : [...cur, o.label]
                          setOpcionMultiSel(p => ({ ...p, [gi]: next }))
                          const stillNeedsHelado = (g.opciones ?? []).some(op => next.includes(op.label) && (op.helado ?? 0) > 0)
                          if (!stillNeedsHelado) setHeladoSel(p => ({ ...p, [gi]: [] }))
                        } else {
                          setOpcionSel(p => ({ ...p, [gi]: o.label }))
                          setHeladoSel(p => ({ ...p, [gi]: [] }))
                        }
                      }}
                      style={{ flex: '1 1 auto', ...chip(selectedLabels(g, gi).includes(o.label)) }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {need > 0 && (
                <>
                  {g.tipo === 'opcion' && (
                    <p className="ed-body" style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0 0 0.5rem' }}>
                      Elige {need === 1 ? 'el sabor' : `${need} sabores`} de helado
                    </p>
                  )}
                  {flavorOptions.length === 0 ? (
                    <p className="ed-body" style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>
                      (Aún no hay sabores configurados)
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {flavorOptions.map(f => {
                        const sel = (heladoSel[gi] ?? []).includes(f)
                        const full = (heladoSel[gi]?.length ?? 0) >= need
                        return (
                          <button key={f} onClick={() => toggleFlavor(gi, f, need)}
                            disabled={!sel && full}
                            style={{ borderRadius: '9999px', opacity: !sel && full ? 0.45 : 1, ...chip(sel) }}>
                            {sel ? '✓ ' : ''}{f}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: '0.375rem 0 0' }}>
                    {(heladoSel[gi]?.length ?? 0)} / {need}
                  </p>
                </>
              )}
            </div>
          )
        })}

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
            disabled={!optionsValid}
            onClick={() => { onAdd({ dish, qty, notes, size, price: unitPrice, extras, optsText: buildOptsText() }); onClose() }}
            style={{ flex: 1, padding: '0.95rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', border: 'none', opacity: optionsValid ? 1 : 0.5, cursor: optionsValid ? 'pointer' : 'not-allowed' }}>
            {optionsValid ? `Agregar ${qty > 1 ? `×${qty}` : ''} · ${fmtCOP(unitPrice * qty)}` : 'Elige las opciones'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
})
CustomizeModal.displayName = 'CustomizeModal'

// ── Plato personalizado (bottom-sheet) ────────────────────────────
interface PublicIngredient {
  id:                    string
  nombre:                string
  unidad_medida:         string
  precio_venta_unitario: number   // ya incluye el margen (costo / 0.65)
  disponible:            boolean
}
interface CustomSel { id: string; nombre: string; unidad: string; cantidad: number; precioUnit: number }

// Incremento por unidad de medida
function stepFor(unidad: string): number {
  switch (unidad) {
    case 'kg': case 'litro': return 0.1
    case 'gramo': case 'ml': return 50
    default: return 1
  }
}

const CustomDishSheet = memo(({ onAdd, onClose, restaurantId }: {
  onAdd:   (item: Omit<CartItem, 'uid'>) => void
  onClose: () => void
  restaurantId: string | null
}) => {
  const [ings,    setIngs]    = useState<PublicIngredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [sel,     setSel]     = useState<Record<string, CustomSel>>({})
  const [notes,   setNotes]   = useState('')

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return }
    supabase.from('ingredientes_menu_publico').select('*')
      .eq('restaurant_id', restaurantId).then(({ data }) => {
      setIngs((data as PublicIngredient[] | null)?.filter(i => i.disponible) ?? [])
      setLoading(false)
    })
  }, [restaurantId])

  const filtered = useMemo(() => {
    if (!search.trim()) return ings
    const q = search.toLowerCase()
    return ings.filter(i => i.nombre.toLowerCase().includes(q))
  }, [ings, search])

  const add = (ing: PublicIngredient) => {
    const step = stepFor(ing.unidad_medida)
    setSel(prev => {
      const cur = prev[ing.id]
      const cantidad = Math.round(((cur?.cantidad ?? 0) + step) * 100) / 100
      return { ...prev, [ing.id]: { id: ing.id, nombre: ing.nombre, unidad: ing.unidad_medida, cantidad, precioUnit: ing.precio_venta_unitario } }
    })
  }
  const bump = (id: string, dir: 1 | -1) => {
    setSel(prev => {
      const cur = prev[id]; if (!cur) return prev
      const step = stepFor(cur.unidad)
      const cantidad = Math.round((cur.cantidad + dir * step) * 100) / 100
      if (cantidad <= 0) { const n = { ...prev }; delete n[id]; return n }
      return { ...prev, [id]: { ...cur, cantidad } }
    })
  }
  const remove = (id: string) => setSel(prev => { const n = { ...prev }; delete n[id]; return n })

  const chosen = Object.values(sel)
  // Precio = suma con margen, redondeado hacia ARRIBA al múltiplo de 100 más cercano
  const rawTotal = chosen.reduce((s, c) => s + c.precioUnit * c.cantidad, 0)
  const total = Math.ceil(rawTotal / 100) * 100
  const isValid = chosen.length > 0

  const fmtQty = (c: CustomSel) =>
    ['pieza', 'paquete'].includes(c.unidad) ? `×${c.cantidad}` : `${c.cantidad} ${c.unidad}`
  const summary = chosen.map(c => `${c.nombre} ${fmtQty(c)}`).join(' · ')

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 0.9rem', borderRadius: '0.75rem', cursor: 'pointer', fontFamily: 'var(--w-sans)',
    fontWeight: 600, fontSize: '0.8125rem', border: active ? '1px solid transparent' : '1px solid var(--w-line)',
    background: active ? 'var(--w-terra)' : 'var(--w-surface)', color: active ? '#fff' : 'var(--w-ink-soft)',
    boxShadow: active ? 'var(--w-shadow-terra)' : 'none',
  })

  const handleAdd = () => {
    if (!isValid) return
    const customDish: Dish = {
      id:          `custom-${crypto.randomUUID()}`,
      name:        'Plato personalizado',
      description: summary,
      price:       total,
      category:    'custom',
      available:   true,
    }
    onAdd({
      dish: customDish, qty: 1, notes, size: '', price: total, extras: [], optsText: summary,
      customIngredients: chosen.map(c => ({ id: c.id, cantidad: c.cantidad })),
    })
    onClose()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'oklch(0.25 0.03 55 / 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 42, mass: 0.85 }}
        onClick={e => e.stopPropagation()}
        className="lg"
        style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--w-line)', margin: '0 auto 1.25rem' }} />

        <h3 className="ed-display" style={{ fontSize: '1.5rem', margin: '0 0 0.25rem' }}>Arma tu propio plato</h3>
        <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0 0 1.25rem', color: 'var(--w-ink-mut)' }}>
          Elige los ingredientes y arma algo único. El precio se calcula al instante.
        </p>

        {/* Seleccionados */}
        {chosen.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Tu plato</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {chosen.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.625rem 0.875rem', border: '1px solid var(--w-line)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: 'var(--w-ink)', fontSize: '0.875rem', margin: 0, fontFamily: 'var(--w-display)' }}>{c.nombre}</p>
                    <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>{fmtQty(c)} · {fmtCOP(Math.round(c.precioUnit * c.cantidad))}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="w-press" onClick={() => bump(c.id, -1)}
                      style={{ width: 28, height: 28, borderRadius: '0.5rem', border: '1px solid var(--w-line)', background: 'var(--w-surface)', fontWeight: 700, fontSize: '1rem', color: 'var(--w-ink)' }}>−</button>
                    <button className="w-press" onClick={() => bump(c.id, 1)}
                      style={{ width: 28, height: 28, borderRadius: '0.5rem', border: 'none', background: 'var(--w-terra)', color: '#fff', fontWeight: 700, fontSize: '1rem' }}>+</button>
                    <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-wine)', fontSize: '1rem', padding: '0 0.25rem' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buscar ingrediente */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ingrediente..."
          style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem 1rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.9375rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box', marginBottom: '0.875rem' }} />

        {/* Ingredientes disponibles */}
        <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Ingredientes disponibles</p>
        {loading ? (
          <p className="ed-body" style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="ed-body" style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>
            {search ? 'No hay ingredientes que coincidan' : 'No hay ingredientes disponibles por ahora.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {filtered.map(ing => (
              <button key={ing.id} onClick={() => add(ing)} style={{ ...chip(!!sel[ing.id]) }}>
                {sel[ing.id] ? '✓ ' : '+ '}{ing.nombre}
                <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 500 }}>
                  {fmtCOP(Math.round(ing.precio_venta_unitario))}/{ing.unidad_medida}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Comentario */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Comentario</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Algún detalle especial..."
            rows={2} maxLength={200}
            style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem', border: '1px solid var(--w-line)', outline: 'none', resize: 'none', fontSize: '0.875rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
        </div>

        <button className="lg-accent w-press" disabled={!isValid} onClick={handleAdd}
          style={{ width: '100%', padding: '0.95rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', border: 'none', opacity: isValid ? 1 : 0.5, cursor: isValid ? 'pointer' : 'not-allowed' }}>
          {isValid ? `Agregar al pedido · ${fmtCOP(total)}` : 'Elige al menos un ingrediente'}
        </button>
      </motion.div>
    </motion.div>
  )
})
CustomDishSheet.displayName = 'CustomDishSheet'

// ── Likes + reseñas (bottom-sheet, liquid glass) ───────────────────
// Gate de identidad: solo puede opinar quien ya pidió el plato con ese
// nombre (verificado server-side). El nombre se recuerda en localStorage
// para no repetirlo, pero la verificación real siempre corre en la BD.
const ReviewsSheet = memo(({ dish, initialName, onNameChange, onClose, onLikeChanged }: {
  dish:          Dish
  initialName:   string
  onNameChange:  (name: string) => void
  onClose:       () => void
  onLikeChanged: () => void
}) => {
  const [nombre,      setNombre]      = useState(initialName)
  const [resenas,     setResenas]     = useState<Resena[]>([])
  const [loading,     setLoading]     = useState(true)
  const [miReaccion,  setMiReaccion]  = useState<'like' | 'dislike' | null>(null)
  const [reaccionBusy,setReaccionBusy]= useState(false)
  const [rating,      setRating]      = useState(5)
  const [comentario,  setComentario]  = useState('')
  const [sending,     setSending]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [sentOk,      setSentOk]      = useState(false)

  const [comentarios,   setComentarios]   = useState<Comentario[]>([])
  const [nuevoTexto,    setNuevoTexto]    = useState('')
  const [enviandoCom,   setEnviandoCom]   = useState(false)
  const [comentarioErr, setComentarioErr] = useState<string | null>(null)
  const [replyingTo,    setReplyingTo]    = useState<string | null>(null)
  const [replyTexto,    setReplyTexto]    = useState('')
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editTexto,     setEditTexto]     = useState('')
  const [myTokens,      setMyTokens]      = useState<Record<string, string>>({})
  const [reportedIds,   setReportedIds]   = useState<Set<string>>(new Set())

  useEffect(() => {
    setMyTokens(getCommentTokens())
    setReportedIds(getReportedSet())
  }, [])

  const fetchComentarios = useCallback(() => {
    supabase.rpc('obtener_comentarios_plato', { p_dish_id: dish.id, p_cliente_nombre: nombre.trim() || null })
      .then(({ data }) => setComentarios((data as Comentario[] | null) ?? []))
  }, [dish.id, nombre])

  useEffect(() => {
    fetchComentarios()
    // Poll ligero mientras el panel está abierto, para que se sientan los
    // comentarios de otros comensales sin tener que cerrar y reabrir.
    const interval = setInterval(fetchComentarios, 10000)
    return () => clearInterval(interval)
  }, [fetchComentarios])

  const postComentario = async (texto: string, parentId: string | null) => {
    if (!nombre.trim()) { setComentarioErr('Escribe el nombre con el que hiciste tu pedido'); return }
    if (!texto.trim()) return
    setEnviandoCom(true)
    setComentarioErr(null)
    const { data, error: err } = await supabase.rpc('crear_comentario_plato', {
      p_dish_id: dish.id, p_cliente_nombre: nombre.trim(), p_texto: texto.trim(), p_parent_id: parentId,
    })
    setEnviandoCom(false)
    if (err) { setComentarioErr(err.message); return }
    const row = (data as { comment_id: string; comment_token: string }[] | null)?.[0]
    if (row) saveCommentToken(row.comment_id, row.comment_token)
    setMyTokens(getCommentTokens())
    setNuevoTexto('')
    setReplyTexto('')
    setReplyingTo(null)
    fetchComentarios()
  }

  const guardarEdicion = async (id: string) => {
    const token = myTokens[id]
    if (!token || !editTexto.trim()) return
    const { error: err } = await supabase.rpc('editar_comentario_plato', { p_comment_id: id, p_edit_token: token, p_texto: editTexto.trim() })
    if (err) { setComentarioErr(err.message); return }
    setEditingId(null)
    fetchComentarios()
  }

  const eliminarComentario = async (id: string) => {
    const token = myTokens[id]
    if (!token) return
    const { error: err } = await supabase.rpc('borrar_comentario_plato', { p_comment_id: id, p_edit_token: token })
    if (err) { setComentarioErr(err.message); return }
    fetchComentarios()
  }

  const likeComentario = async (id: string) => {
    if (!nombre.trim()) { setComentarioErr('Escribe el nombre con el que hiciste tu pedido'); return }
    const { error: err } = await supabase.rpc('reaccionar_comentario_plato', { p_comment_id: id, p_cliente_nombre: nombre.trim() })
    if (err) { setComentarioErr(err.message); return }
    fetchComentarios()
  }

  const reportarComentario = async (id: string) => {
    if (reportedIds.has(id)) return
    await supabase.rpc('reportar_comentario_plato', { p_comment_id: id })
    markReported(id)
    setReportedIds(getReportedSet())
  }

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `${mins} min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} h`
    return `${Math.floor(hrs / 24)} d`
  }

  const renderComentario = (c: Comentario, isReply: boolean) => {
    const borrado = c.estado === 'eliminado'
    const esMio = !!myTokens[c.id]
    return (
      <div key={c.id} style={{ marginLeft: isReply ? '1.5rem' : 0 }}>
        <div className="glass-surface" style={{ borderRadius: '0.875rem', padding: '0.625rem 0.75rem' }}>
          {editingId === c.id ? (
            <div>
              <textarea value={editTexto} onChange={e => setEditTexto(e.target.value)} rows={2} maxLength={500}
                style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.625rem', padding: '0.5rem', border: '1px solid var(--w-line)', outline: 'none', resize: 'none', fontSize: '0.8125rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box', marginBottom: '0.375rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => guardarEdicion(c.id)} style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--w-olive)', background: 'none', border: 'none', cursor: 'pointer' }}>Guardar</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.1875rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--w-ink)' }}>{borrado ? '—' : c.cliente_nombre}</span>
                <span style={{ fontSize: '0.625rem', color: 'var(--w-ink-mut)' }}>{timeAgo(c.created_at)}</span>
              </div>
              <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0 0 0.375rem', fontStyle: borrado ? 'italic' : 'normal', color: borrado ? 'var(--w-ink-mut)' : undefined }}>
                {borrado ? 'Comentario eliminado' : c.texto}
              </p>
              {!borrado && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button onClick={() => likeComentario(c.id)} style={{ fontSize: '0.6875rem', fontWeight: 700, color: c.ya_me_gusta ? 'var(--w-wine)' : 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {c.ya_me_gusta ? '❤️' : '🤍'} {c.likes_count > 0 ? c.likes_count : ''}
                  </button>
                  {!isReply && (
                    <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyTexto('') }} style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Responder
                    </button>
                  )}
                  {esMio && (
                    <>
                      <button onClick={() => { setEditingId(c.id); setEditTexto(c.texto) }} style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Editar</button>
                      <button onClick={() => eliminarComentario(c.id)} style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--w-wine)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Eliminar</button>
                    </>
                  )}
                  <button onClick={() => reportarComentario(c.id)} disabled={reportedIds.has(c.id)}
                    style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', opacity: reportedIds.has(c.id) ? 0.4 : 1, background: 'none', border: 'none', cursor: reportedIds.has(c.id) ? 'default' : 'pointer', padding: 0, marginLeft: 'auto' }}>
                    {reportedIds.has(c.id) ? 'Reportado' : '⚑'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {replyingTo === c.id && (
          <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <input type="text" value={replyTexto} onChange={e => setReplyTexto(e.target.value)} placeholder="Responder..." maxLength={500}
              style={{ flex: 1, background: 'var(--w-bg)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.8125rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
            <button className="w-press" disabled={enviandoCom} onClick={() => postComentario(replyTexto, c.id)}
              style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', background: 'var(--w-terra)', border: 'none', borderRadius: '0.625rem', padding: '0 0.875rem' }}>
              Enviar
            </button>
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    supabase.rpc('obtener_resenas_aprobadas', { p_dish_id: dish.id }).then(({ data }) => {
      setResenas((data as Resena[] | null) ?? [])
      setLoading(false)
    })
  }, [dish.id])

  // Revisa si ese nombre ya reaccionó (like/dislike) a este plato. Corre al
  // abrir (si ya conocíamos el nombre) y cada vez que el comensal termina de
  // escribir/cambiar el nombre en el campo — así funciona igual si vino del
  // checkout, si lo escribió a mano, o si lo hace desde otro dispositivo.
  const checkReaccion = useCallback((n: string) => {
    if (!n.trim()) { setMiReaccion(null); return }
    supabase.rpc('mi_reaccion_plato', { p_dish_id: dish.id, p_cliente_nombre: n.trim() })
      .then(({ data }) => setMiReaccion((data as 'like' | 'dislike' | null) ?? null))
  }, [dish.id])

  useEffect(() => { checkReaccion(initialName) }, [checkReaccion, initialName])

  const commitName = (n: string) => {
    setNombre(n)
    if (n.trim()) onNameChange(n.trim())
  }

  const reaccionar = async (tipo: 'like' | 'dislike') => {
    if (!nombre.trim() || reaccionBusy) return
    setReaccionBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('reaccionar_plato', { p_dish_id: dish.id, p_cliente_nombre: nombre.trim(), p_reaccion: tipo })
    setReaccionBusy(false)
    if (err) { setError(err.message); return }
    setMiReaccion((data as 'like' | 'dislike' | null) ?? null)
    onLikeChanged()
  }

  const enviarResena = async () => {
    if (!nombre.trim()) { setError('Escribe el nombre con el que hiciste tu pedido'); return }
    setSending(true)
    setError(null)
    const { error: err } = await supabase.rpc('dejar_resena_plato', {
      p_dish_id: dish.id, p_cliente_nombre: nombre.trim(), p_rating: rating, p_comentario: comentario.trim() || null,
    })
    setSending(false)
    if (err) { setError(err.message); return }
    setSentOk(true)
    setComentario('')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'oklch(0.25 0.03 55 / 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 42, mass: 0.85 }}
        onClick={e => e.stopPropagation()}
        className="lg"
        style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--w-line)', margin: '0 auto 1.25rem' }} />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, flexShrink: 0 }}><DishImage dish={dish} height={56} /></div>
          <div style={{ flex: 1 }}>
            <h3 className="ed-display" style={{ fontSize: '1.1875rem', margin: 0 }}>{dish.name}</h3>
            <p className="ed-kicker" style={{ margin: '0.25rem 0 0' }}>Likes y reseñas</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="w-press" onClick={() => reaccionar('like')} disabled={!nombre.trim() || reaccionBusy}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', opacity: nombre.trim() ? 1 : 0.4, cursor: nombre.trim() ? 'pointer' : 'not-allowed' }}>
              <span style={{ fontSize: '1.5rem' }}>{miReaccion === 'like' ? '❤️' : '🤍'}</span>
              <span className="ed-kicker" style={{ fontSize: '0.5625rem' }}>Me gusta</span>
            </button>
            <button className="w-press" onClick={() => reaccionar('dislike')} disabled={!nombre.trim() || reaccionBusy}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', opacity: nombre.trim() ? 1 : 0.4, cursor: nombre.trim() ? 'pointer' : 'not-allowed' }}>
              <span style={{ fontSize: '1.5rem' }}>{miReaccion === 'dislike' ? '👎' : '🖐️'}</span>
              <span className="ed-kicker" style={{ fontSize: '0.5625rem' }}>No me gustó</span>
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>¿A quién tenemos el gusto de atender?</label>
          <input type="text" value={nombre} onChange={e => commitName(e.target.value)} onBlur={e => checkReaccion(e.target.value)} placeholder="El mismo nombre con el que pediste"
            style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem 1rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.9375rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
          <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: '0.375rem 0 0' }}>
            Solo puedes calificar platos que ya hayas pedido con ese nombre.
          </p>
        </div>

        {!sentOk ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Tu calificación</p>
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} style={{ background: 'none', border: 'none', fontSize: '1.75rem', cursor: 'pointer', lineHeight: 1, padding: 0 }}>
                  {n <= rating ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder="Cuéntanos qué te pareció (opcional)"
              rows={2} maxLength={300}
              style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem', border: '1px solid var(--w-line)', outline: 'none', resize: 'none', fontSize: '0.875rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box', marginBottom: '0.75rem' }} />
            {error && <p style={{ fontSize: '0.8rem', color: 'var(--w-wine)', margin: '0 0 0.75rem', fontWeight: 600 }}>{error}</p>}
            <button className="lg-accent w-press" disabled={sending} onClick={enviarResena}
              style={{ width: '100%', padding: '0.9rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', border: 'none', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Enviando...' : 'Enviar reseña'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: 'var(--w-olive)', fontWeight: 700, textAlign: 'center', marginBottom: '1.5rem' }}>
            ✓ ¡Gracias! Tu reseña quedará visible cuando el restaurante la apruebe.
          </p>
        )}

        <div>
          <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>Reseñas ({resenas.length})</p>
          {loading ? (
            <p className="ed-body" style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Cargando...</p>
          ) : resenas.length === 0 ? (
            <p className="ed-body" style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Aún no hay reseñas aprobadas para este plato.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {resenas.map((r, i) => (
                <div key={i} className="glass-surface" style={{ borderRadius: '0.875rem', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--w-ink)' }}>{r.cliente_nombre}</span>
                    <span style={{ fontSize: '0.75rem' }}>{'⭐'.repeat(r.rating)}</span>
                  </div>
                  {r.comentario && <p className="ed-body" style={{ fontSize: '0.8125rem', margin: 0 }}>{r.comentario}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--w-line)' }}>
          <p className="ed-kicker" style={{ marginBottom: '0.625rem' }}>
            Comentarios ({comentarios.filter(c => c.estado === 'visible').length})
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input type="text" value={nuevoTexto} onChange={e => setNuevoTexto(e.target.value)} placeholder="Escribe un comentario..." maxLength={500}
              style={{ flex: 1, background: 'var(--w-bg)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.8125rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
            <button className="lg-accent w-press" disabled={enviandoCom} onClick={() => postComentario(nuevoTexto, null)}
              style={{ fontSize: '0.75rem', fontWeight: 700, border: 'none', borderRadius: '0.75rem', padding: '0 1rem' }}>
              Enviar
            </button>
          </div>
          {comentarioErr && <p style={{ fontSize: '0.75rem', color: 'var(--w-wine)', margin: '-0.5rem 0 0.75rem', fontWeight: 600 }}>{comentarioErr}</p>}

          {comentarios.filter(c => !c.parent_id).length === 0 ? (
            <p className="ed-body" style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Sé el primero en comentar este plato.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {comentarios.filter(c => !c.parent_id).map(top => (
                <div key={top.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {renderComentario(top, false)}
                  {comentarios.filter(r => r.parent_id === top.id).map(reply => renderComentario(reply, true))}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
})
ReviewsSheet.displayName = 'ReviewsSheet'

// ── Dish card (editorial, solid warm) ─────────────────────────────
const DishCard = memo(({ dish, inCart, social, onCustomize, onOpenSocial, index = 0 }: {
  dish:         Dish
  inCart:       number
  social?:      DishSocial
  onCustomize:  () => void
  onOpenSocial: () => void
  index?:       number
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

    <div className="w-press" onClick={e => { e.stopPropagation(); onOpenSocial() }}
      style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '0.25rem', columnGap: '0.625rem', cursor: 'pointer' }}>
      {social?.es_popular && (
        <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--w-terra)' }}>🔥 Popular</span>
      )}
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--w-ink-mut)' }}>
        {social && social.rating_count > 0 ? `⭐ ${social.rating_avg} (${social.rating_count})` : '⭐ Opina'}
      </span>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--w-wine)' }}>
        ❤️ {social?.likes_count ?? 0}
      </span>
      {!!social?.comentarios_count && (
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--w-ink-mut)' }}>
          💬 {social.comentarios_count}
        </span>
      )}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.375rem' }}>
      <span style={{ fontFamily: 'var(--w-sans)', fontWeight: 700, color: 'var(--w-terra)', fontSize: '1.0625rem' }}>
        {dish.has_sizes && (dish.sizes?.length ?? 0) > 0
          ? `desde ${fmtCOP(Math.min(...dish.sizes!.map(s => s.precio)))}`
          : fmtCOP(dish.price)}
      </span>
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
  const [promo,         setPromo]         = useState<string | null>(null)
  const [logoUrl,       setLogoUrl]       = useState<string | null>(null)
  const [catLabels,     setCatLabels]     = useState<Record<string, string>>({})
  const [flavors,       setFlavors]       = useState<string[]>([])
  const [jugoFlavors,   setJugoFlavors]   = useState<string[]>([])
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
  const [showCustom,    setShowCustom]    = useState(false)
  const [orderId,       setOrderId]       = useState<string | null>(null)
  const [orderStatus,   setOrderStatus]   = useState<string | null>(null)
  const [isPaid,        setIsPaid]        = useState(false)
  const [showTracking,  setShowTracking]  = useState(false)
  const [onlinePay,     setOnlinePay]     = useState(false)   // ¿el restaurante acepta pagos en línea?
  const [brandExtra,    setBrandExtra]    = useState<{
    whatsapp_numero?: string | null; direccion?: string | null; instagram_url?: string | null; facebook_url?: string | null
    propina_sugerida_pct?: number | null; portada_url?: string | null
    horario_activo?: boolean; horario_apertura?: string | null; horario_cierre?: string | null
    cerrado_manual?: boolean; cerrado_mensaje?: string | null
  }>({})
  const [payingOnline,  setPayingOnline]  = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const [socialMap,     setSocialMap]     = useState<Record<string, DishSocial>>({})
  const [reviewDish,    setReviewDish]    = useState<Dish | null>(null)

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const scrollingTo = useRef(false)

  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  // ── URL params ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('mesa')
    if (m) setMesa(m)
  }, [])

  // ── nombre recordado (para no repetirlo al pedir / opinar) ──────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOMBRE_KEY)
      if (saved) setClientName(saved)
    } catch { /* localStorage no disponible (modo privado, etc.) */ }
  }, [])
  const rememberName = useCallback((name: string) => {
    setClientName(name)
    try { localStorage.setItem(NOMBRE_KEY, name) } catch { /* ignorar */ }
  }, [])

  // ── resolver restaurante (por slug en la URL o único activo) ────
  // Soporta /menu/<slug> y ?r=<slug>. Si no hay slug y solo existe un
  // restaurante, usa ese (compatibilidad con los QR actuales de Cholaos).
  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean) // ['menu', '<slug>']
    const pathSlug = parts[0] === 'menu' ? parts[1] : undefined
    const querySlug = new URLSearchParams(window.location.search).get('r') ?? undefined
    const slug = (pathSlug || querySlug)?.toLowerCase()

    const resolve = async () => {
      if (slug) {
        const { data } = await supabase.from('restaurants_public')
          .select('id, name').eq('slug', slug).maybeSingle()
        if (data) { setRestaurantId(data.id); if (data.name) setBizName(data.name); return }
      }
      // Sin slug (o slug inexistente): usar el único restaurante activo si lo hay
      const { data: all } = await supabase.from('restaurants_public').select('id, name').limit(2)
      if (all && all.length === 1) {
        setRestaurantId(all[0].id)
        if (all[0].name) setBizName(all[0].name)
        return
      }
      // Varios restaurantes y sin slug válido: compatibilidad con los QR físicos
      // ya impresos de Cholaos (creados antes del multi-tenant, sin slug en la URL).
      const LEGACY_DEFAULT_ID = 'cdd99ebf-c8b7-43b1-b437-1d136e283212'
      const { data: legacy } = await supabase.from('restaurants_public')
        .select('id, name').eq('id', LEGACY_DEFAULT_ID).maybeSingle()
      if (legacy) {
        setRestaurantId(legacy.id)
        if (legacy.name) setBizName(legacy.name)
      } else {
        setRestaurantId(null)
        setLoading(false)
      }
    }
    resolve()
  }, [])

  // ── data fetch ─────────────────────────────────────────────────
  const refreshSocial = useCallback(() => {
    if (!restaurantId) return
    supabase.rpc('obtener_interacciones_platos', { p_restaurant_id: restaurantId }).then(({ data }) => {
      const map: Record<string, DishSocial> = {}
      for (const row of (data as (DishSocial & { dish_id: string })[] | null) ?? []) {
        map[row.dish_id] = { likes_count: row.likes_count, dislikes_count: row.dislikes_count, rating_avg: row.rating_avg, rating_count: row.rating_count, comentarios_count: row.comentarios_count, es_popular: row.es_popular }
      }
      setSocialMap(map)
    })
  }, [restaurantId])

  const fetchMenuData = useCallback(() => {
    if (!restaurantId) return
    Promise.all([
      supabase.from('dishes').select('*').eq('restaurant_id', restaurantId).eq('available', true)
        .neq('availability_status', 'discontinued').order('sort_order').order('name'),
      supabase.from('restaurant_config').select('display_name, modules_enabled, logo_url, color_primario, promo_texto, promo_activo, whatsapp_numero, direccion, instagram_url, facebook_url, propina_sugerida_pct, portada_url, horario_activo, horario_apertura, horario_cierre, cerrado_manual, cerrado_mensaje')
        .eq('restaurant_id', restaurantId).maybeSingle(),
    ]).then(([dr, cr]) => {
      setDishes(dr.data || [])
      refreshSocial()
      if (cr.data?.display_name) setBizName(cr.data.display_name)
      if (cr.data?.logo_url) setLogoUrl(cr.data.logo_url as string)
      setPromo(cr.data?.promo_activo && cr.data?.promo_texto ? cr.data.promo_texto as string : null)
      setBrandExtra({
        whatsapp_numero: cr.data?.whatsapp_numero as string | null,
        direccion: cr.data?.direccion as string | null,
        instagram_url: cr.data?.instagram_url as string | null,
        facebook_url: cr.data?.facebook_url as string | null,
        propina_sugerida_pct: cr.data?.propina_sugerida_pct as number | null,
        portada_url: cr.data?.portada_url as string | null,
        horario_activo: cr.data?.horario_activo as boolean | undefined,
        horario_apertura: cr.data?.horario_apertura as string | null,
        horario_cierre: cr.data?.horario_cierre as string | null,
        cerrado_manual: cr.data?.cerrado_manual as boolean | undefined,
        cerrado_mensaje: cr.data?.cerrado_mensaje as string | null,
      })
      // Marca del restaurante: aplicar su color como acento del menú
      if (cr.data?.color_primario) document.documentElement.style.setProperty('--w-terra', cr.data.color_primario as string)
      // Etiquetas de categoría personalizadas (definidas en el panel admin)
      const mods = cr.data?.modules_enabled as { categories?: { value: string; label: string }[]; helado_flavors?: string[]; jugo_flavors?: string[] } | null
      const cats = mods?.categories
      if (Array.isArray(cats)) {
        const map: Record<string, string> = {}
        for (const c of cats) if (c?.value) map[c.value] = c.label
        setCatLabels(map)
      }
      if (Array.isArray(mods?.helado_flavors)) setFlavors(mods!.helado_flavors!)
      if (Array.isArray(mods?.jugo_flavors)) setJugoFlavors(mods!.jugo_flavors!)
      setLoading(false)
    })
  }, [restaurantId, refreshSocial])

  useEffect(() => {
    fetchMenuData()
    if (!restaurantId) return
    // ¿Este restaurante acepta pagos en línea de comensales?
    supabase.rpc('online_payments_enabled', { p_restaurant_id: restaurantId })
      .then(({ data }) => setOnlinePay(data === true))
  }, [restaurantId, fetchMenuData])

  // Refrescar el menú en vivo si el admin edita platos o categorías mientras el comensal ya tiene el menú abierto
  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel(`public-menu-sync-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${restaurantId}` }, fetchMenuData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_config', filter: `restaurant_id=eq.${restaurantId}` }, fetchMenuData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId, fetchMenuData])

  // ── order tracking (polling) ────────────────────────────────────
  // No se puede usar postgres_changes aquí: el comensal no tiene sesión
  // (rol anon) y la tabla orders solo es legible por staff vía RLS —
  // Realtime respeta RLS, así que ese canal nunca recibía nada. Se usa
  // en su lugar la vista pública pedido_estado_publico (solo expone
  // id/status/mesa, sin total ni datos del cliente) con polling.
  useEffect(() => {
    if (!orderId || orderStatus === 'completed' || orderStatus === 'cancelled') return
    let cancelled = false
    const interval = setInterval(() => {
      supabase.from('pedido_estado_publico').select('status, pagado').eq('id', orderId).maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return
          if (data.status) setOrderStatus(data.status)
          setIsPaid(!!data.pagado)
        })
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [orderId, orderStatus])

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

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  // ── cart actions ───────────────────────────────────────────────
  const addToCart = useCallback((item: Omit<CartItem, 'uid'>) => {
    setCart(prev => [...prev, { uid: crypto.randomUUID(), ...item }])
  }, [])
  const removeCartItem = useCallback((uid: string) => {
    setCart(prev => prev.filter(i => i.uid !== uid))
  }, [])

  // ── send order ─────────────────────────────────────────────────
  const isClosedBySchedule = useMemo(() => {
    if (!brandExtra.horario_activo || !brandExtra.horario_apertura || !brandExtra.horario_cierre) return false
    const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const mins = bogota.getHours() * 60 + bogota.getMinutes()
    const [oh, om] = brandExtra.horario_apertura.split(':').map(Number)
    const [ch, cm] = brandExtra.horario_cierre.split(':').map(Number)
    const open = oh * 60 + (om || 0), close = ch * 60 + (cm || 0)
    return open <= close ? !(mins >= open && mins <= close) : !(mins >= open || mins <= close)
  }, [brandExtra.horario_activo, brandExtra.horario_apertura, brandExtra.horario_cierre])

  const isClosedNow = !!brandExtra.cerrado_manual || isClosedBySchedule
  const closedMessage = brandExtra.cerrado_manual
    ? (brandExtra.cerrado_mensaje || 'Cerrado temporalmente. Vuelve más tarde.')
    : `Cerrado ahora · Atendemos de ${brandExtra.horario_apertura} a ${brandExtra.horario_cierre}`

  const canConfirm = (mesa.trim() !== '' || clientName.trim() !== '') && !isClosedNow

  const sendOrder = useCallback(async () => {
    if (!canConfirm || cart.length === 0 || !restaurantId) return
    setSending(true)
    try {
      // El precio de cada línea NUNCA se manda desde aquí — create_public_order
      // lo recalcula en el servidor a partir de dishes/ingredientes reales, para
      // que nadie pueda manipular el total del pedido (y lo que luego cobra Wompi).
      const items = cart.map(i => {
        const line_notes = [i.size && `Tamaño: ${i.size}`, i.optsText || null, ...(i.extras.length ? [`Adicionales: ${i.extras.join(', ')}`] : []), i.notes].filter(Boolean).join(' | ') || null
        return i.customIngredients
          ? { kind: 'custom', quantity: i.qty, line_notes, ingredients: i.customIngredients }
          : { kind: 'dish', dish_id: i.dish.id, quantity: i.qty, size: i.size || null, line_notes }
      })
      const tableNum = mesa.trim() ? parseInt(mesa) : null
      const noteParts = [
        clientName.trim() ? `Cliente: ${clientName.trim()}` : null,
        !mesa.trim() ? 'Pedido en mostrador / sin mesa' : null,
      ].filter(Boolean)
      const { data: newOrderId, error } = await supabase.rpc('create_public_order', {
        p_restaurant_id:  restaurantId,
        p_table_num:      tableNum,
        p_customer_name:  clientName.trim() || null,
        p_notes:          noteParts.length ? noteParts.join(' · ') : null,
        p_items:          items,
      })

      // Solo confirmamos y vaciamos el carrito si el pedido SE GUARDÓ de verdad
      if (error || !newOrderId) {
        throw new Error(error?.message || 'No se pudo registrar el pedido')
      }

      setOrderId(newOrderId)
      setOrderStatus('pending')
      setIsPaid(false)
      setShowTracking(true)
      setSent(true)
      setCart([])
      setShowCart(false)
      // Avisar a cocina y admin (push, suena con la app cerrada) — SOLO a este restaurante
      pushNotificationService.notify(
        ['kitchen', 'admin'],
        'Nuevo pedido',
        tableNum ? `Mesa ${tableNum} hizo un pedido` : `${clientName.trim() || 'Un cliente'} hizo un pedido`,
        '/',
        restaurantId ?? undefined,
      )
    } catch (e) {
      // Falló (red o servidor): NO perdemos el carrito y avisamos al cliente.
      // Si el servidor rechazó el pedido por una regla de negocio (sin stock,
      // cerrado, fuera de horario, etc.) ese mensaje ya viene en español y
      // claro — se lo mostramos tal cual en vez de un genérico que confunde.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const serverMsg = e instanceof Error ? e.message : null
      setSendError(
        offline
          ? 'Parece que no tienes conexión. Tu pedido NO se envió — revisa tu internet e intenta otra vez. Tu carrito sigue aquí.'
          : serverMsg || 'No pudimos enviar tu pedido. Intenta de nuevo o pide ayuda a un mesero. Tu carrito sigue aquí.'
      )
      console.error('Error al enviar pedido:', e)
    } finally { setSending(false) }
  }, [cart, mesa, clientName, canConfirm, restaurantId])

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

  const catLabel = (c: string) => catLabels[c] ?? CATEGORY_LABELS[c] ?? c
  const categoryNavItems = [{ key: 'all' as const, label: 'Todo' }, ...categories.map(c => ({ key: c, label: catLabel(c) }))]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--w-bg)', fontFamily: 'var(--w-sans)', paddingBottom: '6rem' }}>

      {/* ── Cerrado (bloquea pedidos) ── */}
      {isClosedNow && (
        <div style={{ background: 'var(--w-wine)', color: '#fff', textAlign: 'center', padding: '0.625rem 1rem', fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'var(--w-sans)' }}>
          {closedMessage}
        </div>
      )}

      {/* ── Banner de promoción ── */}
      {promo && !isClosedNow && (
        <div style={{ background: 'var(--w-terra)', color: '#fff', textAlign: 'center', padding: '0.625rem 1rem', fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'var(--w-sans)' }}>
          {promo}
        </div>
      )}

      {/* ── Portada ── */}
      {brandExtra.portada_url && (
        <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
          <img src={brandExtra.portada_url} alt={bizName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      {/* ── WhatsApp flotante ── */}
      {brandExtra.whatsapp_numero && (
        <a href={`https://wa.me/${brandExtra.whatsapp_numero}`} target="_blank" rel="noopener noreferrer"
          style={{ position: 'fixed', right: '1.1rem', bottom: '1.1rem', zIndex: 40, width: 52, height: 52, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(0,0,0,0.25)' }}
          aria-label="Escribir por WhatsApp">
          <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 28, height: 28 }}><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.81-.11-.42-.13-.95-.31-1.64-.6-2.89-1.25-4.78-4.15-4.93-4.34-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2 .9 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.49-.14.14-.28.29-.12.57.15.28.68 1.12 1.46 1.82 1.01.9 1.85 1.18 2.13 1.31.29.14.45.11.62-.07.17-.18.72-.84.91-1.13.19-.29.38-.24.63-.14.26.09 1.65.78 1.94.92.28.14.47.21.54.33.07.13.07.72-.16 1.4z"/></svg>
        </a>
      )}

      {/* ── Editorial hero ── */}
      <header className="menu-wrap" style={{ position: 'relative', padding: '2.25rem 1.5rem 1.5rem', margin: '0 auto', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          {logoUrl && (
            <img src={logoUrl} alt={bizName}
              style={{ height: 72, width: 'auto', maxWidth: 180, objectFit: 'contain', marginBottom: '1rem', borderRadius: '0.75rem' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
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
              <div style={{
                background: orderStatus === 'pending' && !isPaid ? 'color-mix(in oklch, var(--w-saffron) 15%, var(--w-bg))' : 'var(--w-bg)',
                borderRadius: '0.875rem', padding: '0.875rem 1rem',
                border: orderStatus === 'pending' && !isPaid ? '1px solid var(--w-saffron)' : '1px solid var(--w-line)',
              }}>
                <p style={{ fontWeight: 600, color: 'var(--w-ink)', margin: 0, fontSize: '0.875rem' }}>
                  {orderStatus === 'pending' && !isPaid && 'Para que tu pedido pase a cocina, ve a caja y paga (efectivo, transferencia o Nequi/Daviplata).'}
                  {orderStatus === 'pending' && isPaid  && 'Tu pedido fue recibido. Pronto comenzamos a prepararlo.'}
                  {orderStatus === 'cooking'   && 'Estamos preparando tu pedido. Ya casi está.'}
                  {orderStatus === 'ready'     && 'Tu pedido está listo. El mesero te lo llevará enseguida.'}
                  {orderStatus === 'completed' && 'Buen provecho. Esperamos que lo disfrutes.'}
                  {orderStatus === 'cancelled' && 'Tu pedido fue cancelado. Consulta con el mesero.'}
                </p>
              </div>

              {/* Pago en línea (si el restaurante lo tiene activo) */}
              {onlinePay && orderStatus !== 'cancelled' && orderStatus !== 'completed' && (
                <button
                  disabled={payingOnline}
                  onClick={async () => {
                    if (!orderId) return
                    setPayingOnline(true)
                    try {
                      const { data, error } = await supabase.functions.invoke('wompi-init', {
                        body: { kind: 'diner', order_id: orderId, redirect_url: window.location.href },
                      })
                      if (error) throw error
                      if (data?.error) { alert(data.error); return }
                      openWompiCheckout(data)
                    } catch {
                      alert('No se pudo iniciar el pago. Intenta de nuevo o paga con el mesero.')
                    } finally { setPayingOnline(false) }
                  }}
                  className="w-press"
                  style={{ marginTop: '1rem', width: '100%', padding: '0.9rem', border: 'none', borderRadius: '0.9rem', background: 'var(--w-terra)', color: '#fff', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.95rem', cursor: payingOnline ? 'not-allowed' : 'pointer', opacity: payingOnline ? 0.7 : 1 }}>
                  {payingOnline ? 'Abriendo pago…' : '💳 Pagar en línea'}
                </button>
              )}

              {orderStatus === 'pending' && !isPaid && (
                <button
                  disabled={cancelling}
                  onClick={async () => {
                    if (!orderId || !window.confirm('¿Cancelar este pedido?')) return
                    setCancelling(true)
                    try {
                      const { error } = await supabase.rpc('cancelar_orden', { p_order_id: orderId })
                      if (error) throw error
                      setOrderStatus('cancelled')
                      alert('Pedido cancelado')
                    } catch {
                      alert('No se pudo cancelar el pedido.')
                    } finally { setCancelling(false) }
                  }}
                  className="w-press"
                  style={{ marginTop: '0.5rem', width: '100%', padding: '0.9rem', border: 'none', borderRadius: '0.9rem', background: 'var(--w-wine)', color: '#fff', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.95rem', cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.7 : 1 }}>
                  {cancelling ? 'Cancelando...' : '🗑️ Cancelar pedido'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success banner ── */}
        <AnimatePresence>
          {sent && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: 'color-mix(in oklch, var(--w-olive) 14%, var(--w-surface))', border: '1px solid var(--w-olive)', borderRadius: '1rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--w-display)', fontWeight: 600, color: 'var(--w-ink)', margin: 0, fontSize: '1.0625rem' }}>Pedido enviado</p>
                <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0.125rem 0 0', color: 'var(--w-ink-mut)' }}>Revisa el estado de tu pedido abajo.</p>
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

        {/* ── Arma tu propio plato ── */}
        {!loading && !isSearching && (
          <motion.button
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowCustom(true)}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '1.75rem', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.125rem 1.25rem', background: 'linear-gradient(135deg, color-mix(in oklch, var(--w-terra) 16%, var(--w-surface)) 0%, var(--w-surface) 70%)', boxShadow: 'var(--w-shadow-sm)', display: 'flex', alignItems: 'center', gap: '1rem', fontFamily: 'var(--w-sans)' }}>
            <div style={{ flex: 1 }}>
              <p className="ed-display" style={{ fontSize: '1.1875rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Arma tu propio plato</p>
              <p className="ed-body" style={{ fontSize: '0.8125rem', margin: '0.1875rem 0 0', color: 'var(--w-ink-mut)' }}>Elige los ingredientes y crea algo único.</p>
            </div>
            <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: 'var(--w-terra)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem', fontWeight: 700, boxShadow: 'var(--w-shadow-terra)' }}>+</span>
          </motion.button>
        )}

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
                return <DishCard key={dish.id} dish={dish} inCart={inCart} social={socialMap[dish.id]} onCustomize={() => setCustomizing(dish)} onOpenSocial={() => setReviewDish(dish)} index={i} />
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
                      {catLabel(cat)}
                    </h2>
                    <div style={{ flex: 1, height: 1, background: 'var(--w-line)' }} />
                    <span className="ed-kicker" style={{ color: 'var(--w-ink-mut)' }}>{catDishes.length}</span>
                  </div>
                  <div className="menu-grid">
                    {catDishes.map((dish, i) => {
                      const inCart = cart.filter(ci => ci.dish.id === dish.id).reduce((s, ci) => s + ci.qty, 0)
                      return <DishCard key={dish.id} dish={dish} inCart={inCart} social={socialMap[dish.id]} onCustomize={() => setCustomizing(dish)} onOpenSocial={() => setReviewDish(dish)} index={i} />
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Footer: contacto y ubicación ── */}
      {(brandExtra.direccion || brandExtra.instagram_url || brandExtra.facebook_url) && (
        <footer className="menu-wrap" style={{ margin: '2rem auto 0', padding: '1.5rem', textAlign: 'center', borderTop: '1px solid var(--w-line)' }}>
          {brandExtra.direccion && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(brandExtra.direccion)}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', marginBottom: '0.75rem', textDecoration: 'none' }}>
              📍 {brandExtra.direccion}
            </a>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            {brandExtra.instagram_url && (
              <a href={brandExtra.instagram_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--w-terra)', textDecoration: 'none' }}>Instagram</a>
            )}
            {brandExtra.facebook_url && (
              <a href={brandExtra.facebook_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--w-terra)', textDecoration: 'none' }}>Facebook</a>
            )}
          </div>
        </footer>
      )}

      {/* ── Floating cart (liquid glass accent) ── */}
      {/* Se oculta cuando el carrito o un modal están abiertos, para no
          chocar con el botón de confirmar. */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && !customizing && !showCustom && (
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
        {customizing && <CustomizeModal dish={customizing} flavors={flavors} jugoFlavors={jugoFlavors} onAdd={addToCart} onClose={() => setCustomizing(null)} />}
      </AnimatePresence>

      {/* ── Plato personalizado ── */}
      <AnimatePresence>
        {showCustom && <CustomDishSheet onAdd={addToCart} onClose={() => setShowCustom(false)} restaurantId={restaurantId} />}
      </AnimatePresence>

      {/* ── Likes + reseñas ── */}
      <AnimatePresence>
        {reviewDish && (
          <ReviewsSheet dish={reviewDish} initialName={clientName} onNameChange={rememberName}
            onClose={() => setReviewDish(null)} onLikeChanged={refreshSocial} />
        )}
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
              style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>

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
                          {item.optsText && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>{item.optsText}</p>}
                          {item.extras.length > 0 && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>+ {item.extras.join(', ')}</p>}
                          {item.notes && <p className="ed-body" style={{ fontSize: '0.6875rem', color: 'var(--w-ink-mut)', margin: 0 }}>Nota: {item.notes}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <p style={{ fontWeight: 700, color: 'var(--w-ink)', fontSize: '0.875rem', margin: 0, fontFamily: 'var(--w-sans)' }}>{fmtCOP(item.price * item.qty)}</p>
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
                  <label className="ed-kicker" style={{ display: 'block', marginBottom: '0.5rem' }}>¿A quién tenemos el gusto de atender?</label>
                  <input type="text" value={clientName} onChange={e => rememberName(e.target.value)} placeholder="Ej: María"
                    style={{ width: '100%', background: 'var(--w-bg)', borderRadius: '0.875rem', padding: '0.75rem 1rem', border: '1px solid var(--w-line)', outline: 'none', fontSize: '0.9375rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', boxSizing: 'border-box' }} />
                </div>
              </div>

              {isClosedNow && (
                <p style={{ fontSize: '0.8rem', color: 'var(--w-wine)', marginBottom: '1rem', textAlign: 'center', fontWeight: 700 }}>
                  {closedMessage}
                </p>
              )}
              {!isClosedNow && !canConfirm && (
                <p className="ed-body" style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', marginBottom: '1rem', textAlign: 'center' }}>
                  Ingresa tu <strong style={{ color: 'var(--w-ink)' }}>nombre</strong> o el número de <strong style={{ color: 'var(--w-ink)' }}>mesa</strong> para continuar
                </p>
              )}
              {!isClosedNow && !!brandExtra.propina_sugerida_pct && (
                <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', marginBottom: '1rem', textAlign: 'center' }}>
                  Propina sugerida ({brandExtra.propina_sugerida_pct}%): {fmtCOP(Math.round(cartTotal * brandExtra.propina_sugerida_pct / 100))} — se paga aparte, a tu criterio
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
                {sending ? 'Enviando...' : isClosedNow ? 'Cerrado ahora' : !canConfirm ? 'Ingresa nombre o mesa' : `Pedir · ${fmtCOP(cartTotal)}`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
