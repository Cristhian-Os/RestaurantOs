/**
 * Resti 3D: renderiza el rig (src/components/resti/rig) en un lienzo transparente.
 * Se carga bajo demanda (React.lazy desde Resti.tsx). Si WebGL no está disponible llama a `onFallo` y Resti usa los sprites.
 * La apariencia es siempre la misma: el rig, los materiales y los colores no dependen del estado (solo cambia la postura).
 * No gasta nada si la pestaña está oculta; en reposo baja a ~24 cuadros por segundo.
 */
import { useEffect, useRef } from 'react'
import {
  WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, PMREMGenerator, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { crearRig } from './rig/restiRig'
import { crearAnimador, type RestiEstado3D } from './rig/restiAnim'

export type { RestiEstado3D }
export interface RestiMetricas { cargaMs: number; fps: number; calidad: 'alta' | 'baja' }

interface Props {
  estado: RestiEstado3D
  direccion?: number
  desplazando?: boolean
  width: number
  height: number
  onFallo: () => void
  onListo?: (m: RestiMetricas) => void
}

/** Equipo modesto: menos píxeles y sin suavizado de bordes. */
const equipoModesto = () => {
  const n = navigator as Navigator & { deviceMemory?: number }
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 2
}

export default function RestiCharacter3D({ estado, direccion = 0, desplazando = false, width, height, onFallo, onListo }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const entrada = useRef({ estado, direccion, desplazando })
  entrada.current = { estado, direccion, desplazando }
  const cb = useRef({ onFallo, onListo }); cb.current = { onFallo, onListo }

  useEffect(() => {
    const canvas = lienzo.current
    if (!canvas) return
    const inicio = performance.now()
    const baja = equipoModesto()
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !baja, powerPreference: 'low-power' })
    } catch { cb.current.onFallo(); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, baja ? 1 : 2))
    renderer.setSize(width, height, false)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new Scene()
    const pmrem = new PMREMGenerator(renderer)
    const sala = new RoomEnvironment()
    scene.environment = pmrem.fromScene(sala, 0.04).texture
    scene.add(new HemisphereLight(0xffffff, 0x9a948c, 0.55))
    const sol = new DirectionalLight(0xfff4e6, 1.5); sol.position.set(1.4, 2.6, 2.4); scene.add(sol)
    const contra = new DirectionalLight(0xffb066, 0.9); contra.position.set(-2, 1.5, -2); scene.add(contra)   // luz cálida de contorno

    const camara = new PerspectiveCamera(24, width / height, 0.1, 30)
    camara.position.set(0, 1.6, 7.4); camara.lookAt(0, 1.25, 0)

    const rig = crearRig(); scene.add(rig.raiz)
    const animador = crearAnimador(rig)

    let raf = 0, anterior = performance.now(), ultimoDibujo = 0, t = 0, vivo = true
    let cuadros = 0, desdeFps = anterior, fps = 0, avisado = false
    const bucle = (ahora: number) => {
      if (!vivo) return
      raf = requestAnimationFrame(bucle)
      if (document.hidden) { anterior = ahora; return }
      const dt = (ahora - anterior) / 1000
      if (animador.quieto() && ahora - ultimoDibujo < 41) return   // reposo: ~24 cuadros por segundo
      anterior = ahora; ultimoDibujo = ahora; t += dt
      const e = entrada.current
      animador.actualizar(dt, t, e)
      renderer.render(scene, camara)
      cuadros++
      if (ahora - desdeFps >= 1000) { fps = Math.round((cuadros * 1000) / (ahora - desdeFps)); cuadros = 0; desdeFps = ahora }
      if (!avisado) { avisado = true; cb.current.onListo?.({ cargaMs: Math.round(performance.now() - inicio), fps, calidad: baja ? 'baja' : 'alta' }) }
    }
    raf = requestAnimationFrame(bucle)

    const alPerderContexto = (ev: Event) => { ev.preventDefault(); cb.current.onFallo() }
    canvas.addEventListener('webglcontextlost', alPerderContexto)

    return () => {
      vivo = false; cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', alPerderContexto)
      rig.dispose(); sala.dispose(); pmrem.dispose(); renderer.dispose()
    }
  }, [width, height])

  return <canvas ref={lienzo} width={width} height={height} role="img" aria-label="Resti, tu chef asistente"
    style={{ display: 'block', width, height, pointerEvents: 'none' }} />
}
