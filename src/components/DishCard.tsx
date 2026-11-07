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

import { memo, useState, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence, type Transition } from 'framer-motion'
import type { Dish } from '../types'
import { CategoryIcon } from './CategoryIcon'

// ─── Constantes de estilo (fuera del componente para evitar recreación) ─
const S = {
  neoOut:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  neoOutSm:{ border: '1px solid var(--w-border-strong)' },
  neoIn:   { boxShadow: 'none', border: '1px solid var(--w-border)' },
  coral:   { boxShadow: 'var(--w-shadow-terra)' },
} as const

// ─── Configuración visual por categoría ──────────────────────
const CATEGORY_CONFIG = {
  entrada:   { label: 'Entrada',   color: 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]' },
  principal: { label: 'Principal', color: 'bg-[var(--w-info-bg)] text-[color:var(--w-info-text)]'     },
  postre:    { label: 'Postre',    color: 'bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]'      },
  bebida:    { label: 'Bebida',    color: 'bg-[var(--w-info-bg)] text-[color:var(--w-info-text)]'      },
  especial:  { label: 'Especial',  color: 'bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]'    },
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
  /** Etiqueta/ícono de categoría ya resueltos (categorías personalizadas del negocio). */
  categoryLabel?: string
  categoryIcon?: ReactNode
  /** Color hexadecimal de la categoría (para gradientes). */
  categoryColor?: string
}

// ─── Componente ───────────────────────────────────────────────
export const DishCard = memo<DishCardProps>(({ dish, onAdd, quantity = 0, categoryLabel, categoryIcon, categoryColor }) => {
  const [justAdded, setJustAdded] = useState(false)
  const cat = CATEGORY_CONFIG[dish.category as keyof typeof CATEGORY_CONFIG]
  const icon = categoryIcon ?? <CategoryIcon category={dish.category} size={40} />
  const label = categoryLabel ?? cat?.label ?? dish.category
  const color = cat?.color ?? 'bg-[var(--w-surface-sunken)] text-[color:var(--w-text-2)]'
  const badgeColor = categoryColor || 'var(--w-accent)'

  const handleAdd = useCallback(() => {
    if (!dish.available) return
    onAdd(dish)
    setJustAdded(true)
    // Feedback visual durante 600ms
    const timer = setTimeout(() => setJustAdded(false), 600)
    return () => clearTimeout(timer)
  }, [dish, onAdd])

  // Glass color: usa categoryColor si existe, sino fallback al gris por defecto
  const glassColor = categoryColor
    ? `color-mix(in srgb, ${categoryColor}33, var(--w-surface))`  // 20% opacidad del color
    : 'var(--w-surface)'

  return (
    <div
      className="rounded-[var(--w-r-xl)] p-4 flex flex-col gap-3 relative"
      style={{ ...S.neoOut, backgroundColor: glassColor }}
    >
      {/* ── Badge de cantidad en carrito ── */}
      <AnimatePresence>
        {quantity > 0 && (
          <motion.span
            key="qty-badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: springBouncy }}
            exit={{ scale: 0, opacity: 0, transition: fadeOut }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-[color:var(--w-on-accent)] text-xs font-bold flex items-center justify-center z-10"
            style={{
              backgroundColor: badgeColor,
              boxShadow: `0 2px 8px ${badgeColor}66`
            }}
          >
            {quantity > 9 ? '9+' : quantity}
          </motion.span>
        )}
      </AnimatePresence>

      {/* ── Imagen o placeholder ── */}
      {dish.image_url ? (
        <div className="w-full h-36 rounded-[var(--w-r-md)] overflow-hidden" style={S.neoIn}>
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
          className="w-full h-28 rounded-[var(--w-r-md)] flex items-center justify-center text-[color:var(--w-text-3)]"
          style={S.neoIn}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* ── Contenido ── */}
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-sm font-bold text-[color:var(--w-text)] leading-tight"
            style={{ fontFamily: 'var(--w-font)' }}
          >
            {dish.name}
          </h3>
          <span className={`${color} text-[0.625rem] font-bold px-2 py-0.5 rounded-full shrink-0`}>
            {label}
          </span>
        </div>

        <p className="text-xs text-[color:var(--w-text-3)] line-clamp-2 leading-relaxed">
          {dish.description}
        </p>

        {dish.tags && dish.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {dish.tags.map(tag => (
              <span
                key={tag}
                className="text-[0.625rem] text-[color:var(--w-text-2)] bg-[var(--w-surface-sunken)] px-2 py-0.5 rounded-full"
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
          className="text-lg font-bold text-[color:var(--w-accent)]"
          style={{ fontFamily: 'var(--w-font)' }}
        >
          ${Math.round(dish.price).toLocaleString('es-CO')}
        </span>

        {/* motion.button con efecto spring al presionar (touch-friendly) */}
        <motion.button
          whileTap={dish.available ? { scale: 0.92, transition: springFast } : {}}
          onClick={handleAdd}
          disabled={!dish.available}
          aria-label={`Agregar ${dish.name} al pedido`}
          className={[
            'min-w-[44px] min-h-[44px] px-4 rounded-[var(--w-r-md)] text-xs font-bold',
            'flex items-center justify-center gap-1.5',
            'transition-colors duration-200',
            dish.available
              ? justAdded
                ? 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]'
                : 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)] hover:bg-[var(--w-accent-hover)]'
              : 'bg-[var(--w-surface-sunken)] text-[color:var(--w-text-3)] cursor-not-allowed',
          ].join(' ')}
          style={
            dish.available
              ? justAdded
                ? { boxShadow: 'var(--w-shadow-md)' }
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
