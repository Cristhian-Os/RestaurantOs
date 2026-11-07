/**
 * Parte lo que dirá Resti en frases cortas. La voz de Gemini no se transmite mientras se genera: tarda varios segundos en devolver todo el audio.
 * Pidiendo cada frase por separado (a la vez) y reproduciéndolas en orden, se oye la primera mucho antes de que termine la segunda.
 */
export function partirFrases(texto: string, maxFrases = 3, minLargo = 14): string[] {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const crudas = t.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
  const frases: string[] = []
  for (const c of crudas) {
    // Una frase muy corta ("Sí.", "Listo.") se une a la anterior: pedir su audio aparte cuesta más de lo que ahorra.
    if (frases.length && (c.length < minLargo || frases[frases.length - 1].length < minLargo)) frases[frases.length - 1] += ' ' + c
    else frases.push(c)
  }
  // Más de `maxFrases`: se agrupan las últimas para no pedir demasiados audios.
  while (frases.length > maxFrases) { const ult = frases.pop()!; frases[frases.length - 1] += ' ' + ult }
  return frases
}
