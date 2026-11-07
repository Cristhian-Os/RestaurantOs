import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

const TONE: Record<Tone, { cls: string; glyph: string }> = {
  success: { cls: 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]', glyph: '✓' },
  warning: { cls: 'bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]', glyph: '!' },
  danger:  { cls: 'bg-[var(--w-danger-bg)] text-[color:var(--w-danger-text)]',   glyph: '✕' },
  info:    { cls: 'bg-[var(--w-info-bg)] text-[color:var(--w-info-text)]',       glyph: 'i' },
  neutral: { cls: 'bg-[var(--w-surface-sunken)] text-[color:var(--w-text-2)]',   glyph: '•' },
  accent:  { cls: 'bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]', glyph: '•' },
}

/** Estado con icono + texto: nunca se comunica solo con color. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-[var(--w-r-pill)] px-2.5 py-1 font-semibold leading-none',
      'text-[length:var(--w-fs-caption)]', TONE[tone].cls, className,
    )}>
      <span aria-hidden className="font-bold">{TONE[tone].glyph}</span>
      {children}
    </span>
  )
}
