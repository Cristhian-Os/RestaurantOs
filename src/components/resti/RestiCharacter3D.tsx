/**
 * Resti 3D: renderiza el rig (src/components/resti/rig) en un lienzo transparente.
 * Se carga bajo demanda (React.lazy desde Resti.tsx). Si WebGL no está disponible llama a `onFallo` y Resti usa los sprites.
 * La apariencia es siempre la misma: solo cambian la postura y el color de la luz del collar (`luz`).
 * No gasta nada si la pestaña está oculta; en reposo baja a ~24 cuadros por segundo.
 */
import { useEffect, useRef } from 'react'
import { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping, Color } from 'three'
import { crearEscena } from './rig/escena.ts'
import { crearRig } from './rig/restiRig.ts'
import { crearAnimador, type RestiEstado3D } from './rig/restiAnim.ts'

export type { RestiEstado3D }
/** Luz del collar (lo único que cambia de color): marca = naranja de la referencia; los otros cuatro, según la lámina del personaje. */
export type RestiLuz = 'marca' | 'disponible' | 'atencion' | 'urgente' | 'procesando'
const COLOR_LUZ: Record<RestiLuz, number> = { marca: 0xff8a1a, disponible: 0x38d66b, atencion: 0xffc233, urgente: 0xff4a3d, procesando: 0x3d8bff }
export interface RestiMetricas { cargaMs: number; fps: number; calidad: 'alta' | 'baja' }

interface Props {
  estado: RestiEstado3D
  direccion?: number
  desplazando?: boolean
  luz?: RestiLuz
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

export default function RestiCharacter3D({ estado, direccion = 0, desplazando = false, luz = 'marca', width, height, onFallo, onListo }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const entrada = useRef({ estado, direccion, desplazando, luz })
  entrada.current = { estado, direccion, desplazando, luz }
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

    const { scene, camara, dispose: liberarEscena } = crearEscena(renderer, width, height)

    const rig = crearRig(); scene.add(rig.raiz)
    const animador = crearAnimador(rig)
    const colorActual = new Color(COLOR_LUZ.marca), colorMeta = new Color()

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
      colorMeta.setHex(COLOR_LUZ[e.luz]); colorActual.lerp(colorMeta, 1 - Math.exp(-6 * dt))   // transición suave de la luz del collar
      rig.luzCuello.material.color.copy(colorActual); rig.luzCuello.material.emissive.copy(colorActual)
      rig.luzCuello.halo?.material.color.copy(colorActual)
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
      rig.dispose(); liberarEscena(); renderer.dispose()
    }
  }, [width, height])

  return <canvas ref={lienzo} width={width} height={height} role="img" aria-label="Resti, tu chef asistente"
    style={{ display: 'block', width, height, pointerEvents: 'none' }} />
}
