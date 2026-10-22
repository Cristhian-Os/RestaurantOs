/**
 * Modelo 3D real de Resti (GLB riggeado con esqueleto Mixamo) movido por el esqueleto virtual de restiRig/restiAnim.
 * El animador (resortes, poses, caminata, saludo…) sigue manejando el esqueleto virtual invisible; aquí solo se COPIA esa pose a los
 * huesos del modelo, así que el movimiento es el mismo, continuo, y la apariencia la define solo la malla.
 *   - Piernas, cadera, columna, cuello y cabeza: misma postura de reposo (de pie) → se copia la rotación en el mundo.
 *   - Brazos: el modelo está en T-pose y el virtual con los brazos abajo → se copia la DIRECCIÓN de cada hueso (hombro→codo→muñeca→dedos).
 * La luz del collar (aro) y los cubiertos de la espalda son piezas aparte pegadas a los huesos.
 */
import { Box3, MathUtils, Mesh, MeshStandardMaterial, Object3D, Quaternion, Sprite, TorusGeometry, Vector3 } from 'three'
import { crearCubiertos } from './cubiertos.ts'
import { halo, NARANJA, type Rig, type Junta } from './restiRig.ts'
import type { RestiEstado3D } from './restiAnim.ts'

const clave = (n: string) => n.replace(/[^a-z0-9]/gi, '').toLowerCase()   // GLTFLoader quita ":" de "mixamorig:Hips"

export const NOMBRES_HUESOS = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightToeBase',
] as const
type NombreHueso = typeof NOMBRES_HUESOS[number]

export interface ModeloResti {
  raiz: Object3D
  huesos: Record<NombreHueso, Object3D>
  /** Aro luminoso del collar: lo único que cambia de color con el estado. */
  luzCuello: { material: MeshStandardMaterial; halo: Sprite | null }
  /** Altura de la cadera y del tope de la cabeza en unidades del mundo (para encuadrar la cámara). */
  alturaCadera: number
  alturaTotal: number
  dispose: () => void
}

type Reposo0 = unknown
/** Giro de la mano/antebrazo sobre su propio eje por estado (para mostrar la palma). Se suaviza: no salta al cambiar de estado. */
const GIRO_MANO: Partial<Record<RestiEstado3D, { Right?: number; Left?: number }>> = {
  saludo: { Right: Math.PI / 2 },
  explicar: { Right: -Math.PI / 2, Left: Math.PI / 2 },
  ejecutar: { Right: -Math.PI / 2, Left: Math.PI / 2 },
  escuchar: { Right: Math.PI / 2 },
  alerta: { Right: Math.PI / 2, Left: -Math.PI / 2 },
}

interface Reposo { q: Quaternion; pos: Vector3; qLocal: Quaternion; posLocal: Vector3 }

/**
 * Prepara el modelo cargado: localiza los huesos, lo escala para que su cadera quede a `alturaCaderaVirtual` y guarda la pose de reposo.
 * `raiz` es la escena del GLB. Se mueve el contenedor, no los huesos.
 */
export function prepararModelo(raiz: Object3D, alturaCaderaVirtual = 1.02): ModeloResti & { _reposo: Map<Object3D, Reposo>; _orden: Object3D[]; _giro: Record<'Right' | 'Left', number> } {
  const huesos = {} as Record<NombreHueso, Object3D>
  raiz.updateMatrixWorld(true)
  raiz.traverse(o => {
    const k = clave(o.name)
    for (const n of NOMBRES_HUESOS) if (k === 'mixamorig' + clave(n)) huesos[n] = o
  })
  for (const n of NOMBRES_HUESOS) if (!huesos[n]) throw new Error(`Al modelo le falta el hueso ${n}`)

  // Lateralidad: el personaje mira a +z, su derecha es -x. Si el modelo viniera al revés, se intercambian los lados.
  const pos = (o: Object3D) => o.getWorldPosition(new Vector3())
  if (pos(huesos.RightArm).x > pos(huesos.LeftArm).x) {
    for (const [a, b] of [['Arm', 'Arm'], ['ForeArm', 'ForeArm'], ['Hand', 'Hand'], ['HandIndex1', 'HandIndex1'], ['UpLeg', 'UpLeg'], ['Leg', 'Leg'], ['Foot', 'Foot']] as const) {
      const r = ('Right' + a) as NombreHueso, l = ('Left' + b) as NombreHueso, t = huesos[r]; huesos[r] = huesos[l]; huesos[l] = t
    }
  }

  // Escala y suelo: el modelo viene en otras unidades y centrado en el origen. Se mide desde el suelo (lo más bajo de la malla, o de los pies
  // si aún no hay malla) y se escala para que la cadera quede a la misma altura que la del esqueleto virtual (el rebote al caminar se copia tal cual).
  let suelo = Math.min(pos(huesos.LeftToeBase).y, pos(huesos.RightToeBase).y), tope = pos(huesos.Head).y
  const malla = raiz.getObjectByProperty('isSkinnedMesh', true) as Mesh | undefined
  if (malla) { const c = new Box3().setFromObject(malla); suelo = c.min.y; tope = c.max.y }
  const k = alturaCaderaVirtual / (pos(huesos.Hips).y - suelo)
  raiz.scale.multiplyScalar(k)
  raiz.position.y = -suelo * k
  raiz.updateMatrixWorld(true)

  const reposo = new Map<Object3D, Reposo>(), orden: Object3D[] = []
  const guardar = (o: Object3D) => {
    reposo.set(o, { q: o.getWorldQuaternion(new Quaternion()), pos: pos(o), qLocal: o.quaternion.clone(), posLocal: o.position.clone() })
    orden.push(o)
  }
  huesos.Hips.traverse(o => { if ((o as any).isBone || o === huesos.Hips) guardar(o) })

  // Cubiertos a la espalda y aro del collar (piezas aparte, pegadas a los huesos)
  const recursos: { dispose: () => void }[] = []
  const espalda = crearCubiertos(); recursos.push(espalda)
  const s2 = reposo.get(huesos.Spine2)!, cuelloR = reposo.get(huesos.Neck)!
  const colocar = (obj: Object3D, hueso: Object3D, mundo: Vector3, qMundo: Quaternion) => {
    hueso.add(obj); obj.position.copy(hueso.worldToLocal(mundo.clone()))
    obj.quaternion.copy(reposo.get(hueso)!.q.clone().invert().multiply(qMundo))
    // La escala del contenedor ya se aplicó al hueso: se compensa para que la pieza mida lo mismo que en el rig procedural.
    obj.scale.setScalar(1 / hueso.getWorldScale(new Vector3()).x)
  }
  colocar(espalda.grupo, huesos.Spine2, new Vector3(s2.pos.x, s2.pos.y - 0.12, s2.pos.z - 0.24), new Quaternion())
  espalda.grupo.scale.multiplyScalar(1.3)   // en la referencia son casi del largo del torso

  const material = new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 0.85, roughness: 0.4 })
  const geoAro = new TorusGeometry(0.125, 0.022, 10, 44)
  const aro = new Mesh(geoAro, material)
  colocar(aro, huesos.Neck, new Vector3(cuelloR.pos.x, cuelloR.pos.y + 0.045, cuelloR.pos.z + 0.015), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.1))
  recursos.push({ dispose: () => { material.dispose(); geoAro.dispose() } })
  const brillo = halo(NARANJA, 0.38, recursos)
  if (brillo) colocar(brillo, huesos.Neck, new Vector3(cuelloR.pos.x, cuelloR.pos.y + 0.07, cuelloR.pos.z + 0.03), new Quaternion())

  return {
    raiz, huesos, luzCuello: { material, halo: brillo }, alturaCadera: alturaCaderaVirtual,
    alturaTotal: (tope - suelo) * k,
    dispose: () => recursos.forEach(r => r.dispose()),
    _reposo: reposo, _orden: orden, _giro: { Right: 0, Left: 0 } as Record<'Right' | 'Left', number>,
  }
}

const A = new Vector3(), B = new Vector3(), Q = new Quaternion(), Q2 = new Quaternion(), I = new Quaternion()
const LARGO_VIRTUAL = { brazo: 0.3, antebrazo: 0.28 }   // restiRig: hombro→codo y codo→muñeca

/**
 * Cinemática inversa de dos huesos con las longitudes REALES del modelo: lleva la muñeca a donde la lleva el esqueleto virtual
 * (escalada a la proporción del modelo) y dobla el codo hacia el mismo lado. Devuelve las direcciones de brazo y antebrazo.
 */
function resolverBrazo(S: Vector3, destino: Vector3, poloV: Vector3, l1: number, l2: number): { brazo: Vector3; ante: Vector3 } {
  const d = destino.clone().sub(S)
  const dist = Math.min(Math.max(d.length(), Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999)
  const u = d.normalize()
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const polo = poloV.clone().sub(u.clone().multiplyScalar(poloV.dot(u)))
  if (polo.lengthSq() < 1e-8) polo.set(0, 0, -1).sub(u.clone().multiplyScalar(-u.z))   // codo hacia atrás por defecto
  polo.normalize()
  const E = S.clone().addScaledVector(u, a).addScaledVector(polo, h)
  return { brazo: E.clone().sub(S).normalize(), ante: S.clone().addScaledVector(u, dist).sub(E).normalize() }
}

/** Copia la pose del esqueleto virtual (ya actualizado por el animador) a los huesos del modelo. */
export function aplicarPostura(m: ReturnType<typeof prepararModelo>, v: Rig, estado: RestiEstado3D = 'reposo', dt = 1 / 60) {
  const g = GIRO_MANO[estado] ?? {}
  m._giro.Right = MathUtils.damp(m._giro.Right, g.Right ?? 0, 7, dt); m._giro.Left = MathUtils.damp(m._giro.Left, g.Left ?? 0, 7, dt)
  v.raiz.updateMatrixWorld(true)
  const h = m.huesos, R = m._reposo
  const wq = (j: Junta) => v.j[j].getWorldQuaternion(new Quaternion())
  const wp = (j: Junta, local?: Vector3) => (local ? v.j[j].localToWorld(local.clone()) : v.j[j].getWorldPosition(new Vector3()))
  const dirModelo = (de: Object3D, a: Object3D) => R.get(a)!.pos.clone().sub(R.get(de)!.pos).normalize()
  const dirVirtual = (a: Vector3, b: Vector3) => b.clone().sub(a).normalize()

  // Fase 1: cadera, columna, cuello, cabeza y piernas (misma postura de reposo: se copia la rotación mundial)
  const delta = new Map<Object3D, Quaternion>()
  const columna = v.j.columna.quaternion
  delta.set(h.Hips, wq('cadera'))
  delta.set(h.Spine, wq('cadera').multiply(I.clone().slerp(columna, 1 / 3)))
  delta.set(h.Spine1, wq('cadera').multiply(I.clone().slerp(columna, 2 / 3)))
  delta.set(h.Spine2, wq('columna'))
  delta.set(h.Neck, wq('cuello')); delta.set(h.Head, wq('cabeza'))
  delta.set(h.RightUpLeg, wq('musloD')); delta.set(h.RightLeg, wq('rodillaD')); delta.set(h.RightFoot, wq('tobilloD'))
  delta.set(h.LeftUpLeg, wq('musloI')); delta.set(h.LeftLeg, wq('rodillaI')); delta.set(h.LeftFoot, wq('tobilloI'))

  const esBrazo = (o: Object3D) => { for (let p: Object3D | null = o; p; p = p.parent) if (p === h.RightArm || p === h.LeftArm) return true; return false }
  const mundo = new Map<Object3D, Quaternion>()
  const poner = (o: Object3D) => {
    const r = R.get(o)!
    const padreMundo = o === h.Hips || !mundo.has(o.parent!) ? o.parent!.getWorldQuaternion(new Quaternion()) : mundo.get(o.parent!)!
    const d = delta.get(o)
    if (d) { Q2.copy(d).multiply(r.q); o.quaternion.copy(padreMundo).invert().multiply(Q2) } else o.quaternion.copy(r.qLocal)
    mundo.set(o, padreMundo.clone().multiply(o.quaternion))
  }
  // Rebote vertical de la cadera
  const dy = v.j.cadera.position.y - 1.02 + v.raiz.position.y
  const r0 = R.get(h.Hips)!
  h.Hips.position.copy(r0.posLocal)
  if (dy !== 0) { B.copy(r0.pos); B.y += dy; const base = h.Hips.parent!.worldToLocal(r0.pos.clone()); h.Hips.position.add(h.Hips.parent!.worldToLocal(B.clone()).sub(base)) }
  for (const o of m._orden) if (!esBrazo(o)) poner(o)
  m.raiz.updateMatrixWorld(true)   // con el tronco ya en pose se conocen los hombros reales

  // Fase 2: brazos por cinemática inversa con las longitudes del modelo (el alcance y el codo coinciden con el esqueleto virtual)
  for (const [lado, hombro, codo, muneca] of [['Right', 'hombroD', 'codoD', 'munecaD'], ['Left', 'hombroI', 'codoI', 'munecaI']] as const) {
    const brazo = h[`${lado}Arm` as NombreHueso], ante = h[`${lado}ForeArm` as NombreHueso], mano = h[`${lado}Hand` as NombreHueso], dedo = h[`${lado}HandIndex1` as NombreHueso]
    const l1 = R.get(ante)!.pos.distanceTo(R.get(brazo)!.pos), l2 = R.get(mano)!.pos.distanceTo(R.get(ante)!.pos)
    const escala = (l1 + l2) / (LARGO_VIRTUAL.brazo + LARGO_VIRTUAL.antebrazo)
    const pH = wp(hombro), pC = wp(codo), pM = wp(muneca), pD = wp(muneca, A.set(0, -0.2, 0))
    const S = brazo.getWorldPosition(new Vector3())
    const ik = resolverBrazo(S, S.clone().addScaledVector(pM.clone().sub(pH), escala), pC.clone().sub(pH), l1, l2)
    const giro = (eje: Vector3) => Q2.setFromAxisAngle(eje, m._giro[lado]).clone()
    const dM = dirVirtual(pM, pD)
    delta.set(brazo, Q.setFromUnitVectors(dirModelo(brazo, ante), ik.brazo).clone())
    delta.set(ante, giro(ik.ante).multiply(Q.setFromUnitVectors(dirModelo(ante, mano), ik.ante)))
    delta.set(mano, giro(dM).multiply(Q.setFromUnitVectors(dirModelo(mano, dedo), dM)))
  }
  for (const o of m._orden) if (esBrazo(o)) poner(o)
}
