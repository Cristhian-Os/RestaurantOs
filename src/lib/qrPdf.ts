import jsPDF from 'jspdf'
import QRCode from 'qrcode'

export interface QrItem { label: string; url: string }
export interface QrPdfOpts { items: QrItem[]; bizName: string; logo: string | null; wCm: number; hCm: number }

// Logo -> dataURL (jsPDF no puede leer URLs). Si falla (CORS/404) se omite el logo.
export async function loadLogo(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
  } catch { return null }
}

// Una página por QR; la página mide EXACTAMENTE wCm x hCm, así el recorte es el borde de la hoja.
// Todo se dibuja dentro de un margen fijo y el QR es cuadrado (nunca se deforma).
export async function buildQrPdf({ items, bizName, logo, wCm, hCm }: QrPdfOpts): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'cm', format: [wCm, hCm], orientation: wCm > hCm ? 'landscape' : 'portrait' })
  const m = Math.min(wCm, hCm) * 0.06
  const innerW = wCm - 2 * m
  const landscape = wCm > hCm
  for (let i = 0; i < items.length; i++) {
    if (i > 0) doc.addPage([wCm, hCm], landscape ? 'landscape' : 'portrait')
    const { label, url } = items[i]
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#FFFFFF' } })
    const footH = hCm * 0.07
    const fs = (cm: number) => cm * 28.35 // cm -> pt
    doc.setTextColor(0)
    if (landscape) {
      // Izquierda: QR cuadrado; derecha: textos
      const q = Math.min(hCm - 2 * m - footH, innerW * 0.5)
      doc.addImage(qr, 'PNG', m, (hCm - footH - q) / 2 + m / 2, q, q)
      const tx = m + q + m, tw = wCm - tx - m
      let y = m
      if (logo) { const l = Math.min(hCm * 0.25, tw); doc.addImage(logo, 'PNG', tx, y, l, l, undefined, 'FAST'); y += l + m / 2 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(hCm * 0.09))
      const biz = doc.splitTextToSize(bizName, tw); doc.text(biz, tx, y + hCm * 0.08); y += biz.length * hCm * 0.1 + m
      doc.setFontSize(fs(hCm * 0.14)); doc.text(doc.splitTextToSize(label, tw), tx, y + hCm * 0.12)
    } else {
      let y = m
      const lh = logo ? hCm * 0.14 : 0
      if (logo) { doc.addImage(logo, 'PNG', (wCm - lh) / 2, y, lh, lh, undefined, 'FAST'); y += lh + m / 2 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(hCm * 0.045))
      const biz = doc.splitTextToSize(bizName, innerW)
      doc.text(biz, wCm / 2, y + hCm * 0.04, { align: 'center' }); y += biz.length * hCm * 0.05 + m / 2
      const labelH = hCm * 0.09
      const q = Math.min(innerW, hCm - y - labelH - footH - 2 * m)
      doc.addImage(qr, 'PNG', (wCm - q) / 2, y, q, q); y += q + m / 2
      doc.setFontSize(fs(hCm * 0.07)); doc.text(label, wCm / 2, y + labelH * 0.7, { align: 'center', maxWidth: innerW })
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs(footH * 0.7)); doc.setTextColor(110)
    doc.text('RestaurantOs', wCm / 2, hCm - m, { align: 'center' })
  }
  return doc
}
