import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

// Naranja solo en la acción primaria. Texto blanco como las láminas (decisión del dueño; 3,1:1, siempre en negrita).
const VARIANT: Record<Variant, string> = {
  primary:   'bg-[var(--w-accent)] text-[color:var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] active:bg-[var(--w-accent-press)]',
  secondary: 'bg-[var(--w-surface)] text-[color:var(--w-text)] border border-[var(--w-border-strong)] hover:bg-[var(--w-surface-sunken)]',
  ghost:     'bg-transparent text-[color:var(--w-text-2)] hover:bg-[var(--w-surface-sunken)]',
  danger:    'bg-[var(--w-danger-bg)] text-[color:var(--w-danger-text)] border border-[var(--w-danger)] hover:brightness-95',
}
// md = 44 px: tamaño táctil mínimo
const SIZE: Record<Size, string> = {
  sm: 'min-h-[36px] px-3 text-[length:var(--w-fs-label)]',
  md: 'min-h-[44px] px-4 text-[length:var(--w-fs-body)]',
  lg: 'min-h-[52px] px-6 text-[length:var(--w-fs-body-lg)]',
}

export function Button({ variant = 'primary', size = 'md', loading, icon, disabled, className, children, type = 'button', ...rest }: Props) {
  const off = disabled || loading
  return (
    <button
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--w-r-md)] font-semibold',
        'transition-colors duration-[var(--w-dur)] select-none',
        VARIANT[variant], SIZE[size],
        off && 'opacity-50 cursor-not-allowed',
        className,
      )}
      style={{ fontFamily: 'var(--w-font)' }}
      {...rest}
    >
      {loading
        ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        : icon}
      {children}
    </button>
  )
}
