import { isRestiTarget, type RestiBrainResponse } from './targets.ts'

const ACCIONES = ['NONE', 'WALK_AND_POINT', 'OPEN_VOICE_COMMANDS', 'SLEEP', 'START_FEEDBACK']

/** Máximo 2 oraciones y 260 caracteres: lo que Resti dice se muestra en un subtítulo de 2 líneas. */
export function recortarHabla(s: string): string {
  const oraciones = s.replace(/\s+/g, ' ').trim().match(/[^.!?¡¿][^.!?]*[.!?]?/g) ?? []
  const t = oraciones.slice(0, 2).join('').trim()
  return t.length > 260 ? t.slice(0, 257).trimEnd() + '…' : t
}

/** Valida lo que devuelve el servidor. Si no cumple el esquema devuelve null y Resti NO actúa. */
export function parseBrainResponse(raw: unknown): RestiBrainResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.speech !== 'string' || !o.speech.trim()) return null
  if (typeof o.action !== 'string' || !ACCIONES.includes(o.action)) return null
  if (o.action === 'WALK_AND_POINT') {
    if (!isRestiTarget(o.targetId)) return null
    return { speech: recortarHabla(o.speech), action: 'WALK_AND_POINT', targetId: o.targetId }
  }
  if (o.targetId !== undefined && o.targetId !== null) return null
  return { speech: recortarHabla(o.speech), action: o.action as RestiBrainResponse['action'] }
}
