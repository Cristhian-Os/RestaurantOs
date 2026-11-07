/** Tenedor y cuchillo cruzados a la espalda (referencia: vista de espalda). Se usa en el rig procedural y en el modelo 3D real. */
import { Group, Mesh, MeshStandardMaterial, CapsuleGeometry, BoxGeometry, type BufferGeometry } from 'three'

export function crearCubiertos(): { grupo: Group; dispose: () => void } {
  const acero = new MeshStandardMaterial({ color: 0xd9dbe0, roughness: 0.28, metalness: 0.7 })
  const geos: BufferGeometry[] = []
  const malla = (g: BufferGeometry, padre: Group, x: number, y: number) => { geos.push(g); const m = new Mesh(g, acero); m.position.set(x, y, 0); padre.add(m) }
  const grupo = new Group()
  const tenedor = new Group(); tenedor.rotation.z = 0.62; grupo.add(tenedor)
  malla(new CapsuleGeometry(0.015, 0.34, 4, 10), tenedor, 0, -0.13)
  malla(new BoxGeometry(0.075, 0.07, 0.012), tenedor, 0, 0.1)
  for (const x of [-0.028, -0.009, 0.009, 0.028]) malla(new BoxGeometry(0.01, 0.1, 0.012), tenedor, x, 0.18)
  const cuchillo = new Group(); cuchillo.rotation.z = -0.62; grupo.add(cuchillo)
  malla(new CapsuleGeometry(0.017, 0.2, 4, 10), cuchillo, 0, -0.17)
  malla(new BoxGeometry(0.055, 0.27, 0.01), cuchillo, 0.004, 0.09)
  return { grupo, dispose: () => { acero.dispose(); geos.forEach(g => g.dispose()) } }
}
