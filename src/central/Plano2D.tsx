/**
 * Plano2D.tsx — la misma oficina en plano 2D (SVG). Es el modo "2D" que eliges, y también lo que se ve cuando el equipo no puede
 * mostrar 3D o el navegador pierde el contexto WebGL. Comparte la planta (geometria.ts) con la escena 3D, así que ambas coinciden.
 * Accesible: cada espacio y cada agente se puede tocar o activar con teclado.
 */
import { useMemo } from 'react'
import { ANILLOS, RADIO_NUCLEO, RADIO_TOTAL, aPunto, calcularSectores, puestosDeAgentes, trazadoSector } from './3d/geometria.ts'
import type { DatosOficina, Seleccion } from './3d/OficinaEscena.ts'

const ESC = 10   // píxeles por unidad del plano (el SVG se ajusta solo al tamaño disponible)

export function Plano2D({ datos, seleccion, onSeleccion, claro }: { datos: DatosOficina; seleccion: Seleccion | null; onSeleccion: (s: Seleccion | null) => void; claro?: boolean }) {
  const sectores = useMemo(() => calcularSectores(datos.departamentos.map(d => ({ id: d.id, anillo: d.anillo, orden: d.orden, color: d.color }))), [datos.departamentos])
  const activar = (s: Seleccion) => (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccion(s) } }
  const R = (RADIO_TOTAL + 2) * ESC
  const texto = claro ? '#10182B' : '#F5F7FB'
  return (
    <svg viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="mx-auto block h-full max-h-full w-full max-w-full" role="group" aria-label="Plano de la oficina: núcleo y tres anillos de espacios">
      <circle r={R} fill={claro ? '#E7EEF8' : '#0A1020'} />
      {([2, 3, 4] as const).map(a => <circle key={a} r={((ANILLOS[a].r0 + ANILLOS[a].r1) / 2) * ESC} fill="none" stroke={claro ? '#B9C6DA' : '#1B2742'} strokeWidth={(ANILLOS[a].r1 - ANILLOS[a].r0) * ESC} />)}
      {sectores.map(s => {
        const d = datos.departamentos.find(x => x.id === s.id)
        if (!d) return null
        const activo = seleccion?.tipo === 'departamento' && seleccion.id === s.id
        const c = aPunto((s.r0 + s.r1) / 2, s.centro)
        const nombre = d.nombre.length > 14 ? d.nombre.slice(0, 13) + '…' : d.nombre
        const agentes = datos.agentes.filter(a => a.departamento_id === s.id)
        return (
          <g key={s.id}>
            <path d={trazadoSector(s, s.r0, s.r1, ESC)} fill={d.color} fillOpacity={activo ? 0.55 : d.estado === 'en_construccion' ? 0.1 : 0.26} stroke={d.color} strokeWidth={activo ? 3 : 1.4}
              strokeDasharray={d.estado === 'en_construccion' ? '6 5' : undefined} tabIndex={0} role="button" aria-label={`${d.nombre}${d.estado === 'en_construccion' ? ' (en construcción)' : ''}`} aria-pressed={activo}
              style={{ cursor: 'pointer', outlineOffset: 2 }} onClick={() => onSeleccion({ tipo: 'departamento', id: s.id })} onKeyDown={activar({ tipo: 'departamento', id: s.id })} />
            <text x={c.x * ESC} y={(c.z * ESC) - (agentes.length ? 14 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={s.anillo === 3 ? 11 : 12.5} fontWeight={600} fill={texto} pointerEvents="none">{nombre}</text>
            {puestosDeAgentes(s, agentes.length).map((p, i) => {
              const a = agentes[i]
              const sel = seleccion?.tipo === 'agente' && seleccion.id === a.id
              return (
                <g key={a.id} transform={`translate(${p.x * ESC} ${p.z * ESC + (s.anillo === 3 ? 12 : 10)})`} tabIndex={0} role="button" aria-label={`Agente ${a.nombre}`} aria-pressed={sel} style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSeleccion({ tipo: 'agente', id: a.id }) }} onKeyDown={activar({ tipo: 'agente', id: a.id })}>
                  <circle r={sel ? 11 : 8.5} fill={d.color} stroke={a.estadoColor} strokeWidth={3} />
                  <circle r={3.2} cy={-1} fill="#fff" />
                </g>
              )
            })}
          </g>
        )
      })}
      <g tabIndex={0} role="button" aria-label="Núcleo: RestaurantOS" aria-pressed={seleccion?.tipo === 'nucleo'} style={{ cursor: 'pointer' }} onClick={() => onSeleccion({ tipo: 'nucleo', id: 'nucleo' })} onKeyDown={activar({ tipo: 'nucleo', id: 'nucleo' })}>
        <circle r={RADIO_NUCLEO * ESC} fill="#FF7A1A" fillOpacity={0.22} stroke="#FF7A1A" strokeWidth={seleccion?.tipo === 'nucleo' ? 4 : 2} />
        <circle r={RADIO_NUCLEO * ESC * 0.62} fill="#FF7A1A" fillOpacity={0.4} />
        <text textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill={texto} pointerEvents="none">RestaurantOS</text>
      </g>
    </svg>
  )
}
