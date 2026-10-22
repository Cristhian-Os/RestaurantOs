/**
 * VoiceButton.tsx
 * Botón de micrófono reutilizable: toca para grabar, toca de nuevo para detener;
 * el audio se procesa y `onResult` recibe el resultado (transcripción + datos).
 * Nunca guarda nada: quien lo usa muestra el resultado para revisarlo.
 */
import { useEffect, useRef, useState } from 'react'
import message from 'antd/es/message'
import { startRecording, parseVoice, MAX_RECORD_SECONDS, type Recorder, type VoiceKind } from '../services/voiceService'

interface Props<T> {
  kind:       VoiceKind
  onResult:   (result: T) => void
  /** Datos para que la IA empareje nombres (categorías, ingredientes, empleados…). */
  context?:   () => Record<string, unknown> | Promise<Record<string, unknown>>
  label?:     string      // si se omite, botón compacto (solo ícono)
  title?:     string
  disabled?:  boolean
}

type State = 'idle' | 'recording' | 'processing'

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" />
  </svg>
)

export function VoiceButton<T = Record<string, unknown>>({ kind, onResult, context, label, title, disabled }: Props<T>) {
  const [state, setState]     = useState<State>('idle')
  const [seconds, setSeconds] = useState(0)
  const recRef = useRef<Recorder | null>(null)

  useEffect(() => () => recRef.current?.cancel(), [])

  useEffect(() => {
    if (state !== 'recording') return
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])

  const finish = async () => {
    const rec = recRef.current
    if (!rec) return
    recRef.current = null
    setState('processing')
    try {
      const audio = await rec.stop()
      const ctx = context ? await context() : {}
      onResult(await parseVoice<T>(kind, audio, ctx))
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo procesar el audio')
    } finally {
      setState('idle')
    }
  }

  useEffect(() => {
    if (state === 'recording' && seconds >= MAX_RECORD_SECONDS) void finish()
  }, [seconds, state])

  const toggle = async () => {
    if (state === 'processing') return
    if (state === 'recording') { await finish(); return }
    try {
      recRef.current = await startRecording()
      setSeconds(0)
      setState('recording')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo grabar')
    }
  }

  const recording  = state === 'recording'
  const processing = state === 'processing'

  return (
    <button type="button" onClick={toggle} disabled={disabled || processing}
      title={title ?? 'Dictar por voz'} aria-label={title ?? 'Dictar por voz'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', flexShrink: 0,
        padding: label ? '0.5rem 0.875rem' : '0.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer',
        fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'inherit',
        background: recording ? 'var(--w-wine, #b91c1c)' : 'var(--w-terra, #FF5722)', color: '#fff',
        opacity: disabled || processing ? 0.6 : 1,
      }}>
      <MicIcon />
      {recording ? `Detener · ${seconds}s` : processing ? 'Procesando…' : label}
    </button>
  )
}
