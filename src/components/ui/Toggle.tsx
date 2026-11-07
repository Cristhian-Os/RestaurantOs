import { cn } from '../../lib/cn'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}

/** Interruptor con etiqueta accesible. El naranja marca "activo" (selección relevante). */
export function Toggle({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 44 px de alto táctil; la pista visual mide 28 px
      className="relative inline-flex h-[44px] w-[56px] items-center justify-center rounded-[var(--w-r-pill)] disabled:opacity-50"
    >
      <span className={cn(
        'relative h-[28px] w-[48px] rounded-[var(--w-r-pill)] transition-colors duration-[var(--w-dur)]',
        checked ? 'bg-[var(--w-accent)]' : 'bg-[var(--w-border-strong)]',
      )}>
        <span className={cn(
          'absolute left-0 top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[var(--w-shadow-sm)] transition-transform duration-[var(--w-dur)]',
          checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
        )} />
      </span>
    </button>
  )
}
