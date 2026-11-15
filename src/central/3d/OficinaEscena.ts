/**
 * OficinaEscena.ts — la oficina circular en 3D (three.js): edificio de vidrio de un solo piso con núcleo naranja (el logo
 * oficial), tres anillos de espacios amueblados, plaza con fuente, palmeras, parqueadero y bosque. Día y noche, sombras, reflejos y
 * brillo según la calidad del equipo. Todo es procedural (sin imágenes ni modelos externos salvo el logo propio de la app).
 * Cuidado con el equipo: calidad adaptable, pausa cuando no se ve y recuperación si el navegador pierde el contexto WebGL.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferGeometry, BufferAttribute, CanvasTexture, CapsuleGeometry, CircleGeometry, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, HemisphereLight, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  OctahedronGeometry, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Points, PointsMaterial, Raycaster, RingGeometry, SRGBColorSpace, Scene,
  SphereGeometry, Sprite, SpriteMaterial, Texture, TorusGeometry, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, HalfFloatType,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Calidad } from './calidad.ts'
import { ANILLOS, RADIO_NUCLEO, aPunto, calcularSectores, puestosDeAgentes, type Sector } from './geometria.ts'
import { azar, crearFormas, Lote, Materiales, type Formas } from './kit.ts'
import { construirEntorno, crearHoja, ENTRADA, palma } from './entorno.ts'
import { escritorio } from './mobiliario.ts'
import { amueblar } from './sectores.ts'
import { texCartel, texCielo, texLogoDisco, texMadera, texMarmol, texPasto, texPendon } from './texturas.ts'

export interface DeptoEscena { id: string; nombre: string; anillo: 2 | 3 | 4; orden: number; color: string; estado: string }
export interface AgenteEscena { id: string; nombre: string; departamento_id: string; estadoColor: string }
export interface DatosOficina { departamentos: DeptoEscena[]; agentes: AgenteEscena[] }
export type ModoCamara = 'planta' | 'exterior' | 'interior' | 'recorrer'
export type Iluminacion = 'dia' | 'noche'
export interface Seleccion { tipo: 'departamento' | 'agente' | 'nucleo'; id: string }

export interface OpcionesOficina {
  canvas: HTMLCanvasElement; calidad: Calidad; iluminacion: Iluminacion; reducirMovimiento: boolean
  onSeleccion: (s: Seleccion | null) => void
  onContextoPerdido: () => void
  onCamaraLibre: () => void                  // el usuario tomó el control: se detuvo el recorrido
  onRecorrido: (departamentoId: string | null) => void
  hero?: boolean                             // portada: cámara que se mece sola, sin controles ni selección (barata y sin riesgo de gestos)
}

interface Vista { pos: Vector3; objetivo: Vector3 }
interface Luminoso { m: MeshStandardMaterial; dia: number; noche: number }
type TipoPiso = 'marmol' | 'madera' | 'pasto'
const suave = (t: number) => t * t * (3 - 2 * t)
const mezclar = (hex: string, con: string, k: number) => new Color(hex).lerp(new Color(con), k)
const DOS_PI = Math.PI * 2
const ALTO_PARED = 2.6

export class OficinaEscena {
  private o: OpcionesOficina
  private renderer: WebGLRenderer
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private escena = new Scene()
  private camara = new PerspectiveCamera(45, 1, 0.1, 500)
  private controles: OrbitControls
  private F: Formas
  private X = new Materiales()
  private hoja = crearHoja()
  private fijo = new Group()                 // entorno, edificio y núcleo: se construyen una vez
  private dinamico = new Group()             // espacios y agentes: se reconstruyen cuando cambian los datos
  private techo = new Group()
  private pickFijo: Object3D[] = []
  private pickDin: Object3D[] = []
  private sectores: Sector[] = []
  private pisoDe = new Map<string, Mesh>()
  private figuraDe = new Map<string, Group>()
  private luminososDin: Luminoso[] = []
  private nucleo = new Group()
  private anillosNucleo: Mesh[] = []
  private luzNucleo = new PointLight('#FF7A1A', 0, 70, 1.5)
  private hemi = new HemisphereLight('#ffffff', '#223', 1)
  private sol = new DirectionalLight('#ffffff', 1)
  private ambiente = new AmbientLight('#FFFFFF', 0)
  private halo: Mesh
  private estrellas: Points
  private domo: Mesh
  private etiquetas: Sprite[] = []        // rótulos que se desvanecen al acercarse (para no tapar la vista)
  private vidrioFachada!: MeshStandardMaterial
  private entornoTex: Texture | null = null
  private cielos: { dia: CanvasTexture; noche: CanvasTexture }
  private texBase = new Map<TipoPiso, CanvasTexture>()
  private texPiso = new Map<string, CanvasTexture>()
  private seleccion: Seleccion | null = null
  private datos: DatosOficina = { departamentos: [], agentes: [] }
  private raf = 0
  private ultimo = 0
  private t0 = performance.now()
  // Resolución adaptable: si el equipo se atrasa baja la resolución, pero nunca por debajo de la nativa de la pantalla (no se ve borrosa);
  // mientras haces scroll no se mide (el tirón de la página no es culpa de la escena). Si le sobra, sube hasta su tope.
  private ultimoScroll = 0
  private alScroll = () => { this.ultimoScroll = performance.now() }
  private ratio = 1
  private ancho = 0
  private alto = 0
  private dtMedio = 0
  private cuadros = 0
  private ultimoAjuste = 0
  private bueno = 0
  private pausado = false
  private destruido = false
  private modo: ModoCamara = 'exterior'
  private verTecho = false
  private transicion: { desde: Vista; hasta: Vista; inicio: number; dur: number } | null = null
  private paradas: { id: string; vista: Vista }[] = []
  private recorrido = { indice: 0, inicio: 0 }
  private raycaster = new Raycaster()
  private abajo: { x: number; y: number; t: number } | null = null
  private iluminacion: Iluminacion

  constructor(opciones: OpcionesOficina) {
    this.o = opciones
    this.iluminacion = opciones.iluminacion
    const { canvas, calidad } = opciones
    const nivel = calidad.nivel
    this.renderer = new WebGLRenderer({ canvas, antialias: calidad.antialias && nivel !== 'alta', powerPreference: 'high-performance' })
    this.ratio = calidad.ratioPixel
    this.renderer.setPixelRatio(this.ratio)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    if (nivel !== 'baja') { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFSoftShadowMap }

    // Reflejos suaves del "ambiente" (sin imágenes externas)
    try {
      const pm = new PMREMGenerator(this.renderer)
      this.entornoTex = pm.fromScene(new RoomEnvironment(), 0.04).texture
      pm.dispose()
      this.escena.environment = this.entornoTex
    } catch { /* sin reflejos: la escena se ve igual de bien, algo más plana */ }

    this.F = crearFormas(nivel === 'baja' ? 8 : nivel === 'media' ? 14 : 24)
    this.cielos = { dia: texCielo(false), noche: texCielo(true) }
    this.escena.add(this.fijo, this.dinamico, this.hemi, this.ambiente, this.sol, this.sol.target, this.luzNucleo)
    this.domo = new Mesh(new SphereGeometry(460, 32, 24), new MeshBasicMaterial({ map: this.cielos.dia, side: BackSide, fog: false, depthWrite: false, toneMapped: false }))
    this.domo.renderOrder = -1
    this.escena.add(this.domo)

    this.sol.position.set(45, 80, 55)
    if (nivel !== 'baja') {
      this.sol.castShadow = true
      const t = nivel === 'alta' ? 2048 : 1024
      this.sol.shadow.mapSize.set(t, t)
      const c = this.sol.shadow.camera; c.left = -75; c.right = 75; c.top = 75; c.bottom = -75; c.near = 20; c.far = 260
      this.sol.shadow.bias = -0.0004; this.sol.shadow.normalBias = 0.06
    }
    this.luzNucleo.position.set(0, 6, 0)

    // Estrellas (solo de noche)
    const n = 500, pos = new Float32Array(n * 3), rnd = azar(99)
    for (let i = 0; i < n; i++) { const a = rnd() * DOS_PI, e = 0.12 + rnd() * 1.2, r = 380; pos[i * 3] = r * Math.cos(e) * Math.cos(a); pos[i * 3 + 1] = r * Math.sin(e); pos[i * 3 + 2] = r * Math.cos(e) * Math.sin(a) }
    const eg = new BufferGeometry(); eg.setAttribute('position', new BufferAttribute(pos, 3))
    this.estrellas = new Points(eg, new PointsMaterial({ color: '#FFFFFF', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }))
    this.estrellas.visible = false
    this.escena.add(this.estrellas)

    this.halo = new Mesh(new TorusGeometry(0.7, 0.07, 8, 32), new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95 }))
    this.halo.rotation.x = Math.PI / 2
    this.halo.visible = false
    this.escena.add(this.halo)

    if (nivel === 'alta') {
      try {
        // Con el brillo activo el antialias del navegador no aplica: el buffer propio lleva 4 muestras (bordes limpios).
        const rt = new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: 4 })
        this.composer = new EffectComposer(this.renderer, rt)
        this.composer.setPixelRatio(this.ratio)
        this.composer.addPass(new RenderPass(this.escena, this.camara))
        this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.2, 0.55, 0.92)
        this.composer.addPass(this.bloom)
        this.composer.addPass(new OutputPass())
      } catch { this.composer = null; this.bloom = null }
    }

    this.controles = new OrbitControls(this.camara, canvas)
    this.controles.enableDamping = true
    this.controles.dampingFactor = 0.08
    this.controles.maxDistance = 150
    this.controles.minDistance = 0.4
    this.controles.maxPolarAngle = Math.PI * 0.495
    this.controles.addEventListener('start', () => { if (this.modo === 'recorrer') { this.modo = 'exterior'; this.transicion = null; this.o.onRecorrido(null); this.o.onCamaraLibre() } })

    if (opciones.hero) this.controles.enabled = false
    else { canvas.addEventListener('pointerdown', this.alBajar); canvas.addEventListener('pointerup', this.alSubir) }
    canvas.addEventListener('webglcontextlost', this.alPerderContexto)
    window.addEventListener('scroll', this.alScroll, { passive: true, capture: true })

    this.construirFijo()
    this.afinarTexturas(this.fijo)
    this.aplicarLuz()
    this.irA('exterior', true)
    this.raf = requestAnimationFrame(this.cuadro)
  }

  // ── Datos ────────────────────────────────────────────────────────────────
  setDatos(d: DatosOficina) {
    this.datos = d
    this.construir()
    this.afinarTexturas(this.dinamico)
  }

  /** Filtro anisotrópico en las texturas de pisos y suelos: se ven nítidas también de lejos y en ángulo (casi sin costo). */
  private afinarTexturas(raiz: Object3D) {
    const tope = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    raiz.traverse(o => {
      const mat = (o as Mesh).material as Material | Material[] | undefined
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        const t = (m as MeshStandardMaterial).map
        if (t && t.anisotropy < tope) { t.anisotropy = tope; t.needsUpdate = true }
      }
    })
  }

  /** Cambia la resolución interna sin tocar el tamaño en pantalla. */
  private fijarRatio(r: number) {
    this.ratio = r
    this.renderer.setPixelRatio(r)
    this.composer?.setPixelRatio(r)
    if (this.ancho > 1) { this.renderer.setSize(this.ancho, this.alto, false); this.composer?.setSize(this.ancho, this.alto) }
  }

  private ajustarResolucion(dt: number, ahora: number) {
    const meta = 1000 / this.o.calidad.fpsMax
    this.cuadros++
    this.dtMedio = this.dtMedio ? this.dtMedio * 0.92 + dt * 0.08 : meta
    if (ahora - this.ultimoScroll < 600) { this.dtMedio = meta; return }   // haciendo scroll: no se mide
    if (this.cuadros < 45 || ahora - this.ultimoAjuste < 1800) return   // calentamiento y pausa entre cambios
    const tope = this.o.calidad.ratioPixel
    const piso = Math.min(1, tope)   // nunca más borroso que la pantalla
    if (this.dtMedio > meta * 1.6 && this.ratio > piso) {
      this.bueno = 0; this.ultimoAjuste = ahora; this.dtMedio = meta
      this.fijarRatio(Math.max(piso, this.ratio - 0.25))
    } else if (this.dtMedio < meta * 1.2 && this.ratio < tope) {
      if (++this.bueno > 60) { this.bueno = 0; this.ultimoAjuste = ahora; this.fijarRatio(Math.min(tope, this.ratio + 0.25)) }
    } else this.bueno = 0
  }

  // ── Texturas de piso compartidas ─────────────────────────────────────────
  private pisoTextura(tipo: TipoPiso, radio: number): CanvasTexture {
    const clave = tipo + Math.round(radio)
    let t = this.texPiso.get(clave)
    if (!t) {
      let base = this.texBase.get(tipo)
      if (!base) { base = tipo === 'marmol' ? texMarmol() : tipo === 'madera' ? texMadera() : texPasto(); this.texBase.set(tipo, base) }
      t = base.clone(); t.repeat.set((radio * 2) / 6, (radio * 2) / 6); t.needsUpdate = true; this.texPiso.set(clave, t)
    }
    return t
  }

  private marcar(obj: Object3D, sel: Seleccion, lista: Object3D[]) {
    obj.traverse(h => { if (h instanceof Mesh) { h.userData.sel = sel; lista.push(h) } })
  }

  private etiqueta(texto: string, color: string, escala = 1): Sprite {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128
    const g = c.getContext('2d') as CanvasRenderingContext2D
    g.fillStyle = 'rgba(12,17,30,0.84)'; g.beginPath(); g.roundRect(8, 24, 496, 80, 40); g.fill()
    g.strokeStyle = color; g.lineWidth = 4; g.stroke()
    g.fillStyle = color; g.beginPath(); g.arc(52, 64, 14, 0, DOS_PI); g.fill()
    g.fillStyle = '#FFFFFF'; g.font = '600 42px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'
    g.fillText(texto.length > 21 ? texto.slice(0, 20) + '…' : texto, 82, 66)
    const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace
    const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
    s.scale.set(5.6 * escala, 1.4 * escala, 1); s.renderOrder = 10
    this.etiquetas.push(s)
    return s
  }

  // ── Edificio, núcleo y entorno (una sola vez) ────────────────────────────
  private construirFijo() {
    const { X, F } = this
    const nivel = this.o.calidad.nivel
    const seg = nivel === 'baja' ? 64 : 128
    this.fijo.add(construirEntorno(F, X, nivel))
    const L = new Lote(), T = new Lote()          // L: edificio · T: techo
    const plano = (lote: Lote, geo: BufferGeometry, mat: Material, y: number) => lote.add(geo, mat, [0, y, 0], 1, [-Math.PI / 2, 0, 0])

    // Piso general de mármol y tiras de luz de los pasillos
    const marmol = X.tinte(X.std('pisoGeneral', '#FFFFFF', { map: this.pisoTextura('marmol', 38.4), roughness: 0.28, metalness: 0.05 }), '#FFFFFF', '#8590B8')
    plano(L, new CircleGeometry(38.4, seg), marmol, 0)
    const tira = X.luz('tiraLuz', '#FFE7C2', 0.45, 2.4), tiraNaranja = X.luz('tiraNaranja', '#FF7A1A', 0.9, 3.4)
    for (const r of [8.5, 16, 17.5, 28, 29.5, 37.1]) plano(L, new RingGeometry(r - 0.07, r + 0.07, seg), tira, 0.035)
    plano(L, new RingGeometry(7.45, 7.6, seg), tiraNaranja, 0.04)
    plano(L, new RingGeometry(RADIO_NUCLEO - 0.06, RADIO_NUCLEO + 0.06, seg), tiraNaranja, 0.04)

    // Fachada: zócalo, vidrio, parantes y vigas
    const zocalo = X.tinte(X.std('zocalo', '#B9B2A2', { roughness: 0.5, side: DoubleSide }), '#B9B2A2', '#626985')
    L.add(new CylinderGeometry(37.75, 37.75, 0.55, seg, 1, true), zocalo, [0, 0.275, 0])
    this.vidrioFachada = X.std('vidrioFachada', '#8FC8E6', { transparent: true, opacity: 0.34, roughness: 0.04, metalness: 0.2, side: DoubleSide, depthWrite: false, envMapIntensity: 1.8 })
    L.add(new CylinderGeometry(37.6, 37.6, 2.85, seg, 1, true), this.vidrioFachada, [0, 1.975, 0])
    const marco = X.std('marcoAluminio', '#C9CFD9', { roughness: 0.35, metalness: 0.75 })
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * DOS_PI
      if (Math.abs(Math.atan2(Math.sin(a - ENTRADA), Math.cos(a - ENTRADA))) < 0.17) continue
      const p = aPunto(37.6, a); L.add(F.caja, marco, [p.x, 1.975, p.z], [0.1, 2.85, 0.1], [0, -a, 0])
    }
    for (const y of [0.58, 2.0]) L.add(new TorusGeometry(37.6, 0.06, 6, seg), marco, [0, y, 0], 1, [Math.PI / 2, 0, 0])
    // Cornisa gris sobre el vidrio (se ve con el techo puesto o retirado)
    const cornisa = X.tinte(X.std('cornisa', '#9EA6B6', { roughness: 0.45, metalness: 0.2, side: DoubleSide }), '#9EA6B6', '#5A617F')
    L.add(new CylinderGeometry(38.0, 38.0, 0.7, seg, 1, true), cornisa, [0, 3.75, 0])
    L.add(new TorusGeometry(38.0, 0.12, 6, seg), cornisa, [0, 4.1, 0], 1, [Math.PI / 2, 0, 0])

    // Entrada: pórtico, parapeto con el cartel y columnas
    const piedra = X.tinte(X.std('piedraClara', '#E9E4D8', { roughness: 0.5 }), '#E9E4D8', '#848BA8')
    const oscuro = X.std('parapeto', '#1D2230', { roughness: 0.5, metalness: 0.3 })
    const ex = 0, ez = 38.6
    L.add(F.caja, oscuro, [ex, 5.0, ez], [16, 3.2, 0.9])
    L.add(F.caja, tiraNaranja, [ex, 3.5, ez + 0.5], [16, 0.12, 0.14])
    L.add(F.caja, piedra, [ex, 3.75, ez + 3.4], [14, 0.32, 6.2])
    L.add(F.caja, tiraNaranja, [ex, 3.56, ez + 6.45], [14, 0.1, 0.12])
    for (const lx of [-6.3, 6.3]) L.add(F.cil, piedra, [lx, 1.85, ez + 5.8], [0.32, 3.7, 0.32])
    plano(L, new PlaneGeometry(14, 9), X.tinte(X.std('alfombraEntrada', '#EFE8D8', { roughness: 0.6 }), '#EFE8D8', '#7F86A4'), 0.045)

    // Cartel RestaurantOS
    const cartel = new Mesh(new PlaneGeometry(10.4, 2.6), new MeshBasicMaterial({ map: texCartel(), toneMapped: false }))
    cartel.position.set(ex, 5.0, ez + 0.47)
    const cartelInterior = cartel.clone(); cartelInterior.position.z = ez - 0.47; cartelInterior.rotation.y = Math.PI   // también se lee desde adentro
    this.fijo.add(cartel, cartelInterior)

    // Techo (se puede retirar)
    const roof = X.tinte(X.std('techo', '#DCE0E7', { roughness: 0.55, metalness: 0.1 }), '#DCE0E7', '#6A7292')
    plano(T, new RingGeometry(8.2, 39.2, seg), roof, 3.5)
    const junta = X.std('juntaTecho', '#A9B0BE', { roughness: 0.6 })
    for (const r of [15, 22, 30]) T.add(new TorusGeometry(r, 0.07, 4, seg), junta, [0, 3.52, 0], 1, [Math.PI / 2, 0, 0])
    for (let i = 0; i < 24; i++) { const a = (i / 24) * DOS_PI, p = aPunto(23.7, a); T.add(F.caja, junta, [p.x, 3.52, p.z], [31, 0.02, 0.12], [0, -a, 0]) }
    const borde = X.std('techoBorde', '#A3ABB9', { roughness: 0.5, metalness: 0.2, side: DoubleSide })
    T.add(new CylinderGeometry(39.2, 39.2, 0.5, seg, 1, true), borde, [0, 3.25, 0])
    T.add(new CylinderGeometry(8.2, 8.2, 0.5, seg, 1, true), borde, [0, 3.25, 0])
    T.add(new TorusGeometry(39.2, 0.08, 6, seg), tira, [0, 3.0, 0], 1, [Math.PI / 2, 0, 0])
    T.add(new TorusGeometry(8.2, 0.1, 6, seg), tiraNaranja, [0, 3.55, 0], 1, [Math.PI / 2, 0, 0])
    const solar = X.std('panelSolar', '#1B2F5C', { roughness: 0.2, metalness: 0.8 })
    const marcoSolar = X.std('marcoSolar', '#9AA3B4', { roughness: 0.4, metalness: 0.6 })
    for (const [r, n] of [[33, 28], [22, 18]] as const) for (let i = 0; i < n; i++) {
      const a = (i / n) * DOS_PI + 0.07
      if (r === 33 && Math.abs(Math.atan2(Math.sin(a - ENTRADA), Math.cos(a - ENTRADA))) < 0.28) continue
      const p = aPunto(r, a)
      T.add(F.caja, marcoSolar, [p.x, 3.62, p.z], [5.1, 0.06, 2.5], [0, -a - Math.PI / 2, 0])
      T.add(F.caja, solar, [p.x, 3.67, p.z], [4.9, 0.06, 2.3], [0, -a - Math.PI / 2, 0])
    }
    this.techo.add(T.construir(true, true))
    this.techo.visible = false

    this.fijo.add(L.construir(nivel !== 'baja', true), this.techo)
    this.construirNucleo()
  }

  // ── Núcleo: RestaurantOS + Resti ──────────────────────────────────────────
  private construirNucleo() {
    const { X, F } = this
    const n = this.nucleo = new Group()
    const L = new Lote(), rng = azar(4242)
    const mar = X.tinte(X.std('marmolBlanco', '#F4F1EA', { roughness: 0.2, metalness: 0.05 }), '#F4F1EA', '#9AA2C4')
    const aro = X.luz('aroNaranja', '#FF7A1A', 0.9, 3.4)
    L.add(F.cil, mar, [0, 0.2, 0], [RADIO_NUCLEO - 0.05, 0.4, RADIO_NUCLEO - 0.05])
    L.add(new TorusGeometry(RADIO_NUCLEO - 0.25, 0.1, 8, 96), aro, [0, 0.42, 0], 1, [Math.PI / 2, 0, 0])
    L.add(new RingGeometry(4.6, 6.05, 64), X.tinte(X.std('jardineraNucleo', '#5BA53F', { roughness: 0.95 }), '#5BA53F', '#35507A'), [0, 0.43, 0], 1, [-Math.PI / 2, 0, 0])
    L.add(F.cil, mar, [0, 0.46, 0], [4.55, 0.12, 4.55])
    L.add(new TorusGeometry(4.5, 0.09, 8, 80), aro, [0, 0.55, 0], 1, [Math.PI / 2, 0, 0])
    for (let i = 0; i < 7; i++) { const a = (i / 7) * DOS_PI + 0.2; palma(L, F, X, this.hoja, 5.35 * Math.cos(a), 5.35 * Math.sin(a), 3.6 + rng() * 1.2, rng) }
    const seto = X.std('seto', '#3C8A38', { roughness: 0.9 })
    for (let i = 0; i < 14; i++) { const a = (i / 14) * DOS_PI + 0.1; L.add(F.esf, seto, [5.35 * Math.cos(a), 0.7, 5.35 * Math.sin(a)], [0.55, 0.4, 0.55]) }
    // Pedestal de madera con banda luminosa
    L.add(F.cil, X.std('pedestal', '#9A6B43', { roughness: 0.45 }), [0, 1.0, 0], [2.0, 1.0, 2.0])
    L.add(F.cil, aro, [0, 1.52, 0], [2.06, 0.08, 2.06])
    L.add(F.cil, mar, [0, 1.58, 0], [1.9, 0.06, 1.9])
    n.add(L.construir(this.o.calidad.nivel !== 'baja', true))

    for (const [r, y] of [[3.6, 0.9], [3.0, 1.6], [2.4, 2.3]] as const) {
      const a = new Mesh(new TorusGeometry(r, 0.07, 8, 80), new MeshBasicMaterial({ color: '#FFB36B', transparent: true, opacity: 0.8 }))
      a.rotation.x = Math.PI / 2; a.position.y = y
      this.anillosNucleo.push(a); n.add(a)
    }
    const haz = new Mesh(new CylinderGeometry(2.2, 3.6, 11, 32, 1, true), new MeshBasicMaterial({ color: '#FF9A3C', transparent: true, opacity: 0.07, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }))
    haz.position.y = 6.2
    n.add(haz)
    // El logo oficial es la pieza central: un medallón que siempre mira a la cámara, bajo y pequeño para no tapar la oficina.
    const medallon = new Sprite(new SpriteMaterial({ map: texLogoDisco(), transparent: true, depthWrite: false, toneMapped: false }))
    medallon.scale.set(3.6, 3.6, 1); medallon.position.set(0, 3.75, 0)
    n.add(medallon)
    const et = this.etiqueta('RestaurantOS · Núcleo', '#FF7A1A', 1.0); et.position.set(0, 6.4, 0)
    n.add(et)
    this.marcar(n, { tipo: 'nucleo', id: 'nucleo' }, this.pickFijo)
    this.marcar(medallon, { tipo: 'nucleo', id: 'nucleo' }, this.pickFijo)
    this.fijo.add(n)
  }

  // ── Un espacio: piso, vidrio, pendón, etiqueta y mobiliario ──────────────
  private construir() {
    for (const h of [...this.dinamico.children]) { this.dinamico.remove(h); this.liberar(h) }
    this.pickDin = []; this.pisoDe.clear(); this.figuraDe.clear(); this.luminososDin = []
    this.etiquetas = this.etiquetas.filter(e => e.parent === this.nucleo)   // quedan solo las del núcleo
    const { departamentos, agentes } = this.datos
    this.sectores = calcularSectores(departamentos.map(d => ({ id: d.id, anillo: d.anillo, orden: d.orden, color: d.color })))
    const { X, F } = this
    const nivel = this.o.calidad.nivel
    const L = new Lote(), k = { L, F, X }, rng = azar(777)

    for (const s of this.sectores) {
      const d = departamentos.find(x => x.id === s.id)
      if (!d) continue
      this.construirSector(L, s, d, nivel)
      amueblar(k, s, d, this.hoja, rng, nivel !== 'baja')
      const deEste = agentes.filter(a => a.departamento_id === s.id)
      puestosDeAgentes(s, deEste.length).forEach((p, i) => {
        escritorio(k, { x: p.x, z: p.z, phi: p.giro }, d.color, 5 + i, true)
        this.construirAgente(deEste[i], d, p.x, p.z, p.giro)
      })
    }
    this.dinamico.add(L.construir(nivel !== 'baja', true))

    // Paradas del recorrido: una por espacio, mirando desde el pasillo hacia el centro del sector
    this.paradas = this.sectores.map(s => {
      const dentro = aPunto(s.r0 - 2.4, s.centro), meta = aPunto((s.r0 + s.r1) / 2, s.centro)
      return { id: s.id, vista: { pos: new Vector3(dentro.x, 3.6, dentro.z), objetivo: new Vector3(meta.x, 1.1, meta.z) } }
    })
    this.aplicarLuz()
    this.reseleccionar()
  }

  private construirSector(L: Lote, s: Sector, d: DeptoEscena, nivel: Calidad['nivel']) {
    const { X, F } = this
    const enConstruccion = d.estado === 'en_construccion'
    const tipo: TipoPiso = d.id === 'jardines' ? 'pasto' : ['cafeteria', 'descanso', 'recreacion'].includes(d.id) ? 'madera' : 'marmol'
    const seg = Math.max(8, Math.round((96 * (s.a1 - s.a0)) / DOS_PI) + 4)
    const g = new Group()

    // Piso del espacio (lo que se toca para elegirlo)
    const mat = new MeshStandardMaterial({
      color: tipo === 'pasto' ? new Color('#FFFFFF') : mezclar('#FFFFFF', d.color, tipo === 'madera' ? 0.12 : 0.44), map: this.pisoTextura(tipo, s.r1),
      roughness: tipo === 'marmol' ? 0.3 : 0.65, emissive: new Color(d.color), emissiveIntensity: 0.05, transparent: enConstruccion, opacity: enConstruccion ? 0.55 : 1,
    })
    this.luminososDin.push({ m: mat, dia: 0.05, noche: 0.42 })
    const piso = new Mesh(new RingGeometry(s.r0, s.r1, seg, 1, -s.a1, s.a1 - s.a0), mat)
    piso.rotation.x = -Math.PI / 2; piso.position.y = 0.02; piso.receiveShadow = true
    this.pisoDe.set(s.id, piso)
    g.add(piso)
    this.marcar(piso, { tipo: 'departamento', id: d.id }, this.pickDin)

    // Paredes de vidrio con rieles de color y parantes
    const vidrio = X.std('vidrioInterior', '#D6EEF7', { transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.2, side: DoubleSide, depthWrite: false, envMapIntensity: 1.4 })
    const riel = X.luz('riel' + d.color, d.color, 0.6, 2.2, { side: DoubleSide })
    const poste = X.std('posteClaro', '#E4E8EE', { roughness: 0.4, metalness: 0.4 })
    const th = Math.PI / 2 - s.a1, len = s.a1 - s.a0
    for (const r of [s.r0, s.r1]) {
      L.add(new CylinderGeometry(r, r, ALTO_PARED, seg, 1, true, th, len), vidrio, [0, ALTO_PARED / 2, 0])
      L.add(new CylinderGeometry(r, r, 0.1, seg, 1, true, th, len), riel, [0, ALTO_PARED, 0])
      L.add(new CylinderGeometry(r, r, 0.12, seg, 1, true, th, len), riel, [0, 0.07, 0])
      const n = Math.max(2, Math.round((r * len) / 3.4))
      for (let i = 0; i <= n; i++) { const p = aPunto(r, s.a0 + (len * i) / n); L.add(F.caja, poste, [p.x, ALTO_PARED / 2, p.z], [0.1, ALTO_PARED, 0.1]) }
    }
    for (const a of [s.a0, s.a1]) {
      const m = aPunto((s.r0 + s.r1) / 2, a)
      L.add(F.caja, vidrio, [m.x, ALTO_PARED / 2, m.z], [s.r1 - s.r0, ALTO_PARED, 0.06], [0, -a, 0])
      L.add(F.caja, riel, [m.x, ALTO_PARED, m.z], [s.r1 - s.r0, 0.1, 0.12], [0, -a, 0])
    }

    // Pendón con el glifo del espacio, mirando al pasillo interior
    let h = 0; for (const ch of d.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const tex = texPendon(d.color, h)
    const pm = new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new Color('#FFFFFF'), emissiveIntensity: 0.4, roughness: 0.7, side: DoubleSide })
    this.luminososDin.push({ m: pm, dia: 0.35, noche: 0.9 })
    const ap = s.a0 + len * 0.1                      // a un lado, para no tapar la vista hacia el espacio
    const pos = aPunto(s.r0 + 0.8, ap)
    const pendon = new Mesh(new PlaneGeometry(1.5, 2.6), pm)
    pendon.position.set(pos.x, 2.35, pos.z); pendon.rotation.y = -ap - Math.PI / 2
    g.add(pendon)
    L.add(F.caja, poste, [pos.x, 0.95, pos.z], [0.07, 1.9, 0.07], [0, -ap, 0])
    L.add(F.caja, poste, [pos.x, 3.7, pos.z], [1.6, 0.06, 0.06], [0, -ap - Math.PI / 2, 0])

    const centro = aPunto((s.r0 + s.r1) / 2, s.centro)
    const et = this.etiqueta(d.nombre, d.color, nivel === 'baja' ? 0.9 : 1); et.position.set(centro.x, 4.9, centro.z)
    g.add(et)
    this.dinamico.add(g)
  }

  // ── Un agente ─────────────────────────────────────────────────────────────
  private construirAgente(a: AgenteEscena, d: DeptoEscena, x: number, z: number, giro: number) {
    const g = new Group()
    const seg = this.o.calidad.detalleAgentes
    const color = new Color(d.color)
    const traje = new MeshStandardMaterial({ color, roughness: 0.6 })
    const piel = new MeshStandardMaterial({ color: '#F4F6FA', roughness: 0.35, metalness: 0.1 })   // cabeza de robot (blanca)
    const blanco = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 })
    const visor = new MeshStandardMaterial({ color: '#0E1320', roughness: 0.15, metalness: 0.5 })
    const ojos = new MeshBasicMaterial({ color: '#7FE9FF', toneMapped: false })
    const parte = (geo: BufferGeometry, mat: Material, px: number, py: number, pz: number, rx = 0, sy = 1) => {
      const m = new Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; m.scale.y = sy; m.castShadow = true; g.add(m)
    }
    parte(new CapsuleGeometry(0.27, 0.42, 3, seg), traje, 0, 0.95, 0)                                   // torso sentado
    parte(new SphereGeometry(0.22, seg, Math.max(6, seg - 2)), piel, 0, 1.52, 0)                          // cabeza
    parte(new CylinderGeometry(0.2, 0.22, 0.14, seg), blanco, 0, 1.76, 0)                                 // toque: banda
    parte(new SphereGeometry(0.26, seg, Math.max(6, seg - 2)), blanco, 0, 1.97, 0, 0, 0.82)               // toque: copa
    parte(new CapsuleGeometry(0.07, 0.34, 3, 6), traje, -0.31, 0.96, 0.22, 1.15)                          // brazos hacia el teclado
    parte(new CapsuleGeometry(0.07, 0.34, 3, 6), traje, 0.31, 0.96, 0.22, 1.15)
    parte(new SphereGeometry(0.19, seg, Math.max(6, seg - 2)), visor, 0, 1.53, 0.1, 0, 0.7)               // visor oscuro
    parte(new SphereGeometry(0.035, 8, 6), ojos, -0.075, 1.55, 0.27)                                      // ojos cian
    parte(new SphereGeometry(0.035, 8, 6), ojos, 0.075, 1.55, 0.27)
    parte(new RingGeometry(0.5, 0.62, 24), new MeshBasicMaterial({ color: a.estadoColor, side: DoubleSide }), 0, 0.06, 0, -Math.PI / 2)   // anillo de estado
    // Marcador de su color sobre la cabeza: se ve desde lejos, aunque la figura sea pequeña
    const marca = new Mesh(new OctahedronGeometry(0.2), new MeshBasicMaterial({ color }))
    marca.position.set(0, 2.5, 0); marca.userData.marca = true; g.add(marca)
    g.scale.setScalar(1.7)
    g.position.set(x, 0, z); g.rotation.y = giro
    const et = this.etiqueta(a.nombre, d.color, 0.55); et.position.set(x, 5.6, z); this.dinamico.add(et)
    g.userData.fase = Math.random() * DOS_PI
    this.figuraDe.set(a.id, g)
    this.marcar(g, { tipo: 'agente', id: a.id }, this.pickDin)
    this.dinamico.add(g)
  }

  // ── Selección ─────────────────────────────────────────────────────────────
  seleccionar(s: Seleccion | null) { this.seleccion = s; this.reseleccionar() }
  private reseleccionar() {
    const s = this.seleccion
    this.halo.visible = false
    if (s?.tipo === 'agente') {
      const f = this.figuraDe.get(s.id)
      if (f) { this.halo.visible = true; this.halo.position.set(f.position.x, 0.12, f.position.z) }
    }
  }

  // ── Cámara ────────────────────────────────────────────────────────────────
  private vista(modo: Exclude<ModoCamara, 'recorrer'>): Vista {
    if (modo === 'planta') return { pos: new Vector3(0, 96, 12), objetivo: new Vector3(0, 0, 0) }
    if (modo === 'interior') return { pos: new Vector3(0, 5.2, 10), objetivo: new Vector3(0, 2.4, 26) }
    return { pos: new Vector3(30, 34, 66), objetivo: new Vector3(0, 0, 6) }
  }

  setCamara(modo: ModoCamara) { this.irA(modo, false) }

  /** Muestra u oculta el techo (solo se ve desde la cámara Exterior). */
  setTecho(v: boolean) { this.verTecho = v; this.techo.visible = v && this.modo === 'exterior' }

  private irA(modo: ModoCamara, instantaneo: boolean) {
    this.modo = modo
    this.techo.visible = this.verTecho && modo === 'exterior'
    this.controles.enablePan = modo !== 'interior'
    this.controles.minDistance = modo === 'interior' ? 0.3 : 4
    if (modo === 'recorrer') {
      if (!this.paradas.length || this.o.reducirMovimiento) { this.modo = 'exterior'; this.techo.visible = this.verTecho; return }
      this.recorrido = { indice: 0, inicio: performance.now() }
      this.desplazar(this.paradas[0].vista, 1200)
      this.o.onRecorrido(this.paradas[0].id)
      return
    }
    this.o.onRecorrido(null)
    const v = this.vista(modo)
    if (instantaneo) { this.camara.position.copy(v.pos); this.controles.target.copy(v.objetivo); this.controles.update() } else this.desplazar(v, 900)
  }

  private desplazar(hasta: Vista, dur: number) {
    this.transicion = { desde: { pos: this.camara.position.clone(), objetivo: this.controles.target.clone() }, hasta, inicio: performance.now(), dur }
  }

  setIluminacion(i: Iluminacion) { this.iluminacion = i; this.aplicarLuz() }
  private aplicarLuz() {
    const noche = this.iluminacion === 'noche'
    const dom = this.domo.material as MeshBasicMaterial
    dom.map = noche ? this.cielos.noche : this.cielos.dia; dom.needsUpdate = true
    this.escena.background = new Color(noche ? '#2A2F5C' : '#E6EDF2')
    this.escena.fog = new Fog(new Color(noche ? '#2A2F5C' : '#DDE7EE'), noche ? 120 : 140, noche ? 330 : 400)
    this.hemi.intensity = noche ? 0.28 : 0.4; this.hemi.color.set(noche ? '#8CA0E0' : '#FFFFFF'); this.hemi.groundColor.set(noche ? '#10172E' : '#8A8F78')
    this.ambiente.intensity = noche ? 0.35 : 0.05; this.ambiente.color.set(noche ? '#8FA3E6' : '#FFFFFF')
    this.sol.intensity = noche ? 0.45 : 1.7; this.sol.color.set(noche ? '#8EA6F0' : '#FFF1DC')
    this.sol.position.set(noche ? -50 : 45, noche ? 90 : 80, noche ? -40 : 55)
    this.escena.environmentIntensity = noche ? 0.2 : 0.55
    this.luzNucleo.intensity = noche ? 90 : 14
    for (const e of this.X.luminosos) e.m.emissiveIntensity = noche ? e.noche : e.dia
    for (const e of this.luminososDin) e.m.emissiveIntensity = noche ? e.noche : e.dia
    for (const t of this.X.tintes) t.m.color.copy(noche ? t.noche : t.dia)
    this.vidrioFachada.emissive.set(noche ? '#FFB866' : '#000000'); this.vidrioFachada.emissiveIntensity = noche ? 0.5 : 0
    this.vidrioFachada.opacity = noche ? 0.34 : 0.26
    this.estrellas.visible = noche
    if (this.bloom) { this.bloom.strength = noche ? 0.55 : 0.16; this.bloom.threshold = noche ? 0.85 : 0.95 }
    this.renderer.toneMappingExposure = noche ? 1.1 : 1.0
  }

  // ── Entrada del usuario ───────────────────────────────────────────────────
  private alBajar = (e: PointerEvent) => { this.abajo = { x: e.clientX, y: e.clientY, t: performance.now() } }
  private alSubir = (e: PointerEvent) => {
    const a = this.abajo; this.abajo = null
    if (!a || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6 || performance.now() - a.t > 600) return
    const r = this.o.canvas.getBoundingClientRect()
    this.raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)), this.camara)
    const golpe = this.raycaster.intersectObjects([...this.pickFijo, ...this.pickDin], false)[0]
    const sel = (golpe?.object.userData.sel as Seleccion | undefined) ?? null
    this.seleccion = sel; this.reseleccionar(); this.o.onSeleccion(sel)
  }
  private alPerderContexto = (e: Event) => { e.preventDefault(); this.pausar(true); this.o.onContextoPerdido() }

  redimensionar(ancho: number, alto: number) {
    if (this.destruido || ancho < 2 || alto < 2) return
    this.ancho = ancho; this.alto = alto
    this.renderer.setSize(ancho, alto, false)
    this.composer?.setSize(ancho, alto)
    this.camara.aspect = ancho / alto
    this.domo.position.copy(this.camara.position)
    // En pantallas verticales (celular) se ensancha el campo de visión para que la oficina no quede recortada a los lados.
    this.camara.fov = this.camara.aspect < 1 ? (2 * Math.atan(Math.tan((22.5 * Math.PI) / 180) / this.camara.aspect) * 180) / Math.PI : 45
    this.camara.updateProjectionMatrix()
  }
  pausar(p: boolean) { this.pausado = p }

  // ── Bucle ─────────────────────────────────────────────────────────────────
  private cuadro = (ahora: number) => {
    if (this.destruido) return
    this.raf = requestAnimationFrame(this.cuadro)
    if (this.pausado || document.hidden) return
    if (ahora - this.ultimo < 1000 / this.o.calidad.fpsMax - 2) return
    const dt = ahora - this.ultimo
    this.ultimo = ahora
    if (dt < 250) this.ajustarResolucion(dt, ahora)   // un salto grande (pestaña dormida) no cuenta
    const t = (ahora - this.t0) / 1000
    const mov = !this.o.reducirMovimiento

    if (this.transicion) {
      const k = Math.min(1, (ahora - this.transicion.inicio) / this.transicion.dur), e = suave(k)
      this.camara.position.lerpVectors(this.transicion.desde.pos, this.transicion.hasta.pos, e)
      this.controles.target.lerpVectors(this.transicion.desde.objetivo, this.transicion.hasta.objetivo, e)
      if (k >= 1) this.transicion = null
    } else if (this.modo === 'recorrer' && this.paradas.length) {
      if (ahora - this.recorrido.inicio > 5200) {   // 1.8 s de viaje + 3.4 s de pausa
        this.recorrido = { indice: (this.recorrido.indice + 1) % this.paradas.length, inicio: ahora }
        const p = this.paradas[this.recorrido.indice]
        this.desplazar(p.vista, 1800)
        this.o.onRecorrido(p.id)
      }
    }
    if (this.o.hero) {
      // Portada: la cámara se mece sola frente a la entrada (quieta si el equipo pide menos movimiento)
      const a = Math.atan2(66, 30) + (mov ? Math.sin(t * 0.09) * 0.55 : 0)
      this.camara.position.set(Math.cos(a) * 74, 30 + (mov ? Math.sin(t * 0.13) * 3 : 0), Math.sin(a) * 74)
      this.camara.lookAt(0, 3, 6)
    } else this.controles.update()
    this.domo.position.copy(this.camara.position)
    for (const e of this.etiquetas) {
      const op = Math.max(0, Math.min(1, (this.camara.position.distanceTo(e.position) - 14) / 14))
      e.visible = op > 0.03; (e.material as SpriteMaterial).opacity = op
    }

    if (mov) {
      this.anillosNucleo.forEach((a, i) => { a.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); a.scale.setScalar(1 + Math.sin(t * 1.6 + i) * 0.015) })
      this.figuraDe.forEach(f => { f.position.y = Math.sin(t * 1.4 + f.userData.fase) * 0.025 })
    }
    // El espacio elegido pulsa suavemente
    const sel = this.seleccion
    const noche = this.iluminacion === 'noche'
    for (const [id, piso] of this.pisoDe) {
      const m = piso.material as MeshStandardMaterial
      const registro = this.luminososDin.find(x => x.m === m)
      if (!registro) continue
      const activo = sel?.tipo === 'departamento' && sel.id === id
      m.emissiveIntensity = (noche ? registro.noche : registro.dia) + (activo ? 0.4 + (mov ? Math.sin(t * 3) * 0.15 : 0) : 0)
    }
    if (this.halo.visible && mov) this.halo.scale.setScalar(1 + Math.sin(t * 4) * 0.08)
    if (this.composer) this.composer.render(); else this.renderer.render(this.escena, this.camara)
  }

  // ── Limpieza ──────────────────────────────────────────────────────────────
  /** Libera lo que es propio de este objeto; los materiales y texturas compartidos (userData.c) se liberan al destruir la escena. */
  private liberar(o: Object3D) {
    o.traverse(h => {
      const m = h as Mesh
      m.geometry?.dispose?.()
      const mat = m.material as Material | Material[] | undefined
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        if (x.userData.c) continue
        const s = x as MeshBasicMaterial
        if (s.map && !s.map.userData.c) s.map.dispose()
        if ((x as MeshStandardMaterial).emissiveMap && (x as MeshStandardMaterial).emissiveMap !== s.map) (x as MeshStandardMaterial).emissiveMap?.dispose()
        x.dispose()
      }
    })
  }

  destruir() {
    this.destruido = true
    cancelAnimationFrame(this.raf)
    const c = this.o.canvas
    c.removeEventListener('pointerdown', this.alBajar); c.removeEventListener('pointerup', this.alSubir); c.removeEventListener('webglcontextlost', this.alPerderContexto)
    window.removeEventListener('scroll', this.alScroll, { capture: true })
    this.controles.dispose()
    this.liberar(this.fijo); this.liberar(this.dinamico); this.liberar(this.halo); this.liberar(this.estrellas); this.liberar(this.domo)
    this.X.dispose()
    this.texPiso.forEach(t => t.dispose()); this.texBase.forEach(t => t.dispose())
    this.cielos.dia.dispose(); this.cielos.noche.dispose()
    this.entornoTex?.dispose()
    this.hoja.dispose()
    for (const f of Object.values(this.F)) (f as BufferGeometry).dispose()
    this.composer?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
