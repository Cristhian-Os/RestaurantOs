/**
 * Globo3D.tsx — envoltorio de React del globo (GloboEscena). Mantiene la escena sincronizada con los marcadores, la selección y el
 * giro automático, y avisa (onFallo) para que Mundo caiga al mapa plano si el equipo no puede con WebGL.
 */
import { useEffect, useRef } from 'react'
import { decidirCalidad, prefiereMenosMovimiento, type PreferenciaCalidad } from './calidad.ts'
import { GloboEscena, type Marcador } from './GloboEscena.ts'

interface Props {
  marcadores: Marcador[]
  seleccion: string | null
  enfoque: { lat: number; lng: number; n: number } | null
  giro: boolean
  calidad: PreferenciaCalidad
  onSeleccion: (id: string | null) => void
  onFallo: (motivo: string) => void
}

export default function Globo3D(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const escena = useRef<GloboEscena | null>(null)
  const cb = useRef(p)
  cb.current = p

  useEffect(() => {
    const c = canvas.current, contenedor = caja.current
    if (!c || !contenedor) return
    let e: GloboEscena
    try {
      e = new GloboEscena({
        canvas: c, calidad: decidirCalidad(cb.current.calidad), reducirMovimiento: prefiereMenosMovimiento(),
        onSeleccion: id => cb.current.onSeleccion(id),
        onContextoPerdido: () => cb.current.onFallo('El navegador pausó el 3D para ahorrar memoria.'),
      })
    } catch {
      cb.current.onFallo('Este equipo no pudo iniciar el 3D.')
      return
    }
    escena.current = e
    e.setMarcadores(cb.current.marcadores)
    e.autoRotar(cb.current.giro)
    if (cb.current.enfoque) e.enfocar(cb.current.enfoque.lat, cb.current.enfoque.lng)
    const medir = () => e.redimensionar(contenedor.clientWidth, contenedor.clientHeight)
    medir()
    const ro = new ResizeObserver(medir); ro.observe(contenedor)
    const io = new IntersectionObserver(([x]) => e.pausar(!x.isIntersecting)); io.observe(contenedor)
    return () => { ro.disconnect(); io.disconnect(); e.destruir(); escena.current = null }
  }, [])

  useEffect(() => { escena.current?.setMarcadores(p.marcadores) }, [p.marcadores])
  useEffect(() => { escena.current?.seleccionar(p.seleccion) }, [p.seleccion])
  useEffect(() => { escena.current?.autoRotar(p.giro) }, [p.giro])
  useEffect(() => { if (p.enfoque) escena.current?.enfocar(p.enfoque.lat, p.enfoque.lng) }, [p.enfoque])

  return (
    <div ref={caja} className="relative h-full w-full">
      <canvas ref={canvas} className="block h-full w-full touch-none outline-none" role="img" aria-label="Globo terráqueo con los restaurantes ubicados. Arrastra para girar y toca un punto para ver el restaurante." />
    </div>
  )
}
