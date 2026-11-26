/**
 * errorReporter.ts — detector de errores de la app: manda cada error nuevo a la base (registrar_error_app) para que el vigía de Central lo revise.
 * Reglas (qué es ruido, a qué ritmo) en errorReporte.ts. Silencioso: nunca muestra nada, nunca lanza y nunca escribe en la consola.
 * Solo viaja el mensaje, la pila y la ruta; la base quita consultas e identificadores y no guarda datos de restaurantes.
 */
import { supabase } from '../services/supabaseClient'
import { crearLimitador, prepararReporte, type OrigenError } from './errorReporte'

const puedeEnviar = crearLimitador()

export function reportarError(origen: OrigenError, error: unknown): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return   // sin internet no hay a dónde mandarlo
    const r = prepararReporte(origen, error)
    if (!r || !puedeEnviar(r)) return
    void supabase
      .rpc('registrar_error_app', { p_origen: r.origen, p_mensaje: r.mensaje, p_pila: r.pila, p_ruta: window.location.pathname })
      .then(() => undefined, () => undefined)   // si falla el reporte, no pasa nada
  } catch { /* el detector nunca debe romper la app */ }
}

/** Escucha los errores que nadie capturó (de la ventana y de promesas). Llamar una sola vez al arrancar. */
export function iniciarReporteErrores(): void {
  window.addEventListener('error', ev => reportarError('ventana', ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', ev => reportarError('promesa', ev.reason))
}
