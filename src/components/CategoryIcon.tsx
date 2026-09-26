/**
 * CategoryIcon.tsx
 * Iconos de línea (stroke) por categoría de plato — reemplaza los
 * emojis decorativos (🥗🍽️🍰🥤) que quedaban como "tell" de IA.
 */
import type { DishCategory } from '../types'

const PATHS: Record<DishCategory | 'especial', string> = {
  entrada:   'M4 11a8 8 0 0 0 16 0zM4 11h16M12 11V5M12 5c-1.4 0-2-.9-2-2M12 5c1.4 0 2-.9 2-2',
  principal: 'M7 3v6a2 2 0 0 0 4 0V3M9 9v12M17 3c-1.5 0-3 1.5-3 4s1 4 1 6v8M17 3v18',
  postre:    'M4 21h16l-1-8H5l-1 8zM7 13c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5M12 4.5V7M10.8 3h2.4',
  bebida:    'M6 3h12l-1.2 15.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8L6 3zM5 3h14M8 8h8',
  especial:  'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
}

interface CategoryIconProps {
  category: string
  size?: number
  className?: string
}

export function CategoryIcon({ category, size = 18, className }: CategoryIconProps) {
  const d = PATHS[category as keyof typeof PATHS] ?? PATHS.principal
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} className={className}>
      <path d={d} />
    </svg>
  )
}
