/**
 * VoiceCommandFab.tsx
 * Botón flotante de micrófono, a la izquierda del botón del chat de soporte.
 * Abre el modal de comandos de voz (admin y cajero).
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/cn'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'>

export const VoiceCommandFab = forwardRef<HTMLButtonElement, Props>(({ className, ...props }, ref) => (
  <motion.button
    ref={ref} type="button" whileTap={{ scale: 0.92 }}
    title="Comando de voz" aria-label="Comando de voz"
    // 20px del borde + 58px del botón del chat + 12px de separación
    style={{ position: 'fixed', bottom: 20, right: 90, zIndex: 90 }}
    className={cn(
      'flex h-[58px] w-[58px] cursor-pointer items-center justify-center rounded-full border border-[var(--w-line)]',
      'bg-[var(--w-surface)] text-[var(--w-terra)] shadow-lg',
      className,
    )}
    {...props}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[26px] w-[26px]">
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" />
    </svg>
  </motion.button>
))
VoiceCommandFab.displayName = 'VoiceCommandFab'
