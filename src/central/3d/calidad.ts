/**
 * calidad.ts — cuánta calidad gráfica puede mostrar este equipo (sin three.js). Un celular o un equipo modesto recibe una
 * escena más ligera; si no hay WebGL o el equipo pide menos movimiento, Central cae al plano 2D. Se prueba con
 * `node src/central/3d/calidad.test.ts`.
 */
export type NivelCalidad = 'alta' | 'media' | 'baja'
export type PreferenciaCalidad = 'auto' | NivelCalidad

export interface Capacidad { hilos: number | null; memoriaGB: number | null; tactil: boolean; anchoPantalla: number; ratioPixel: number }
export interface Calidad { nivel: NivelCalidad; ratioPixel: number; antialias: boolean; fpsMax: number; puntosGlobo: number; detalleAgentes: number }

/** Elige el nivel automático. Datos que el navegador no da (null) se toman como "equipo corriente", nunca como "potente". */
export function elegirNivel(c: Capacidad): NivelCalidad {
  const hilos = c.hilos ?? 4
  const mem = c.memoriaGB ?? 4
  if (mem <= 2 || hilos <= 2) return 'baja'
  if (c.tactil || c.anchoPantalla < 700 || mem <= 4 || hilos <= 4) return 'media'
  return 'alta'
}

export function calidadPara(nivel: NivelCalidad, c: Pick<Capacidad, 'ratioPixel'>): Calidad {
  const tope = { alta: 2, media: 1.5, baja: 1 }[nivel]
  return {
    nivel,
    ratioPixel: Math.max(1, Math.min(c.ratioPixel, tope)),
    antialias: nivel !== 'baja',
    fpsMax: nivel === 'baja' ? 30 : 60,
    puntosGlobo: { alta: 1, media: 2, baja: 3 }[nivel],      // paso de muestreo de la máscara de tierra
    detalleAgentes: { alta: 12, media: 8, baja: 6 }[nivel],  // segmentos de las figuras
  }
}

/** Lee el equipo real (solo en el navegador). */
export function leerCapacidad(): Capacidad {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    hilos: nav.hardwareConcurrency || null,
    memoriaGB: nav.deviceMemory ?? null,
    tactil: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    anchoPantalla: window.innerWidth,
    ratioPixel: window.devicePixelRatio || 1,
  }
}

export function decidirCalidad(pref: PreferenciaCalidad): Calidad {
  const cap = leerCapacidad()
  return calidadPara(pref === 'auto' ? elegirNivel(cap) : pref, cap)
}

/** ¿Puede este navegador crear un contexto WebGL? */
export function webglDisponible(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

export const prefiereMenosMovimiento = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
