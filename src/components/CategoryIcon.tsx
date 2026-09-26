/**
 * CategoryIcon.tsx
 * Iconos de línea (stroke) por categoría de plato — reemplaza los
 * emojis decorativos (🥗🍽️🍰🥤) que quedaban como "tell" de IA.
 */
import type { DishCategory } from '../types'

const PATHS: Record<DishCategory | 'especial', string> = {
  entrada:   'M12 3c-4 0-7 2.5-7 7 0 3 1.8 5.2 4 6.3V21h6v-4.7c2.2-1.1 4-3.3 4-6.3 0-4.5-3-7-7-7zM8 8c1-1.5 2.5-2 4-2s3 .5 4 2',
  principal: 'M7 3v6a2 2 0 0 0 4 0V3M9 9v12M17 3c-1.5 0-3 1.5-3 4s1 4 1 6v8M17 3v18',
  postre:    'M5 21h14l-1.2-9.5a1 1 0 0 0-1-.9H7.2a1 1 0 0 0-1 .9L5 21zM8 10.5C8 7 9.5 3 12 3s4 4 4 7.5',
  bebida:    'M6 3h12l-1.2 15.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8L6 3zM5 3h14M8 8h8',
  especial:  'M12 2l2.6 6.6L21 9.2l-5 4.5L17.4 21 12 17.5 6.6 21 8 13.7l-5-4.5 6.4-.6L12 2z',
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
