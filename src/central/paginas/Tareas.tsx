/**
 * Tareas.tsx — tareas, aprobaciones y proyectos. Las reglas (N2/N3 exigen tu aprobación, no se completa sin resultado,
 * no se empieza con tareas previas sin terminar) las hace cumplir la base; aquí solo se ofrecen los botones que tienen sentido.
 */
import { useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { StatePanel } from '../../components/ui/StatePanel'
import { Tabs } from '../../components/ui/Tabs'
import { cambiarEstadoTarea, crearProyecto, crearTarea, decidirAprobacion, pedirAprobacion } from '../acciones.ts'
import {
  ETIQUETA_ESTADO_TAREA, ETIQUETA_PRIORIDAD, NIVELES_INFO, fechaCorta, fechaHora, hace,
  type Aprobacion, type EstadoTarea, type Nivel, type Prioridad, type Tarea,
} from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { exigeAprobacion, puedeSerResponsable } from '../permisos.ts'
import { AvisoHonesto, ErrorAccion, Pagina, TituloBloque, useAccion } from '../ui.tsx'

const SIGUIENTES: Record<EstadoTarea, EstadoTarea[]> = {
  propuesta: ['en_ejecucion', 'cancelada'], pendiente_aprobacion: ['cancelada'], aprobada: ['en_ejecucion', 'cancelada'],
  en_ejecucion: ['completada', 'bloqueada', 'cancelada'], bloqueada: ['en_ejecucion', 'cancelada'], completada: [], rechazada: [], cancelada: [],
}
const TONO_ESTADO: Record<EstadoTarea, Tone> = {
  propuesta: 'neutral', pendiente_aprobacion: 'warning', aprobada: 'info', en_ejecucion: 'accent', bloqueada: 'danger', completada: 'success', rechazada: 'danger', cancelada: 'neutral',
}
const tonoPrioridad = (p: Prioridad): Tone => (p === 'P0' ? 'danger' : p === 'P1' ? 'warning' : 'neutral')
const BOTON_ESTADO: Partial<Record<EstadoTarea, string>> = { en_ejecucion: 'Empezar', completada: 'Completar', bloqueada: 'Marcar bloqueada', cancelada: 'Cancelar tarea' }

function NuevaTarea({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const vacio = { titulo: '', descripcion: '', prioridad: 'P3' as Prioridad, nivel: 'N0' as Nivel, agente: '', depto: '', proyecto: '', fecha: '', previa: '' }
  const [f, setF] = useState(vacio)
  const set = <K extends keyof typeof vacio>(k: K, v: (typeof vacio)[K]) => setF(x => ({ ...x, [k]: v }))
  const candidatos = datos.agentes.filter(a => puedeSerResponsable(a.nivel, f.nivel) && f.nivel !== 'N3')
  return (
    <Modal open={abierto} onClose={() => { limpiar(); onCerrar() }} title="Nueva tarea"
      footer={<Button disabled={f.titulo.trim().length < 3} loading={ocupado} onClick={async () => {
        if (await ejecutar(() => crearTarea({ titulo: f.titulo, descripcion: f.descripcion, prioridad: f.prioridad, nivel_requerido: f.nivel, responsable_agente_id: f.agente || null, departamento_id: f.depto || null, proyecto_id: f.proyecto || null, fecha_limite: f.fecha || null, depende_de: f.previa ? [f.previa] : [] }))) { setF(vacio); onCerrar() }
      }}>Crear tarea</Button>}>
      <div className="flex flex-col gap-3">
        <Input label="Título" value={f.titulo} onChange={e => set('titulo', e.target.value)} required maxLength={160} />
        <Textarea label="Descripción" value={f.descripcion} onChange={e => set('descripcion', e.target.value)} rows={3} maxLength={4000} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Prioridad" value={f.prioridad} onChange={e => set('prioridad', e.target.value as Prioridad)}>{(Object.keys(ETIQUETA_PRIORIDAD) as Prioridad[]).map(p => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}</Select>
          <Select label="Nivel de autorización" value={f.nivel} onChange={e => { set('nivel', e.target.value as Nivel); set('agente', '') }} hint={NIVELES_INFO[f.nivel].resumen}>{(['N0', 'N1', 'N2', 'N3'] as Nivel[]).map(n => <option key={n} value={n}>{NIVELES_INFO[n].titulo}</option>)}</Select>
          <Select label="Responsable" value={f.agente} onChange={e => set('agente', e.target.value)} hint={f.nivel === 'N3' ? 'Las tareas N3 solo las hace una persona.' : 'Solo aparecen los agentes cuyo nivel alcanza.'}>
            <option value="">Cristhian (persona)</option>{candidatos.map(a => <option key={a.id} value={a.id}>{a.nombre} ({a.nivel})</option>)}
          </Select>
          <Select label="Departamento" value={f.depto} onChange={e => set('depto', e.target.value)}><option value="">Sin área</option>{datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select>
          <Select label="Proyecto" value={f.proyecto} onChange={e => set('proyecto', e.target.value)}><option value="">Sin proyecto</option>{datos.proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>
          <Input label="Fecha límite" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} />
        </div>
        <Select label="Depende de" value={f.previa} onChange={e => set('previa', e.target.value)} hint="No podrá empezar hasta que esa tarea esté completada.">
          <option value="">Ninguna</option>{datos.tareas.filter(t => ABIERTA(t.estado)).map(t => <option key={t.id} value={t.id}>#{t.codigo} · {t.titulo}</option>)}
        </Select>
        {exigeAprobacion(f.nivel) && <AvisoHonesto>Esta tarea no podrá ejecutarse sin tu aprobación registrada.</AvisoHonesto>}
        <ErrorAccion texto={error} />
      </div>
    </Modal>
  )
}

function DetalleTarea({ t, onCerrar }: { t: Tarea | null; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { agente, depto } = useIndices()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [resultado, setResultado] = useState('')
  const [impacto, setImpacto] = useState('')
  if (!t) return null
  const previas = t.depende_de.map(id => datos.tareas.find(x => x.id === id)).filter((x): x is Tarea => !!x)
  const aprobs = datos.aprobaciones.filter(a => a.tarea_id === t.id)
  const necesita = exigeAprobacion(t.nivel_requerido) && t.estado === 'propuesta'
  const pasos = SIGUIENTES[t.estado].filter(s => !(necesita && s === 'en_ejecucion'))
  const cerrar = () => { limpiar(); setResultado(''); setImpacto(''); onCerrar() }
  return (
    <Modal open onClose={cerrar} title={`#${t.codigo} · ${t.titulo}`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2"><Badge tone={TONO_ESTADO[t.estado]}>{ETIQUETA_ESTADO_TAREA[t.estado]}</Badge><Badge tone={tonoPrioridad(t.prioridad)}>{ETIQUETA_PRIORIDAD[t.prioridad]}</Badge><Badge tone="info">{NIVELES_INFO[t.nivel_requerido].titulo}</Badge></div>
        {t.descripcion && <p className="m-0 whitespace-pre-wrap text-[color:var(--w-text-2)]">{t.descripcion}</p>}
        <dl className="m-0 grid gap-2 text-[length:var(--w-fs-label)] sm:grid-cols-2">
          <div><dt className="text-[color:var(--w-text-3)]">Responsable</dt><dd className="m-0 text-[color:var(--w-text)]">{agente(t.responsable_agente_id)?.nombre ?? 'Cristhian'}</dd></div>
          <div><dt className="text-[color:var(--w-text-3)]">Área</dt><dd className="m-0 text-[color:var(--w-text)]">{depto(t.departamento_id)?.nombre ?? 'Sin área'}</dd></div>
          <div><dt className="text-[color:var(--w-text-3)]">Creada</dt><dd className="m-0 text-[color:var(--w-text)]">{fechaHora(t.created_at)}</dd></div>
          <div><dt className="text-[color:var(--w-text-3)]">Fecha límite</dt><dd className="m-0 text-[color:var(--w-text)]">{t.fecha_limite ? fechaCorta(t.fecha_limite) : 'Sin fecha'}</dd></div>
        </dl>
        {previas.length > 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Depende de: {previas.map(p => `#${p.codigo} (${ETIQUETA_ESTADO_TAREA[p.estado]})`).join(', ')}</p>}
        {t.resultado && <p className="m-0 rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3 text-[color:var(--w-text)]"><b>Resultado:</b> {t.resultado}</p>}
        {aprobs.map(a => <p key={a.id} className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Aprobación {a.estado}{a.decidido_en ? ` · ${fechaHora(a.decidido_en)}` : ''}{a.nota_decision ? ` · “${a.nota_decision}”` : ''}</p>)}
        {necesita && (
          <div className="flex flex-col gap-2 rounded-[var(--w-r-md)] border border-[var(--w-warning)] p-3">
            <p className="m-0 font-semibold text-[color:var(--w-text)]">Esta tarea necesita tu aprobación antes de ejecutarse.</p>
            <Textarea label="Impacto (qué cambiaría si la apruebas)" value={impacto} onChange={e => setImpacto(e.target.value)} rows={2} maxLength={2000} />
            <div><Button loading={ocupado} onClick={async () => { if (await ejecutar(() => pedirAprobacion(t, impacto))) cerrar() }}>Pedir aprobación</Button></div>
          </div>
        )}
        {t.estado === 'en_ejecucion' && <Textarea label="Resultado (obligatorio para completar)" value={resultado} onChange={e => setResultado(e.target.value)} rows={2} maxLength={4000} />}
        <ErrorAccion texto={error} />
        {pasos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pasos.map(s => (
              <Button key={s} variant={s === 'cancelada' ? 'secondary' : 'primary'} loading={ocupado}
                disabled={s === 'completada' && resultado.trim().length === 0}
                onClick={async () => { if (await ejecutar(() => cambiarEstadoTarea(t.id, s, s === 'completada' ? resultado : undefined))) cerrar() }}>{BOTON_ESTADO[s] ?? ETIQUETA_ESTADO_TAREA[s]}</Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function ListaTareas() {
  const { datos } = useCentral()
  const { agente, depto } = useIndices()
  const [estado, setEstado] = useState('abiertas'); const [area, setArea] = useState('')
  const [sel, setSel] = useState<Tarea | null>(null); const [nueva, setNueva] = useState(false)
  const lista = datos.tareas.filter(t => (estado === 'abiertas' ? ABIERTA(t.estado) : estado === 'todas' ? true : t.estado === estado) && (!area || t.departamento_id === area))
  const selActual = sel ? datos.tareas.find(t => t.id === sel.id) ?? null : null
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><Select label="Estado" value={estado} onChange={e => setEstado(e.target.value)}><option value="abiertas">Abiertas</option><option value="todas">Todas</option>{(Object.keys(ETIQUETA_ESTADO_TAREA) as EstadoTarea[]).map(s => <option key={s} value={s}>{ETIQUETA_ESTADO_TAREA[s]}</option>)}</Select></div>
        <div className="w-56"><Select label="Departamento" value={area} onChange={e => setArea(e.target.value)}><option value="">Todos</option>{datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select></div>
        <div className="ml-auto"><Button onClick={() => setNueva(true)}>Nueva tarea</Button></div>
      </div>
      {lista.length === 0 ? <StatePanel kind="empty" title="No hay tareas con este filtro" text="Crea una con “Nueva tarea”." /> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lista.map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => setSel(t)} className="flex min-h-[64px] w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] px-4 py-3 text-left hover:border-[var(--w-border-strong)]">
                <Badge tone={tonoPrioridad(t.prioridad)}>{t.prioridad}</Badge>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-[color:var(--w-text)]">#{t.codigo} · {t.titulo}</span><span className="block truncate text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{depto(t.departamento_id)?.nombre ?? 'Sin área'} · {agente(t.responsable_agente_id)?.nombre ?? 'Cristhian'} · {hace(t.created_at)}</span></span>
                <Badge tone="info">{t.nivel_requerido}</Badge>
                <Badge tone={TONO_ESTADO[t.estado]}>{ETIQUETA_ESTADO_TAREA[t.estado]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NuevaTarea abierto={nueva} onCerrar={() => setNueva(false)} />
      <DetalleTarea t={selActual} onCerrar={() => setSel(null)} />
    </>
  )
}

function FilaAprobacion({ a }: { a: Aprobacion }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar } = useAccion()
  const [nota, setNota] = useState('')
  const t = datos.tareas.find(x => x.id === a.tarea_id)
  const pendiente = a.estado === 'pendiente'
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={a.nivel === 'N3' ? 'danger' : 'warning'}>{a.nivel}</Badge><Badge tone={pendiente ? 'warning' : a.estado === 'aprobada' ? 'success' : 'neutral'}>{a.estado}</Badge><span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hace(a.created_at)}</span></div>
      <p className="m-0 font-semibold text-[color:var(--w-text)]">{a.accion}</p>
      {t && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Tarea #{t.codigo}</p>}
      {a.impacto && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Impacto:</b> {a.impacto}</p>}
      {!pendiente && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{a.decidido_en ? fechaHora(a.decidido_en) : ''}{a.nota_decision ? ` · “${a.nota_decision}”` : ''}</p>}
      {pendiente && (
        <>
          <Input label="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} maxLength={1000} />
          <ErrorAccion texto={error} />
          <div className="flex gap-2"><Button loading={ocupado} onClick={() => void ejecutar(() => decidirAprobacion(a.id, 'aprobada', nota))}>Aprobar</Button><Button variant="secondary" loading={ocupado} onClick={() => void ejecutar(() => decidirAprobacion(a.id, 'rechazada', nota))}>Rechazar</Button></div>
        </>
      )}
    </Card>
  )
}

function Proyectos() {
  const { datos } = useCentral()
  const { depto } = useIndices()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({ nombre: '', descripcion: '', depto: '', inicio: '', fin: '' })
  return (
    <>
      <div><Button onClick={() => setAbierto(true)}>Nuevo proyecto</Button></div>
      {datos.proyectos.length === 0 ? <StatePanel kind="empty" title="Todavía no hay proyectos" text="Un proyecto agrupa tareas con un objetivo común." /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {datos.proyectos.map(p => {
            const ts = datos.tareas.filter(t => t.proyecto_id === p.id); const hechas = ts.filter(t => t.estado === 'completada').length
            return (
              <Card key={p.id} className="flex flex-col gap-2">
                <p className="m-0 font-bold text-[color:var(--w-text)]">{p.nombre}</p>
                <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{depto(p.departamento_id)?.nombre ?? 'Sin área'} · {p.estado.replace('_', ' ')}{p.fecha_fin ? ` · hasta ${fechaCorta(p.fecha_fin)}` : ''}</p>
                {p.descripcion && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{p.descripcion}</p>}
                <progress className="h-2 w-full accent-[var(--w-accent)]" max={Math.max(ts.length, 1)} value={hechas} aria-label="Avance del proyecto" />
                <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hechas} de {ts.length} tareas completadas</p>
              </Card>
            )
          })}
        </div>
      )}
      <Modal open={abierto} onClose={() => { limpiar(); setAbierto(false) }} title="Nuevo proyecto"
        footer={<Button disabled={f.nombre.trim().length < 2} loading={ocupado} onClick={async () => { if (await ejecutar(() => crearProyecto({ nombre: f.nombre, descripcion: f.descripcion, departamento_id: f.depto || null, fecha_inicio: f.inicio || null, fecha_fin: f.fin || null }))) { setF({ nombre: '', descripcion: '', depto: '', inicio: '', fin: '' }); setAbierto(false) } }}>Crear proyecto</Button>}>
        <div className="flex flex-col gap-3">
          <Input label="Nombre" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} required maxLength={120} />
          <Textarea label="Descripción" value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} rows={3} maxLength={2000} />
          <Select label="Departamento" value={f.depto} onChange={e => setF({ ...f, depto: e.target.value })}><option value="">Sin área</option>{datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select>
          <div className="grid grid-cols-2 gap-3"><Input label="Inicio" type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /><Input label="Fin" type="date" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></div>
          <ErrorAccion texto={error} />
        </div>
      </Modal>
    </>
  )
}

export function Tareas() {
  const { datos } = useCentral()
  const [pestana, setPestana] = useState('tareas')
  const pendientes = datos.aprobaciones.filter(a => a.estado === 'pendiente').length
  return (
    <Pagina titulo="Tareas" subtitulo="Lo que hay que hacer, quién lo hace y qué necesita tu aprobación">
      <Tabs label="Secciones de tareas" value={pestana} onChange={setPestana} items={[{ key: 'tareas', label: 'Tareas' }, { key: 'aprobaciones', label: `Aprobaciones${pendientes ? ` (${pendientes})` : ''}` }, { key: 'proyectos', label: 'Proyectos' }]} />
      {pestana === 'tareas' && <ListaTareas />}
      {pestana === 'aprobaciones' && (
        <div className="flex flex-col gap-3">
          <TituloBloque>Aprobaciones</TituloBloque>
          <AvisoHonesto>Aprobar es decisión tuya. Ningún agente puede aprobarse a sí mismo; cada decisión queda en la auditoría con tu nombre.</AvisoHonesto>
          {datos.aprobaciones.length === 0 ? <StatePanel kind="empty" title="No hay aprobaciones" text="Aparecen cuando una tarea N2 o N3 pide tu visto bueno." /> : datos.aprobaciones.map(a => <FilaAprobacion key={a.id} a={a} />)}
        </div>
      )}
      {pestana === 'proyectos' && <Proyectos />}
    </Pagina>
  )
}
