/**
 * Oficina3D.tsx — envoltorio de React de la escena 3D (OficinaEscena). Crea la escena una vez, la mantiene sincronizada con los
 * datos y la cámara, se pausa cuando no se ve y avisa (onFallo) si el equipo no puede mostrar 3D o pierde el contexto WebGL,
 * para que la pantalla caiga al plano 2D en vez de quedarse en blanco.
 */
import { useEffect, useRef } from 'react'
import type { PreferenciaCalidad } from './calidad.ts'
import { decidirCalidad, prefiereMenosMovimiento } from './calidad.ts'
import { OficinaEscena, type DatosOficina, type Iluminacion, type ModoCamara, type Seleccion } from './OficinaEscena.ts'

interface Props {
  datos: DatosOficina
  camara: ModoCamara
  iluminacion: Iluminacion
  techo?: boolean
  calidad: PreferenciaCalidad
  seleccion?: Seleccion | null
  onSeleccion?: (s: Seleccion | null) => void
  onFallo: (motivo: string) => void
  onRecorrido?: (departamentoId: string | null) => void
  onCamaraLibre?: () => void
  /** Portada: cámara que se mece sola, sin gestos y con resolución y fotogramas moderados (para la pantalla de Inicio). */
  hero?: boolean
}

export default function Oficina3D(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const escena = useRef<OficinaEscena | null>(null)
  const cb = useRef(p)
  cb.current = p

  useEffect(() => {
    const c = canvas.current, contenedor = caja.current
    if (!c || !contenedor) return
    let e: OficinaEscena
    try {
      const base = decidirCalidad(cb.current.calidad)
      const hero = !!cb.current.hero
      e = new OficinaEscena({
        canvas: c, hero, iluminacion: cb.current.iluminacion, reducirMovimiento: prefiereMenosMovimiento(),
        calidad: hero ? { ...base, nivel: base.nivel === 'alta' ? 'media' : base.nivel, ratioPixel: Math.min(base.ratioPixel, 1.25), fpsMax: 30 } : base,
        onSeleccion: s => cb.current.onSeleccion?.(s),
        onContextoPerdido: () => cb.current.onFallo('El navegador pausó el 3D para ahorrar memoria.'),
        onCamaraLibre: () => cb.current.onCamaraLibre?.(),
        onRecorrido: id => cb.current.onRecorrido?.(id),
      })
    } catch {
      cb.current.onFallo('Este equipo no pudo iniciar el 3D.')
      return
    }
    escena.current = e
    e.setDatos(cb.current.datos)
    e.setTecho(!!cb.current.techo)
    e.setCamara(cb.current.camara)
    e.seleccionar(cb.current.seleccion ?? null)
    const medir = () => e.redimensionar(contenedor.clientWidth, contenedor.clientHeight)
    medir()
    const ro = new ResizeObserver(medir); ro.observe(contenedor)
    const io = new IntersectionObserver(([x]) => e.pausar(!x.isIntersecting)); io.observe(contenedor)
    return () => { ro.disconnect(); io.disconnect(); e.destruir(); escena.current = null }
  }, [])

  useEffect(() => { escena.current?.setDatos(p.datos) }, [p.datos])
  useEffect(() => { escena.current?.setCamara(p.camara) }, [p.camara])
  useEffect(() => { escena.current?.setTecho(!!p.techo) }, [p.techo])
  useEffect(() => { escena.current?.setIluminacion(p.iluminacion) }, [p.iluminacion])
  useEffect(() => { escena.current?.seleccionar(p.seleccion ?? null) }, [p.seleccion])

  return (
    <div ref={caja} className="relative h-full w-full">
      <canvas ref={canvas} className={p.hero ? 'block h-full w-full outline-none' : 'block h-full w-full touch-none outline-none'} role="img"
        aria-label={p.hero ? 'Vista de la oficina de Central en 3D.' : 'Oficina de Central en 3D. Toca un espacio o un agente para ver su ficha.'} />
    </div>
  )
}
