/** Devuelve la URL solo si es https:// válida; si no, null (evita javascript:, data:, http:). */
export function urlSegura(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const t = u.trim()
  if (!t) return null
  try {
    const url = new URL(t)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
