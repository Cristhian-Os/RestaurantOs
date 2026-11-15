/**
 * Departamentos.tsx — los 19 espacios de la oficina (anillos 2, 3 y 4) y el detalle de cada uno.
 */
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { StatePanel } from '../../components/ui/StatePanel'
import { ETIQUETA_ANILLO, ETIQUETA_ESTADO_TAREA, ETIQUETA_PRIORIDAD, estadoVisual, hace, type Departamento } from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { Enlace } from '../navegacion.tsx'
import { useRuta } from '../navegacion.tsx'
import { AgenteAvatar, Estado, Pagina, Punto, TituloBloque } from '../ui.tsx'

const PRIVACIDAD = { abierto: 'Abierto', semiprivado: 'Semiprivado', privado: 'Privado' } as const

function TarjetaDepto({ d }: { d: Departamento }) {
  const { datos } = useCentral()
  const { agentesDe } = useIndices()
  const agentes = agentesDe(d.id)
  const abiertas = datos.tareas.filter(t => t.departamento_id === d.id && ABIERTA(t.estado)).length
  return (
    <Enlace a="departamentos" id={d.id} className="c-agente flex min-h-[44px] flex-col gap-2 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4 transition-colors"
      style={{ ['--c' as string]: d.color, borderTop: `3px solid ${d.color}` }}>
      <span className="flex items-center gap-2">
        <Punto color={d.color} size={10} />
        <span className="min-w-0 flex-1 truncate font-bold text-[color:var(--w-text)]">{d.nombre}</span>
        {d.estado === 'en_construccion' && <Badge tone="warning">En construcción</Badge>}
      </span>
      <span className="line-clamp-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{d.descripcion}</span>
      <span className="mt-auto flex items-center gap-2 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
        <span className="flex -space-x-2">{agentes.slice(0, 3).map(a => <AgenteAvatar key={a.id} color={d.color} size={26} />)}</span>
        {agentes.length ? `${agentes.length} agente${agentes.length > 1 ? 's' : ''}` : 'Sin agentes'} · {abiertas} tarea{abiertas === 1 ? '' : 's'}
      </span>
    </Enlace>
  )
}

function Detalle({ id }: { id: string }) {
  const { datos } = useCentral()
  const { depto, agentesDe, agente } = useIndices()
  const d = depto(id)
  if (!d) return <Pagina titulo="Departamento"><StatePanel kind="empty" title="No existe ese departamento" action={<Enlace a="departamentos" className="font-semibold text-[color:var(--w-accent-text)] underline">Ver todos</Enlace>} /></Pagina>
  const agentes = agentesDe(d.id)
  const tareas = datos.tareas.filter(t => t.departamento_id === d.id && ABIERTA(t.estado))
  const canal = datos.conversaciones.find(c => c.tipo === 'canal_departamento' && c.departamento_id === d.id)
  const docs = datos.documentos.filter(x => x.departamento_id === d.id)
  return (
    <Pagina titulo={d.nombre} subtitulo={`${ETIQUETA_ANILLO[d.anillo]} · ${PRIVACIDAD[d.privacidad]}`}
      acciones={<Enlace a="departamentos" className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Todos los departamentos</Enlace>}>
      <Card className="flex flex-col gap-2" style={{ borderTop: `3px solid ${d.color}` }}>
        <p className="m-0 text-[color:var(--w-text-2)]">{d.descripcion}</p>
        {d.estado === 'en_construccion' && <Badge tone="warning">En construcción: todavía no tiene jefe ni agentes</Badge>}
      </Card>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <TituloBloque>Agentes</TituloBloque>
          {agentes.length === 0 ? <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Este espacio no tiene agentes asignados.</p> : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {agentes.map(a => (
                <li key={a.id}>
                  <Enlace a="agentes" id={a.id} className="flex min-h-[56px] items-center gap-3 rounded-[var(--w-r-md)] px-2 hover:bg-[var(--w-surface-sunken)]">
                    <AgenteAvatar color={d.color} estadoColor={estadoVisual(a).color} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-[color:var(--w-text)]">{a.nombre}</span><span className="block truncate text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{a.especialidad}</span></span>
                    <Estado color={estadoVisual(a).color}>{estadoVisual(a).etiqueta}</Estado>
                  </Enlace>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <TituloBloque>Tareas abiertas</TituloBloque>
          {tareas.length === 0 ? <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay tareas abiertas en esta área.</p> : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {tareas.slice(0, 8).map(t => (
                <li key={t.id} className="flex min-h-[44px] items-center gap-2">
                  <Badge tone={t.prioridad === 'P0' ? 'danger' : t.prioridad === 'P1' ? 'warning' : 'neutral'}>{ETIQUETA_PRIORIDAD[t.prioridad].split(' ')[0]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--w-text)]">{t.titulo}</span>
                  <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETIQUETA_ESTADO_TAREA[t.estado]} · {agente(t.responsable_agente_id)?.nombre ?? 'Sin responsable'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <TituloBloque>Comunicación y biblioteca</TituloBloque>
          {canal ? <Enlace a="conversaciones" id={canal.id} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Abrir el canal de {d.nombre}</Enlace> : <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Este espacio no tiene canal propio.</p>}
          <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{docs.length} documento{docs.length === 1 ? '' : 's'} en la biblioteca{docs[0] ? ` · último cambio ${hace(docs[0].updated_at)}` : ''}.</p>
        </Card>
      </div>
    </Pagina>
  )
}

export function Departamentos() {
  const { ruta } = useRuta()
  const { datos } = useCentral()
  if (ruta.id) return <Detalle id={ruta.id} />
  return (
    <Pagina titulo="Departamentos" subtitulo="La oficina tiene un núcleo (RestaurantOS) y tres anillos de espacios">
      {[2, 3, 4].map(anillo => (
        <div key={anillo} className="flex flex-col gap-3">
          <TituloBloque>{ETIQUETA_ANILLO[anillo]}</TituloBloque>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datos.departamentos.filter(d => d.anillo === anillo).map(d => <TarjetaDepto key={d.id} d={d} />)}
          </div>
        </div>
      ))}
    </Pagina>
  )
}
