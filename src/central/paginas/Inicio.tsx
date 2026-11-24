/**
 * Inicio.tsx — resumen de Central: restaurantes, agentes, trabajo pendiente y lo que espera tu decisión. Todo sale de datos reales;
 * lo que todavía no existe (agentes conectados, consumo de modelos) se dice tal cual.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { revisarPlataforma } from '../acciones.ts'
import { ETIQUETA_PRIORIDAD, ESTADOS_VISUALES, estadoVisual, dinero, hace } from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { Enlace, useRuta } from '../navegacion.tsx'
import { AgenteAvatar, AvisoHonesto, Estado, Icono, Kpi, TituloBloque } from '../ui.tsx'
import { webglDisponible, type PreferenciaCalidad } from '../3d/calidad.ts'
import type { DatosOficina } from '../3d/OficinaEscena.ts'

// La portada usa la misma escena de la oficina, descargada aparte (no frena la carga de Inicio).
const Oficina3D = lazy(() => import('../3d/Oficina3D'))

function Vigilancia() {
  const { recargar } = useCentral()
  const [cargando, setCargando] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null)
  const revisar = async () => {
    setCargando(true); setRes(null)
    const r = await revisarPlataforma()
    if (r.ok === true) {
      const d = r.datos
      const tg = d.telegram === 'enviado' ? ' Te avisé por Telegram.' : d.telegram === 'sin_configurar' ? ' (Telegram sin configurar.)' : d.telegram === 'falla' ? ' (No pude avisar por Telegram.)' : ''
      setRes({ ok: true, texto: d.tareas_creadas > 0 ? `Revisé ${d.vigilados.restaurantes} restaurantes y ${d.vigilados.opiniones_nuevas} opiniones nuevas: ${d.tareas_creadas} tarea(s) nueva(s) en Tareas.${tg}` : `Revisé ${d.vigilados.restaurantes} restaurantes y ${d.vigilados.opiniones_nuevas} opiniones nuevas: nada nuevo (${d.ya_estaban} pendiente(s) ya anotado(s)).` })
      void recargar()
    } else setRes({ ok: false, texto: r.mensaje })
    setCargando(false)
  }
  return (
    <Card className="flex flex-col items-start gap-2">
      <TituloBloque>Vigilancia de la plataforma</TituloBloque>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Revisa con datos reales: restaurantes nuevos, pruebas por terminar, cobros con problema, restaurantes sin pedidos y opiniones de usuarios sin atender. Crea tareas para el agente responsable (solo propuestas) y te avisa por Telegram de lo nuevo.</p>
      <Button size="sm" loading={cargando} onClick={() => void revisar()}>Revisar ahora</Button>
      {res && <p role="status" className={`m-0 text-[length:var(--w-fs-label)] ${res.ok ? 'text-[color:var(--w-success)]' : 'text-[color:var(--w-danger)]'}`}>{res.texto}</p>}
    </Card>
  )
}

export function Inicio() {
  const { datos, restaurantesDisponibles } = useCentral()
  const { ir } = useRuta()
  const { depto } = useIndices()
  const [fallo3d, setFallo3d] = useState(false)
  const soportaWebgl = useMemo(() => webglDisponible(), [])
  const calidad = (typeof datos.config.calidad_grafica === 'string' ? datos.config.calidad_grafica : 'auto') as PreferenciaCalidad
  const quiere3d = soportaWebgl && !fallo3d && datos.config.modo_oficina !== '2d'
  const datosEscena = useMemo<DatosOficina>(() => ({
    departamentos: datos.departamentos.map(d => ({ id: d.id, nombre: d.nombre, anillo: d.anillo, orden: d.orden, color: d.color, estado: d.estado })),
    agentes: datos.agentes.map(a => ({ id: a.id, nombre: a.nombre, departamento_id: a.departamento_id, estadoColor: estadoVisual(a).color })),
  }), [datos.departamentos, datos.agentes])
  const activos = datos.restaurantes.filter(r => r.activo)
  const pedidos = datos.restaurantes.reduce((s, r) => s + (r.pedidos_hoy ?? 0), 0)
  const cobrado = datos.restaurantes.reduce((s, r) => s + Number(r.cobrado_hoy ?? 0), 0)
  const abiertas = datos.tareas.filter(t => ABIERTA(t.estado))
  const pendientes = datos.aprobaciones.filter(a => a.estado === 'pendiente')
  const urgentes = abiertas.filter(t => t.prioridad === 'P0' || t.prioridad === 'P1').slice(0, 5)
  const conectados = datos.agentes.filter(a => a.proveedor_estado === 'activo').length
  const porEstado = ESTADOS_VISUALES.map(e => ({ ...e, n: datos.agentes.filter(a => estadoVisual(a).id === e.id).length }))

  return (
    <section className="flex flex-col gap-5" aria-labelledby="central-titulo">
      <header className="c-portada min-h-[260px] sm:min-h-[320px] lg:min-h-[360px]">
        <div className="absolute inset-0" aria-hidden={!quiere3d}>
          {quiere3d ? (
            <Suspense fallback={null}>
              <Oficina3D hero datos={datosEscena} camara="exterior" iluminacion="noche" calidad={calidad} onFallo={() => setFallo3d(true)} />
            </Suspense>
          ) : (
            <div className="h-full w-full" style={{ background: 'radial-gradient(60% 80% at 75% 55%, rgba(255,122,26,0.35), transparent 70%), radial-gradient(50% 70% at 90% 10%, rgba(80,140,255,0.28), transparent 70%)' }} />
          )}
        </div>
        <div className="relative z-10 flex h-full min-h-[inherit] flex-col justify-end gap-3 p-5 sm:p-7 lg:max-w-[58%]">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--w-r-pill)] border border-[var(--w-glass-border)] bg-[var(--w-glass-bg)] px-3 py-1 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-accent-text)]"><Icono nombre="candado" size={14} />Centro privado</span>
          <h1 id="central-titulo" className="m-0 font-bold leading-[1.05] text-[color:var(--w-text)]" style={{ fontSize: 'clamp(28px, 4.2vw, 44px)' }}>Bienvenido, Cristhian</h1>
          <p className="m-0 text-[length:var(--w-fs-body)] text-[color:var(--w-text-2)]">La oficina de tus agentes, en un solo lugar. Ellos vigilan la plataforma y proponen; nada sale hacia clientes sin tu aprobación.</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button onClick={() => ir('oficina')}>Entrar a la oficina</Button>
            <Button variant="secondary" onClick={() => ir('mundo')}>Ver el mundo</Button>
          </div>
        </div>
      </header>
      {datos.config.ia_encendida === true && conectados > 0 ? (
        <AvisoHonesto>
          La IA está <b>encendida</b>: los chats directos con los agentes responden con <b>IA real</b> (cada mensaje lo dice). En los canales los agentes todavía no participan. Los agentes solo trabajan por su cuenta en lo que tú apruebas (por ahora Mateo y Nico) y nada se contacta ni se publica sin tu aprobación.
        </AvisoHonesto>
      ) : (
        <AvisoHonesto>
          La IA está <b>apagada</b> o ningún agente está activo con un proveedor. Si hablas con un agente, responde en <b>simulación local</b>. Enciéndela en Integraciones cuando quieras.
        </AvisoHonesto>
      )}

      <Vigilancia />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Restaurantes activos" valor={restaurantesDisponibles ? activos.length : '—'} detalle={restaurantesDisponibles ? `de ${datos.restaurantes.length} registrados` : 'No se pudo leer'} icono="mundo" />
        <Kpi etiqueta="Pedidos de hoy" valor={restaurantesDisponibles ? pedidos : '—'} detalle={restaurantesDisponibles ? `${dinero(cobrado)} cobrado (referencia)` : undefined} icono="dinero" />
        <Kpi etiqueta="Agentes" valor={datos.agentes.length} detalle={`${conectados} conectados a un modelo`} icono="agentes" />
        <Kpi etiqueta="Tareas abiertas" valor={abiertas.length} detalle={`${urgentes.length} urgentes`} icono="tareas" />
        <Kpi etiqueta="Esperan tu decisión" valor={pendientes.length} detalle={pendientes.length ? 'Aprobaciones pendientes' : 'Nada pendiente'} icono="escudo" color={pendientes.length ? 'var(--w-warning)' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <TituloBloque>Aprobaciones pendientes</TituloBloque>
          {pendientes.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Nada espera tu decisión. Cuando un agente proponga algo de nivel N2 o N3, aparecerá aquí y en la campana.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pendientes.slice(0, 5).map(a => (
                <li key={a.id}>
                  <Enlace a="tareas" className="flex min-h-[52px] items-center gap-3 rounded-[var(--w-r-md)] px-2 hover:bg-[var(--w-surface-sunken)]">
                    <Badge tone={a.nivel === 'N3' ? 'danger' : 'warning'}>{a.nivel}</Badge>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[color:var(--w-text)]">{a.accion}</span><span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hace(a.created_at)}</span></span>
                    <Icono nombre="flecha" size={18} />
                  </Enlace>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <TituloBloque>Tareas urgentes</TituloBloque>
          {urgentes.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay tareas P0 ni P1 abiertas.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {urgentes.map(t => (
                <li key={t.id}>
                  <Enlace a="tareas" className="flex min-h-[52px] items-center gap-3 rounded-[var(--w-r-md)] px-2 hover:bg-[var(--w-surface-sunken)]">
                    <Badge tone={t.prioridad === 'P0' ? 'danger' : 'warning'}>{ETIQUETA_PRIORIDAD[t.prioridad].split(' ')[0]}</Badge>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[color:var(--w-text)]">{t.titulo}</span><span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{depto(t.departamento_id)?.nombre ?? 'Sin área'} · {hace(t.created_at)}</span></span>
                    <Icono nombre="flecha" size={18} />
                  </Enlace>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <TituloBloque>Estado de los agentes</TituloBloque>
          <div className="flex flex-wrap gap-x-4 gap-y-2">{porEstado.map(e => <Estado key={e.id} color={e.color}>{e.etiqueta}: {e.n}</Estado>)}</div>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {datos.agentes.map(a => {
              const d = depto(a.departamento_id)
              return (
                <li key={a.id}>
                  <Enlace a="agentes" id={a.id} title={`${a.nombre} · ${d?.nombre ?? ''}`} className="flex flex-col items-center gap-1 rounded-[var(--w-r-md)] p-1.5 hover:bg-[var(--w-surface-sunken)]">
                    <AgenteAvatar color={d?.color ?? '#9CA3AF'} size={44} estadoColor={estadoVisual(a).color} />
                    <span className="text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-2)]">{a.nombre}</span>
                  </Enlace>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3">
          <TituloBloque>Restaurantes</TituloBloque>
          {!restaurantesDisponibles ? (
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No se pudo leer la lista de restaurantes.</p>
          ) : datos.restaurantes.length === 0 ? (
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay restaurantes registrados.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {datos.restaurantes.slice(0, 6).map(r => (
                <li key={r.id} className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1">
                  <span className="min-w-0 truncate text-[color:var(--w-text)]">{r.nombre}</span>
                  <Badge tone={r.activo ? 'success' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
                  <span className="col-span-2 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{r.pedidos_hoy} pedidos hoy</span>
                </li>
              ))}
            </ul>
          )}
          <Enlace a="mundo" className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--w-accent-text)] underline">Ver en el globo</Enlace>
        </Card>
      </div>
    </section>
  )
}
