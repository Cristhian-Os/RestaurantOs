/**
 * navegador.ts — salidas que SÍ dependen del navegador: imprimir con el diálogo del sistema, descargar/compartir el PDF y abrir WhatsApp.
 * Siempre hay un plan B que no necesita impresora especial (Anexo H, 2).
 */
import type { Modelo } from './modelo.ts'
import { renderHtml, urlWhatsApp } from './render.ts'

const ESPERA_CARGA_MS = 10_000        // si la vista no carga en este tiempo, se da por fallida
const ESPERA_CONFIRMAR_MS = 45_000    // tras abrir el diálogo, tiempo máximo para que el navegador avise que terminó

/**
 * Imprime con la impresora que el equipo tenga instalada (diálogo del navegador).
 * Rechaza si la vista no carga a tiempo, si falla al abrir el diálogo o si el navegador no confirma el final
 * (evento `afterprint`): sin esa confirmación NO se da por impreso. Nunca se queda colgada.
 */
export function imprimirEnNavegador(m: Modelo): Promise<void> {
  return new Promise((ok, mal) => {
    const f = document.createElement('iframe')
    f.setAttribute('aria-hidden', 'true')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    let fin = false
    let tCarga: ReturnType<typeof setTimeout> | undefined
    let tConfirmar: ReturnType<typeof setTimeout> | undefined
    const cerrar = (error?: Error) => {
      if (fin) return
      fin = true
      clearTimeout(tCarga); clearTimeout(tConfirmar)
      window.removeEventListener('afterprint', alTerminar)
      setTimeout(() => f.remove(), 500)
      if (error) mal(error); else ok()
    }
    const alTerminar = () => cerrar()
    tCarga = setTimeout(() => cerrar(new Error('La impresión no cargó a tiempo')), ESPERA_CARGA_MS)
    f.onerror = () => cerrar(new Error('No se pudo preparar la impresión'))
    f.onload = () => {
      clearTimeout(tCarga)
      try {
        const w = f.contentWindow
        if (!w) throw new Error('No se pudo abrir la impresión')
        w.addEventListener('afterprint', alTerminar)
        window.addEventListener('afterprint', alTerminar)
        tConfirmar = setTimeout(() => cerrar(new Error('El navegador no confirmó la impresión')), ESPERA_CONFIRMAR_MS)
        w.focus(); w.print()
      } catch (e) { cerrar(e instanceof Error ? e : new Error('No se pudo imprimir')) }
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
