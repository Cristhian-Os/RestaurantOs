/**
 * render.ts — del modelo neutro a HTML imprimible y a texto para WhatsApp (sin depender del navegador, para poder probarlo).
 * El HTML usa letra monoespaciada: 1,5 mm por caracter, así 32 caracteres ocupan 48 mm (papel de 58) y 48 ocupan 72 mm (papel de 80).
 */
import { aplanar, aTexto, COLUMNAS, type Modelo } from './modelo.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderHtml(m: Modelo, opts: { autoImprimir?: boolean } = {}): string {
  const lado = ((m.ancho - COLUMNAS[m.ancho] * 1.5) / 2).toFixed(2)
  const lineas = aplanar(m).map(l => `<div class="l${l.negrita ? ' b' : ''}${l.grande ? ' g' : ''}">${esc(l.texto) || '&nbsp;'}</div>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.titulo)}</title><style>
@page{size:${m.ancho}mm auto;margin:0}
html,body{margin:0;padding:0;background:#fff;color:#000}
body{width:${m.ancho}mm;padding:3mm ${lado}mm 6mm;box-sizing:border-box;font-family:"Courier New",Courier,monospace;font-size:2.3mm;line-height:1.3}
.l{white-space:pre}.b{font-weight:700}.g{font-size:4.6mm;line-height:1.2}
@media screen{body{margin:0 auto;border:1px dashed #bbb}}
</style></head><body>${lineas}${opts.autoImprimir ? '<script>window.onload=function(){window.focus();window.print()}</script>' : ''}</body></html>`
}

/** Texto para compartir por WhatsApp (con formato monoespaciado). */
export function textoWhatsApp(m: Modelo): string {
  return '```\n' + aTexto(m).map(l => l.replace(/\s+$/, '')).join('\n') + '\n```'
}
export const urlWhatsApp = (m: Modelo, telefono?: string | null) =>
  `https://wa.me/${(telefono ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(textoWhatsApp(m))}`
