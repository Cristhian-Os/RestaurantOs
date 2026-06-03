/**
 * DishCard.tsx
 * ─────────────────────────────────────────────────────────────
 * Tarjeta de plato del menú digital con:
 *  • Estilo neomórfico consistente con el sistema
 *  • Spring press (scale) al agregar al pedido
 *  • Badge de carrito animado con AnimatePresence
 *  • Área de toque mínima 44px (WCAG / Apple HIG)
 *  • Imágenes con lazy loading nativo
 */

import { memo, useState, useCallback } from 'react'
import { motion, AnimatePresence, type Transition } from 'framer-motion'
import type { Dish } from '../types'

// ─── Constantes de estilo (fuera del componente para evitar recreación) ─
const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
} as const

// ─── Configuración visual por categoría ──────────────────────
const CATEGORY_CONFIG = {
  entrada:   { emoji: '', label: 'Entrada',   color: 'bg-emerald-100 text-emerald-700' },
  principal: { emoji: '', label: 'Principal', color: 'bg-blue-100 text-blue-700'     },
  postre:    { emoji: '', label: 'Postre',    color: 'bg-pink-100 text-pink-700'      },
  bebida:    { emoji: '', label: 'Bebida',    color: 'bg-cyan-100 text-cyan-700'      },
  especial:  { emoji: '', label: 'Especial',  color: 'bg-amber-100 text-amber-700'    },
} as const

// ─── Transiciones tipadas para FM v12 ────────────────────────
const springFast: Transition = { type: 'spring', stiffness: 500, damping: 20 }
const springBouncy: Transition = { type: 'spring', stiffness: 600, damping: 18 }
const fadeOut: Transition = { duration: 0.15, ease: 'easeOut' }

// ─── Props ────────────────────────────────────────────────────
interface DishCardProps {
  dish:      Dish
  onAdd:     (dish: Dish) => void
  /** Número de unidades en el carrito (muestra badge si > 0). */
  quantity?: number
}

// ─── Componente ───────────────────────────────────────────────
export const DishCard = memo<DishCardProps>(({ dish, onAdd, quantity = 0 }) => {
  const [justAdded, setJustAdded] = useState(false)
  const cat = CATEGORY_CONFIG[dish.category]

  const handleAdd = useCallback(() => {
    if (!dish.available) return
    onAdd(dish)
    setJustAdded(true)
    // Feedback visual durante 600ms
    const timer = setTimeout(() => setJustAdded(false), 600)
    return () => clearTimeout(timer)
  }, [dish, onAdd])

  return (
    <div
      className="bg-[#D8DAE4] rounded-3xl p-4 flex flex-col gap-3 relative"
      style={S.neoOut}
    >
      {/* ── Badge de cantidad en carrito ── */}
      <AnimatePresence>
        {quantity > 0 && (
          <motion.span
            key="qty-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: springBouncy }}
            exit={{ scale: 0, opacity: 0, transition: fadeOut }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#FF5722] text-white text-xs font-bold flex items-center justify-center z-10"
            style={{ boxShadow: '0 2px 8px rgba(255,87,34,0.5)' }}
          >
            {quantity > 9 ? '9+' : quantity}
          </motion.span>
        )}
      </AnimatePresence>

      {/* ── Imagen o placeholder ── */}
      {dish.image_url ? (
        <div className="w-full h-36 rounded-2xl overflow-hidden" style={S.neoIn}>
          <img
            src={dish.image_url}
            alt={dish.name}
            className="w-full h-full object-cover"
            loading="lazy"    // lazy load nativo, sin JS extra
            decoding="async"  // no bloquea el main thread
          />
        </div>
      ) : (
        <div
          className="w-full h-28 rounded-2xl flex items-center justify-center text-5xl"
          style={S.neoIn}
          aria-hidden="true"
        >
          {cat.emoji}
        </div>
      )}

      {/* ── Contenido ── */}
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-sm font-bold text-[#2D3561] leading-tight"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            {dish.name}
          </h3>
          <span className={`${cat.color} text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0`}>
            {cat.label}
          </span>
        </div>

        <p className="text-xs text-[#9CA3AF] line-clamp-2 leading-relaxed">
          {dish.description}
        </p>

        {dish.tags && dish.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {dish.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] text-[#6B7280] bg-[#CDD0DC] px-2 py-0.5 rounded-full"
                style={S.neoOutSm}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Precio + botón agregar ── */}
      <div className="flex items-center justify-between mt-1">
        <span
          className="text-lg font-bold text-[#FF5722]"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          ${dish.price.toFixed(2)}
        </span>

        {/* motion.button con efecto spring al presionar (touch-friendly) */}
        <motion.button
          whileTap={dish.available ? { scale: 0.92, transition: springFast } : {}}
          onClick={handleAdd}
          disabled={!dish.available}
          aria-label={`Agregar ${dish.name} al pedido`}
          className={[
            'min-w-[44px] min-h-[44px] px-4 rounded-2xl text-xs font-bold',
            'flex items-center justify-center gap-1.5',
            'transition-colors duration-200',
            dish.available
              ? justAdded
                ? 'bg-emerald-500 text-white'
                : 'bg-[#FF5722] text-white hover:bg-[#E64A19]'
              : 'bg-[#CDD0DC] text-[#9CA3AF] cursor-not-allowed',
          ].join(' ')}
          style={
            dish.available
              ? justAdded
                ? { boxShadow: '4px 4px 12px rgba(16,185,129,0.35)' }
                : S.coral
              : S.neoIn
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {justAdded ? (
              <motion.span
                key="added"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1, transition: springBouncy }}
                exit={{ opacity: 0, scale: 0.7, transition: fadeOut }}
              >
                ✓ Listo
              </motion.span>
            ) : dish.available ? (
              <motion.span
                key="add"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1, transition: springBouncy }}
                exit={{ opacity: 0, scale: 0.7, transition: fadeOut }}
              >
                + Agregar
              </motion.span>
            ) : (
              <motion.span key="unavail">No disp.</motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  )
})

DishCard.displayName = 'DishCard'
