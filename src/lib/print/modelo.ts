/**
 * modelo.ts — modelo neutro de un ticket (Anexo H, 3). El contenido se define UNA sola vez; de aquí salen
 * el texto de ancho fijo (ESC/POS y pruebas), el HTML para imprimir desde el navegador y el PDF.
 * Ancho: 58 mm = 32 caracteres, 80 mm = 48 caracteres.
 */
export type Ancho = 58 | 80
export const COLUMNAS: Record<Ancho, number> = { 58: 32, 80: 48 }

export type Linea =
  | { k: 'titulo'; texto: string }                                         // centrado y grande
  | { k: 'centro'; texto: string; negrita?: boolean }
  | { k: 'texto'; texto: string; negrita?: boolean; grande?: boolean; sangria?: number }
  | { k: 'fila'; izq: string; der: string; negrita?: boolean }             // texto a la izquierda y valor a la derecha
  | { k: 'sep'; ch?: string }
  | { k: 'blanco' }

export interface Modelo { ancho: Ancho; titulo: string; lineas: Linea[] }

/** Una línea ya acomodada al ancho: lista para imprimir con letra monoespaciada. */
export interface LineaPlana { texto: string; negrita: boolean; grande: boolean }

const ACENTOS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N' }
export const sinAcentos = (s: string) => s.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, c => ACENTOS[c] ?? c)

/** Parte un texto en renglones de máximo `cols` caracteres, respetando palabras (las muy largas se cortan). */
export function ajustar(texto: string, cols: number): string[] {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return ['']
  const out: string[] = []
  let actual = ''
  for (const palabra of limpio.split(' ')) {
    let p = palabra
    while (p.length > cols) {                       // palabra más larga que el renglón
      if (actual) { out.push(actual); actual = '' }
      out.push(p.slice(0, cols)); p = p.slice(cols)
    }
    if (!actual) actual = p
    else if (actual.length + 1 + p.length <= cols) actual += ' ' + p
    else { out.push(actual); actual = p }
  }
  if (actual) out.push(actual)
  return out
}

const centrar = (t: string, cols: number) => ' '.repeat(Math.max(0, Math.floor((cols - t.length) / 2))) + t

/** Acomoda el modelo al ancho: cada elemento queda en uno o más renglones de largo fijo. */
export function aplanar(m: Modelo): LineaPlana[] {
  const cols = COLUMNAS[m.ancho]
  const out: LineaPlana[] = []
  for (const l of m.lineas) {
    switch (l.k) {
      case 'blanco': out.push({ texto: '', negrita: false, grande: false }); break
      case 'sep': out.push({ texto: (l.ch ?? '-').repeat(cols), negrita: false, grande: false }); break
      case 'titulo': for (const r of ajustar(l.texto, Math.floor(cols / 2))) out.push({ texto: centrar(r, Math.floor(cols / 2)), negrita: true, grande: true }); break
      case 'centro': for (const r of ajustar(l.texto, cols)) out.push({ texto: centrar(r, cols), negrita: !!l.negrita, grande: false }); break
      case 'texto': {
        const c = (l.grande ? Math.floor(cols / 2) : cols) - (l.sangria ?? 0)
        for (const r of ajustar(l.texto, Math.max(8, c))) out.push({ texto: ' '.repeat(l.sangria ?? 0) + r, negrita: !!l.negrita || !!l.grande, grande: !!l.grande })
        break
      }
      case 'fila': {
        const der = String(l.der ?? '')
        const ancho = Math.max(4, cols - der.length - 1)
        const partes = ajustar(l.izq, ancho)
        partes.forEach((p, i) => {
          const ultima = i === partes.length - 1
          out.push({ texto: ultima ? p + ' '.repeat(Math.max(1, cols - p.length - der.length)) + der : p, negrita: !!l.negrita, grande: false })
        })
        break
      }
    }
  }
  return out
}

/** Texto plano de ancho fijo (una cadena por renglón). Con `soloAscii` quita tildes y ñ para impresoras que no las soportan. */
export function aTexto(m: Modelo, opts: { soloAscii?: boolean } = {}): string[] {
  return aplanar(m).map(l => (opts.soloAscii ? sinAcentos(l.texto) : l.texto))
}

// ── Formatos compartidos por todos los tickets ──
export const cop = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

// La base guarda las horas en UTC: aquí siempre se muestran en hora de Colombia.
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const SOLO_HORA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false })
export const fechaHora = (iso: string) => FECHA_HORA.format(new Date(iso)).replace(',', '')
export const soloHora = (iso: string) => SOLO_HORA.format(new Date(iso))
