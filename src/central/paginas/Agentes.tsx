/**
 * Agentes.tsx — organigrama de agentes y ficha de cada uno (resumen, conversación, tareas, historial, permisos).
 * Un agente nuevo nace N0, diseñado y sin conexión. Subirle el nivel o activarlo es decisión tuya y queda en la auditoría;
 * la base impide declarar "activo" a un agente sin conexión y N3 no existe para agentes.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { StatePanel } from '../../components/ui/StatePanel'
import { Tabs } from '../../components/ui/Tabs'
import { actualizarAgente, conversacionDirecta, crearAgente } from '../acciones.ts'
import {
  ETIQUETA_CICLO, ETIQUETA_ESTADO_TAREA, ETIQUETA_PRIORIDAD, ETIQUETA_PROVEEDOR, ETIQUETA_ROL, NIVELES_INFO, estadoVisual, fechaHora, hace,
  type Agente, type Ciclo, type EventoAuditoria, type Nivel, type NivelAgente, type Proveedor,
} from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { Enlace, useRuta } from '../navegacion.tsx'
import { permite } from '../permisos.ts'
import { AgenteAvatar, AvisoHonesto, ErrorAccion, Estado, Pagina, TituloBloque, useAccion } from '../ui.tsx'
import { Chat } from './Chat'

function TarjetaAgente({ a }: { a: Agente }) {
  const { depto } = useIndices()
  const d = depto(a.departamento_id)
  const ev = estadoVisual(a)
  return (
    <Enlace a="agentes" id={a.id} style={{ ['--c' as string]: d?.color ?? '#9CA3AF' }} className="c-agente flex min-h-[44px] flex-col gap-3 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4 transition-colors">
      <span className="flex items-center gap-3">
        <AgenteAvatar color={d?.color ?? '#9CA3AF'} estadoColor={ev.color} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[color:var(--w-text)]">{a.nombre}</span>
          <span className="block truncate text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETIQUETA_ROL[a.rol]} · {d?.nombre}</span>
        </span>
        <Badge tone={a.nivel === 'N0' ? 'neutral' : 'info'}>{a.nivel}</Badge>
      </span>
      <span className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{a.especialidad}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><Estado color={ev.color}>{ev.etiqueta}</Estado><span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETIQUETA_PROVEEDOR[a.proveedor_estado]}</span></span>
    </Enlace>
  )
}

function NuevoAgente({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [nombre, setNombre] = useState(''); const [idAgente, setId] = useState(''); const [area, setArea] = useState(''); const [esp, setEsp] = useState('')
  const idSugerido = (idAgente || nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const valido = nombre.trim().length >= 2 && idSugerido.length >= 2 && !!area
  return (
    <Modal open={abierto} onClose={() => { limpiar(); onCerrar() }} title="Nuevo agente"
      footer={<Button disabled={!valido} loading={ocupado} onClick={async () => { if (await ejecutar(() => crearAgente({ id: idSugerido, nombre, departamento_id: area, especialidad: esp }))) { setNombre(''); setId(''); setEsp(''); onCerrar() } }}>Crear agente</Button>}>
      <div className="flex flex-col gap-3">
        <AvisoHonesto>El agente nace en <b>N0 (solo lectura)</b>, <b>diseñado</b> y <b>sin conexión</b>. No hace nada hasta que tú lo decidas.</AvisoHonesto>
        <Input label="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} required maxLength={80} />
        <Input label="Identificador" hint="Sin espacios ni tildes; no se puede cambiar después." value={idAgente || idSugerido} onChange={e => setId(e.target.value)} maxLength={40} />
        <Select label="Departamento" value={area} onChange={e => setArea(e.target.value)} required>
          <option value="">Elige un departamento…</option>
          {datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Select>
        <Input label="Especialidad" value={esp} onChange={e => setEsp(e.target.value)} maxLength={200} />
        <ErrorAccion texto={error} />
      </div>
    </Modal>
  )
}

function Historial({ id }: { id: string }) {
  const [filas, setFilas] = useState<EventoAuditoria[] | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.from('central_auditoria').select('*').eq('recurso', `central_agentes:${id}`).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (vivo) setFilas((data ?? []) as EventoAuditoria[]) }, () => { if (vivo) setFilas([]) })
    return () => { vivo = false }
  }, [id])
  if (!filas) return <StatePanel kind="loading" />
  if (!filas.length) return <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay cambios anotados para este agente.</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {filas.map(f => (
        <li key={f.id} className="flex flex-col gap-0.5 border-b border-[var(--w-border)] pb-2 last:border-0">
          <span className="font-semibold text-[color:var(--w-text)]">{f.accion === 'insert_agentes' ? 'Se creó el agente' : 'Se modificó el agente'}</span>
          <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{fechaHora(f.created_at)}</span>
          {f.detalle && Object.entries((f.detalle as Record<string, { antes?: unknown; despues?: unknown }>)).filter(([k]) => k !== 'fila').map(([k, v]) => (
            <span key={k} className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-2)]">{k}: {JSON.stringify(v?.antes)} → {JSON.stringify(v?.despues)}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}

function Permisos({ a }: { a: Agente }) {
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const { datos } = useCentral()
  const iaEncendida = datos.config.ia_encendida === true   // "Conectado" solo se puede elegir con la IA encendida en Integraciones
  const [nivel, setNivel] = useState<NivelAgente>(a.nivel)
  const [ciclo, setCiclo] = useState<Ciclo>(a.ciclo)
  const [prov, setProv] = useState<Proveedor>(a.proveedor_estado)
  const [confirma, setConfirma] = useState(false)
  useEffect(() => { setNivel(a.nivel); setCiclo(a.ciclo); setProv(a.proveedor_estado); limpiar() }, [a.id, a.nivel, a.ciclo, a.proveedor_estado]) // eslint-disable-line react-hooks/exhaustive-deps
  const cambios = nivel !== a.nivel || ciclo !== a.ciclo || prov !== a.proveedor_estado
  const sube = nivel !== a.nivel && nivel !== 'N0'
  const guardar = async () => {
    const ok = await ejecutar(() => actualizarAgente(a.id, { nivel, ciclo, proveedor_estado: prov }))
    if (ok) setConfirma(false)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] border-collapse text-left text-[length:var(--w-fs-label)]">
        <thead><tr className="text-[color:var(--w-text-3)]"><th className="py-2 pr-3 font-semibold">Acción</th><th className="py-2 font-semibold">¿Puede {a.nombre}?</th></tr></thead>
        <tbody>
          {(['N0', 'N1', 'N2', 'N3'] as Nivel[]).map(n => {
            const d = permite(a.nivel, n)
            return (
              <tr key={n} className="border-t border-[var(--w-border)]">
                <td className="py-2 pr-3 text-[color:var(--w-text)]"><b>{NIVELES_INFO[n].titulo}</b><br /><span className="text-[color:var(--w-text-3)]">{NIVELES_INFO[n].resumen}</span></td>
                <td className="py-2"><Badge tone={d === 'ejecutar' ? 'success' : d === 'requiere_aprobacion' ? 'warning' : 'danger'}>{d === 'ejecutar' ? 'Sí' : d === 'requiere_aprobacion' ? 'Con tu aprobación' : 'No'}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <AvisoHonesto>Un agente nunca se aprueba a sí mismo ni sube sus propios permisos: este cambio solo lo haces tú, y queda en la auditoría.</AvisoHonesto>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label="Nivel máximo" value={nivel} onChange={e => setNivel(e.target.value as NivelAgente)} hint="N3 es solo humano: no existe para agentes.">
          {(['N0', 'N1', 'N2'] as NivelAgente[]).map(n => <option key={n} value={n}>{NIVELES_INFO[n].titulo}</option>)}
        </Select>
        <Select label="Ciclo de vida" value={ciclo} onChange={e => setCiclo(e.target.value as Ciclo)}>
          {(Object.keys(ETIQUETA_CICLO) as Ciclo[]).map(c => <option key={c} value={c}>{ETIQUETA_CICLO[c]}</option>)}
        </Select>
        <Select label="Proveedor de IA" value={prov} onChange={e => setProv(e.target.value as Proveedor)} hint="“Conectado” = responde la IA real (con tu tope de gasto). Se habilita al encender la IA en Integraciones.">
          {(Object.keys(ETIQUETA_PROVEEDOR) as Proveedor[]).map(p => <option key={p} value={p} disabled={p === 'activo' && !iaEncendida}>{ETIQUETA_PROVEEDOR[p]}{p === 'activo' && !iaEncendida ? ' (enciende la IA primero)' : ''}</option>)}
        </Select>
      </div>
      <ErrorAccion texto={error} />
      <div><Button disabled={!cambios} onClick={() => (sube || ciclo === 'activo' ? setConfirma(true) : void guardar())} loading={ocupado && !confirma}>Guardar cambios</Button></div>
      <Modal open={confirma} onClose={() => setConfirma(false)} title="Confirma tu decisión"
        footer={<><Button variant="secondary" onClick={() => setConfirma(false)}>Cancelar</Button><Button loading={ocupado} onClick={() => void guardar()}>Sí, lo decido yo</Button></>}>
        <p className="m-0 text-[color:var(--w-text-2)]">{a.nombre} pasará a <b>{NIVELES_INFO[nivel].titulo}</b>{ciclo !== a.ciclo ? <> y su ciclo a <b>{ETIQUETA_CICLO[ciclo]}</b></> : null}. {nivel !== 'N0' ? 'Podrá hacer acciones reversibles dentro de lo aprobado.' : ''} Puedes volver a bajarlo cuando quieras.</p>
        <ErrorAccion texto={error} />
      </Modal>
    </div>
  )
}

function Ficha({ id }: { id: string }) {
  const { datos, hacer } = useCentral()
  const { depto, agente } = useIndices()
  const [pestana, setPestana] = useState('resumen')
  const [conv, setConv] = useState<string | null>(null)
  const [errorConv, setErrorConv] = useState<string | null>(null)
  const a = agente(id)
  const tareas = datos.tareas.filter(t => t.responsable_agente_id === id)
  useEffect(() => { setConv(null); setErrorConv(null); setPestana('resumen') }, [id])
  useEffect(() => {
    if (pestana !== 'conversacion' || !a || conv) return
    let vivo = true
    void conversacionDirecta(a).then(r => { if (!vivo) return; if ('error' in r) setErrorConv(r.error); else { setConv(r.id); void hacer(async () => null) } })
    return () => { vivo = false }
  }, [pestana, a, conv]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return <Pagina titulo="Agente"><StatePanel kind="empty" title="No existe ese agente" action={<Enlace a="agentes" className="font-semibold text-[color:var(--w-accent-text)] underline">Ver todos</Enlace>} /></Pagina>
  const d = depto(a.departamento_id); const ev = estadoVisual(a); const jefe = agente(a.reporta_a)
  return (
    <Pagina titulo={a.nombre} subtitulo={`${ETIQUETA_ROL[a.rol]} · ${d?.nombre ?? ''}`} acciones={<Enlace a="agentes" className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Todos los agentes</Enlace>}>
      <Card className="flex flex-wrap items-center gap-4">
        <AgenteAvatar color={d?.color ?? '#9CA3AF'} estadoColor={ev.color} size={72} titulo={`Avatar de ${a.nombre}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 text-[color:var(--w-text-2)]">{a.especialidad}</p>
          <div className="flex flex-wrap items-center gap-2"><Estado color={ev.color}>{ev.etiqueta}</Estado><Badge tone="neutral">{a.nivel}</Badge><Badge tone={a.proveedor_estado === 'activo' ? 'success' : 'warning'}>{ETIQUETA_PROVEEDOR[a.proveedor_estado]}</Badge></div>
        </div>
      </Card>
      <Tabs label="Secciones del agente" value={pestana} onChange={setPestana} items={[{ key: 'resumen', label: 'Resumen' }, { key: 'conversacion', label: 'Conversación' }, { key: 'tareas', label: `Tareas (${tareas.length})` }, { key: 'historial', label: 'Historial' }, { key: 'permisos', label: 'Permisos' }]} />
      <Card className="flex flex-col gap-4">
        {pestana === 'resumen' && (
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[['Reporta a', jefe?.nombre ?? 'Cristhian (directo)'], ['Ciclo de vida', ETIQUETA_CICLO[a.ciclo]], ['Presupuesto mensual', a.presupuesto_mensual ? `$ ${a.presupuesto_mensual}` : 'Sin presupuesto asignado'], ['Modelos', a.modelos.length ? a.modelos.join(', ') : 'Ninguno conectado'], ['Herramientas', a.herramientas.length ? a.herramientas.join(', ') : 'Ninguna'], ['Objetivos', a.objetivos.length ? a.objetivos.join(' · ') : 'Todavía sin objetivos definidos']].map(([k, v]) => (
              <div key={k}><dt className="text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-3)]">{k}</dt><dd className="m-0 text-[color:var(--w-text)]">{v}</dd></div>
            ))}
          </dl>
        )}
        {pestana === 'conversacion' && (
          <>
            {!(datos.config.ia_encendida === true && a.proveedor_estado === 'activo') && (
              <AvisoHonesto tono="warning">{a.nombre} no está conectado a un modelo de IA. Sus respuestas son <b>simulación local</b>: texto armado con los datos reales de Central, no razonamiento.</AvisoHonesto>
            )}
            {errorConv ? <ErrorAccion texto={errorConv} /> : conv ? <Chat conversacionId={conv} agente={a} vacio={`Saluda a ${a.nombre}.`} /> : <StatePanel kind="loading" title="Abriendo la conversación…" />}
          </>
        )}
        {pestana === 'tareas' && (tareas.length === 0 ? <p className="m-0 text-[color:var(--w-text-3)]">Este agente no tiene tareas asignadas.</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {tareas.map(t => (
              <li key={t.id} className="flex min-h-[44px] items-center gap-2">
                <Badge tone={ABIERTA(t.estado) ? 'info' : 'neutral'}>{ETIQUETA_ESTADO_TAREA[t.estado]}</Badge>
                <span className="min-w-0 flex-1 truncate text-[color:var(--w-text)]">{t.titulo}</span>
                <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETIQUETA_PRIORIDAD[t.prioridad].split(' ')[0]} · {hace(t.created_at)}</span>
              </li>
            ))}
          </ul>
        ))}
        {pestana === 'historial' && <Historial id={a.id} />}
        {pestana === 'permisos' && <Permisos a={a} />}
      </Card>
    </Pagina>
  )
}

export function Agentes() {
  const { ruta } = useRuta()
  const { datos } = useCentral()
  const [area, setArea] = useState('')
  const [nuevo, setNuevo] = useState(false)
  if (ruta.id) return <Ficha id={ruta.id} />
  const lista = datos.agentes.filter(a => !area || a.departamento_id === area)
  return (
    <Pagina titulo="Agentes" subtitulo={`${datos.agentes.length} agentes en el organigrama aprobado`} acciones={<Button onClick={() => setNuevo(true)}>Nuevo agente</Button>}>
      <AvisoHonesto>Todos los agentes están <b>diseñados, en N0 y sin conexión</b>. Ninguno actúa ni responde con inteligencia artificial hasta que tú configures y autorices un proveedor.</AvisoHonesto>
      <div className="max-w-xs"><Select label="Filtrar por departamento" value={area} onChange={e => setArea(e.target.value)}><option value="">Todos</option>{datos.departamentos.filter(d => datos.agentes.some(a => a.departamento_id === d.id)).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select></div>
      {lista.length === 0 ? <StatePanel kind="empty" title="Sin agentes en este filtro" /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{lista.map(a => <TarjetaAgente key={a.id} a={a} />)}</div>
      )}
      <NuevoAgente abierto={nuevo} onCerrar={() => setNuevo(false)} />
    </Pagina>
  )
}
