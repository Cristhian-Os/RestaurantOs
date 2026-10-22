// Validación del reporte que redactó la IA. Principio del Anexo I: la IA NO calcula; solo redacta cifras que ya le dio la base.
// Si el texto trae una cifra que no está en los datos, el reporte se rechaza.

export type Confianza = 'seguro' | 'probable' | 'suposicion'
export interface Resultado {
  resumen: string
  hallazgos: { texto: string; cifra: string; fuente: string }[]
  acciones: { texto: string; confianza: Confianza }[]
  datos_faltantes: string[]
}

const MAX = { resumen: 500, texto: 400, cifra: 60, fuente: 80 }
const CONF: Confianza[] = ['seguro', 'probable', 'suposicion']
const txt = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim()
  return s && s.length <= max ? s : null
}

/** Revisa la forma del JSON y lo deja limpio. Devuelve el error en palabras para pedirle al modelo que lo corrija. */
export function validarEsquema(raw: unknown): { ok: true; r: Resultado } | { ok: false; error: string } {
  let o: any = raw
  if (typeof raw === 'string') { try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { return { ok: false, error: 'La respuesta no es JSON válido' } } }
  if (!o || typeof o !== 'object') return { ok: false, error: 'La respuesta no es un objeto JSON' }
  const resumen = txt(o.resumen, MAX.resumen)
  if (!resumen) return { ok: false, error: `Falta "resumen" (texto de hasta ${MAX.resumen} caracteres)` }
  if (!Array.isArray(o.hallazgos) || o.hallazgos.length < 1 || o.hallazgos.length > 5) return { ok: false, error: '"hallazgos" debe tener entre 1 y 5 elementos' }
  const hallazgos = []
  for (const h of o.hallazgos) {
    const texto = txt(h?.texto, MAX.texto), cifra = txt(h?.cifra, MAX.cifra), fuente = txt(h?.fuente, MAX.fuente)
    if (!texto || !cifra || !fuente) return { ok: false, error: 'Cada hallazgo necesita "texto", "cifra" y "fuente" (la ruta del dato, por ejemplo ventas.total)' }
    hallazgos.push({ texto, cifra, fuente })
  }
  if (!Array.isArray(o.acciones) || o.acciones.length > 5) return { ok: false, error: '"acciones" debe ser una lista de hasta 5 elementos' }
  const acciones = []
  for (const a of o.acciones) {
    const texto = txt(a?.texto, MAX.texto)
    if (!texto || !CONF.includes(a?.confianza)) return { ok: false, error: 'Cada acción necesita "texto" y "confianza" (seguro, probable o suposicion)' }
    acciones.push({ texto, confianza: a.confianza as Confianza })
  }
  const faltantes = Array.isArray(o.datos_faltantes) ? o.datos_faltantes.map((x: unknown) => txt(x, MAX.texto)).filter((x: string | null): x is string => !!x).slice(0, 8) : []
  return { ok: true, r: { resumen, hallazgos, acciones, datos_faltantes: faltantes } }
}

// ── Cifras ──
/** Convierte "1.234.567", "39.333", "25,5", "25.5" o "100" en número. Formato colombiano: punto = miles, coma = decimales. */
export function aNumero(tok: string): number | null {
  let t = tok.replace(/[.,]+$/, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.')
  else if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function cifrasDeTexto(s: string): number[] {
  const out: number[] = []
  for (const m of s.matchAll(/\d[\d.,]*/g)) { const n = aNumero(m[0]); if (n != null) out.push(n) }
  return out
}

/** Todos los números que existen en los datos: valores numéricos, números dentro de textos y partes de fechas. En valor absoluto (una baja de -22 se escribe "22%"). */
export function cifrasDeDatos(datos: unknown, acc: Set<number> = new Set()): Set<number> {
  if (typeof datos === 'number' && Number.isFinite(datos)) acc.add(Math.abs(datos))
  else if (typeof datos === 'string') { for (const n of cifrasDeTexto(datos)) acc.add(Math.abs(n)); for (const p of datos.split(/\D+/)) if (p) acc.add(Number(p)) }
  else if (Array.isArray(datos)) datos.forEach(d => cifrasDeDatos(d, acc))
  else if (datos && typeof datos === 'object') Object.values(datos).forEach(d => cifrasDeDatos(d, acc))
  return acc
}

const coincide = (a: number, conocidas: Set<number>) => {
  for (const b of conocidas) if (Math.abs(a - b) <= 0.51 || (b >= 1000 && Math.abs(a - b) / b <= 0.001)) return true
  return false
}

/** Cifras del reporte que NO están en los datos (vacío = todo bien). */
export function cifrasInventadas(r: Resultado, datos: unknown): string[] {
  const conocidas = cifrasDeDatos(datos)
  const textos = [r.resumen, ...r.hallazgos.flatMap(h => [h.texto, h.cifra]), ...r.acciones.map(a => a.texto), ...r.datos_faltantes]
  const malas = new Set<string>()
  for (const t of textos) for (const m of t.matchAll(/\d[\d.,]*/g)) {
    const n = aNumero(m[0]); if (n != null && !coincide(n, conocidas)) malas.add(m[0].replace(/[.,]+$/, ''))
  }
  return [...malas]
}

/** Quita de los datos cualquier campo que parezca de una persona antes de enviarlos a la IA (defensa extra: la base ya no los entrega). */
const CLAVE_PERSONAL = /mesero|cliente|telefono|teléfono|celular|correo|email|full_name|persona|nombre_completo|pagado_por/i
export function limpiarPersonales<T>(d: T): T {
  if (Array.isArray(d)) return d.map(limpiarPersonales) as T
  if (d && typeof d === 'object') return Object.fromEntries(Object.entries(d as Record<string, unknown>).filter(([k]) => !CLAVE_PERSONAL.test(k)).map(([k, v]) => [k, limpiarPersonales(v)])) as T
  return d
}
export const tieneCorreo = (d: unknown) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(JSON.stringify(d))
