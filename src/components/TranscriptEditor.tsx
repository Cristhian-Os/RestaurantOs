/**
 * TranscriptEditor.tsx
 * Lo que se entendió de un dictado, en un cuadro que se puede corregir; "Interpretar de nuevo" manda el
 * texto corregido (sin volver a grabar). Sirve también para escribir en vez de hablar (cuadro vacío).
 * Solo propone: quien lo usa sigue mostrando los cambios para revisarlos antes de guardar.
 */
import { MAX_TEXT_CHARS } from '../services/voiceText'

interface Props {
  value:       string
  onChange:    (v: string) => void
  onInterpret: () => void
  busy?:       boolean
  disabled?:   boolean
  /** Texto de ayuda cuando está vacío (modo "escribir"). */
  placeholder?: string
}

export function TranscriptEditor({ value, onChange, onInterpret, busy, disabled, placeholder }: Props) {
  const empty = value.trim() === ''
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[var(--w-surface)] p-2.5">
      <label className="text-[0.6875rem] font-bold uppercase text-[var(--w-ink-mut)]">Escuché (puedes corregirlo)</label>
      <textarea
        value={value} onChange={e => onChange(e.target.value.slice(0, MAX_TEXT_CHARS))} rows={2}
        disabled={busy || disabled} placeholder={placeholder ?? 'Escribe aquí lo que quieres hacer'}
        className="w-full resize-y rounded-lg border border-[var(--w-line)] bg-[var(--w-bg)] p-2 text-sm text-[var(--w-ink)]" />
      <button type="button" onClick={onInterpret} disabled={busy || disabled || empty}
        className="cursor-pointer self-end rounded-xl border-none bg-[var(--w-terra)] px-3.5 py-2 text-[0.8125rem] font-bold text-white disabled:opacity-50">
        {busy ? 'Interpretando…' : 'Interpretar de nuevo'}
      </button>
    </div>
  )
}
