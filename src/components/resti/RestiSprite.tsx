/**
 * Resti sin 3D: capturas del MISMO modelo (public/assets/resti/sprites, ver spritesRuta.ts), nunca un dibujo distinto ni la imagen espejada
 * (un espejo cambiaría de lado el emblema): hay una captura para cada dirección. Sirve cuando el equipo no puede mostrar el 3D
 * y en pantallas sin personaje animado (guía del asistente de configuración).
 * Si una imagen no carga, no se muestra nada: es preferible a mostrar un personaje con otro aspecto.
 */
import { useEffect, useRef, useState } from 'react'
import { rutaSprite, type LuzSprite } from './spritesRuta.ts'
import type { RestiEstado3D } from './rig/restiAnim.ts'

/** Nombres antiguos de las cuatro poses (los usan pantallas que no son del panel). */
export type RestiPose = 'wave' | 'walk' | 'click' | 'think'
const DE_POSE: Record<RestiPose, RestiEstado3D> = { wave: 'saludo', walk: 'caminar', click: 'senalar', think: 'pensar' }

interface Props {
  estado?: RestiEstado3D
  pose?: RestiPose
  /** -1 izquierda, 1 derecha (solo cambia la imagen al caminar y señalar). */
  direccion?: number
  desplazando?: boolean
  luz?: LuzSprite
  width?: number
}

const CSS = '@keyframes resti-aparece{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion: reduce){.resti-fundido{animation:none!important}}'

export function RestiSprite({ estado, pose = 'wave', direccion = 1, desplazando = false, luz = 'disponible', width = 84 }: Props) {
  const e = estado ?? DE_POSE[pose]
  const [cuadro, setCuadro] = useState(0)
  const caminando = e === 'caminar' || desplazando
  useEffect(() => {
    if (!caminando || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setCuadro(c => c + 1), 230)   // alterna los dos cuadros de la zancada
    return () => clearInterval(id)
  }, [caminando])

  const src = rutaSprite(e, direccion, luz, cuadro)
  // Fundido corto al cambiar de estado (no al alternar los cuadros de la caminata): la imagen anterior queda debajo hasta que entra la nueva.
  const previo = useRef({ src, estado: e }), [debajo, setDebajo] = useState<string | null>(null)
  useEffect(() => {
    if (previo.current.src === src) return
    if (previo.current.estado !== e) { setDebajo(previo.current.src); const t = setTimeout(() => setDebajo(null), 200); previo.current = { src, estado: e }; return () => clearTimeout(t) }
    previo.current = { src, estado: e }
  }, [src, e])

  const alto = Math.round(width * 328 / 208)
  const img = (s: string, extra?: object) => <img src={s} alt="" width={width} height={alto} draggable={false} style={{ display: 'block', position: 'absolute', left: 0, top: 0, ...extra }} />
  return (
    <div role="img" aria-label="Resti, tu chef asistente" style={{ position: 'relative', width, height: alto }}>
      <style>{CSS}</style>
      {debajo && img(debajo)}
      <img key={src} className={debajo ? 'resti-fundido' : undefined} src={src} alt="" width={width} height={alto} draggable={false}
        style={{ display: 'block', position: 'absolute', left: 0, top: 0, animation: debajo ? 'resti-aparece 180ms ease-out both' : undefined }} />
    </div>
  )
}

/** Solo el gorro: así vive Resti cuando está guardado (el botón). */
const HAT = '/assets/resti/resti-hat.webp'
export function RestiHat({ size = 58 }: { size?: number }) {
  const [roto, setRoto] = useState(false)
  if (roto) return null
  return <img src={HAT} alt="" aria-hidden="true" width={size * 0.8} draggable={false} onError={() => setRoto(true)} style={{ display: 'block', height: 'auto' }} />
}
