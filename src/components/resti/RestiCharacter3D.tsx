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
  width: number
  height: number
  onFallo: (motivo: MotivoFallo) => void
  onListo?: (m: RestiMetricas) => void
}

/** Equipo modesto: menos píxeles y sin suavizado de bordes. */
const equipoModesto = () => {
  const n = navigator as Navigator & { deviceMemory?: number }
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 2
}

export default function RestiCharacter3D({ estado, direccion = 0, desplazando = false, luz = 'marca', width, height, onFallo, onListo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const entrada = useRef({ estado, direccion, desplazando, luz })
  entrada.current = { estado, direccion, desplazando, luz }
  const cb = useRef({ onFallo, onListo }); cb.current = { onFallo, onListo }

  useEffect(() => {
    const host = contenedor.current
    if (!host) return
    // Un lienzo nuevo por intento: tras forceContextLoss() el contexto de un lienzo ya no sirve para volver a crear WebGL.
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height; canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = `display:block;width:${width}px;height:${height}px;pointer-events:none`
    host.appendChild(canvas)
    const inicio = performance.now()
    const baja = equipoModesto()
    // Conexión lenta o ahorro de datos: ni se intenta descargar el modelo (2 MB) ni la librería 3D ya cargada se usa.
    const red = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if ((red?.saveData || /(^|-)2g$/.test(red?.effectiveType ?? ''))) { cb.current.onFallo('red-lenta'); return }
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !baja, powerPreference: 'low-power' })
    } catch { cb.current.onFallo('sin-webgl'); return }
    // Renderizado por software (sin GPU real): iría a ~1 cuadro por segundo; mejor los sprites.
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info')
    const nombreGpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/swiftshader|llvmpipe|software|microsoft basic render/i.test(nombreGpu)) { renderer.forceContextLoss(); renderer.dispose(); cb.current.onFallo('sin-gpu'); return }
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
    cargador.loadAsync(MODELO_URL).then(gltf => {
      if (!vivo) return
      gltf.scene.traverse(o => { if ((o as Mesh).isMesh) o.frustumCulled = false })   // la malla se deforma con los huesos: su caja de reposo no sirve
      modelo = prepararModelo(gltf.scene)
      scene.add(modelo.raiz); encuadrar(camara, modelo.alturaTotal)
    }).catch(() => { if (vivo) cb.current.onFallo('modelo') })
    const limiteCarga = setTimeout(() => { if (vivo && !modelo) cb.current.onFallo('modelo') }, 20_000)   // red muy lenta o archivo colgado
    const colorActual = new Color(COLOR_LUZ.marca), colorMeta = new Color()

    let perdido = false, raf = 0, anterior = performance.now(), ultimoDibujo = 0, t = 0
    let cuadros = 0, desdeFps = anterior, fps = 0, avisado = false, lentos = 0
    const bucle = (ahora: number) => {
      if (!vivo) return
      raf = requestAnimationFrame(bucle)
      if (document.hidden || perdido) { anterior = ahora; return }   // pestaña oculta o contexto WebGL perdido: no se dibuja
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
      if (!animador.quieto()) { lentos = dt > 0.085 ? lentos + 1 : Math.max(0, lentos - 1); if (lentos > 45) { vivo = false; cb.current.onFallo('lento'); return } }
      cuadros++
      if (ahora - desdeFps >= 1000) { fps = Math.round((cuadros * 1000) / (ahora - desdeFps)); cuadros = 0; desdeFps = ahora }
      if (!avisado) { avisado = true; cb.current.onListo?.({ cargaMs: Math.round(performance.now() - inicio), fps, calidad: baja ? 'baja' : 'alta' }) }
    }
    raf = requestAnimationFrame(bucle)

    // El navegador puede quitar el contexto WebGL (poca memoria, cambio de GPU). Si lo devuelve pronto (three.js se restablece solo), se sigue en 3D;
    // si no, se usan los sprites un rato y Resti vuelve a intentar el 3D más tarde (no se queda en sprites para siempre).
    let esperaRestaurar: ReturnType<typeof setTimeout> | undefined
    const alPerderContexto = (ev: Event) => {
      ev.preventDefault(); perdido = true
      clearTimeout(esperaRestaurar)
      esperaRestaurar = setTimeout(() => { if (vivo && perdido) cb.current.onFallo('contexto-perdido') }, 3000)
    }
    const alRestaurarContexto = () => { perdido = false; clearTimeout(esperaRestaurar); anterior = performance.now() }
    canvas.addEventListener('webglcontextlost', alPerderContexto)
    canvas.addEventListener('webglcontextrestored', alRestaurarContexto)

    return () => {
      vivo = false; cancelAnimationFrame(raf); clearTimeout(limiteCarga)
      clearTimeout(esperaRestaurar)
      canvas.removeEventListener('webglcontextlost', alPerderContexto)
      canvas.removeEventListener('webglcontextrestored', alRestaurarContexto)
      if (modelo) {
        modelo.dispose()
        modelo.raiz.traverse(o => {
          const m = o as Mesh; if (!m.isMesh) return
          m.geometry.dispose()
          for (const mat of ([] as Material[]).concat(m.material)) { for (const v of Object.values(mat)) if (v && (v as Texture).isTexture) (v as Texture).dispose(); mat.dispose() }
        })
      }
      rig.dispose(); liberarEscena()
      renderer.forceContextLoss()   // suelta ya el contexto WebGL: los navegadores admiten pocos a la vez y dispose() solo no lo libera
      renderer.dispose()
      canvas.remove()
    }
  }, [width, height])

  return <div ref={contenedor} role="img" aria-label="Resti, tu chef asistente" style={{ width, height, pointerEvents: 'none' }} />
}
