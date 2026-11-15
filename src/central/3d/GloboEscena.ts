/**
 * GloboEscena.ts — el globo terráqueo de Central (three.js): continentes de puntos (máscara propia en tierra.ts, sin imágenes
 * externas), atmósfera y un marcador por restaurante con su color de estado. Solo muestra lo que se le entrega: no inventa
 * ubicaciones. Giro automático opcional, pausa cuando no se ve y recuperación si el navegador pierde el contexto WebGL.
 */
import {
  AdditiveBlending, BackSide, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Points, PointsMaterial,
  BufferAttribute, BufferGeometry, Raycaster, RingGeometry, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, AmbientLight, DirectionalLight, MeshStandardMaterial,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Calidad } from './calidad.ts'
import { puntosDeTierra } from './tierra.ts'

export interface Marcador { id: string; lat: number; lng: number; color: string; pulso: boolean; demo: boolean }
export interface OpcionesGlobo {
  canvas: HTMLCanvasElement; calidad: Calidad; reducirMovimiento: boolean
  onSeleccion: (id: string | null) => void
  onContextoPerdido: () => void
}

/** Latitud/longitud → punto sobre una esfera (y arriba, longitud 0 hacia +x… la misma convención de la máscara de tierra). */
export function aEsfera(lat: number, lng: number, r = 1): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180, theta = ((lng + 180) * Math.PI) / 180
  return new Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

const VERTICE = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
const FRAGMENTO = 'varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.25,0.55,1.0,1.0) * clamp(i, 0.0, 1.0); }'

export class GloboEscena {
  private o: OpcionesGlobo
  private renderer: WebGLRenderer
  private escena = new Scene()
  private camara = new PerspectiveCamera(40, 1, 0.1, 50)
  private controles: OrbitControls
  private mundo = new Group()
  private marcadores = new Group()
  private pickables: Mesh[] = []
  private anillos: { m: Mesh; pulso: boolean; fase: number }[] = []
  private porId = new Map<string, Group>()
  private seleccion: string | null = null
  private raf = 0
  private ultimo = 0
  private t0 = performance.now()
  private pausado = false
  private destruido = false
  private giro: boolean
  private abajo: { x: number; y: number; t: number } | null = null
  private vuelo: { desde: Vector3; hasta: Vector3; inicio: number; dur: number } | null = null
  private raycaster = new Raycaster()

  constructor(opciones: OpcionesGlobo) {
    this.o = opciones
    const { canvas, calidad } = opciones
    this.giro = !opciones.reducirMovimiento
    this.renderer = new WebGLRenderer({ canvas, antialias: calidad.antialias, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(calidad.ratioPixel)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    this.escena.add(this.mundo, new AmbientLight('#8FA8D8', 1.2))
    const sol = new DirectionalLight('#FFFFFF', 1.6); sol.position.set(4, 2, 5); this.escena.add(sol)

    const esfera = new Mesh(new SphereGeometry(1, calidad.nivel === 'baja' ? 32 : 64, calidad.nivel === 'baja' ? 24 : 48), new MeshStandardMaterial({ color: '#0A1530', roughness: 0.9, metalness: 0.1, emissive: '#0A1A3A', emissiveIntensity: 0.6 }))
    this.mundo.add(esfera)
    const atmosfera = new Mesh(new SphereGeometry(1.14, 48, 32), new ShaderMaterial({ vertexShader: VERTICE, fragmentShader: FRAGMENTO, blending: AdditiveBlending, side: BackSide, transparent: true, depthWrite: false }))
    this.escena.add(atmosfera)

    const pts = puntosDeTierra(calidad.puntosGlobo)
    const pos = new Float32Array(pts.length * 3)
    pts.forEach(([lat, lng], i) => { const v = aEsfera(lat, lng, 1.004); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z })
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3))
    this.mundo.add(new Points(g, new PointsMaterial({ color: new Color('#8FB4E8'), size: calidad.puntosGlobo === 1 ? 0.0105 : calidad.puntosGlobo === 2 ? 0.016 : 0.022, sizeAttenuation: true, transparent: true, opacity: 0.95 })))
    this.mundo.add(this.marcadores)

    this.camara.position.set(0, 0.6, 3.4)
    this.controles = new OrbitControls(this.camara, canvas)
    this.controles.enablePan = false
    this.controles.enableDamping = true
    this.controles.minDistance = 1.7
    this.controles.maxDistance = 6
    this.controles.rotateSpeed = 0.55
    this.controles.autoRotate = this.giro
    this.controles.autoRotateSpeed = 0.45
    this.controles.addEventListener('start', () => { this.vuelo = null; this.controles.autoRotate = false })

    canvas.addEventListener('pointerdown', this.alBajar)
    canvas.addEventListener('pointerup', this.alSubir)
    canvas.addEventListener('webglcontextlost', this.alPerder)
    this.raf = requestAnimationFrame(this.cuadro)
  }

  setMarcadores(lista: Marcador[]) {
    for (const h of [...this.marcadores.children]) { this.marcadores.remove(h); this.liberar(h) }
    this.pickables = []; this.anillos = []; this.porId.clear()
    for (const m of lista) {
      const g = new Group()
      const p = aEsfera(m.lat, m.lng, 1.012)
      g.position.copy(p)
      g.lookAt(p.clone().multiplyScalar(2))        // el eje z apunta hacia afuera: los anillos quedan "acostados" sobre la superficie
      const color = new Color(m.color)
      if (!m.demo) {
        const punto = new Mesh(new SphereGeometry(0.017, 12, 10), new MeshBasicMaterial({ color })); g.add(punto)
      }
      const aro = new Mesh(new RingGeometry(0.026, 0.034, 28), new MeshBasicMaterial({ color, transparent: true, opacity: m.demo ? 0.55 : 0.9, side: DoubleSide, depthWrite: false }))
      g.add(aro); this.anillos.push({ m: aro, pulso: m.pulso && !this.o.reducirMovimiento, fase: Math.random() * 6 })
      const toque = new Mesh(new SphereGeometry(0.055, 8, 6), new MeshBasicMaterial({ visible: false })); toque.userData.id = m.id   // área grande para tocar con el dedo
      g.add(toque); this.pickables.push(toque)
      this.marcadores.add(g); this.porId.set(m.id, g)
    }
    this.seleccionar(this.seleccion)
  }

  seleccionar(id: string | null) {
    this.seleccion = id
    this.porId.forEach((g, k) => g.scale.setScalar(k === id ? 1.9 : 1))
  }

  /** Gira la cámara hacia un punto del mundo. */
  enfocar(lat: number, lng: number, distancia = 2.7) {
    this.controles.autoRotate = false
    this.vuelo = { desde: this.camara.position.clone(), hasta: aEsfera(lat, lng, distancia), inicio: performance.now(), dur: this.o.reducirMovimiento ? 1 : 1100 }
  }
  autoRotar(si: boolean) { this.giro = si && !this.o.reducirMovimiento; this.controles.autoRotate = this.giro }

  private alBajar = (e: PointerEvent) => { this.abajo = { x: e.clientX, y: e.clientY, t: performance.now() } }
  private alSubir = (e: PointerEvent) => {
    const a = this.abajo; this.abajo = null
    if (!a || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6 || performance.now() - a.t > 600) return
    const r = this.o.canvas.getBoundingClientRect()
    this.raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)), this.camara)
    const golpes = this.raycaster.intersectObjects(this.pickables, false)
    // un marcador del lado oculto del planeta no se puede tocar
    const visible = golpes.find(h => { const p = h.object.getWorldPosition(new Vector3()); return p.dot(this.camara.position.clone().sub(p)) > 0 })
    const id = (visible?.object.userData.id as string | undefined) ?? null
    this.seleccionar(id); this.o.onSeleccion(id)
  }
  private alPerder = (e: Event) => { e.preventDefault(); this.pausar(true); this.o.onContextoPerdido() }

  redimensionar(ancho: number, alto: number) {
    if (this.destruido || ancho < 2 || alto < 2) return
    this.renderer.setSize(ancho, alto, false)
    this.camara.aspect = ancho / alto
    // En pantallas verticales (celular) se ensancha el campo de visión para que el globo no quede recortado a los lados.
    this.camara.fov = this.camara.aspect < 1 ? (2 * Math.atan(Math.tan((20 * Math.PI) / 180) / this.camara.aspect) * 180) / Math.PI : 40
    this.camara.updateProjectionMatrix()
  }
  pausar(p: boolean) { this.pausado = p }

  private cuadro = (ahora: number) => {
    if (this.destruido) return
    this.raf = requestAnimationFrame(this.cuadro)
    if (this.pausado || document.hidden) return
    if (ahora - this.ultimo < 1000 / this.o.calidad.fpsMax - 2) return
    this.ultimo = ahora
    if (this.vuelo) {
      const k = Math.min(1, (ahora - this.vuelo.inicio) / this.vuelo.dur), e = k * k * (3 - 2 * k)
      this.camara.position.lerpVectors(this.vuelo.desde, this.vuelo.hasta, e)
      if (k >= 1) this.vuelo = null
    }
    this.controles.update()
    const t = (ahora - this.t0) / 1000
    for (const a of this.anillos) if (a.pulso) { const s = 1 + ((t * 0.9 + a.fase) % 1.6) * 0.9; a.m.scale.setScalar(s); (a.m.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 - (s - 1) * 0.6) }
    this.renderer.render(this.escena, this.camara)
  }

  private liberar(o: Object3D) {
    o.traverse(h => {
      const m = h as Mesh
      m.geometry?.dispose?.()
      const mat = m.material as Material | Material[] | undefined
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose()
    })
  }

  destruir() {
    this.destruido = true
    cancelAnimationFrame(this.raf)
    const c = this.o.canvas
    c.removeEventListener('pointerdown', this.alBajar); c.removeEventListener('pointerup', this.alSubir); c.removeEventListener('webglcontextlost', this.alPerder)
    this.controles.dispose()
    this.liberar(this.mundo); this.liberar(this.escena)
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
