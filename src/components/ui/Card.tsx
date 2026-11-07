import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Superficie limpia: borde discreto, sombra contenida. No anidar tarjetas sin necesidad. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4',
        'shadow-[var(--w-shadow-sm)]',
        className,
      )}
      {...rest}
    />
  )
}

/** Capa flotante de vidrio líquido: SOLO para píldora de navegación, panel Más, popovers y overlays. */
export function GlassPanel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--w-r-xl)] p-3', className)}
      style={{
        background: 'var(--w-glass-bg)',
        backdropFilter: 'blur(var(--w-glass-blur)) saturate(var(--w-glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--w-glass-blur)) saturate(var(--w-glass-saturate))',
        border: '1px solid var(--w-glass-border)',
        boxShadow: 'var(--w-shadow-lg), 0 0 0 1px var(--w-glass-ring)',
      }}
      {...rest}
    />
  )
}
