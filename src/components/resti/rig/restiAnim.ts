/**
 * Animación de Resti: cada estado define una postura OBJETIVO y cada articulación la persigue con un resorte amortiguado
 * sobre cuaterniones (siempre por el camino más corto), así que cambiar de estado a mitad de movimiento nunca salta:
 * la postura actual se transforma de forma continua.
 * Encima del resorte se suman capas procedurales (respiración, ciclo de caminata, aleteo del saludo) con su propio peso suavizado.
 * Los ángulos de brazos salen de resolver numéricamente la posición de la mano (ver rig.test.ts, que los verifica).
 */
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { JUNTAS, type Junta, type Rig } from './restiRig.ts'

export type RestiEstado3D = 'reposo' | 'saludo' | 'caminar' | 'senalar' | 'pensar' | 'escuchar' | 'explicar' | 'ejecutar' | 'listo' | 'alerta' | 'seguro'
type V3 = [number, number, number]
export type Postura = Partial<Record<Junta, V3>>

const R = (grados: number) => (grados * Math.PI) / 180
/** Brazo: hombro [x,y,z], codo (flexión), muñeca [x,z], en grados → postura. */
const brazo = (lado: 'D' | 'I', h: V3, c: number, m: [number, number]): Postura => ({
  [`hombro${lado}`]: [R(h[0]), R(h[1]), R(h[2])], [`codo${lado}`]: [R(c), 0, 0], [`muneca${lado}`]: [R(m[0]), 0, R(m[1])],
})
const RELAJADO_D = brazo('D', [0, 0, -7], -8, [0, 0]), RELAJADO_I = brazo('I', [0, 0, 7], -8, [0, 0])
const AMBOS_RELAJADOS: Postura = { ...RELAJADO_D, ...RELAJADO_I }

export const POSTURAS: Record<RestiEstado3D, Postura> = {
  reposo: { ...AMBOS_RELAJADOS, cabeza: [R(-2), 0, 0] },
  caminar: { ...AMBOS_RELAJADOS, columna: [R(4), 0, 0] },
  saludo: { ...brazo('D', [-84, 14, -65], -66, [-29, -24]), ...RELAJADO_I, cabeza: [R(-3), R(-6), R(4)], columna: [0, 0, R(2)] },
  senalar: { ...brazo('I', [-83, -5, -2], -36, [-18, -5]), ...RELAJADO_D, cabeza: [R(-4), 0, 0], columna: [R(-2), 0, 0] },
  pensar: { ...brazo('D', [-64, 30, 15], -85, [-30, 20]), ...RELAJADO_I, cabeza: [R(8), R(-10), R(-8)], columna: [R(3), 0, 0] },
  escuchar: { ...brazo('D', [-85, 21, -44], -101, [-39, -12]), ...RELAJADO_I, cabeza: [R(2), R(-4), R(11)], columna: [0, 0, R(-2)] },
  explicar: { ...brazo('D', [-38, 1, 3], -54, [-25, 1]), ...brazo('I', [-38, 0, -4], -52, [-27, -2]), cabeza: [R(-2), R(-5), 0], columna: [R(-2), 0, 0] },
  ejecutar: { ...brazo('D', [-27, 13, 0], -60, [-32, 7]), ...brazo('I', [-27, -11, 0], -60, [-31, -8]), cabeza: [R(14), 0, 0], columna: [R(5), 0, 0] },
  listo: { ...brazo('D', [-21, 27, 3], -85, [-60, 12]), ...RELAJADO_I, cabeza: [R(-8), 0, 0], columna: [R(-4), 0, 0] },
  alerta: { ...brazo('D', [-87, 27, -58], -58, [-24, -19]), ...brazo('I', [-85, -27, 59], -58, [-26, 21]), cabeza: [R(-6), 0, 0], columna: [R(-3), 0, 0] },
  seguro: { ...brazo('D', [38, 11, -19], -59, [-51, 10]), ...brazo('I', [37, -12, 18], -57, [-53, -10]), cabeza: [R(-4), 0, 0], columna: [R(-2), 0, 0] },
}

/** Curvatura de los dedos (0 abiertos, 1 cerrados) por estado y mano: [meñique, anular, medio, índice, pulgar]. */
const MANO_ABIERTA = [0.1, 0.1, 0.1, 0.1, 0.1]
const MANO_RELAJADA = [0.45, 0.45, 0.4, 0.35, 0.2]
const MANO_SENALA = [1.15, 1.15, 1.15, 0.0, 0.7]       // índice extendido
const MANO_PUNO = [1.2, 1.2, 1.2, 1.2, 0.8]
const MANOS: Record<RestiEstado3D, { D: number[]; I: number[] }> = {
  reposo: { D: MANO_RELAJADA, I: MANO_RELAJADA }, caminar: { D: MANO_RELAJADA, I: MANO_RELAJADA },
  saludo: { D: MANO_ABIERTA, I: MANO_RELAJADA }, senalar: { D: MANO_RELAJADA, I: MANO_SENALA },
  pensar: { D: MANO_PUNO, I: MANO_RELAJADA }, escuchar: { D: MANO_ABIERTA, I: MANO_RELAJADA },
  explicar: { D: MANO_ABIERTA, I: MANO_ABIERTA }, ejecutar: { D: MANO_SENALA, I: MANO_ABIERTA },
  listo: { D: MANO_PUNO, I: MANO_RELAJADA }, alerta: { D: MANO_ABIERTA, I: MANO_ABIERTA },
  seguro: { D: MANO_PUNO, I: MANO_PUNO },
}

/** Coloca el rig directamente en la postura de un estado (sin resortes). Sirve para pruebas y capturas. */
export function fijarPostura(rig: Rig, estado: RestiEstado3D) {
  const p = POSTURAS[estado]
  for (const n of JUNTAS) { const v = p[n]; rig.j[n].rotation.set(v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0) }
  for (const lado of ['D', 'I'] as const) MANOS[estado][lado].forEach((c, i) => { rig.dedos[lado][i].rotation.x = -c })
  rig.raiz.updateMatrixWorld(true)
}

const VEL_MAX = 7   // rad/s (~400°/s)
const K = 110, C = 14   // rigidez y amortiguación del resorte (~0.67 de amortiguación crítica: sin rebote exagerado)

export interface EntradaAnim {
  estado: RestiEstado3D
  /** -1 mira/camina hacia la izquierda de la pantalla, 1 hacia la derecha, 0 de frente. */
  direccion: number
  /** El personaje se está desplazando por la pantalla (activa el ciclo de caminata). */
  desplazando: boolean
  /** Giro adicional del cuerpo en radianes (0 de frente, π de espaldas). */
  orientacion?: number
}

export interface Animador {
  actualizar: (dt: number, t: number, entrada: EntradaAnim) => void
  /** true cuando no hay movimiento perceptible (permite bajar los cuadros por segundo). */
  quieto: () => boolean
}

export function crearAnimador(rig: Rig): Animador {
  const n = JUNTAS.length
  const q = JUNTAS.map(() => new Quaternion()), w = JUNTAS.map(() => new Vector3())
  const meta = new Quaternion(), err = new Quaternion(), inv = new Quaternion(), dq = new Quaternion(), off = new Quaternion()
  const eje = new Vector3(), euler = new Euler(), offEuler = new Euler()
  const dedos = { D: new Float32Array(5), I: new Float32Array(5) }
  let yaw = 0, yawVel = 0, pesoAndar = 0, fase = 0, pesoSaludo = 0, pesoGesto = 0, pesoOcupa = 0, energia = 0

  return {
    quieto: () => energia < 0.002,
    actualizar(dtBruto, t, { estado, direccion, desplazando, orientacion = 0 }) {
      const dt = Math.min(dtBruto, 0.05)
      const objetivo = POSTURAS[estado]
      let e = 0

      // Resorte sobre cuaterniones: el error es la rotación más corta que lleva la postura actual a la objetivo.
      for (let i = 0; i < n; i++) {
        const p = objetivo[JUNTAS[i]]
        meta.setFromEuler(euler.set(p?.[0] ?? 0, p?.[1] ?? 0, p?.[2] ?? 0))
        err.copy(meta).multiply(inv.copy(q[i]).invert())
        if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w)
        const s = Math.sqrt(err.x * err.x + err.y * err.y + err.z * err.z)
        const ang = 2 * Math.atan2(s, err.w)
        if (s > 1e-6) eje.set(err.x / s, err.y / s, err.z / s).multiplyScalar(ang); else eje.set(0, 0, 0)
        w[i].addScaledVector(eje, K * dt).multiplyScalar(Math.exp(-C * dt))
        if (w[i].length() > VEL_MAX) w[i].setLength(VEL_MAX)   // un brazo no gira más rápido que esto: movimiento natural, no latigazo
        const vel = w[i].length()
        if (vel > 1e-6) { dq.setFromAxisAngle(eje.copy(w[i]).divideScalar(vel), vel * dt); q[i].premultiply(dq).normalize() }
        e += vel
      }

      // Giro del cuerpo: hacia donde camina o señala; de frente en cualquier otro caso.
      const giro = (estado === 'caminar' || estado === 'senalar' || desplazando) ? direccion * R(estado === 'senalar' ? 38 : 62) : 0
      const giroTotal = giro + orientacion
      yawVel += (giroTotal - yaw) * 70 * dt; yawVel *= Math.exp(-11 * dt); yaw += yawVel * dt
      e += Math.abs(yawVel)

      // Pesos de las capas procedurales (suavizados: entran y salen sin cortes)
      pesoAndar = MathUtils.damp(pesoAndar, (desplazando || estado === 'caminar') ? 1 : 0, 7, dt)
      pesoSaludo = MathUtils.damp(pesoSaludo, estado === 'saludo' ? 1 : 0, 6, dt)
      pesoGesto = MathUtils.damp(pesoGesto, estado === 'explicar' || estado === 'ejecutar' || estado === 'alerta' || estado === 'pensar' ? 1 : 0, 6, dt)
      fase += dt * (2 * Math.PI * 1.7) * pesoAndar
      e += pesoAndar + pesoSaludo * 0.5 + pesoGesto * 0.5

      pesoOcupa = MathUtils.damp(pesoOcupa, ['saludo', 'senalar', 'escuchar', 'listo', 'seguro', 'explicar', 'ejecutar', 'alerta', 'pensar'].includes(estado) ? 1 : 0, 8, dt)
      const ocupaBrazos = pesoOcupa
      const respira = Math.sin(t * 1.9) * 0.012
      const paso = Math.sin(fase), contra = Math.sin(fase + Math.PI)
      const aleteo = Math.sin(t * 7.5) * R(14) * pesoSaludo
      const gesto = Math.sin(t * 2.6) * pesoGesto
      const alertar = estado === 'alerta' ? Math.sin(t * 17) * R(5) * pesoGesto : 0

      for (let i = 0; i < n; i++) {
        let x = 0, y = 0, z = 0
        switch (JUNTAS[i]) {
          case 'cadera': y = yaw; z = paso * R(2.5) * pesoAndar; break
          case 'columna': x = respira * 1.2 + R(5) * pesoAndar; y = -yaw * 0.25 + contra * R(3) * pesoAndar; break
          case 'cabeza': y = -yaw * 0.35; x = Math.sin(t * 1.1) * R(1.2); break
          case 'musloD': x = -paso * R(34) * pesoAndar; break
          case 'musloI': x = -contra * R(34) * pesoAndar; break
          case 'rodillaD': x = Math.max(0, paso) * R(46) * pesoAndar; break
          case 'rodillaI': x = Math.max(0, contra) * R(46) * pesoAndar; break
          case 'tobilloD': x = -Math.max(0, paso) * R(16) * pesoAndar; break
          case 'tobilloI': x = -Math.max(0, contra) * R(16) * pesoAndar; break
          case 'hombroD': x = (contra * R(24) * pesoAndar + respira * 2) * (1 - ocupaBrazos) + gesto * R(5); break
          case 'hombroI': x = (paso * R(24) * pesoAndar + respira * 2) * (1 - ocupaBrazos) - gesto * R(5); break
          case 'codoD': x = -Math.max(0, contra) * R(22) * pesoAndar * (1 - ocupaBrazos) + (estado === 'ejecutar' ? Math.sin(t * 9) * R(4) : 0); break
          case 'codoI': x = -Math.max(0, paso) * R(22) * pesoAndar * (1 - ocupaBrazos); break
          case 'munecaD': z = aleteo + alertar; x = estado === 'ejecutar' ? Math.sin(t * 11) * R(6) : 0; break
          case 'munecaI': z = -alertar; break
        }
        off.setFromEuler(offEuler.set(x, y, z))
        rig.j[JUNTAS[i]].quaternion.copy(q[i]).premultiply(off)
      }
      // Rebote vertical del cuerpo al caminar (dos por ciclo) y al respirar
      rig.j.cadera.position.y = 1.02 + Math.abs(Math.sin(fase)) * 0.028 * pesoAndar - 0.012 * pesoAndar + respira
      rig.raiz.position.y = estado === 'alerta' ? Math.abs(Math.sin(t * 13)) * 0.02 * pesoGesto : 0

      // Dedos: curvatura objetivo por estado, también suavizada (sin chasquidos)
      for (const lado of ['D', 'I'] as const) {
        const m = MANOS[estado][lado]
        for (let f = 0; f < 5; f++) {
          dedos[lado][f] = MathUtils.damp(dedos[lado][f], m[f], 12, dt)
          rig.dedos[lado][f].rotation.x = -dedos[lado][f]
        }
      }
      energia = e / (n * 3)
    },
  }
}
