/**
 * ScrollReveal.tsx
 * ─────────────────────────────────────────────────────────────
 * Wrapper animado que ejecuta fade-in + slide-up cuando el
 * elemento entra en el viewport.
 *
 * Decisiones de diseño para PWA móvil:
 *  • once: true     → se anima UNA SOLA VEZ. Sin repetición al
 *                     hacer scroll arriba/abajo. Ahorra batería.
 *  • margin: -80px  → se dispara 80px antes del borde visible
 *  • useReducedMotion → respeta "Reducir movimiento" del SO
 *  • transform+opacity → propiedades compuestas (compositor
 *                     thread), no bloquean el hilo principal
 */

import { memo, type ReactNode } from 'react'
import { motion, useReducedMotion, type Transition } from 'framer-motion'

// ─── Ease personalizado como tupla (tipos estrictos FM v12) ──
// [0.25, 0.46, 0.45, 0.94] = easeOutQuad: rápido al inicio, suave al final
const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

// ─── Tipos del componente ─────────────────────────────────────
interface ScrollRevealProps {
  children:   ReactNode
  /** Retraso en segundos. Útil para stagger manual en listas. */
  delay?:     number
  /** Duración de la transición en segundos (default: 0.45). */
  duration?:  number
  /**
   * Desplazamiento inicial en px (efecto slide-up).
   * 20–28: sutil para tarjetas. 40–60: dramático para heroes.
   */
  y?:         number
  className?: string
}

// ─── Componente ScrollReveal ──────────────────────────────────
export const ScrollReveal = memo<ScrollRevealProps>(({
  children,
  delay    = 0,
  duration = 0.45,
  y        = 24,
  className,
}) => {
  const shouldReduce = useReducedMotion()

  // Respeta la preferencia de accesibilidad del SO
  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  const transition: Transition = {
    duration,
    delay,
    ease: EASE_OUT,
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{
        once:   true,    // ← CLAVE: se anima solo la primera vez
        margin: '-80px', // se dispara 80px antes del borde
      }}
      transition={transition}
    >
      {children}
    </motion.div>
  )
})
ScrollReveal.displayName = 'ScrollReveal'

// ═══════════════════════════════════════════════════════════════
// VARIANTE: ScrollRevealList + ScrollRevealItem (stagger automático)
// ═══════════════════════════════════════════════════════════════

interface ScrollRevealListProps {
  children:  ReactNode
  /** Intervalo entre hijos en segundos (default: 0.08 → 80ms). */
  stagger?:  number
  className?: string
}

/**
 * Lista con stagger automático: el padre orquesta el timing,
 * los hijos (<ScrollRevealItem>) se animan en secuencia.
 *
 * Ejemplo:
 * ```tsx
 * <ScrollRevealList stagger={0.08} className="grid grid-cols-2 gap-4">
 *   {dishes.map(d => (
 *     <ScrollRevealItem key={d.id}>
 *       <DishCard dish={d} onAdd={handleAdd} />
 *     </ScrollRevealItem>
 *   ))}
 * </ScrollRevealList>
 * ```
 */
export const ScrollRevealList = memo<ScrollRevealListProps>(({
  children,
  stagger   = 0.08,
  className,
}) => {
  const shouldReduce = useReducedMotion()
  if (shouldReduce) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden:  {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  )
})
ScrollRevealList.displayName = 'ScrollRevealList'

/**
 * Item hijo para <ScrollRevealList>.
 * Hereda automáticamente las variantes "hidden" / "visible" del padre.
 */
export const ScrollRevealItem = memo<{ children: ReactNode; className?: string }>(
  ({ children, className }) => {
    const shouldReduce = useReducedMotion()
    if (shouldReduce) return <div className={className}>{children}</div>

    return (
      <motion.div
        className={className}
        variants={{
          hidden:  { opacity: 0, y: 24 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.45, ease: EASE_OUT } as Transition,
          },
        }}
      >
        {children}
      </motion.div>
    )
  }
)
ScrollRevealItem.displayName = 'ScrollRevealItem'
