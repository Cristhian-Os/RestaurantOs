import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const CONTROL = cn(
  'w-full min-h-[44px] rounded-[var(--w-r-md)] border bg-[var(--w-surface)] px-3',
  'text-[length:var(--w-fs-body)] text-[color:var(--w-text)] placeholder:text-[color:var(--w-text-3)]',
  'transition-colors duration-[var(--w-dur)]',
  'disabled:bg-[var(--w-surface-sunken)] disabled:text-[color:var(--w-text-disabled)] disabled:cursor-not-allowed',
)

interface Meta {
  label: string
  hint?: string
  error?: string
  required?: boolean
}

/** Etiqueta persistente + ayuda breve + error junto al campo. */
function Shell({ label, hint, error, required, id, children }: Meta & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">
        {label}{required && <span aria-hidden className="text-[color:var(--w-accent-text)]"> *</span>}
      </label>
      {children}
      {error
        ? <p id={`${id}-msg`} role="alert" className="text-[length:var(--w-fs-caption)] font-medium text-[color:var(--w-danger-text)]">✕ {error}</p>
        : hint && <p id={`${id}-msg`} className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hint}</p>}
    </div>
  )
}
const borderOf = (error?: string) => (error ? 'border-[var(--w-danger)]' : 'border-[var(--w-border-strong)]')
const describe = (id: string, m: Meta) => ({
  id,
  'aria-invalid': m.error ? true : undefined,
  'aria-describedby': m.error || m.hint ? `${id}-msg` : undefined,
})

export function Input({ label, hint, error, required, className, ...rest }: Meta & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      <input required={required} className={cn(CONTROL, borderOf(error), className)} {...describe(id, { label, hint, error })} {...rest} />
    </Shell>
  )
}

export function Textarea({ label, hint, error, required, className, ...rest }: Meta & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea required={required} rows={3} className={cn(CONTROL, 'py-2', borderOf(error), className)} {...describe(id, { label, hint, error })} {...rest} />
    </Shell>
  )
}

export function Select({ label, hint, error, required, className, children, ...rest }: Meta & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      <select required={required} className={cn(CONTROL, borderOf(error), className)} {...describe(id, { label, hint, error })} {...rest}>{children}</select>
    </Shell>
  )
}
