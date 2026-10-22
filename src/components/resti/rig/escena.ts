/** Escena de Resti: iluminación y cámara. Compartida por el componente y por las capturas de prueba para que se vean idénticos. */
import { Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, PMREMGenerator, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Encuadra a un personaje de `altura` (unidades del mundo) con un margen, de cuerpo entero. */
export function encuadrar(camara: PerspectiveCamera, altura: number) {
  const dist = (altura * 1.25) / 2 / Math.tan((camara.fov * Math.PI) / 360)
  camara.position.set(0, altura * 0.5 + 0.35, dist); camara.lookAt(0, altura * 0.5, 0)
}

export function crearEscena(renderer: WebGLRenderer, ancho: number, alto: number) {
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const sala = new RoomEnvironment()
  scene.environment = pmrem.fromScene(sala, 0.04).texture
  scene.add(new HemisphereLight(0xffffff, 0x9a948c, 0.55))
  const sol = new DirectionalLight(0xfff4e6, 1.5); sol.position.set(1.4, 2.6, 2.4); scene.add(sol)
  const contra = new DirectionalLight(0xffb066, 0.9); contra.position.set(-2, 1.5, -2); scene.add(contra)   // luz cálida de contorno
  const camara = new PerspectiveCamera(24, ancho / alto, 0.1, 30)
  camara.position.set(0, 1.6, 7.4); camara.lookAt(0, 1.25, 0)
  return { scene, camara, dispose: () => { sala.dispose(); pmrem.dispose() } }
}
