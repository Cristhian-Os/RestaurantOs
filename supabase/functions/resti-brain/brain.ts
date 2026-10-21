// Esquema de la respuesta de Resti. Copia del validador del navegador (src/lib/resti): mantener las dos listas iguales.
export const TARGETS = ['card-ventas-hoy', 'card-pendientes', 'card-en-cocina', 'card-listas', 'card-completadas', 'card-mesas-activas', 'tab-nueva-orden', 'tab-mesas', 'btn-notificaciones'] as const
export const ACCIONES = ['NONE', 'WALK_AND_POINT', 'OPEN_VOICE_COMMANDS', 'SLEEP'] as const

export interface BrainResponse { speech: string; action: typeof ACCIONES[number]; targetId?: typeof TARGETS[number] }

export const SIN_RESPUESTA: BrainResponse = { speech: 'No te entendí bien. ¿Me lo dices de otra forma?', action: 'NONE' }

export function recortarHabla(s: string): string {
  const oraciones = s.replace(/\s+/g, ' ').trim().match(/[^.!?¡¿][^.!?]*[.!?]?/g) ?? []
  const t = oraciones.slice(0, 2).join('').trim()
  return t.length > 260 ? t.slice(0, 257).trimEnd() + '…' : t
}

/** Valida lo que devolvió el modelo. Si no cumple el esquema devuelve null (Resti no actúa). */
export function validar(raw: unknown): BrainResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const o = { ...(raw as Record<string, unknown>) }
  if (typeof o.speech !== 'string' || !o.speech.trim()) return null
  if (typeof o.action !== 'string' || !(ACCIONES as readonly string[]).includes(o.action)) return null
  if (o.action === 'WALK_AND_POINT') {
    if (typeof o.targetId !== 'string' || !(TARGETS as readonly string[]).includes(o.targetId)) return null
    return { speech: recortarHabla(o.speech), action: 'WALK_AND_POINT', targetId: o.targetId as BrainResponse['targetId'] }
  }
  return { speech: recortarHabla(o.speech), action: o.action as BrainResponse['action'] }   // el modelo puede mandar un targetId de más: se ignora
}
