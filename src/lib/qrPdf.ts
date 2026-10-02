import { jsPDF } from 'jspdf'
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

const SHEET = { w: 21.59, h: 27.94 } // Carta
const SHEET_MARGIN = 1, GAP = 0.3

// Cuántas etiquetas caben por hoja en cada orientación; gana la que acomode más.
function layout(wCm: number, hCm: number) {
  const fit = (sw: number, sh: number) => ({
    sw, sh,
    cols: Math.floor((sw - 2 * SHEET_MARGIN + GAP) / (wCm + GAP)),
    rows: Math.floor((sh - 2 * SHEET_MARGIN + GAP) / (hCm + GAP)),
  })
  const a = fit(SHEET.w, SHEET.h), b = fit(SHEET.h, SHEET.w)
  const best = a.cols * a.rows >= b.cols * b.rows ? a : b
  return best.cols * best.rows >= 2 ? best : null // null = una etiqueta por página, tamaño exacto
}

async function drawTag(doc: jsPDF, ox: number, oy: number, { label, url }: QrItem, bizName: string, logo: string | null, wCm: number, hCm: number) {
  const m = Math.min(wCm, hCm) * 0.06
  const innerW = wCm - 2 * m
  const landscape = wCm > hCm
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#FFFFFF' } })
  const footH = hCm * 0.07
  const fs = (cm: number) => cm * 28.35 // cm -> pt
  doc.setTextColor(0)
  if (landscape) {
    // Izquierda: QR cuadrado; derecha: textos
    const q = Math.min(hCm - 2 * m - footH, innerW * 0.5)
    doc.addImage(qr, 'PNG', ox + m, oy + (hCm - footH - q) / 2 + m / 2, q, q)
    const tx = ox + m + q + m, tw = wCm - (tx - ox) - m
    let y = oy + m
    if (logo) { const l = Math.min(hCm * 0.25, tw); doc.addImage(logo, 'PNG', tx, y, l, l, undefined, 'FAST'); y += l + m / 2 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(hCm * 0.09))
    const biz = doc.splitTextToSize(bizName, tw); doc.text(biz, tx, y + hCm * 0.08); y += biz.length * hCm * 0.1 + m
    doc.setFontSize(fs(hCm * 0.14)); doc.text(doc.splitTextToSize(label, tw), tx, y + hCm * 0.12)
  } else {
    let y = oy + m
    const lh = logo ? hCm * 0.14 : 0
    if (logo) { doc.addImage(logo, 'PNG', ox + (wCm - lh) / 2, y, lh, lh, undefined, 'FAST'); y += lh + m / 2 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(hCm * 0.045))
    const biz = doc.splitTextToSize(bizName, innerW)
    doc.text(biz, ox + wCm / 2, y + hCm * 0.04, { align: 'center' }); y += biz.length * hCm * 0.05 + m / 2
    const labelH = hCm * 0.09
    const q = Math.min(innerW, hCm - (y - oy) - labelH - footH - 2 * m)
    doc.addImage(qr, 'PNG', ox + (wCm - q) / 2, y, q, q); y += q + m / 2
    doc.setFontSize(fs(hCm * 0.07)); doc.text(label, ox + wCm / 2, y + labelH * 0.7, { align: 'center', maxWidth: innerW })
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(fs(footH * 0.7)); doc.setTextColor(110)
  doc.text('RestaurantOs', ox + wCm / 2, oy + hCm - m, { align: 'center' })
}

// Si caben 2+ etiquetas por hoja Carta: cuadrícula con guía de corte punteada alrededor de cada una.
// Si no: una etiqueta por página, de EXACTAMENTE wCm x hCm (el borde de la hoja es el corte).
// El QR siempre es cuadrado, nunca se deforma.
export async function buildQrPdf({ items, bizName, logo, wCm, hCm }: QrPdfOpts): Promise<jsPDF> {
  const lay = layout(wCm, hCm)
  if (!lay) {
    const o = wCm > hCm ? 'landscape' : 'portrait'
    const doc = new jsPDF({ unit: 'cm', format: [wCm, hCm], orientation: o })
    for (let i = 0; i < items.length; i++) {
      if (i > 0) doc.addPage([wCm, hCm], o)
      await drawTag(doc, 0, 0, items[i], bizName, logo, wCm, hCm)
    }
    return doc
  }
  const { sw, sh, cols, rows } = lay
  const doc = new jsPDF({ unit: 'cm', format: [sw, sh], orientation: sw > sh ? 'landscape' : 'portrait' })
  const gx = (sw - (cols * wCm + (cols - 1) * GAP)) / 2
  const gy = SHEET_MARGIN
  doc.setDrawColor(150); doc.setLineWidth(0.01); doc.setLineDashPattern([0.15, 0.15], 0)
  for (let i = 0; i < items.length; i++) {
    const k = i % (cols * rows)
    if (i > 0 && k === 0) doc.addPage([sw, sh], sw > sh ? 'landscape' : 'portrait')
    const x = gx + (k % cols) * (wCm + GAP), y = gy + Math.floor(k / cols) * (hCm + GAP)
    doc.rect(x, y, wCm, hCm)
    await drawTag(doc, x, y, items[i], bizName, logo, wCm, hCm)
  }
  return doc
}
