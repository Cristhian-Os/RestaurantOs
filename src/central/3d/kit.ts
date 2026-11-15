/**
 * kit.ts — herramientas de la escena 3D de la oficina: formas base, materiales compartidos y "lotes" que funden muchas piezas
 * iguales en una sola malla (cientos de escritorios, palmeras y autos se dibujan en pocas llamadas, así el 3D corre fluido
 * incluso en celulares). Sin imágenes externas.
 */
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, Material, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, SphereGeometry, Vector3, type MeshStandardMaterialParameters,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V3 = [number, number, number]

/** Formas unitarias: se escalan al colocarlas (caja 1×1×1, cilindro radio 1 alto 1, esfera radio 1, cono radio 1 alto 1). */
export interface Formas { caja: BoxGeometry; cil: CylinderGeometry; esf: SphereGeometry; cono: ConeGeometry }
export function crearFormas(seg: number): Formas {
  return {
    caja: new BoxGeometry(1, 1, 1),
    cil: new CylinderGeometry(1, 1, 1, seg),
    esf: new SphereGeometry(1, seg, Math.max(5, Math.round(seg * 0.7))),
    cono: new ConeGeometry(1, 1, seg),
  }
}

/** Materiales compartidos, con intensidad propia de día y de noche para los que emiten luz. */
export class Materiales {
  private c = new Map<string, MeshStandardMaterial>()
  readonly luminosos: { m: MeshStandardMaterial; dia: number; noche: number }[] = []
  /** Materiales cuyo color cambia entre día y noche (pasto, asfalto, mármol de afuera…). */
  readonly tintes: { m: MeshStandardMaterial; dia: Color; noche: Color }[] = []

  tinte(m: MeshStandardMaterial, dia: string, noche: string): MeshStandardMaterial {
    this.tintes.push({ m, dia: new Color(dia), noche: new Color(noche) }); return m
  }

  std(clave: string, color: string, o: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
    let m = this.c.get(clave)
    if (!m) { m = new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...o }); m.userData.c = true; this.c.set(clave, m) }
    return m
  }
  /** Material que brilla: `dia` y `noche` son las intensidades de cada modo. */
  luz(clave: string, color: string, dia: number, noche: number, o: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
    let m = this.c.get(clave)
    if (!m) {
      m = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: dia, roughness: 0.5, ...o })
      m.userData.c = true; this.c.set(clave, m); this.luminosos.push({ m, dia, noche })
    }
    return m
  }
  dispose() { this.c.forEach(m => { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose() }); this.c.clear(); this.luminosos.length = 0; this.tintes.length = 0 }
}

/** Reúne piezas y las funde por material en pocas mallas. */
export class Lote {
  private grupos = new Map<Material, BufferGeometry[]>()
  private M = new Matrix4(); private Q = new Quaternion(); private E = new Euler(); private P = new Vector3(); private S = new Vector3()

  /** Añade una copia de `geo` colocada en `pos`, escalada y girada (rot en radianes; el giro que más se usa es el del eje y). */
  add(geo: BufferGeometry, mat: Material, pos: V3 = [0, 0, 0], esc: V3 | number = 1, rot: V3 = [0, 0, 0]) {
    const s: V3 = typeof esc === 'number' ? [esc, esc, esc] : esc
    this.E.set(rot[0], rot[1], rot[2], 'YXZ'); this.Q.setFromEuler(this.E)
    this.P.set(pos[0], pos[1], pos[2]); this.S.set(s[0], s[1], s[2])
    this.M.compose(this.P, this.Q, this.S)
    const g = geo.clone(); g.applyMatrix4(this.M)
    const l = this.grupos.get(mat)
    if (l) l.push(g); else this.grupos.set(mat, [g])
  }

  /** Como `add`, pero `local` se mide desde un punto de la planta (x, z, giro phi): la pieza gira con él (phi = hacia dónde mira el eje z). */
  addEn(b: { x: number; z: number; phi: number; y?: number }, geo: BufferGeometry, mat: Material, local: V3, esc: V3 | number = 1, giro: number | V3 = 0) {
    const c = Math.cos(b.phi), s = Math.sin(b.phi)
    const r: V3 = typeof giro === 'number' ? [0, giro, 0] : giro
    this.add(geo, mat, [b.x + local[0] * c + local[2] * s, (b.y ?? 0) + local[1], b.z - local[0] * s + local[2] * c], esc, [r[0], r[1] + b.phi, r[2]])
  }

  construir(sombra: boolean, recibe = true): Group {
    const out = new Group()
    for (const [mat, lista] of this.grupos) {
      let g: BufferGeometry | null = lista.length === 1 ? lista[0] : mergeGeometries(lista, false)
      if (lista.length > 1) lista.forEach(x => x.dispose())
      if (!g) continue
      const m = new Mesh(g, mat)
      m.castShadow = sombra && !mat.transparent; m.receiveShadow = recibe
      out.add(m)
    }
    this.grupos.clear()
    return out
  }
}

/** Número pseudoaleatorio repetible (la oficina se ve igual cada vez que se abre). */
export function azar(semilla: number) {
  let s = semilla >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
