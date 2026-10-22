// Esquema de la respuesta de Resti. Copia del validador del navegador (src/lib/resti): mantener las dos listas iguales.
export const TARGETS = ['card-ventas-hoy', 'card-pendientes', 'card-en-cocina', 'card-listas', 'card-completadas', 'card-mesas-activas', 'tab-nueva-orden', 'tab-mesas'] as const
export const ACCIONES = ['NONE', 'WALK_AND_POINT', 'OPEN_VOICE_COMMANDS', 'SLEEP', 'START_FEEDBACK'] as const

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

export interface TurnoHistorial { rol: 'user' | 'assistant'; texto: string }
const MAX_TURNOS = 6, MAX_TEXTO = 300

/**
 * Memoria de la conversación que manda el navegador. Es DATO no confiable: solo se aceptan hasta 6 turnos,
 * roles user/assistant, texto recortado, y siempre empieza por un turno del administrador (nunca por una respuesta inventada).
 */
export function limpiarHistorial(raw: unknown): TurnoHistorial[] {
  if (!Array.isArray(raw)) return []
  // eslint-disable-next-line no-control-regex
  const limpio = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO)
  const out: TurnoHistorial[] = []
  for (const t of raw.slice(-MAX_TURNOS)) {
    const o = t as Record<string, unknown>
    const rol = o?.rol === 'user' || o?.rol === 'assistant' ? o.rol : null
    const texto = limpio(o?.texto)
    if (rol && texto) out.push({ rol, texto })
  }
  while (out.length && out[0].rol !== 'user') out.shift()
  // Los roles deben alternar: si hay dos seguidos del mismo, se queda el más reciente.
  return out.filter((t, i) => i === out.length - 1 || out[i + 1].rol !== t.rol)
}

/** Extrae el objeto JSON de la respuesta del modelo (tolera texto o ``` alrededor). null si no hay JSON válido. */
export function extraerJson(texto: string): unknown {
  const t = texto.trim()
  try { return JSON.parse(t) } catch { /* puede venir envuelto */ }
  const i = t.indexOf('{'), j = t.lastIndexOf('}')
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)) } catch { /* no era JSON */ } }
  return null
}
