/**
 * VoiceCommandModal.tsx
 * Cambia datos que ya existen hablando: precio/disponibilidad de platos, inventario,
 * tareas, turnos y mesas. Se dicta, se muestra cada cambio como "antes → después",
 * y solo se aplica lo que la persona aprueba. Nada se guarda sin esa revisión.
 *
 * Colores con las variables --w-* del tema: el modo claro/oscuro de la app se
 * aplica solo (la app no usa la clase `dark:` de Tailwind).
 */
import { forwardRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import message from 'antd/es/message'
import { VoiceButton } from './VoiceButton'
import { cn } from '../lib/cn'
import { buildProposals, toPromptContext, type CommandContext, type Proposal, type RawAction, type VoiceRole } from '../services/voiceCommands'
import { applyChange, loadCommandContext } from '../services/voiceCommandsApi'

interface Item { id: number; action: RawAction; error?: string }

interface Props {
  userId:    string
  role:      VoiceRole
  onApplied: () => void
  onClose:   () => void
}

// ─── Fila de un cambio propuesto ─────────────────────────────────────────────

interface RowProps {
  proposal: Proposal
  error?:   string
  disabled: boolean
  onRemove: () => void
}

const ProposalRow = forwardRef<HTMLLIElement, RowProps>(({ proposal, error, disabled, onRemove }, ref) => {
  const problem = proposal.problem ?? error
  return (
    <motion.li
      ref={ref} layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      className={cn(
        'relative flex items-start gap-3 rounded-2xl border bg-[var(--w-surface)] p-3 pr-10 list-none',
        problem ? 'border-[var(--w-wine)]' : 'border-[var(--w-line)]',
      )}>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-bold text-[var(--w-ink)]">{proposal.title}</p>
        {proposal.detail && <p className="m-0 mt-0.5 text-sm text-[var(--w-ink-soft)]">{proposal.detail}</p>}
        {problem && <p className="m-0 mt-1 text-xs font-semibold text-[var(--w-wine)]">{problem}</p>}
      </div>
      <button type="button" onClick={onRemove} disabled={disabled} aria-label="Quitar este cambio" title="Quitar"
        className="absolute right-2 top-2 h-7 w-7 cursor-pointer rounded-lg border-none bg-transparent text-base text-[var(--w-ink-mut)] hover:text-[var(--w-wine)] disabled:opacity-50">
        ✕
      </button>
    </motion.li>
  )
})
ProposalRow.displayName = 'ProposalRow'

// ─── Modal ───────────────────────────────────────────────────────────────────

export function VoiceCommandModal({ userId, role, onApplied, onClose }: Props) {
  const [ctx, setCtx]               = useState<CommandContext | null>(null)
  const [items, setItems]           = useState<Item[]>([])
  const [transcript, setTranscript] = useState('')
  const [applying, setApplying]     = useState(false)
  const [nextId, setNextId]         = useState(1)

  const proposals = useMemo(
    () => (ctx ? buildProposals(items.map(i => i.action), ctx, userId, role) : []),
    [ctx, items, userId, role],
  )
  const applicable = proposals.filter(p => p.change).length

  const onResult = (r: { transcript: string; actions: RawAction[] }) => {
    setTranscript(r.transcript ?? '')
    const actions = r.actions ?? []
    if (actions.length === 0) { message.warning('No entendí ningún cambio. Intenta de nuevo.'); return }
    setItems(prev => [...prev, ...actions.map((action, k) => ({ id: nextId + k, action }))])
    setNextId(n => n + actions.length)
  }

  const apply = async () => {
    if (applicable === 0 || applying) return
    setApplying(true)
    const done = new Set<number>()
    const failed = new Map<number, string>()
    // En orden: las propuestas ya se calcularon suponiendo ese orden.
    for (const p of proposals) {
      if (!p.change) continue
      const item = items[p.index]
      try {
        await applyChange(p.change, role)
        done.add(item.id)
      } catch (e) {
        failed.set(item.id, e instanceof Error ? e.message : 'No se pudo aplicar')
      }
    }
    if (done.size > 0) onApplied()

    const remaining = items.filter(i => !done.has(i.id)).map(i => ({ ...i, error: failed.get(i.id) }))
    if (remaining.length === 0) {
      setApplying(false)
      message.success(`${done.size} ${done.size === 1 ? 'cambio aplicado' : 'cambios aplicados'}`)
      onClose()
      return
    }
    // Quedan cambios con problemas: recargo los datos (ya cambiaron) y los dejo para revisar.
    try {
      setCtx(await loadCommandContext(role))
      setItems(remaining)
      if (done.size > 0) message.warning(`${done.size} aplicados. Revisa los que quedaron.`)
      else message.error('No se pudo aplicar ningún cambio.')
    } catch {
      message.warning(`${done.size} aplicados. Cierra y vuelve a abrir para continuar.`)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  return createPortal(
    <div onClick={() => !applying && onClose()} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div onClick={e => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-3xl border border-[var(--w-line)] bg-[var(--w-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-lg font-bold text-[var(--w-ink)]">Comando de voz</h3>
          <VoiceButton<{ transcript: string; actions: RawAction[] }>
            kind="command" label={items.length ? 'Dictar más' : 'Hablar'} onResult={onResult} disabled={applying}
            context={async () => {
              const fresh = await loadCommandContext(role)
              setCtx(fresh)
              return toPromptContext(fresh)
            }} />
        </div>

        <p className="m-0 text-xs text-[var(--w-ink-mut)]">
          Di por ejemplo: {role === 'admin'
            ? '“sube el cholao grande a 15 mil”, “se acabó la fresa”, “agrégale 3 kilos al limón”, “mesa 4 ocupada”, “Juan trabaja el lunes de 8 a 5”, “ponle una tarea a María: limpiar la nevera”.'
            : '“se acabó la limonada”, “se acabó la fresa”, “quedan 2 kilos de limón”, “mesa 4 ocupada”, “mesa 4 libre”.'}
          {' '}Revisa los cambios antes de aplicarlos.
        </p>

        {transcript && (
          <p className="m-0 rounded-xl bg-[var(--w-surface)] px-3 py-2 text-xs italic text-[var(--w-ink-soft)]">
            Escuché: “{transcript}”
          </p>
        )}

        <ul className="m-0 flex flex-col gap-2 p-0">
          <AnimatePresence initial={false}>
            {proposals.map(p => (
              <ProposalRow key={items[p.index].id} proposal={p} error={items[p.index].error} disabled={applying}
                onRemove={() => setItems(prev => prev.filter(i => i.id !== items[p.index].id))} />
            ))}
          </AnimatePresence>
        </ul>

        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} disabled={applying}
            className="flex-1 cursor-pointer rounded-2xl border-none bg-[var(--w-surface)] p-3 font-bold text-[var(--w-ink-soft)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={apply} disabled={applying || applicable === 0}
            className="flex-[2] cursor-pointer rounded-2xl border-none bg-[var(--w-terra)] p-3 font-bold text-white disabled:opacity-50">
            {applying ? 'Aplicando…' : applicable > 0 ? `Aplicar ${applicable} ${applicable === 1 ? 'cambio' : 'cambios'}` : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
