// Integridad de la malla en cada pose: mide cuánto se estira o se aplasta cada arista frente al reposo (skinning en CPU).
// Una pose "rompe la malla" si aparecen aristas muy estiradas (codos o hombros en "caramelo"). Correr con:  node src/components/resti/rig/malla.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Object3D, Bone, Matrix4, Vector3 } from 'three'
import { crearRig } from './restiRig.ts'
import { fijarPostura, POSTURAS, type RestiEstado3D } from './restiAnim.ts'
import { prepararModelo, aplicarPostura } from './modelo.ts'

const f = readFileSync('public/assets/resti/resti.glb'), largo = f.readUInt32LE(12), j = JSON.parse(f.subarray(20, 20 + largo).toString())
const bin = f.subarray(20 + largo + 8)
const acc = (i: number) => {
  const a = j.accessors[i], bv = j.bufferViews[a.bufferView], off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type]
  const T = ({ 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array } as Record<number, any>)[a.componentType]
  const tam = T.BYTES_PER_ELEMENT, paso = bv.byteStride ?? n * tam, dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const leer = (o: number) => a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : a.componentType === 5125 ? dv.getUint32(o, true) : dv.getUint8(o)
  const d = new T(a.count * n)   // se copia en orden, sin intercalado
  for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) d[e * n + c] = leer(off + e * paso + c * tam)
  return { d: d as ArrayLike<number>, n, count: a.count as number }
}
const nodoMalla = j.nodes.find((n: any) => n.mesh !== undefined)
const prim = j.meshes[nodoMalla.mesh].primitives[0]
const P = acc(prim.attributes.POSITION), J = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0), IDX = acc(prim.indices)
const skin = j.skins[nodoMalla.skin], IBM = acc(skin.inverseBindMatrices)

// Jerarquía de huesos (sin mallas)
const objs: Object3D[] = j.nodes.map((n: any) => {
  const o = new Bone(); o.name = n.name ?? ''
  if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale) }
  if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale)
  return o
})
j.nodes.forEach((n: any, i: number) => (n.children ?? []).forEach((c: number) => objs[i].add(objs[c])))
const escena = new Object3D(); for (const i of j.scenes[j.scene ?? 0].nodes) escena.add(objs[i])
const modelo = prepararModelo(escena), virtual = crearRig()
const ibm = (k: number) => new Matrix4().fromArray(Array.from(IBM.d).slice(k * 16, k * 16 + 16))
const ibms = skin.joints.map((_: number, k: number) => ibm(k))

// Aristas únicas
const aristas = new Set<number>(), lista: [number, number][] = []
for (let t = 0; t < IDX.count; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
  const x = IDX.d[t + a], y = IDX.d[t + b], k = Math.min(x, y) * 100000 + Math.max(x, y)
  if (!aristas.has(k)) { aristas.add(k); lista.push([x, y]) }
}
const v0 = Array.from({ length: P.count }, (_, i) => new Vector3(P.d[i * 3], P.d[i * 3 + 1], P.d[i * 3 + 2]))

function posada(): Vector3[] {
  escena.updateMatrixWorld(true)
  const M = skin.joints.map((nodo: number, k: number) => objs[nodo].matrixWorld.clone().multiply(ibms[k]))
  const e = new Matrix4(), out: Vector3[] = []
  for (let i = 0; i < P.count; i++) {
    const p = new Vector3(); let s = 0
    for (let c = 0; c < 4; c++) { const w = W.d[i * 4 + c]; if (w <= 0) continue; p.addScaledVector(v0[i].clone().applyMatrix4(M[J.d[i * 4 + c]]), w); s += w }
    out.push(s > 0 ? p.divideScalar(s) : p)
  }
  void e; return out
}
const k = modelo.raiz.scale.x
// El modelo se esculpió en T-pose y el reposo tiene los brazos abajo: una pose con los brazos arriba está cerca de la T-pose y lejos del reposo
// (y al revés). Una arista solo es sospechosa si está deformada respecto a las DOS referencias.
const longitudes = () => { const pos = posada(); return lista.map(([a, b]) => pos[a].distanceTo(pos[b]) / k) }
fijarPostura(virtual, 'reposo'); for (let i = 0; i < 40; i++) aplicarPostura(modelo, virtual, 'reposo', 10)
const baseA = longitudes()
const baseT = lista.map(([a, b]) => v0[a].distanceTo(v0[b]))
function estiramiento(): { max: number; p999: number; min: number; peor: [Vector3, number] } {
  const pos = posada(), r: number[] = []; let peor: [Vector3, number] = [new Vector3(), 1]
  lista.forEach(([a, b], i) => {
    if (baseA[i] < 1e-6 || baseT[i] < 1e-6) return
    const l = pos[a].distanceTo(pos[b]) / k, qA = l / baseA[i], qT = l / baseT[i]
    const q = Math.abs(Math.log(qA)) < Math.abs(Math.log(qT)) ? qA : qT   // la referencia más cercana
    r.push(q)
    if (Math.abs(Math.log(q)) > Math.abs(Math.log(peor[1]))) peor = [pos[a].clone(), q]
  })
  r.sort((x, y) => x - y)
  return { max: r[r.length - 1], p999: r[Math.floor(r.length * 0.999)], min: r[0], peor }
}

// Umbrales calibrados con poses revisadas a ojo (saludo, explicar y seguro se ven limpias y miden ~2,2 / 1,9 / 0,05): sirven de guardia contra
// regresiones y roturas catastróficas (un "caramelo" estira aristas 10× o más), no como medida de belleza.
const LIM = { max: Number(process.env.LIM_MAX ?? 3.2), p999: Number(process.env.LIM_P999 ?? 2.4), min: Number(process.env.LIM_MIN ?? 0.02) }
let falla = 0
console.log('(frente a la referencia más cercana: T-pose o reposo)  pose  máx estiramiento | p99.9 | mín | peor arista (x,y,z)')
for (const e of Object.keys(POSTURAS) as RestiEstado3D[]) {
  fijarPostura(virtual, e); for (let i = 0; i < 40; i++) aplicarPostura(modelo, virtual, e, 10)
  const m = estiramiento(), ok = m.max < LIM.max && m.p999 < LIM.p999 && m.min > LIM.min
  console.log(`${e.padEnd(10)}  ${m.max.toFixed(2).padStart(6)}  ${m.p999.toFixed(2).padStart(6)}  ${m.min.toFixed(2).padStart(5)}  [${m.peor[0].toArray().map(v => v.toFixed(2))}] ${ok ? '' : '← ROMPE LA MALLA'}`)
  if (!ok) falla++
}
// Caminata: cuadros a lo largo del ciclo
{
  const rig = virtual; let peor = 0
  for (let t = 0; t < 12; t++) {
    fijarPostura(rig, 'caminar'); const s = Math.sin(t / 12 * Math.PI * 2)
    rig.j.musloD.rotation.x = -s * 0.6; rig.j.musloI.rotation.x = s * 0.6; rig.j.rodillaD.rotation.x = Math.max(0, s) * 0.8; rig.j.rodillaI.rotation.x = Math.max(0, -s) * 0.8
    rig.j.hombroD.rotation.x = s * 0.4; rig.j.hombroI.rotation.x = -s * 0.4; rig.raiz.updateMatrixWorld(true)
    aplicarPostura(modelo, rig, 'caminar', 10); const m = estiramiento(); peor = Math.max(peor, m.max)
  }
  console.log(`caminar (ciclo)  máx ${peor.toFixed(2)}`)   // informativo: los muslos cruzados estiran la entrepierna, ver acercamiento
}
modelo.dispose(); virtual.dispose()
assert.equal(falla, 0, `${falla} pose(s) rompen la malla`)
console.log('malla.test OK')
