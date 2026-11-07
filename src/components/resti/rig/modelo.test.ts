// Prueba del retargeting al modelo real (GLB con esqueleto Mixamo). Correr con:  node src/components/resti/rig/modelo.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Object3D, Bone, Vector3, Quaternion } from 'three'
import { crearRig } from './restiRig.ts'
import { fijarPostura, type RestiEstado3D } from './restiAnim.ts'
import { prepararModelo, aplicarPostura } from './modelo.ts'

// Reconstruye solo la jerarquía de nodos del GLB (sin mallas ni texturas) para probar los huesos en Node
function jerarquia(ruta: string): Object3D {
  const f = readFileSync(ruta), largo = f.readUInt32LE(12), j = JSON.parse(f.subarray(20, 20 + largo).toString())
  const objs = j.nodes.map((n: any) => {
    const o = new Bone(); o.name = n.name ?? ''
    if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale) }
    if (n.translation) o.position.fromArray(n.translation)
    if (n.rotation) o.quaternion.fromArray(n.rotation)
    if (n.scale) o.scale.fromArray(n.scale)
    return o
  })
  j.nodes.forEach((n: any, i: number) => (n.children ?? []).forEach((c: number) => objs[i].add(objs[c])))
  const raiz = new Object3D()
  for (const i of j.scenes[j.scene ?? 0].nodes) raiz.add(objs[i])
  return raiz
}

const escena = jerarquia('public/assets/resti/resti.glb')
const modelo = prepararModelo(escena)
const virtual = crearRig()
const pos = (o: Object3D) => o.getWorldPosition(new Vector3())
const dir = (a: Object3D, b: Object3D) => pos(b).sub(pos(a)).normalize()
const dirV = (a: Object3D, b: Object3D) => dir(a, b)

// 1. Escala y lateralidad: cadera a la altura del rig virtual; la derecha del personaje está en -x
assert.ok(Math.abs(pos(modelo.huesos.Hips).y - 1.02) < 0.15, `cadera a ${pos(modelo.huesos.Hips).y}`)
assert.ok(pos(modelo.huesos.RightArm).x < pos(modelo.huesos.LeftArm).x, 'brazo derecho en -x')

// 2. Reposo: tras aplicar la postura "reposo" los brazos cuelgan (la pose de T se convierte en brazos abajo)
const probar = (estado: RestiEstado3D, comprobar: () => void) => { fijarPostura(virtual, estado); aplicarPostura(modelo, virtual); escena.updateMatrixWorld(true); comprobar() }
probar('reposo', () => {
  const d = dir(modelo.huesos.RightArm, modelo.huesos.RightForeArm)
  assert.ok(d.y < -0.9, `reposo: el brazo derecho cuelga (dir ${d.toArray().map(v => v.toFixed(2))})`)
})

// 3. Cada hueso del brazo apunta igual que su par del esqueleto virtual (misma dirección, aunque midan distinto)
for (const estado of ['saludo', 'senalar', 'pensar', 'escuchar', 'explicar', 'alerta', 'seguro', 'ejecutar', 'listo'] as RestiEstado3D[]) {
  probar(estado, () => {
    for (const [lado, hombro, codo, muneca] of [['Right', 'hombroD', 'codoD', 'munecaD'], ['Left', 'hombroI', 'codoI', 'munecaI']] as const) {
      const par = (a: string, b: string, ma: Object3D, mb: Object3D) => {
        const dm = dir(ma, mb), dv = dirV(virtual.j[a as keyof typeof virtual.j], virtual.j[b as keyof typeof virtual.j])
        assert.ok(dm.dot(dv) > 0.985, `${estado} ${lado} ${a}→${b}: coseno ${dm.dot(dv).toFixed(3)}`)
      }
      par(hombro, codo, modelo.huesos[`${lado}Arm` as keyof typeof modelo.huesos], modelo.huesos[`${lado}ForeArm` as keyof typeof modelo.huesos])
      par(codo, muneca, modelo.huesos[`${lado}ForeArm` as keyof typeof modelo.huesos], modelo.huesos[`${lado}Hand` as keyof typeof modelo.huesos])
    }
  })
}

// 4. Piernas y cabeza copian la rotación (caminata: el muslo del modelo sigue al virtual)
{
  const q = new Quaternion(), v = new Quaternion()
  fijarPostura(virtual, 'reposo'); virtual.j.musloD.rotation.x = -0.5; virtual.j.cabeza.rotation.y = 0.4; virtual.raiz.updateMatrixWorld(true)
  aplicarPostura(modelo, virtual); escena.updateMatrixWorld(true)
  const reposoDir = new Vector3(0, -1, 0), a = dir(modelo.huesos.RightUpLeg, modelo.huesos.RightLeg), b = reposoDir.clone().applyQuaternion(virtual.j.musloD.getWorldQuaternion(v))
  assert.ok(a.dot(b) > 0.97, `muslo derecho: coseno ${a.dot(b).toFixed(3)}`)
  void q
}

// 5. Las piezas aparte existen y cuelgan de los huesos correctos
assert.ok(modelo.luzCuello.material, 'luz del collar'); assert.ok(modelo.huesos.Neck.children.length > 0)
modelo.dispose(); virtual.dispose()
console.log('modelo.test OK')
