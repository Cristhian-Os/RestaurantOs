/**
 * Animación de Resti: cada estado define una postura OBJETIVO y cada articulación la persigue con un resorte amortiguado,
 * así que cambiar de estado a mitad de movimiento nunca salta: la postura actual se transforma de forma continua.
 * Encima del resorte se suman capas procedurales (respiración, ciclo de caminata, gesto de saludo) con su propio peso suavizado.
 */
import { MathUtils } from 'three'
import { JUNTAS, type Junta, type Rig } from './restiRig'

export type RestiEstado3D = 'reposo' | 'saludo' | 'caminar' | 'senalar' | 'pensar' | 'escuchar' | 'explicar' | 'ejecutar' | 'listo' | 'alerta'
type V3 = [number, number, number]
type Postura = Partial<Record<Junta, V3>>

const R = (grados: number) => (grados * Math.PI) / 180
const D: 'D' = 'D', I: 'I' = 'I'

/** Brazo cayendo relajado, ligeramente separado del cuerpo. */
const BRAZOS_RELAJADOS: Postura = {
  hombroD: [0, 0, R(-7)], hombroI: [0, 0, R(7)], codoD: [R(-8), 0, 0], codoI: [R(-8), 0, 0],
}

const POSTURAS: Record<RestiEstado3D, Postura> = {
  reposo: { ...BRAZOS_RELAJADOS, cabeza: [R(-2), 0, 0] },
  caminar: { ...BRAZOS_RELAJADOS, columna: [R(4), 0, 0] },
  saludo: {   // mano derecha del personaje (izquierda de la imagen) abierta y en alto
    hombroD: [R(-12), 0, R(-118)], codoD: [R(-62), 0, 0], munecaD: [0, 0, R(-8)],
    hombroI: [0, 0, R(7)], codoI: [R(-8), 0, 0], cabeza: [R(-3), R(-6), R(4)], columna: [0, 0, R(2)],
  },
  senalar: {  // brazo izquierdo extendido hacia adelante y arriba; el cuerpo ya viene girado hacia el objetivo
    hombroI: [R(-78), 0, R(24)], codoI: [R(-6), 0, 0], hombroD: [R(8), 0, R(-8)], codoD: [R(-20), 0, 0],
    cabeza: [R(-4), 0, 0], columna: [R(-2), 0, 0],
  },
  pensar: {   // mano derecha al mentón, otra bajo el codo
    hombroD: [R(-52), R(-18), R(-10)], codoD: [R(-128), 0, 0], hombroI: [R(-38), R(20), R(10)], codoI: [R(-96), 0, 0],
    cabeza: [R(8), R(-10), R(-8)], columna: [R(3), 0, 0],
  },
  escuchar: { // mano a la altura del oído, cabeza ladeada
    hombroD: [R(-30), R(-10), R(-52)], codoD: [R(-118), 0, 0], hombroI: [0, 0, R(7)], codoI: [R(-8), 0, 0],
    cabeza: [R(2), R(-4), R(11)], columna: [0, 0, R(-2)],
  },
  explicar: { // manos abiertas al frente, como mostrando un dato
    hombroD: [R(-40), R(12), R(-22)], codoD: [R(-70), 0, 0], munecaD: [R(-20), 0, 0],
    hombroI: [R(-52), R(-8), R(18)], codoI: [R(-82), 0, 0], munecaI: [R(-35), 0, 0],
    cabeza: [R(-2), R(-5), 0], columna: [R(-2), 0, 0],
  },
  ejecutar: { // sostiene una tableta con la izquierda y opera con la derecha
    hombroD: [R(-46), R(10), R(-14)], codoD: [R(-92), 0, 0], hombroI: [R(-58), R(-14), R(16)], codoI: [R(-84), 0, 0],
    cabeza: [R(14), 0, 0], columna: [R(5), 0, 0],
  },
  listo: {    // confirma: puño al pecho y mentón arriba
    hombroD: [R(-30), R(-6), R(-24)], codoD: [R(-110), 0, 0], hombroI: [0, 0, R(9)], codoI: [R(-10), 0, 0],
    cabeza: [R(-8), 0, 0], columna: [R(-4), 0, 0],
  },
  alerta: {   // ambas manos arriba, abiertas
    hombroD: [R(-24), 0, R(-70)], codoD: [R(-70), 0, 0], hombroI: [R(-24), 0, R(70)], codoI: [R(-70), 0, 0],
    cabeza: [R(-6), 0, 0], columna: [R(-3), 0, 0],
  },
}

/** Curvatura de los dedos (0 abiertos, 1 cerrados) por estado y mano: [meñique..índice, pulgar]. */
const MANO_ABIERTA = [0.1, 0.1, 0.1, 0.1, 0.1]
const MANO_RELAJADA = [0.45, 0.45, 0.4, 0.35, 0.2]
const MANO_SENALA = [1.15, 1.15, 1.15, 0.0, 0.7]       // índice extendido (el 4.º, el más cercano al pulgar)
const MANO_PUNO = [1.2, 1.2, 1.2, 1.2, 0.8]
const MANOS: Record<RestiEstado3D, { D: number[]; I: number[] }> = {
  reposo: { D: MANO_RELAJADA, I: MANO_RELAJADA }, caminar: { D: MANO_RELAJADA, I: MANO_RELAJADA },
  saludo: { D: MANO_ABIERTA, I: MANO_RELAJADA }, senalar: { D: MANO_RELAJADA, I: MANO_SENALA },
  pensar: { D: MANO_PUNO, I: MANO_RELAJADA }, escuchar: { D: MANO_ABIERTA, I: MANO_RELAJADA },
  explicar: { D: MANO_ABIERTA, I: MANO_ABIERTA }, ejecutar: { D: MANO_SENALA, I: MANO_ABIERTA },
  listo: { D: MANO_PUNO, I: MANO_RELAJADA }, alerta: { D: MANO_ABIERTA, I: MANO_ABIERTA },
}

const K = 110, C = 14   // rigidez y amortiguación del resorte (~0.67 de amortiguación crítica: sin rebote exagerado)
const BRAZOS: Junta[] = ['hombroD', 'codoD', 'munecaD', 'hombroI', 'codoI', 'munecaI']

export interface EntradaAnim {
  estado: RestiEstado3D
  /** -1 mira/camina hacia la izquierda de la pantalla, 1 hacia la derecha, 0 de frente. */
  direccion: number
  /** El personaje se está desplazando por la pantalla (activa el ciclo de caminata). */
  desplazando: boolean
}

export interface Animador {
  actualizar: (dt: number, t: number, entrada: EntradaAnim) => void
  /** true cuando no hay movimiento perceptible (permite bajar los cuadros por segundo). */
  quieto: () => boolean
}

export function crearAnimador(rig: Rig): Animador {
  const n = JUNTAS.length
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3)
  const dedosPos = { D: new Float32Array(5), I: new Float32Array(5) }
  let yaw = 0, yawVel = 0
  let pesoAndar = 0, fase = 0, pesoSaludo = 0, pesoGesto = 0
  let energia = 0

  const estados = (e: RestiEstado3D) => POSTURAS[e]

  return {
    quieto: () => energia < 0.002,
    actualizar(dtBruto, t, { estado, direccion, desplazando }) {
      const dt = Math.min(dtBruto, 0.05)
      const objetivo = estados(estado)
      let e = 0

      for (let i = 0; i < n; i++) {
        const p = objetivo[JUNTAS[i]]
        for (let k = 0; k < 3; k++) {
          const idx = i * 3 + k, meta = p ? p[k] : 0
          vel[idx] += (meta - pos[idx]) * K * dt
          vel[idx] *= Math.exp(-C * dt)
          pos[idx] += vel[idx] * dt
          e += Math.abs(vel[idx])
        }
      }

      // Giro del cuerpo: hacia donde camina o señala; de frente en cualquier otro caso.
      const giro = (estado === 'caminar' || estado === 'senalar' || desplazando) ? direccion * R(estado === 'senalar' ? 38 : 62) : 0
      yawVel += (giro - yaw) * 70 * dt; yawVel *= Math.exp(-11 * dt); yaw += yawVel * dt
      e += Math.abs(yawVel)

      // Pesos de las capas procedurales (suavizados: entran y salen sin cortes)
      const meta = (desplazando || estado === 'caminar') ? 1 : 0
      pesoAndar = MathUtils.damp(pesoAndar, meta, 7, dt)
      pesoSaludo = MathUtils.damp(pesoSaludo, estado === 'saludo' ? 1 : 0, 6, dt)
      pesoGesto = MathUtils.damp(pesoGesto, estado === 'explicar' || estado === 'ejecutar' || estado === 'alerta' || estado === 'pensar' ? 1 : 0, 6, dt)
      fase += dt * (2 * Math.PI * 1.7) * pesoAndar
      e += pesoAndar + pesoSaludo * 0.5 + pesoGesto * 0.5

      // Aplicación: resorte + capas aditivas
      const ocupaBrazos = Math.max(pesoSaludo, pesoGesto, estado === 'senalar' || estado === 'escuchar' || estado === 'listo' ? 1 : 0)
      const respira = Math.sin(t * 1.9) * 0.012
      const paso = Math.sin(fase), contra = Math.sin(fase + Math.PI)
      const aleteo = (Math.sin(t * 7.5) * R(14)) * pesoSaludo
      const gesto = Math.sin(t * 2.6) * pesoGesto
      const alertar = estado === 'alerta' ? Math.sin(t * 17) * R(5) * pesoGesto : 0

      for (let i = 0; i < n; i++) {
        const nombre = JUNTAS[i], o = rig.j[nombre]
        let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
        switch (nombre) {
          case 'cadera': y += yaw; z += paso * R(2.5) * pesoAndar; break
          case 'columna': x += respira * 1.2 + R(5) * pesoAndar; y += -yaw * 0.25 + contra * R(3) * pesoAndar; break
          case 'cabeza': y += -yaw * 0.35; x += Math.sin(t * 1.1) * R(1.2); break
          case 'musloD': x += -paso * R(34) * pesoAndar; break
          case 'musloI': x += -contra * R(34) * pesoAndar; break
          case 'rodillaD': x += Math.max(0, paso) * R(46) * pesoAndar; break
          case 'rodillaI': x += Math.max(0, contra) * R(46) * pesoAndar; break
          case 'tobilloD': x += -Math.max(0, paso) * R(16) * pesoAndar; break
          case 'tobilloI': x += -Math.max(0, contra) * R(16) * pesoAndar; break
          case 'hombroD': x += (contra * R(30) * pesoAndar + respira * 2) * (1 - ocupaBrazos); x += gesto * R(5); break
          case 'hombroI': x += (paso * R(30) * pesoAndar + respira * 2) * (1 - ocupaBrazos); x += -gesto * R(5); break
          case 'codoD': z += 0; x += -Math.max(0, contra) * R(22) * pesoAndar * (1 - ocupaBrazos) + (estado === 'ejecutar' ? Math.sin(t * 9) * R(4) : 0); break
          case 'codoI': x += -Math.max(0, paso) * R(22) * pesoAndar * (1 - ocupaBrazos); break
          case 'munecaD': z += aleteo + alertar; x += (estado === 'ejecutar' ? Math.sin(t * 11) * R(6) : 0); break
          case 'munecaI': z += -alertar; break
        }
        o.rotation.set(x, y, z)
      }
      // Rebote vertical del cuerpo al caminar (dos por ciclo) y al respirar
      rig.j.cadera.position.y = 1.02 + Math.abs(Math.sin(fase)) * 0.028 * pesoAndar - 0.012 * pesoAndar + respira
      rig.raiz.position.y = estado === 'alerta' ? Math.abs(Math.sin(t * 13)) * 0.02 * pesoGesto : 0

      // Dedos: curvatura objetivo por estado, también con resorte suave (sin chasquidos)
      for (const lado of ['D', 'I'] as const) {
        const m = MANOS[estado][lado]
        for (let f = 0; f < 5; f++) {
          dedosPos[lado][f] = MathUtils.damp(dedosPos[lado][f], m[f], 12, dt)
          rig.dedos[lado][f].rotation.x = -dedosPos[lado][f]
        }
      }
      energia = e / (n * 3)
    },
  }
}

export { BRAZOS, D, I }
