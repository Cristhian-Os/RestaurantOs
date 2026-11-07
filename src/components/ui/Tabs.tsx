import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  items: { key: string; label: string; icon?: ReactNode }[]
  value: string
  // any: los llamadores pasan su setState tipado (p. ej. 'a' | 'b'); la clave siempre sale de `items`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (k: any) => void
  label: string
}

/** Pestañas segmentadas. La activa usa naranja (selección); las demás quedan neutras. */
export function Tabs({ items, value, onChange, label }: Props) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-[var(--w-r-pill)] bg-[var(--w-surface-sunken)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => {
        const on = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={cn(
              'inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--w-r-pill)] px-4 font-semibold transition-colors duration-[var(--w-dur)]',
              'text-[length:var(--w-fs-label)]',
              on
                ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]'
                : 'text-[color:var(--w-text-2)] hover:text-[color:var(--w-text)]',
            )}
          >
            {it.icon && <span aria-hidden className="[&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
