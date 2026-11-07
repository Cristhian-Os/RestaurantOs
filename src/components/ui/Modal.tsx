import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Diálogo accesible: Esc y clic fuera cierran, el foco entra y vuelve al botón que lo abrió.
 * En pantallas angostas se muestra como hoja inferior (sheet), en escritorio centrado.
 */
export function Modal({ open, onClose, title, children, footer }: Props) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key !== 'Tab' || !box.current) return
      const f = box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus() }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: 'var(--w-overlay)', zIndex: 'var(--w-z-modal)' as unknown as number }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="liquid-glass liquid-glass-dense flex max-h-[90dvh] w-full flex-col rounded-t-[var(--w-r-xl)] sm:max-w-[480px] sm:rounded-[var(--w-r-xl)]"
        style={{ fontFamily: 'var(--w-font)', color: 'var(--w-text)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--w-border)] px-5 py-4">
          <h2 id={titleId} className="font-bold text-[length:var(--w-fs-title)]">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-[var(--w-r-md)] text-[color:var(--w-text-2)] hover:bg-[var(--w-surface-sunken)]"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[var(--w-border)] px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
