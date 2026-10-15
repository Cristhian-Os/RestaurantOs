/**
 * voiceText.ts — Utilidades puras del dictado (sin red ni React) para poder probarlas con scripts/voiceText.check.ts.
 */

/** Largo máximo del texto que se manda a `voice-parse` (el servidor aplica el mismo límite). */
export const MAX_TEXT_CHARS = 1500

/** Limpia una transcripción simple: espacios y UN punto final. Nunca borra otra letra ("Frutas Pérez" queda igual). */
export function limpiarTranscripcion(s: string): string {
  return (s ?? '').trim().replace(/\.$/, '').trim()
}

/**
 * Cambia solo los elementos de un dictado (`group`) por los nuevos. Los de otros dictados no se tocan.
 * Los nuevos quedan donde estaba el primero del grupo viejo (o al final si el grupo ya no tenía ninguno).
 */
export function reemplazarGrupo<T extends { group: number }>(items: T[], group: number, nuevos: T[]): T[] {
  const first = items.findIndex(i => i.group === group)
  const rest = items.filter(i => i.group !== group)
  if (first < 0) return [...rest, ...nuevos]
  const before = items.slice(0, first).filter(i => i.group !== group).length
  return [...rest.slice(0, before), ...nuevos, ...rest.slice(before)]
}
