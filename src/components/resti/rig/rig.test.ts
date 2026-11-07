// Pruebas del rig de Resti: poses, apariencia constante y movimiento continuo. Correr con:  node src/components/resti/rig/rig.test.ts
import assert from 'node:assert/strict'
import { Mesh, Quaternion, Vector3, type MeshStandardMaterial } from 'three'
import { crearRig, JUNTAS } from './restiRig.ts'
import { crearAnimador, fijarPostura, POSTURAS, type RestiEstado3D } from './restiAnim.ts'

const estados = Object.keys(POSTURAS) as RestiEstado3D[]
const punta = (rig: ReturnType<typeof crearRig>, lado: 'D' | 'I') => rig.j[`muneca${lado}`].localToWorld(new Vector3(0, -0.2, 0))

// 1. Poses: la mano termina donde el gesto lo pide (cabeza ≈ y 1.91, mentón ≈ 1.65, caderas ≈ 1.05)
{
  const rig = crearRig()
  fijarPostura(rig, 'reposo'); assert.ok(punta(rig, 'D').y < 1.2 && punta(rig, 'I').y < 1.2, 'reposo: manos abajo')
  fijarPostura(rig, 'saludo'); { const p = punta(rig, 'D'); assert.ok(p.y > 1.9 && p.x < -0.4, `saludo: mano en alto y abierta al lado (${p.toArray()})`) }
  fijarPostura(rig, 'pensar'); { const p = punta(rig, 'D'); assert.ok(p.distanceTo(new Vector3(-0.02, 1.74, 0.3)) < 0.12, `pensar: mano al mentón (${p.toArray()})`) }
  fijarPostura(rig, 'escuchar'); { const p = punta(rig, 'D'); assert.ok(p.y > 1.8 && p.x > -0.45, `escuchar: mano junto al oído (${p.toArray()})`) }
  fijarPostura(rig, 'senalar'); { const p = punta(rig, 'I'); assert.ok(p.z > 0.5 && p.y > 1.5, `señalar: brazo extendido al frente (${p.toArray()})`) }
  fijarPostura(rig, 'alerta'); assert.ok(punta(rig, 'D').y > 1.9 && punta(rig, 'I').y > 1.9, 'alerta: ambas manos arriba')
  fijarPostura(rig, 'seguro'); assert.ok(punta(rig, 'D').y < 1.25 && Math.abs(punta(rig, 'D').x) > 0.25, 'seguro: manos en la cintura')
  fijarPostura(rig, 'explicar'); assert.ok(punta(rig, 'D').z > 0.45 && punta(rig, 'I').z > 0.45, 'explicar: manos al frente')
  rig.dispose()
}

// 2. Apariencia constante: tras animar todos los estados, ninguna malla cambia de forma, posición local, escala ni color
{
  const rig = crearRig()
  const foto = () => {
    const s: string[] = []
    rig.raiz.traverse(o => {
      if (!(o instanceof Mesh)) return
      const m = o.material as MeshStandardMaterial
      s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), m.color.getHex(), m.emissive.getHex(), m.emissiveIntensity, o.geometry.uuid].join('|'))
    })
    return s.join('\n')
  }
  const antes = foto(), anim = crearAnimador(rig)
  let t = 0
  for (const e of estados) for (let i = 0; i < 90; i++) { t += 1 / 60; anim.actualizar(1 / 60, t, { estado: e, direccion: e === 'senalar' ? 1 : -1, desplazando: e === 'caminar' }) }
  assert.equal(foto(), antes, 'la apariencia no debe cambiar con la animación')
  rig.dispose()
}

// 3. Continuidad: cambiar de estado a mitad de movimiento no produce saltos (giro por cuadro acotado, sin NaN)
{
  const rig = crearRig(), anim = crearAnimador(rig)
  const previo = JUNTAS.map(() => new Quaternion()), ahora = new Quaternion()
  let t = 0, maxPaso = 0
  const orden: RestiEstado3D[] = ['reposo', 'saludo', 'alerta', 'seguro', 'pensar', 'senalar', 'caminar', 'ejecutar', 'escuchar', 'explicar', 'listo', 'saludo']
  for (let k = 0; k < orden.length; k++) {
    for (let i = 0; i < 20; i++) {   // se cambia de estado a los 1/3 de segundo, sin esperar a que se asiente
      t += 1 / 60
      anim.actualizar(1 / 60, t, { estado: orden[k], direccion: k % 2 ? 1 : -1, desplazando: orden[k] === 'caminar' })
      JUNTAS.forEach((n, j) => {
        ahora.copy(rig.j[n].quaternion)
        assert.ok(Number.isFinite(ahora.x + ahora.y + ahora.z + ahora.w), `${n}: NaN`)
        if (t > 1 / 30) maxPaso = Math.max(maxPaso, 2 * Math.acos(Math.min(1, Math.abs(previo[j].dot(ahora)))))
        previo[j].copy(ahora)
      })
    }
  }
  assert.ok(maxPaso < 0.15, `salto entre cuadros: ${maxPaso.toFixed(3)} rad (máx 0.15 ≈ 9 rad/s; un salto real sería ≥ 1 rad)`)
  console.log(`  giro máximo por cuadro a 60 fps: ${maxPaso.toFixed(3)} rad`)
  rig.dispose()
}

console.log('rig.test OK')
