/**
 * Rig 3D de Resti: chef de arcilla blanca sin rostro, construido en código (sin archivos de modelo ni licencias).
 * La apariencia es FIJA: nada aquí depende del estado de la animación (solo cambian las rotaciones de las articulaciones).
 * Convención: el personaje mira a +z, su derecha es -x, los pies están en y = 0.
 */
import {
  Group, Mesh, Object3D, Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending, DoubleSide, MeshStandardMaterial, MeshPhysicalMaterial,
  CapsuleGeometry, SphereGeometry, CylinderGeometry, BoxGeometry, TorusGeometry, ExtrudeGeometry, Shape, Path, type BufferGeometry, type Material,
} from 'three'

export const NARANJA = 0xff8a1a
const BLANCO = 0xf1f1f3, SOMBRA = 0xd3d4da, GRIS = 0xb4b7be, OSCURO = 0x34353b, DORADO = 0xe9b866

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

/** Halo suave aditivo (el resplandor naranja del emblema y del cuello de la referencia). */
function halo(color: string, tam: number, recursos: { dispose: () => void }[]): Sprite | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'); if (!g) return null
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, color + '55'); grad.addColorStop(0.45, color + '22'); grad.addColorStop(1, color + '00')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(c), m = new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true })
  recursos.push(tex, m)
  const s = new Sprite(m); s.scale.set(tam, tam, 1); return s
}

export function crearRig(): Rig {
  const recursos: { dispose: () => void }[] = []
  const mat = <T extends Material>(m: T) => { recursos.push(m); return m }
  const geo = <T extends BufferGeometry>(g: T) => { recursos.push(g); return g }

  const blanco = mat(new MeshStandardMaterial({ color: BLANCO, roughness: 0.62, metalness: 0.02 }))
  const blancoDoble = mat(new MeshStandardMaterial({ color: BLANCO, roughness: 0.62, side: DoubleSide }))
  const sombra = mat(new MeshStandardMaterial({ color: SOMBRA, roughness: 0.7 }))
  const cabezaMat = mat(new MeshPhysicalMaterial({ color: 0xf7f7f9, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.25 }))
  const gris = mat(new MeshStandardMaterial({ color: GRIS, roughness: 0.55, metalness: 0.15 }))
  const oscuro = mat(new MeshStandardMaterial({ color: OSCURO, roughness: 0.5, metalness: 0.3 }))
  const dorado = mat(new MeshStandardMaterial({ color: DORADO, roughness: 0.4, metalness: 0.4, emissive: DORADO, emissiveIntensity: 0.3 }))
  const brillo = mat(new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 0.6, roughness: 0.45 }))
  const brilloLuz = mat(new MeshStandardMaterial({ color: NARANJA, emissive: NARANJA, emissiveIntensity: 1.1, roughness: 0.4 }))
  const iconoPower = mat(new MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.4 }))
  const acero = mat(new MeshStandardMaterial({ color: 0xd9dbe0, roughness: 0.28, metalness: 0.7 }))

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
  const aro = (r: number, tubo: number, m: Material, padre: Object3D, x: number, y: number, z: number) => {
    const t = malla(new TorusGeometry(r, tubo, 10, 44), m, padre, x, y, z); t.rotation.x = Math.PI / 2; return t
  }

  const raiz = new Group()
  const cadera = junta('cadera', raiz, 0, 1.02, 0)
  const columna = junta('columna', cadera, 0, 0.04, 0)

  // Torso, chaqueta de doble botonadura, cinturón con bolsas
  malla(new CapsuleGeometry(0.245, 0.28, 8, 28), blanco, columna, 0, 0.27, 0, 1.14, 1, 0.78)
  malla(new CylinderGeometry(0.26, 0.3, 0.13, 32), blanco, cadera, 0, -0.04, 0, 1.14, 1, 0.8)                     // falda de la chaqueta
  malla(new CylinderGeometry(0.268, 0.268, 0.075, 32), oscuro, cadera, 0, 0.03, 0, 1.15, 1, 0.8)                   // cinturón
  malla(new BoxGeometry(0.12, 0.08, 0.03), gris, cadera, 0, 0.03, 0.233)                                           // hebilla
  malla(new BoxGeometry(0.07, 0.04, 0.012), oscuro, cadera, 0, 0.03, 0.25)
  for (const s of [-1, 1]) {
    malla(new BoxGeometry(0.075, 0.085, 0.05), gris, cadera, s * 0.29, -0.005, 0.12).rotation.y = s * 0.45                  // bolsas del cinturón
    malla(new BoxGeometry(0.08, 0.012, 0.055), oscuro, cadera, s * 0.29, 0.04, 0.12).rotation.y = s * 0.45
  }
  for (const x of [-0.07, 0.07]) for (const y of [0.16, 0.27, 0.38, 0.49]) malla(new SphereGeometry(0.015, 12, 12), gris, columna, x * 1.2, y, 0.192)
  for (const x of [-0.035, 0.035]) malla(new BoxGeometry(0.006, 0.5, 0.006), dorado, columna, x * 2.9, 0.3, 0.19)  // vivos dorados
  malla(new BoxGeometry(0.005, 0.52, 0.005), sombra, columna, 0.045, 0.3, 0.191).rotation.z = 0.2                  // cierre cruzado

  // Cubiertos cruzados a la espalda (referencia: vista de espalda)
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
  const haloEmblema = halo('#ff8a00', 0.3, recursos); if (haloEmblema) { haloEmblema.position.z = 0.03; emblema.add(haloEmblema) }

  // Cuello alto con borde luminoso, cabeza ovalada sin rostro y gorro de chef con pliegues
  const cuello = junta('cuello', columna, 0, 0.6, 0)
  malla(new CylinderGeometry(0.115, 0.135, 0.085, 32, 1, true), blancoDoble, cuello, 0, 0.02, 0)
  aro(0.118, 0.02, brilloLuz, cuello, 0, 0.065, 0.005).rotation.x = Math.PI / 2 - 0.1
  const haloCuello = halo('#ff8a00', 0.42, recursos); if (haloCuello) { haloCuello.position.set(0, 0.06, 0.1); cuello.add(haloCuello) }
  const cabeza = junta('cabeza', cuello, 0, 0.02, 0)
  malla(new SphereGeometry(1, 40, 32), cabezaMat, cabeza, 0, 0.23, 0, 0.2, 0.26, 0.215)
  malla(new CylinderGeometry(0.215, 0.208, 0.12, 36), blanco, cabeza, 0, 0.425, 0)                                  // banda del gorro
  aro(0.21, 0.008, brilloLuz, cabeza, 0, 0.366, 0)                                                                   // aro luminoso inferior
  aro(0.212, 0.004, sombra, cabeza, 0, 0.485, 0)                                                                     // costura superior de la banda
  const copa = [[0, 0.63, 0, 0.2, 0.17, 0.2], [-0.17, 0.57, 0, 0.14, 0.14, 0.15], [0.17, 0.57, 0, 0.14, 0.14, 0.15],
    [0, 0.56, 0.14, 0.15, 0.13, 0.12], [0, 0.56, -0.14, 0.15, 0.13, 0.12]]
  for (const [x, y, z, sx, sy, sz] of copa) malla(new SphereGeometry(1, 28, 24), blanco, cabeza, x, y, z, sx, sy, sz)
  for (const x of [-0.13, -0.065, 0, 0.065, 0.13]) {                                                                 // pliegues del gorro
    malla(new SphereGeometry(1, 10, 10), sombra, cabeza, x, 0.53, 0.205 - Math.abs(x) * 0.35, 0.007, 0.08, 0.012).rotation.z = -x * 1.5
  }

  // Brazos: hombro (con hombrera) → codo → muñeca (puño dorado) → mano con dedos articulados
  const dedos: Rig['dedos'] = { D: [], I: [] }
  const brazo = (s: -1 | 1, lado: 'D' | 'I') => {
    const hombro = junta(`hombro${lado}` as Junta, columna, s * 0.36, 0.48, 0)
    malla(new SphereGeometry(0.108, 20, 18), blanco, hombro)
    malla(new CapsuleGeometry(0.045, 0.1, 6, 14), blanco, hombro, s * 0.01, 0.085, 0, 1.4, 0.55, 1.5).rotation.z = s * 0.35   // hombrera
    segmento(hombro, 0.094, 0.3)
    const codo = junta(`codo${lado}` as Junta, hombro, 0, -0.3, 0)
    malla(new SphereGeometry(0.09, 18, 16), blanco, codo)
    segmento(codo, 0.086, 0.28)
    const muneca = junta(`muneca${lado}` as Junta, codo, 0, -0.28, 0)
    malla(new CylinderGeometry(0.098, 0.1, 0.07, 24), blanco, muneca, 0, 0.065, 0)                                   // puño de la manga
    aro(0.099, 0.01, dorado, muneca, 0, 0.1, 0); aro(0.1, 0.008, dorado, muneca, 0, 0.032, 0)
    malla(new SphereGeometry(0.078, 20, 18), blanco, muneca, 0, -0.075, 0, 1, 1.05, 0.66)                            // palma
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

  // Piernas: muslo → rodilla (con rodillera) → tobillo → bota con correas
  const pierna = (s: -1 | 1, lado: 'D' | 'I') => {
    const muslo = junta(`muslo${lado}` as Junta, cadera, s * 0.135, -0.04, 0)
    segmento(muslo, 0.125, 0.44)
    malla(new BoxGeometry(0.006, 0.4, 0.006), sombra, muslo, s * 0.124, -0.22, 0)                                    // costura lateral
    const rodilla = junta(`rodilla${lado}` as Junta, muslo, 0, -0.44, 0)
    malla(new SphereGeometry(0.112, 18, 16), blanco, rodilla)
    malla(new SphereGeometry(0.09, 16, 14), sombra, rodilla, 0, 0, 0.075, 1, 1.1, 0.5)                              // rodillera
    segmento(rodilla, 0.108, 0.4)
    const tobillo = junta(`tobillo${lado}` as Junta, rodilla, 0, -0.4, 0)
    malla(new CylinderGeometry(0.145, 0.158, 0.18, 24), gris, tobillo, 0, -0.005, 0.0)                                // caña de la bota
    malla(new BoxGeometry(0.24, 0.1, 0.4), gris, tobillo, 0, -0.09, 0.1)                                           // suela
    malla(new BoxGeometry(0.245, 0.03, 0.405), oscuro, tobillo, 0, -0.135, 0.1)                                      // banda de rodadura
    malla(new SphereGeometry(0.125, 18, 14), gris, tobillo, 0, -0.045, 0.17, 1, 0.75, 1.3)                              // puntera
    for (const y of [0.04, -0.02]) { malla(new BoxGeometry(0.31, 0.034, 0.04), oscuro, tobillo, 0, y, 0.13); malla(new BoxGeometry(0.055, 0.044, 0.044), acero, tobillo, 0, y, 0.15) }
  }
  pierna(-1, 'D'); pierna(1, 'I')

  return { raiz, j, dedos, emblema, dispose: () => { for (const r of recursos) r.dispose() } }
}
