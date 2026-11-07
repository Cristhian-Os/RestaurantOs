/**
 * Resti 3D: el modelo real (GLB con esqueleto Mixamo) movido por el esqueleto virtual de src/components/resti/rig, en un lienzo transparente.
 * Se carga bajo demanda (React.lazy desde Resti.tsx).
 * La apariencia es siempre la misma: solo cambian la postura y el color de la luz del collar (`luz`).
 * Niveles: si el equipo no puede con el 3D (sin WebGL, sin GPU real, conexión lenta o con ahorro de datos, el modelo no carga, o va a tirones)
 * llama a `onFallo(motivo)` y Resti pasa a los sprites (capturas del mismo modelo). Nunca se muestra otro personaje.
 * No gasta nada si la pestaña está oculta; en reposo baja a ~24 cuadros por segundo.
 */
import { useEffect, useRef } from 'react'
import { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping, Color, Mesh, type Material, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { crearEscena, encuadrar } from './rig/escena.ts'
import { prepararModelo, aplicarPostura } from './rig/modelo.ts'
import { crearRig } from './rig/restiRig.ts'
import { crearAnimador, type RestiEstado3D } from './rig/restiAnim.ts'

export type { RestiEstado3D }
/** Luz del collar (lo único que cambia de color): marca = naranja de la referencia; los otros cuatro, según la lámina del personaje. */
export type RestiLuz = 'marca' | 'disponible' | 'atencion' | 'urgente' | 'procesando'
const MODELO_URL = '/assets/resti/resti.glb'
const COLOR_LUZ: Record<RestiLuz, number> = { marca: 0xff8a1a, disponible: 0x38d66b, atencion: 0xffc233, urgente: 0xff4a3d, procesando: 0x3d8bff }
/** Por qué se dejó el 3D (para observabilidad y para decidir qué mostrar). */
export type MotivoFallo = 'sin-webgl' | 'sin-gpu' | 'red-lenta' | 'modelo' | 'lento' | 'contexto-perdido'
export interface RestiMetricas { cargaMs: number; fps: number; calidad: 'alta' | 'baja' }

interface Props {
  estado: RestiEstado3D
  direccion?: number
  desplazando?: boolean
  luz?: RestiLuz
  /** Giro adicional del cuerpo (0 de frente, π de espaldas). */
  orientacion?: number
  /** Dónde está el modelo GLB (por defecto el de la app). */
  modeloUrl?: string
  /** El GLB ya en memoria (base64), en lugar de descargarlo: para páginas donde no se pueden servir archivos .glb. */
  modeloBase64?: string
  width: number
  height: number
  onFallo: (motivo: MotivoFallo) => void
  /** Ignora la detección de equipo sin GPU y el vigilante de rendimiento (pruebas y capturas con renderizado por software). */
  forzar3D?: boolean
  onListo?: (m: RestiMetricas) => void
}

/** Equipo modesto: menos píxeles y sin suavizado de bordes. */
const equipoModesto = () => {
  const n = navigator as Navigator & { deviceMemory?: number }
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 2
}

export default function RestiCharacter3D({ estado, direccion = 0, desplazando = false, luz = 'marca', orientacion = 0, modeloUrl = MODELO_URL, modeloBase64, width, height, onFallo, onListo, forzar3D = false }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const entrada = useRef({ estado, direccion, desplazando, luz, orientacion })
  entrada.current = { estado, direccion, desplazando, luz, orientacion }
  const cb = useRef({ onFallo, onListo }); cb.current = { onFallo, onListo }

  useEffect(() => {
    const canvas = lienzo.current
    if (!canvas) return
    const inicio = performance.now()
    const baja = equipoModesto()
    // Conexión lenta o ahorro de datos: ni se intenta descargar el modelo (2 MB) ni la librería 3D ya cargada se usa.
    const red = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (!forzar3D && (red?.saveData || /(^|-)2g$/.test(red?.effectiveType ?? ''))) { cb.current.onFallo('red-lenta'); return }
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !baja, powerPreference: 'low-power' })
    } catch { cb.current.onFallo('sin-webgl'); return }
    // Renderizado por software (sin GPU real): iría a ~1 cuadro por segundo; mejor los sprites.
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info')
    const nombreGpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (!forzar3D && /swiftshader|llvmpipe|software|microsoft basic render/i.test(nombreGpu)) { renderer.dispose(); cb.current.onFallo('sin-gpu'); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, baja ? 1 : 2))
    renderer.setSize(width, height, false)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const { scene, camara, dispose: liberarEscena } = crearEscena(renderer, width, height)

    // El esqueleto virtual (invisible) lo mueve el animador; el modelo real copia su pose. Si el GLB no carga se usan los sprites, nunca otro personaje.
    const rig = crearRig()
    const animador = crearAnimador(rig)
    let modelo: ReturnType<typeof prepararModelo> | null = null, vivo = true
    const cargador = new GLTFLoader()
    const archivo = modeloBase64
      ? (() => { const b = atob(modeloBase64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return cargador.parseAsync(u.buffer, '') })()
      : cargador.loadAsync(modeloUrl)
    archivo.then(gltf => {
      if (!vivo) return
      gltf.scene.traverse(o => { if ((o as Mesh).isMesh) o.frustumCulled = false })   // la malla se deforma con los huesos: su caja de reposo no sirve
      modelo = prepararModelo(gltf.scene)
      scene.add(modelo.raiz); encuadrar(camara, modelo.alturaTotal)
    }).catch(() => { if (vivo) cb.current.onFallo('modelo') })
    const limiteCarga = setTimeout(() => { if (vivo && !modelo) cb.current.onFallo('modelo') }, 20_000)   // red muy lenta o archivo colgado
    const colorActual = new Color(COLOR_LUZ.marca), colorMeta = new Color()

    let raf = 0, anterior = performance.now(), ultimoDibujo = 0, t = 0
    let cuadros = 0, desdeFps = anterior, fps = 0, avisado = false, lentos = 0
    const bucle = (ahora: number) => {
      if (!vivo) return
      raf = requestAnimationFrame(bucle)
      if (document.hidden) { anterior = ahora; return }
      const dt = (ahora - anterior) / 1000
      if (!modelo) return   // aún cargando: no se dibuja nada (nunca un aspecto distinto mientras tanto)
      if (animador.quieto() && ahora - ultimoDibujo < 41) return   // reposo: ~24 cuadros por segundo
      anterior = ahora; ultimoDibujo = ahora; t += dt
      const e = entrada.current
      colorMeta.setHex(COLOR_LUZ[e.luz]); colorActual.lerp(colorMeta, 1 - Math.exp(-6 * dt))   // transición suave de la luz del collar
      const luzMat = modelo.luzCuello
      luzMat.material.color.copy(colorActual); luzMat.material.emissive.copy(colorActual)
      luzMat.halo?.material.color.copy(colorActual)
      animador.actualizar(dt, t, e)
      aplicarPostura(modelo, rig, e.estado, dt)
      renderer.render(scene, camara)
      // Vigilante: si mientras se mueve va por debajo de ~12 cuadros por segundo de forma sostenida, se pasa a los sprites.
      if (!forzar3D && !animador.quieto()) { lentos = dt > 0.085 ? lentos + 1 : Math.max(0, lentos - 1); if (lentos > 45) { vivo = false; cb.current.onFallo('lento'); return } }
      cuadros++
      if (ahora - desdeFps >= 1000) { fps = Math.round((cuadros * 1000) / (ahora - desdeFps)); cuadros = 0; desdeFps = ahora }
      if (!avisado) { avisado = true; cb.current.onListo?.({ cargaMs: Math.round(performance.now() - inicio), fps, calidad: baja ? 'baja' : 'alta' }) }
    }
    raf = requestAnimationFrame(bucle)

    const alPerderContexto = (ev: Event) => { ev.preventDefault(); cb.current.onFallo('contexto-perdido') }
    canvas.addEventListener('webglcontextlost', alPerderContexto)

    return () => {
      vivo = false; cancelAnimationFrame(raf); clearTimeout(limiteCarga)
      canvas.removeEventListener('webglcontextlost', alPerderContexto)
      if (modelo) {
        modelo.dispose()
        modelo.raiz.traverse(o => {
          const m = o as Mesh; if (!m.isMesh) return
          m.geometry.dispose()
          for (const mat of ([] as Material[]).concat(m.material)) { for (const v of Object.values(mat)) if (v && (v as Texture).isTexture) (v as Texture).dispose(); mat.dispose() }
        })
      }
      rig.dispose(); liberarEscena(); renderer.dispose()
    }
  }, [width, height, modeloUrl, modeloBase64, forzar3D])

  return <canvas ref={lienzo} width={width} height={height} role="img" aria-label="Resti, tu chef asistente"
    style={{ display: 'block', width, height, pointerEvents: 'none' }} />
}
