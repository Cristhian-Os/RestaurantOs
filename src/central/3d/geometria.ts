/**
 * geometria.ts — la planta circular de la oficina (un solo nivel, cuatro anillos), sin three.js ni React.
 * La usan la escena 3D y el plano 2D, así que ambos muestran exactamente lo mismo. Se prueba con `node src/central/3d/geometria.test.ts`.
 * Convención: ángulo 0 = derecha (+x), crece en sentido horario visto desde arriba; el primer sector de cada anillo queda arriba.
 */
export type NumeroAnillo = 2 | 3 | 4

/** Radios de cada anillo (unidades de la escena). El núcleo (anillo 1) es el círculo central: RestaurantOS. */
export const RADIO_NUCLEO = 6.5
export const ANILLOS: Record<NumeroAnillo, { r0: number; r1: number }> = {
  2: { r0: 8.5, r1: 16 },
  3: { r0: 17.5, r1: 28 },
  4: { r0: 29.5, r1: 37 },
}
export const RADIO_TOTAL = 38

export interface EntradaSector { id: string; anillo: NumeroAnillo; orden: number; color: string }
export interface Sector { id: string; anillo: NumeroAnillo; a0: number; a1: number; centro: number; r0: number; r1: number; color: string }
export interface Puesto { x: number; z: number; giro: number }

const DOS_PI = Math.PI * 2
const INICIO = -Math.PI / 2   // arriba

/** Reparte cada anillo en tantos sectores iguales como espacios tenga, con una pequeña separación entre ellos. */
export function calcularSectores(entradas: EntradaSector[]): Sector[] {
  const out: Sector[] = []
  for (const anillo of [2, 3, 4] as NumeroAnillo[]) {
    const deAnillo = entradas.filter(e => e.anillo === anillo).sort((a, b) => a.orden - b.orden)
    const n = deAnillo.length
    if (!n) continue
    const tramo = DOS_PI / n
    const holgura = Math.min(0.045, tramo * 0.1)
    deAnillo.forEach((e, i) => {
      const a0 = INICIO + i * tramo + holgura
      const a1 = INICIO + (i + 1) * tramo - holgura
      out.push({ id: e.id, anillo, a0, a1, centro: (a0 + a1) / 2, r0: ANILLOS[anillo].r0, r1: ANILLOS[anillo].r1, color: e.color })
    })
  }
  return out
}

export const aPunto = (r: number, ang: number) => ({ x: r * Math.cos(ang), z: r * Math.sin(ang) })

/** Puestos de trabajo de `n` agentes dentro de un sector: en arco, mirando al centro de la oficina (hasta dos filas). */
export function puestosDeAgentes(s: Sector, n: number): Puesto[] {
  const out: Puesto[] = []
  if (n <= 0) return out
  const filas = n > 4 ? 2 : 1
  const porFila = Math.ceil(n / filas)
  for (let k = 0; k < n; k++) {
    const fila = Math.floor(k / porFila)
    const dentroFila = k % porFila
    const cuantos = fila === filas - 1 ? n - fila * porFila : porFila
    const margen = (s.a1 - s.a0) * 0.18
    const ang = cuantos === 1 ? s.centro : s.a0 + margen + ((s.a1 - s.a0 - 2 * margen) * dentroFila) / (cuantos - 1)
    const r = s.r0 + (s.r1 - s.r0) * (filas === 1 ? 0.62 : 0.5 + fila * 0.22)
    const { x, z } = aPunto(r, ang)
    out.push({ x, z, giro: Math.atan2(-x, -z) })     // la figura mira hacia el núcleo
  }
  return out
}

const normalizar = (a: number) => ((a - INICIO) % DOS_PI + DOS_PI) % DOS_PI + INICIO

/** ¿En qué sector cae un punto? (null si está en el núcleo, en un pasillo entre sectores o fuera de la oficina) */
export function sectorEn(sectores: Sector[], x: number, z: number): Sector | null {
  const r = Math.hypot(x, z)
  const ang = normalizar(Math.atan2(z, x))
  for (const s of sectores) if (r >= s.r0 && r <= s.r1 && ang >= s.a0 && ang <= s.a1) return s
  return null
}

/** Trazado SVG (centrado en 0,0) de un sector, entre dos radios. `escala` = píxeles por unidad. */
export function trazadoSector(s: Pick<Sector, 'a0' | 'a1'>, r0: number, r1: number, escala = 1): string {
  const f = (n: number) => (n * escala).toFixed(2)
  const p = (r: number, a: number) => `${f(r * Math.cos(a))} ${f(r * Math.sin(a))}`
  const grande = s.a1 - s.a0 > Math.PI ? 1 : 0
  return `M ${p(r0, s.a0)} L ${p(r1, s.a0)} A ${f(r1)} ${f(r1)} 0 ${grande} 1 ${p(r1, s.a1)} L ${p(r0, s.a1)} A ${f(r0)} ${f(r0)} 0 ${grande} 0 ${p(r0, s.a0)} Z`
}
