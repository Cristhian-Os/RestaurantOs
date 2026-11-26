/**
 * errorReporte.ts — reglas puras (sin red) del detector de errores de la app: qué se reporta y a qué ritmo.
 * Se prueban con:  node src/lib/errorReporte.test.ts
 * El envío real está en errorReporter.ts. Aquí no hay nada que pueda romper la app.
 */
export type OrigenError = 'ventana' | 'promesa' | 'react'
export interface Reporte { origen: OrigenError; mensaje: string; pila: string }

/** Ruido que no es un fallo de la app: avisos del navegador y cortes de red (en un restaurante con mal wifi serían miles). */
const RUIDO = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection/i,
  /Failed to fetch|Load failed|NetworkError|network request failed|Network request failed/i,
  /AbortError|The user aborted a request/i,
]
export const MAX_MENSAJE = 300
export const MAX_PILA = 1500

/** Convierte lo que llegó (Error, texto u otra cosa) en un reporte, o `null` si es ruido o no dice nada. */
export function prepararReporte(origen: OrigenError, error: unknown): Reporte | null {
  const e = error instanceof Error ? error : null
  const bruto = e ? e.message : typeof error === 'string' ? error : ''
  const mensaje = bruto.replace(/\s+/g, ' ').trim().slice(0, MAX_MENSAJE)
  if (!mensaje || RUIDO.some(r => r.test(mensaje))) return null
  return { origen, mensaje, pila: (e?.stack ?? '').slice(0, MAX_PILA) }
}

/** Freno en el navegador: no repite el mismo error en la sesión y manda como máximo `max` por minuto. */
export function crearLimitador(max = 5, ventanaMs = 60_000) {
  const vistos = new Set<string>()
  let tiempos: number[] = []
  return (r: Reporte, ahora: number = Date.now()): boolean => {
    const clave = `${r.origen}|${r.mensaje}`
    if (vistos.has(clave)) return false
    tiempos = tiempos.filter(t => ahora - t < ventanaMs)
    if (tiempos.length >= max) return false
    vistos.add(clave); tiempos.push(ahora)
    return true
  }
}
