/**
 * voiceMatch.ts — empareja un nombre dictado ("fresas", "Juan") con el más
 * parecido de una lista existente (ingredientes, platos, empleados).
 * Sin coincidencia razonable devuelve null: la persona lo elige en la revisión.
 */
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Singular burdo para que "fresas" ≈ "fresa".
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

export function matchName<T>(spoken: string | undefined | null, items: T[], getName: (t: T) => string): T | null {
  const q = norm(spoken ?? '')
  if (!q) return null
  const list = items.map(it => ({ it, n: norm(getName(it)) }))

  const exact = list.find(x => x.n === q)
  if (exact) return exact.it

  const qs = q.split(' ').map(stem)
  let best: { it: T; score: number } | null = null
  for (const x of list) {
    const ns = x.n.split(' ').map(stem)
    const shared = qs.filter(w => ns.includes(w)).length
    if (shared === 0) continue
    const score = shared / Math.max(qs.length, ns.length)
    if (!best || score > best.score) best = { it: x.it, score }
  }
  return best && best.score >= 0.5 ? best.it : null
}
