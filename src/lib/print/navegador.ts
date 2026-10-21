/**
 * navegador.ts — salidas que SÍ dependen del navegador: imprimir con el diálogo del sistema, descargar/compartir el PDF y abrir WhatsApp.
 * Siempre hay un plan B que no necesita impresora especial (Anexo H, 2).
 */
import type { Modelo } from './modelo.ts'
import { renderHtml, urlWhatsApp } from './render.ts'

/** Imprime con la impresora que el equipo tenga instalada (diálogo del navegador). Rechaza si no se pudo abrir. */
export function imprimirEnNavegador(m: Modelo): Promise<void> {
  return new Promise((ok, mal) => {
    const f = document.createElement('iframe')
    f.setAttribute('aria-hidden', 'true')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    f.onload = () => {
      try {
        f.contentWindow?.focus(); f.contentWindow?.print()
        setTimeout(() => { f.remove(); ok() }, 1500)
      } catch (e) { f.remove(); mal(e instanceof Error ? e : new Error('No se pudo imprimir')) }
    }
    f.srcdoc = renderHtml(m)
    document.body.appendChild(f)
  })
}

/** Comparte el PDF (celular) o lo descarga (computador). */
export async function compartirPdf(m: Modelo, nombre: string): Promise<void> {
  const { renderPdf } = await import('./pdf.ts')           // jsPDF se carga solo cuando se necesita
  const blob = renderPdf(m)
  const archivo = new File([blob], `${nombre}.pdf`, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: m.titulo }); return }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `${nombre}.pdf`; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export const abrirWhatsApp = (m: Modelo, telefono?: string | null) => window.open(urlWhatsApp(m, telefono), '_blank', 'noopener')
