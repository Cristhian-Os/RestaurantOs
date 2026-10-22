/**
 * VoiceCommandModal.tsx
 * Cambia datos que ya existen hablando: precio/disponibilidad de platos, inventario,
 * recetas, gastos, compras a proveedor, tareas, turnos y mesas. Se dicta, se muestra cada cambio como "antes → después",
 * y solo se aplica lo que la persona aprueba. Nada se guarda sin esa revisión.
 *
 * Colores con las variables --w-* del tema: el modo claro/oscuro de la app se
 * aplica solo (la app no usa la clase `dark:` de Tailwind).
 */
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import message from 'antd/es/message'
import { VoiceButton } from './VoiceButton'
import { TranscriptEditor } from './TranscriptEditor'
import { cn } from '../lib/cn'
import { buildProposals, toPromptContext, type CommandContext, type Proposal, type RawAction, type VoiceRole } from '../services/voiceCommands'
import { applyChange, loadCommandContext } from '../services/voiceCommandsApi'
import { parseVoiceText } from '../services/voiceService'
import { reemplazarGrupo } from '../services/voiceText'

// `group` = el dictado del que salió el cambio; al corregir su texto solo se reemplazan los de ese grupo.
interface Item { id: number; group: number; action: RawAction; error?: string }
// `n` = cuántos cambios propuso la última interpretación (para avisar si la persona ya quitó alguno).
interface Dictado { id: number; text: string; n: number }

interface Props {
  userId:    string
  role:      VoiceRole
  onApplied: () => void
  onClose:   () => void
  /** Lo que la persona le dijo a Resti: se interpreta al abrir (igual hay que revisar y aprobar cada cambio). */
  textoInicial?: string
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

export function VoiceCommandModal({ userId, role, onApplied, onClose, textoInicial }: Props) {
  const [ctx, setCtx]               = useState<CommandContext | null>(null)
  const [items, setItems]           = useState<Item[]>([])
  const [dictados, setDictados]     = useState<Dictado[]>([])
  const [busyGroup, setBusyGroup]   = useState<number | null>(null)
  const [applying, setApplying]     = useState(false)
  const seq = useRef(1)

  const proposals = useMemo(
    () => (ctx ? buildProposals(items.map(i => i.action), ctx, userId, role) : []),
    [ctx, items, userId, role],
  )
  const applicable = proposals.filter(p => p.change).length

  const toItems = (actions: RawAction[], group: number): Item[] => actions.map(action => ({ id: seq.current++, group, action }))

  const onResult = (r: { transcript: string; actions: RawAction[] }) => {
    const actions = r.actions ?? []
    const group = seq.current++
    // El dictado se queda aunque no haya salido ningún cambio: así se corrige el texto ("chorao" → "cholao").
    setDictados(prev => [...prev, { id: group, text: r.transcript ?? '', n: actions.length }])
    if (actions.length === 0) { message.warning('No entendí ningún cambio. Corrige el texto e interprétalo de nuevo.'); return }
    setItems(prev => [...prev, ...toItems(actions, group)])
  }

  const escribir = () => { const id = seq.current++; setDictados(prev => [...prev, { id, text: '', n: 0 }]) }

  const editarTexto = (id: number, text: string) => setDictados(prev => prev.map(d => d.id === id ? { ...d, text } : d))

  /** Manda el texto corregido de un dictado y cambia SOLO las propuestas de ese dictado. */
  const interpretar = async (d: Dictado) => {
    if (busyGroup !== null || applying) return
    const quitados = d.n - items.filter(i => i.group === d.id).length
    if (quitados > 0 && !window.confirm(`Quitaste ${quitados} ${quitados === 1 ? 'cambio' : 'cambios'} de este dictado. Al interpretar de nuevo se reemplazan por lo que salga del texto. ¿Continuar?`)) return
    setBusyGroup(d.id)
    try {
      const fresh = await loadCommandContext(role)
      setCtx(fresh)
      const r = await parseVoiceText<{ transcript: string; actions: RawAction[] }>('command', d.text, toPromptContext(fresh))
      const actions = r.actions ?? []
      setItems(prev => reemplazarGrupo(prev, d.id, toItems(actions, d.id)))
      setDictados(prev => prev.map(x => x.id === d.id ? { ...x, n: actions.length } : x))
      if (actions.length === 0) message.warning('No entendí ningún cambio con ese texto.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo interpretar el texto')
    } finally {
      setBusyGroup(null)
    }
  }

  // Si viene de Resti con lo que dijiste, se interpreta solo (sin tener que repetirlo). Los cambios siguen necesitando tu aprobación.
  useEffect(() => {
    const t = textoInicial?.trim(); if (!t) return
    const id = seq.current++, d = { id, text: t, n: 0 }
    setDictados([d]); void interpretar(d)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          <button type="button" onClick={escribir} disabled={applying || busyGroup !== null}
            className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--w-terra)] underline disabled:opacity-50">
            Escribir en vez de hablar
          </button>
          <VoiceButton<{ transcript: string; actions: RawAction[] }>
            kind="command" label={dictados.length ? 'Dictar más' : 'Hablar'} onResult={onResult} disabled={applying || busyGroup !== null}
            context={async () => {
              const fresh = await loadCommandContext(role)
              setCtx(fresh)
              return toPromptContext(fresh)
            }} />
        </div>

        <p className="m-0 text-xs text-[var(--w-ink-mut)]">
          Di por ejemplo: {role === 'admin'
            ? '“sube el cholao grande a 15 mil”, “se acabó la fresa”, “agrégale 3 kilos al limón”, “mesa 4 ocupada”, “la receta del cholao lleva 200 gramos de fresa y 100 de leche”, “gasto de 50 mil en gas”, “compré a Frutas Pérez 2 kilos de fresa a 8 mil el kilo”, “agrega al proveedor Frutas Pérez, vende fruta, su teléfono es 300 123 4567”, “el correo de Frutas Pérez es ventas arroba frutasperez punto com”, “Juan trabaja el lunes de 8 a 5”, “ponle una tarea a María: limpiar la nevera”.'
            : '“se acabó la limonada”, “se acabó la fresa”, “quedan 2 kilos de limón”, “mesa 4 ocupada”, “gasto de 30 mil en domicilio”, “le pagué 50 mil a Coca-Cola”, “compré a Frutas Pérez 2 kilos de fresa a 8 mil el kilo”.'}
          {' '}Revisa los cambios antes de aplicarlos.
        </p>

        {dictados.map(d => (
          <TranscriptEditor key={d.id} value={d.text} onChange={t => editarTexto(d.id, t)} onInterpret={() => void interpretar(d)}
            busy={busyGroup === d.id} disabled={applying || (busyGroup !== null && busyGroup !== d.id)} />
        ))}

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
