/**
 * Habilidad agéntica de Resti: entender una orden de cambio, prepararla, pedir confirmación y aplicarla.
 * Aquí solo está la parte pura (detectar la orden, la confirmación y armar lo que Resti dice); el trabajo con la base está en Resti.tsx
 * y reutiliza EXACTAMENTE las mismas reglas del modal de comandos (voiceCommands: propuestas validadas, RLS al escribir).
 */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

/** ¿Lo que dijo suena a una orden de CAMBIAR datos (agotar, precio, inventario, mesa, gasto, tarea…)? Si no, se pregunta al cerebro como siempre. */
export function esOrdenDeCambio(frase: string): boolean {
  const t = norm(frase)
  if (t.length < 6) return false
  if (/^(cuanto|cuantos|cuantas|que|como|donde|quien|cual|cuando|por que|me (muestras|dices|llevas))\b/.test(t)) return false   // preguntas y consultas
  return /\b(desactiva\w*|activa\w*|agot\w+|se (acabo|termino|agoto)|ya no (hay|queda)|volvio|sube\w*|baja\w*|cambia\w*|pon\w*|marca\w*|quita\w*|registra\w*|anota\w*|agrega\w*|resta\w*|suma\w*|crea\w*|asigna\w*|compre|le pague)\b/.test(t)
    && /\b(helado|sabor|jugo|plato|precio|inventario|stock|mesa|gasto|tarea|turno|receta|proveedor|ingrediente|cholao|limon|fresa|vainilla|leche|topping|agotad\w+|disponible)\b|\$|\d/.test(t)
}

/** "sí, aplícalo" cuando hay un cambio esperando confirmación. Solo el comienzo de la frase, para no confundirlo con otra cosa. */
export const esConfirmacion = (frase: string) => /^(si|sii+|dale|de una|aplicalo|aplicalos|aplica|confirmo|confirma|confirmado|hazlo|hagale|listo|ok|okay|claro|por favor|correcto|exacto|eso es)\b/.test(norm(frase))
export const esCancelacion = (frase: string) => /^(no|nop|cancela\w*|dejalo|olvidalo|ahora no|mejor no|para|detente|alto)\b/.test(norm(frase))

export interface PropuestaCorta { title: string; detail: string; change: unknown | null; problem?: string }

/** Lo que Resti dice al proponer el cambio (corto: va por voz y en el globo). */
export function resumenParaDecir(ps: PropuestaCorta[]): string {
  const ok = ps.filter(p => p.change)
  if (ok.length === 0) return 'No pude preparar ese cambio.'
  if (ok.length === 1) return `${limpiarFrase(ok[0].title, ok[0].detail)} ¿Lo aplico?`
  return `Preparé ${ok.length} cambios. Míralos en pantalla y dime sí para aplicarlos.`
}
/** Para decirlo en voz alta: sin símbolos ("·", "→") que el sintetizador lee mal. */
const limpiarFrase = (title: string, detail: string) => {
  const ti = String(title ?? '').replace(/\s*·\s*/g, ', ').trim()
  const de = String(detail ?? '').trim().replace(/^(.+?)\s*→\s*(.+)$/, 'de $1 a $2').replace(/\s*→\s*/g, ' a ')
  const t = [ti, de].filter(Boolean).join(': ')
  return /[.!?]$/.test(t) ? t : t + '.'
}

export function resumenAplicado(hechos: number, fallos: string[]): string {
  if (fallos.length === 0) return hechos === 1 ? 'Listo, ya lo apliqué.' : `Listo, apliqué los ${hechos} cambios.`
  if (hechos === 0) return `No pude aplicarlo: ${fallos[0]}`
  return `Apliqué ${hechos}, pero uno falló: ${fallos[0]}`
}
