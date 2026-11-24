/**
 * importarLista.ts — convierte una lista pegada (una línea por negocio) en prospectos. Sin IA y sin red: lee el texto tal cual, así no se inventa nada.
 * Formatos que entiende por línea (separados por | ; o tabulador):   Nombre | dirección o barrio | enlace de Google Maps | teléfono (opcional)
 * También entiende "Nombre, dirección" o "Nombre - dirección" y encuentra solo el enlace y el teléfono donde estén.
 */
export interface FilaLista { nombre_comercial: string; ubicacion_publica: string; fuente_url?: string; telefono?: string }
export interface Descartada { linea: string; motivo: string }
export const MAX_LINEAS = 100

const URL_RE = /https?:\/\/[^\s|;]+/i
const TEL_RE = /^\+?\d[\d\s().-]{6,17}\d$/
const limpiar = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export function leerLista(texto: string): { filas: FilaLista[]; descartadas: Descartada[] } {
  const filas: FilaLista[] = [], descartadas: Descartada[] = []
  const vistos = new Set<string>()
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  lineas.forEach((linea, i) => {
    if (i >= MAX_LINEAS) { if (i === MAX_LINEAS) descartadas.push({ linea: `(${lineas.length - MAX_LINEAS} línea(s) más)`, motivo: `Pasa del máximo de ${MAX_LINEAS} por vez` }); return }
    let resto = linea
    const m = resto.match(URL_RE)
    let url: string | undefined
    if (m) {
      try { const u = new URL(m[0]); if (u.protocol === 'http:' || u.protocol === 'https:') url = m[0].slice(0, 500) } catch { /* enlace roto: se ignora */ }
      resto = resto.replace(m[0], ' ')
    }
    let partes = resto.split(/\t|\||;/).map(p => limpiar(p, 300)).filter(Boolean)
    if (partes.length === 1) partes = partes[0].split(/\s+-\s+|,/).map(p => limpiar(p, 300)).filter(Boolean)
    const telIdx = partes.findIndex((p, k) => k > 0 && TEL_RE.test(p))
    const telefono = telIdx > 0 ? partes.splice(telIdx, 1)[0] : undefined
    const nombre = limpiar(partes[0] ?? '', 160)
    if (nombre.length < 2) { descartadas.push({ linea: limpiar(linea, 80), motivo: 'No tiene un nombre' }); return }
    const clave = nombre.toLowerCase()
    if (vistos.has(clave)) { descartadas.push({ linea: nombre, motivo: 'Repetido en la lista' }); return }
    vistos.add(clave)
    filas.push({ nombre_comercial: nombre, ubicacion_publica: limpiar(partes.slice(1).join(', '), 300), ...(url ? { fuente_url: url } : {}), ...(telefono ? { telefono: telefono.slice(0, 40) } : {}) })
  })
  return { filas, descartadas }
}
