/**
 * pdf.ts — el mismo ticket como PDF de ancho 58 u 80 mm (plan B sin impresora especial: se guarda, se comparte o se imprime).
 * Letra Courier (Latin-1: tildes y ñ salen bien); 1,5 mm por caracter, igual que el HTML.
 */
import { jsPDF } from 'jspdf'
import { aplanar, COLUMNAS, type Modelo } from './modelo.ts'

const MM_POR_PT = 0.3528
const latin1 = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?')

export function renderPdf(m: Modelo): Blob {
  const lineas = aplanar(m)
  const margen = (m.ancho - COLUMNAS[m.ancho] * 1.5) / 2
  const alto = 6 + lineas.reduce((s, l) => s + (l.grande ? 6.4 : 3.3), 0) + 6
  const doc = new jsPDF({ unit: 'mm', format: [m.ancho, alto] })
  let y = 4
  for (const l of lineas) {
    const tam = l.grande ? 4.6 : 2.3                  // un poco menos de 1,5 mm por caracter: deja holgura al borde
    doc.setFont('courier', l.negrita ? 'bold' : 'normal')
    doc.setFontSize(tam / MM_POR_PT)
    y += l.grande ? 5 : 2.6
    if (l.texto.trim()) doc.text(latin1(l.texto), margen, y, { baseline: 'alphabetic' })
    y += l.grande ? 1.4 : 0.7
  }
  return doc.output('blob')
}
