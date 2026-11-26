/**
 * Oficina.tsx — la oficina circular: 3D (Planta, Exterior, Interior, Recorrer; día/noche) o plano 2D, con ficha lateral del espacio,
 * agente o núcleo que elijas. Si el equipo no puede con el 3D (sin WebGL, poca memoria, el navegador pausa el contexto),
 * cae solo al plano 2D con un aviso. Las preferencias se guardan en la configuración de Central.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatePanel } from '../../components/ui/StatePanel'
import { cn } from '../../lib/cn'
import { guardarConfig } from '../acciones.ts'
import { ESTADOS_VISUALES, ETIQUETA_ANILLO, ETIQUETA_PROVEEDOR, estadoVisual } from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { Enlace } from '../navegacion.tsx'
import { Plano2D } from '../Plano2D'
import { webglDisponible, type PreferenciaCalidad } from '../3d/calidad.ts'
import type { DatosOficina, Iluminacion, ModoCamara, Seleccion } from '../3d/OficinaEscena.ts'
import { AgenteAvatar, AvisoHonesto, Estado, Icono, Punto, TituloBloque, useEscritorio } from '../ui.tsx'

const Oficina3D = lazy(() => import('../3d/Oficina3D'))

const CAMARAS: { id: ModoCamara; etiqueta: string }[] = [{ id: 'planta', etiqueta: 'Planta' }, { id: 'exterior', etiqueta: 'Exterior' }, { id: 'interior', etiqueta: 'Interior' }, { id: 'recorrer', etiqueta: 'Recorrer' }]
const boton = (activo: boolean) => cn('inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--w-r-pill)] px-3.5 font-semibold text-[length:var(--w-fs-label)] transition-colors',
  activo ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'bg-[var(--w-surface)] text-[color:var(--w-text-2)] border border-[var(--w-border-strong)] hover:bg-[var(--w-surface-sunken)]')

function Ficha({ sel, onCerrar }: { sel: Seleccion | null; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { depto, agente, agentesDe } = useIndices()
  if (!sel) {
    return (
      <div className="flex flex-col gap-4">
        <TituloBloque>Cómo leer la oficina</TituloBloque>
        <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Toca un espacio, un agente o el núcleo para ver su ficha. Un solo nivel circular: el núcleo (RestaurantOS) y tres anillos.</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{[2, 3, 4].map(a => <li key={a}>{ETIQUETA_ANILLO[a]}</li>)}</ul>
        <div className="flex flex-col gap-1.5"><p className="m-0 font-semibold text-[color:var(--w-text)]">Estado de un agente</p>{ESTADOS_VISUALES.map(e => <Estado key={e.id} color={e.color}>{e.etiqueta}</Estado>)}</div>
        <AvisoHonesto>El estado sale del ciclo real del agente: los que siguen en <b>«diseñado»</b> se ven en gris (Inactivo). Cambiar el ciclo de un agente es decisión tuya, en su ficha → Permisos.</AvisoHonesto>
      </div>
    )
  }
  if (sel.tipo === 'nucleo') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2"><TituloBloque>Núcleo · RestaurantOS</TituloBloque><button type="button" onClick={onCerrar} className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--w-text-3)] hover:bg-[var(--w-surface-sunken)]" aria-label="Cerrar ficha"><Icono nombre="cerrar" size={18} /></button></div>
        <p className="m-0 text-[color:var(--w-text-2)]">El corazón de la oficina: la plataforma de los restaurantes. Resti, tu asistente personal, está aquí.</p>
        <p className="m-0 text-[color:var(--w-text-2)]">{datos.restaurantes.length} restaurantes registrados, {datos.restaurantes.filter(r => r.activo).length} activos.</p>
        <Enlace a="mundo" className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Ver el mundo</Enlace>
      </div>
    )
  }
  if (sel.tipo === 'agente') {
    const a = agente(sel.id); if (!a) return null
    const d = depto(a.departamento_id); const ev = estadoVisual(a)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3"><AgenteAvatar color={d?.color ?? '#9CA3AF'} estadoColor={ev.color} size={56} /><div className="min-w-0 flex-1"><TituloBloque>{a.nombre}</TituloBloque><p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{d?.nombre}</p></div><button type="button" onClick={onCerrar} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--w-text-3)] hover:bg-[var(--w-surface-sunken)]" aria-label="Cerrar ficha"><Icono nombre="cerrar" size={18} /></button></div>
        <p className="m-0 text-[color:var(--w-text-2)]">{a.especialidad}</p>
        <div className="flex flex-wrap items-center gap-2"><Estado color={ev.color}>{ev.etiqueta}</Estado><Badge tone="neutral">{a.nivel}</Badge><Badge tone="warning">{ETIQUETA_PROVEEDOR[a.proveedor_estado]}</Badge></div>
        <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{datos.tareas.filter(t => t.responsable_agente_id === a.id && ABIERTA(t.estado)).length} tareas abiertas</p>
        <Enlace a="agentes" id={a.id} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Abrir ficha y conversación</Enlace>
      </div>
    )
  }
  const d = depto(sel.id); if (!d) return null
  const ags = agentesDe(d.id)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2"><Punto color={d.color} size={12} /><TituloBloque>{d.nombre}</TituloBloque><button type="button" onClick={onCerrar} className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--w-text-3)] hover:bg-[var(--w-surface-sunken)]" aria-label="Cerrar ficha"><Icono nombre="cerrar" size={18} /></button></div>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETIQUETA_ANILLO[d.anillo]}</p>
      <p className="m-0 text-[color:var(--w-text-2)]">{d.descripcion}</p>
      {d.estado === 'en_construccion' && <Badge tone="warning">En construcción</Badge>}
      {ags.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{ags.map(a => <li key={a.id}><Enlace a="agentes" id={a.id} className="flex min-h-[44px] items-center gap-2 text-[color:var(--w-text)] hover:underline"><AgenteAvatar color={d.color} estadoColor={estadoVisual(a).color} size={30} />{a.nombre}</Enlace></li>)}</ul>}
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{datos.tareas.filter(t => t.departamento_id === d.id && ABIERTA(t.estado)).length} tareas abiertas</p>
      <Enlace a="departamentos" id={d.id} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Abrir el departamento</Enlace>
    </div>
  )
}

export function Oficina() {
  const { datos, hacer } = useCentral()
  const { depto } = useIndices()
  const escritorio = useEscritorio()
  const cfg = (k: string, def: string) => (typeof datos.config[k] === 'string' ? (datos.config[k] as string) : def)
  const [vista, setVista] = useState<'3d' | '2d'>(cfg('modo_oficina', '3d') === '2d' ? '2d' : '3d')
  const luzCfg = cfg('iluminacion', 'auto')
  const [luz, setLuz] = useState<Iluminacion>(luzCfg === 'noche' || (luzCfg === 'auto' && (new Date().getHours() >= 19 || new Date().getHours() < 6)) ? 'noche' : 'dia')
  const [camara, setCamara] = useState<ModoCamara>('exterior')
  const [techo, setTecho] = useState(false)
  const [sel, setSel] = useState<Seleccion | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [parada, setParada] = useState<string | null>(null)
  const soportaWebgl = useMemo(() => webglDisponible(), [])
  const calidad = cfg('calidad_grafica', 'auto') as PreferenciaCalidad

  const datosEscena = useMemo<DatosOficina>(() => ({
    departamentos: datos.departamentos.map(d => ({ id: d.id, nombre: d.nombre, anillo: d.anillo, orden: d.orden, color: d.color, estado: d.estado })),
    agentes: datos.agentes.map(a => ({ id: a.id, nombre: a.nombre, departamento_id: a.departamento_id, estadoColor: estadoVisual(a).color })),
  }), [datos.departamentos, datos.agentes])

  const en3d = vista === '3d' && soportaWebgl && !fallo
  const cambiarVista = (v: '3d' | '2d') => { setVista(v); setFallo(null); void hacer(() => guardarConfig('modo_oficina', v).then(() => null)) }
  const cambiarLuz = (l: Iluminacion) => { setLuz(l); void hacer(() => guardarConfig('iluminacion', l).then(() => null)) }

  return (
    <div className={cn('flex flex-col', escritorio ? 'h-[calc(100vh-56px)] flex-row' : '')}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--w-border)] p-3">
          <div className="inline-flex gap-1" role="group" aria-label="Vista">
            <button type="button" className={boton(en3d || (vista === '3d'))} aria-pressed={vista === '3d'} onClick={() => cambiarVista('3d')}>3D</button>
            <button type="button" className={boton(vista === '2d')} aria-pressed={vista === '2d'} onClick={() => cambiarVista('2d')}>Plano 2D</button>
          </div>
          {en3d && (
            <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Cámara">
              {CAMARAS.map(c => <button key={c.id} type="button" className={boton(camara === c.id)} aria-pressed={camara === c.id} onClick={() => setCamara(c.id)}>{c.etiqueta}</button>)}
            </div>
          )}
          {en3d && camara === 'exterior' && <button type="button" className={boton(techo)} aria-pressed={techo} onClick={() => setTecho(t => !t)}>{techo ? 'Techo: puesto' : 'Techo: retirado'}</button>}
          <button type="button" className={cn(boton(luz === 'noche'), 'ml-auto')} aria-pressed={luz === 'noche'} onClick={() => cambiarLuz(luz === 'noche' ? 'dia' : 'noche')}>{luz === 'noche' ? 'Modo nocturno: sí' : 'Modo nocturno: no'}</button>
          {camara === 'recorrer' && parada && en3d && <Badge tone="accent">Visitando: {depto(parada)?.nombre}</Badge>}
        </div>
        {(vista === '3d' && (!soportaWebgl || fallo)) && (
          <div className="p-3"><AvisoHonesto tono="warning">{!soportaWebgl ? 'Este equipo o navegador no puede mostrar 3D.' : fallo} Se muestra el plano 2D, con lo mismo.{' '}
            {soportaWebgl && <Button size="sm" variant="secondary" onClick={() => { setFallo(null); setIntento(n => n + 1) }}>Reintentar 3D</Button>}</AvisoHonesto></div>
        )}
        <div className={cn('relative min-h-[360px] flex-1 overflow-hidden bg-[var(--w-bg-2)]', !escritorio && 'h-[58vh] flex-none')}>
          {en3d ? (
            <Suspense fallback={<StatePanel kind="loading" title="Cargando el 3D…" />}>
              <Oficina3D key={intento} datos={datosEscena} camara={camara} iluminacion={luz} techo={techo} calidad={calidad} seleccion={sel}
                onSeleccion={setSel} onFallo={setFallo} onRecorrido={setParada} onCamaraLibre={() => setCamara('exterior')} />
            </Suspense>
          ) : <div className="h-full w-full p-3"><Plano2D datos={datosEscena} seleccion={sel} onSeleccion={setSel} claro={luz === 'dia'} /></div>}
        </div>
      </div>
      <aside className={cn('shrink-0 overflow-y-auto border-[var(--w-border)] bg-[var(--w-surface)] p-4', escritorio ? 'w-[340px] border-l' : 'border-t pb-28')} aria-live="polite" aria-label="Ficha">
        <Card className="!border-0 !bg-transparent !p-0 !shadow-none"><Ficha sel={sel} onCerrar={() => setSel(null)} /></Card>
      </aside>
    </div>
  )
}
