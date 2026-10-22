/**
 * Rig 3D de Resti: chef de arcilla blanca sin rostro, construido en código (sin archivos de modelo ni licencias).
 * Esqueleto de articulaciones (Object3D) con la convención: el personaje mira a +z, su derecha es -x, los pies están en y = 0.
 * Rotación x negativa = brazo/pierna hacia adelante; z = abrir hacia afuera (signo del lado: derecha -1, izquierda +1).
 */
import {
  Group, Mesh, Object3D, MeshStandardMaterial, MeshPhysicalMaterial, CapsuleGeometry, SphereGeometry, CylinderGeometry,
  BoxGeometry, TorusGeometry, ExtrudeGeometry, Shape, Path, type BufferGeometry, type Material,
} from 'three'

export const NARANJA = 0xffa22e
const BLANCO = 0xf1f1f3, GRIS = 0xb4b7be, OSCURO = 0x34353b, DORADO = 0xe9b866

export const JUNTAS = [
  'cadera', 'columna', 'cuello', 'cabeza',
  'hombroD', 'codoD', 'munecaD', 'hombroI', 'codoI', 'munecaI',
  'musloD', 'rodillaD', 'tobilloD', 'musloI', 'rodillaI', 'tobilloI',
] as const
export type Junta = typeof JUNTAS[number]

export interface Rig {
  raiz: Group
  j: Record<Junta, Object3D>
  dedos: { D: Object3D[]; I: Object3D[] }      // 4 dedos + pulgar por mano; rotation.x = curvatura
  emblema: Group
  dispose: () => void
}

export function crearRig(): Rig {
  const recursos: { dispose: () => void }[] = []
  const mat = <T extends Material>(m: T) => { recursos.push(m); return m }
  const geo = <T extends BufferGeometry>(g: T) => { recursos.push(g); return g }

  const blanco = mat(new MeshStandardMaterial({ color: BLANCO, roughness: 0.62, metalness: 0.02 }))
  const cabezaMat = mat(new MeshPhysicalMaterial({ color: 0xf7f7f9, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.25 }))
  const gris = mat(new MeshStandardMaterial({ color: GRIS, roughness: 0.55, metalness: 0.15 }))
  const oscuro = mat(new MeshStandardMaterial({ color: OSCURO, roughness: 0.5, metalness: 0.3 }))
  const dorado = mat(new MeshStandardMaterial({ color: DORADO, roughness: 0.4, metalness: 0.4, emissive: DORADO, emissiveIntensity: 0.25 }))
  const brillo = mat(new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 0.9, roughness: 0.45 }))
  const brilloCuello = mat(new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 1.4, roughness: 0.4 }))
  const brilloGorro = mat(new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 1.1, roughness: 0.4 }))
  const iconoPower = mat(new MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.4 }))

  const j = {} as Record<Junta, Object3D>
  const junta = (nombre: Junta, padre: Object3D, x = 0, y = 0, z = 0) => {
    const o = new Object3D(); o.name = nombre; o.position.set(x, y, z); padre.add(o); j[nombre] = o; return o
  }
  const malla = (g: BufferGeometry, m: Material, padre: Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const me = new Mesh(geo(g), m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); padre.add(me); return me
  }
  /** Segmento de miembro: cuelga hacia -y desde la articulación, longitud total `L`. */
  const segmento = (padre: Object3D, r: number, L: number, m: Material = blanco) =>
    malla(new CapsuleGeometry(r, Math.max(0.001, L - 2 * r), 6, 20), m, padre, 0, -L / 2, 0)

  const raiz = new Group()
  const cadera = junta('cadera', raiz, 0, 1.02, 0)
  const columna = junta('columna', cadera, 0, 0.04, 0)

  // Torso, chaqueta de doble botonadura y cinturón
  malla(new CapsuleGeometry(0.245, 0.28, 8, 28), blanco, columna, 0, 0.27, 0, 1.14, 1, 0.78)
  malla(new CylinderGeometry(0.26, 0.3, 0.13, 32), blanco, cadera, 0, -0.04, 0, 1.14, 1, 0.8)      // falda de la chaqueta
  malla(new CylinderGeometry(0.268, 0.268, 0.075, 32), oscuro, cadera, 0, 0.03, 0, 1.15, 1, 0.8)        // cinturón
  malla(new BoxGeometry(0.11, 0.075, 0.03), gris, cadera, 0, 0.03, 0.232)                                // hebilla
  for (const x of [-0.07, 0.07]) for (const y of [0.18, 0.31, 0.44]) malla(new SphereGeometry(0.014, 12, 12), gris, columna, x * 1.2, y, 0.192)
  for (const x of [-0.035, 0.035]) malla(new BoxGeometry(0.006, 0.46, 0.006), dorado, columna, x * 2.9, 0.3, 0.19)   // vivos dorados

  // Tenedor y cuchillo cruzados a la espalda (como en la referencia)
  const acero = mat(new MeshStandardMaterial({ color: 0xd9dbe0, roughness: 0.28, metalness: 0.7 }))
  const espalda = new Group(); espalda.position.set(0, 0.3, -0.215); columna.add(espalda)
  const tenedor = new Group(); tenedor.rotation.z = 0.62; espalda.add(tenedor)
  malla(new CapsuleGeometry(0.015, 0.34, 4, 10), acero, tenedor, 0, -0.13, 0)
  malla(new BoxGeometry(0.075, 0.07, 0.012), acero, tenedor, 0, 0.1, 0)
  for (const x of [-0.028, -0.009, 0.009, 0.028]) malla(new BoxGeometry(0.01, 0.1, 0.012), acero, tenedor, x, 0.18, 0)
  const cuchillo = new Group(); cuchillo.rotation.z = -0.62; espalda.add(cuchillo)
  malla(new CapsuleGeometry(0.017, 0.2, 4, 10), acero, cuchillo, 0, -0.17, 0)
  malla(new BoxGeometry(0.055, 0.27, 0.01), acero, cuchillo, 0.004, 0.09, 0)

  // Emblema: engranaje con icono de encendido, en el lado derecho del pecho del personaje (izquierda de la imagen)
  const emblema = new Group(); emblema.position.set(-0.105, 0.37, 0.188); columna.add(emblema)
  const engranaje = new Shape()
  const dientes = 8, rExt = 0.085, rInt = 0.066
  for (let i = 0; i < dientes * 4; i++) {
    const a = (i / (dientes * 4)) * Math.PI * 2, r = i % 4 < 2 ? rExt : rInt
    i === 0 ? engranaje.moveTo(Math.cos(a) * r, Math.sin(a) * r) : engranaje.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const hueco = new Path(); hueco.absarc(0, 0, 0.046, 0, Math.PI * 2, true); engranaje.holes.push(hueco)
  malla(new ExtrudeGeometry(engranaje, { depth: 0.012, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), brillo, emblema)
  const arco = malla(new TorusGeometry(0.026, 0.0065, 10, 32, Math.PI * 2 * 0.78), iconoPower, emblema, 0, -0.003, 0.012)
  arco.rotation.z = Math.PI / 2 + Math.PI * 2 * 0.11
  malla(new CylinderGeometry(0.0065, 0.0065, 0.036, 10), iconoPower, emblema, 0, 0.016, 0.012)

  // Cuello luminoso, cabeza y gorro de chef
  const cuello = junta('cuello', columna, 0, 0.6, 0)
  malla(new TorusGeometry(0.118, 0.02, 12, 44), brilloCuello, cuello, 0, 0.012, 0.01, 1, 1, 1).rotation.x = Math.PI / 2 - 0.12
  malla(new CylinderGeometry(0.085, 0.1, 0.08, 24), blanco, cuello, 0, 0.03, 0)
  const cabeza = junta('cabeza', cuello, 0, 0.02, 0)
  malla(new SphereGeometry(1, 40, 32), cabezaMat, cabeza, 0, 0.23, 0, 0.2, 0.26, 0.215)
  malla(new CylinderGeometry(0.215, 0.208, 0.12, 36), blanco, cabeza, 0, 0.425, 0)                          // banda del gorro
  malla(new TorusGeometry(0.21, 0.008, 8, 48), brilloGorro, cabeza, 0, 0.366, 0).rotation.x = Math.PI / 2 // aro luminoso inferior
  const copa = [[0, 0.63, 0, 0.2, 0.17, 0.2], [-0.17, 0.57, 0, 0.14, 0.14, 0.15], [0.17, 0.57, 0, 0.14, 0.14, 0.15],
    [0, 0.56, 0.14, 0.15, 0.13, 0.12], [0, 0.56, -0.14, 0.15, 0.13, 0.12]]
  for (const [x, y, z, sx, sy, sz] of copa) malla(new SphereGeometry(1, 28, 24), blanco, cabeza, x, y, z, sx, sy, sz)

  // Brazos: hombro → codo → muñeca → mano con dedos articulados
  const dedos: Rig['dedos'] = { D: [], I: [] }
  const brazo = (s: -1 | 1, lado: 'D' | 'I') => {
    const hombro = junta(`hombro${lado}` as Junta, columna, s * 0.36, 0.48, 0)
    malla(new SphereGeometry(0.108, 20, 18), blanco, hombro)
    segmento(hombro, 0.094, 0.3)
    const codo = junta(`codo${lado}` as Junta, hombro, 0, -0.3, 0)
    malla(new SphereGeometry(0.09, 18, 16), blanco, codo)
    segmento(codo, 0.086, 0.28)
    const muneca = junta(`muneca${lado}` as Junta, codo, 0, -0.28, 0)
    malla(new TorusGeometry(0.088, 0.011, 8, 28), dorado, muneca, 0, 0.07, 0).rotation.x = Math.PI / 2   // puño de la manga
    malla(new SphereGeometry(0.078, 20, 18), blanco, muneca, 0, -0.075, 0, 1, 1.05, 0.66)                  // palma
    for (let i = 0; i < 4; i++) {
      const d = new Object3D(); d.position.set((i - 1.5) * 0.034, -0.125, 0.0); muneca.add(d)
      malla(new CapsuleGeometry(0.0165, i === 1 ? 0.075 : 0.06, 4, 10), blanco, d, 0, -0.045, 0)
      dedos[lado].push(d)
    }
    const pulgar = new Object3D(); pulgar.position.set(-s * 0.07, -0.07, 0.012); pulgar.rotation.z = -s * 0.5; muneca.add(pulgar)
    malla(new CapsuleGeometry(0.019, 0.045, 4, 10), blanco, pulgar, 0, -0.035, 0)
    dedos[lado].push(pulgar)
  }
  brazo(-1, 'D'); brazo(1, 'I')

  // Piernas: muslo → rodilla → tobillo → bota
  const pierna = (s: -1 | 1, lado: 'D' | 'I') => {
    const muslo = junta(`muslo${lado}` as Junta, cadera, s * 0.135, -0.04, 0)
    segmento(muslo, 0.125, 0.44)
    const rodilla = junta(`rodilla${lado}` as Junta, muslo, 0, -0.44, 0)
    malla(new SphereGeometry(0.112, 18, 16), blanco, rodilla)
    segmento(rodilla, 0.108, 0.4)
    const tobillo = junta(`tobillo${lado}` as Junta, rodilla, 0, -0.4, 0)
    malla(new CylinderGeometry(0.128, 0.138, 0.15, 20), gris, tobillo, 0, -0.01, 0.0)                    // caña de la bota
    malla(new BoxGeometry(0.2, 0.09, 0.34), gris, tobillo, 0, -0.09, 0.07)                              // suela
    malla(new SphereGeometry(0.11, 18, 14), gris, tobillo, 0, -0.05, 0.14, 1, 0.7, 1.3)                // puntera
    malla(new BoxGeometry(0.25, 0.035, 0.035), oscuro, tobillo, 0, 0.01, 0.12)                                // correa
  }
  pierna(-1, 'D'); pierna(1, 'I')

  return { raiz, j, dedos, emblema, dispose: () => { for (const r of recursos) r.dispose() } }
}
