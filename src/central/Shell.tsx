/**
 * Shell.tsx — la cáscara de Central: píldora de navegación inferior + "Más" (celular y escritorio), campana de avisos,
 * botón flotante de Resti y la pantalla activa. Solo se monta con el acceso ya verificado (CentralGate).
 * Si el servidor aún no tiene instalado el núcleo de Central, lo dice claro y no muestra nada inventado.
 */
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { StatePanel } from '../components/ui/StatePanel'
import { GlassPanel } from '../components/ui/Card'
import { RestiSprite } from '../components/resti/RestiSprite'
import { cn } from '../lib/cn'
import { marcarLeidas } from './acciones.ts'
import { hace } from './catalogo.ts'
import { useCentral } from './datos.tsx'
import { Enlace, useRuta } from './navegacion.tsx'
import { SECCIONES, parseRuta, type Seccion } from './rutas.ts'
import { Icono } from './ui.tsx'
import { Inicio } from './paginas/Inicio'
import { Departamentos } from './paginas/Departamentos'
import { Agentes } from './paginas/Agentes'
import { Tareas } from './paginas/Tareas'
import { Conversaciones } from './paginas/Conversaciones'
import { Reuniones } from './paginas/Reuniones'
import { Crecimiento } from './paginas/Crecimiento'
import { Prospectos } from './paginas/Prospectos'
import { Mision } from './paginas/Mision'
import { Agenda } from './paginas/Agenda'
import { Mensajes } from './paginas/Mensajes'
import { Biblioteca, Memoria } from './paginas/Conocimiento'
import { Integraciones, Presupuestos, Configuracion } from './paginas/Gobierno'
import { Auditoria } from './paginas/Auditoria'
import { RestiPanel } from './paginas/RestiPanel'

// Las pantallas con 3D se descargan aparte: quien no las abre no baja three.js.
const Oficina = lazy(() => import('./paginas/Oficina').then(m => ({ default: m.Oficina })))
const Mundo = lazy(() => import('./paginas/Mundo').then(m => ({ default: m.Mundo })))

const PANTALLA_COMPLETA = new Set<Seccion>(['oficina', 'mundo'])

function Pantalla({ seccion }: { seccion: Seccion }) {
  switch (seccion) {
    case 'oficina': return <Suspense fallback={<StatePanel kind="loading" title="Cargando la oficina…" />}><Oficina /></Suspense>
    case 'mundo': return <Suspense fallback={<StatePanel kind="loading" title="Cargando el mundo…" />}><Mundo /></Suspense>
    case 'departamentos': return <Departamentos />
    case 'agentes': return <Agentes />
    case 'conversaciones': return <Conversaciones />
    case 'tareas': return <Tareas />
    case 'reuniones': return <Reuniones />
    case 'crecimiento': return <Crecimiento />
    case 'prospectos': return <Prospectos />
    case 'mision': return <Mision />
    case 'agenda': return <Agenda />
    case 'mensajes': return <Mensajes />
    case 'biblioteca': return <Biblioteca />
    case 'memoria': return <Memoria />
    case 'integraciones': return <Integraciones />
    case 'presupuestos': return <Presupuestos />
    case 'auditoria': return <Auditoria />
    case 'configuracion': return <Configuracion />
    default: return <Inicio />
  }
}

const itemNav = (activo: boolean) => cn(
  'c-nav relative flex min-h-[52px] min-w-0 items-center gap-2 rounded-[var(--w-r-md)] px-2.5 font-semibold transition-colors duration-[var(--w-dur)]',
  'text-[length:var(--w-fs-label)] leading-tight [overflow-wrap:anywhere]',
  activo ? 'bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]' : 'text-[color:var(--w-text-2)] hover:bg-[var(--w-surface-sunken)]',
)

export function Shell() {
  const { ruta, ir } = useRuta()
  const { estado, datos, enVivo, recargar } = useCentral()
  const [mas, setMas] = useState(false)
  const [campana, setCampana] = useState(false)
  const [resti, setResti] = useState(false)

  const pendientes = datos.aprobaciones.filter(a => a.estado === 'pendiente').length
  const noLeidas = datos.notificaciones.filter(n => !n.leida)
  const cuenta = (s: Seccion) => (s === 'tareas' ? pendientes : 0)
  const completa = PANTALLA_COMPLETA.has(ruta.seccion)
  const actual = SECCIONES.find(s => s.id === ruta.seccion)

  let contenido: ReactNode
  if (estado === 'cargando') contenido = <StatePanel kind="loading" title="Cargando Central…" />
  else if (estado === 'no_instalado') contenido = (
    <StatePanel kind="forbidden" title="Central aún no está instalado en la base de datos"
      text="Falta aplicar la migración del núcleo (20261114140000_central_nucleo). Hasta entonces no se muestra nada."
      action={<Button variant="secondary" onClick={() => void recargar()}>Reintentar</Button>} />
  )
  else if (estado === 'error') contenido = (
    <StatePanel kind="error" title="No se pudo cargar Central" action={<Button variant="secondary" onClick={() => void recargar()}>Reintentar</Button>} />
  )
  else contenido = <Pantalla seccion={ruta.seccion} />

  const abrirAviso = async (id: string, enlace: string | null) => {
    setCampana(false)
    await marcarLeidas([id])
    void recargar()
    if (enlace) ir(parseRuta(enlace).seccion, parseRuta(enlace).id)
  }

  const barraSuperior = (
    <div className="c-barra flex min-h-[56px] items-center gap-3 px-4">
      <img src="/brand/logo-oficial.png" alt="" className="h-9 w-9 rounded-[var(--w-r-md)] object-cover" />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-body-lg)' }}>RestaurantOS Central</p>
        <p className="m-0 truncate text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{actual?.etiqueta}</p>
      </div>
      <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-[var(--w-r-pill)] px-2.5 py-1 text-[length:var(--w-fs-caption)] font-semibold',
        enVivo === 'en_vivo' ? 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]' : 'bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]')}>
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full bg-current', enVivo !== 'en_vivo' && 'animate-pulse')} />
        {enVivo === 'en_vivo' ? 'En vivo' : enVivo === 'conectando' ? 'Conectando…' : 'Reconectando…'}
      </span>
      <span className="hidden items-center gap-1.5 rounded-[var(--w-r-pill)] bg-[var(--w-success-bg)] px-3 py-1.5 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-success-text)] sm:inline-flex">
        <Icono nombre="candado" size={14} />Acceso verificado · 2 pasos
      </span>
      <button type="button" onClick={() => setCampana(true)} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--w-text-2)] hover:bg-[var(--w-surface-sunken)]" aria-label={`Avisos${noLeidas.length ? `, ${noLeidas.length} sin leer` : ''}`}>
        <Icono nombre="campana" />
        {noLeidas.length > 0 && <span className="absolute right-1 top-1 inline-flex min-w-[18px] justify-center rounded-full bg-[var(--w-accent)] px-1 text-[11px] font-bold text-[color:var(--w-on-accent)]">{noLeidas.length}</span>}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen">
      <div className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-10">{barraSuperior}</div>
        <main className={cn(completa ? 'p-0' : 'mx-auto w-full max-w-6xl p-4 lg:p-6', 'pb-40')}>{contenido}</main>
      </div>

      {/* Píldora de navegación inferior: la misma en celular y en escritorio (centrada y angosta en pantallas grandes) */}
      <nav className="fixed inset-x-3 bottom-3 z-20 mx-auto max-w-[560px]" aria-label="Menú de Central">
        <GlassPanel className="c-pildora flex items-stretch justify-between gap-1 !p-1.5">
          {SECCIONES.filter(s => s.principal).map(s => (
            <Enlace key={s.id} a={s.id} aria-current={ruta.seccion === s.id ? 'page' : undefined}
              className={cn('c-nav relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--w-r-lg)] text-[11px] font-semibold',
                ruta.seccion === s.id ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'text-[color:var(--w-text-2)]')}>
              <Icono nombre={s.icono} size={22} />{s.etiqueta}
              {cuenta(s.id) > 0 && <span className="absolute right-3 top-1 rounded-full bg-[var(--w-danger)] px-1 text-[10px] font-bold text-white">{cuenta(s.id)}</span>}
            </Enlace>
          ))}
          <button type="button" onClick={() => setMas(true)} className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--w-r-lg)] text-[11px] font-semibold text-[color:var(--w-text-2)]">
            <Icono nombre="mas" size={22} />Más
          </button>
        </GlassPanel>
      </nav>

      {/* Resti: asistente personal, siempre a mano */}
      <button type="button" onClick={() => setResti(true)} aria-label="Hablar con Resti"
        className="fixed bottom-[96px] right-3 z-20 flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full border border-[var(--w-glass-border)] shadow-[var(--w-shadow-lg)]"
        style={{ background: 'var(--w-glass-bg)', backdropFilter: 'blur(var(--w-glass-blur))' }}>
        <RestiSprite estado="saludo" width={52} />
      </button>

      <Modal open={mas} onClose={() => setMas(false)} title="Más secciones">
        <div className="grid grid-cols-2 gap-2">
          {SECCIONES.filter(s => !s.principal).map(s => (
            <Enlace key={s.id} a={s.id} onClick={() => setMas(false)} className={itemNav(ruta.seccion === s.id)}><Icono nombre={s.icono} size={20} />{s.etiqueta}</Enlace>
          ))}
          <a href="/" className={itemNav(false)}><Icono nombre="atras" size={20} />Plataforma</a>
        </div>
      </Modal>

      <Modal open={campana} onClose={() => setCampana(false)} title="Avisos"
        footer={noLeidas.length > 0 ? <Button variant="secondary" onClick={async () => { await marcarLeidas(noLeidas.map(n => n.id)); void recargar() }}>Marcar todo como leído</Button> : undefined}>
        {datos.notificaciones.length === 0
          ? <StatePanel kind="empty" title="Sin avisos" text="Aquí llegarán las aprobaciones pendientes y las tareas urgentes." />
          : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {datos.notificaciones.slice(0, 30).map(n => (
                <li key={n.id}>
                  <button type="button" onClick={() => void abrirAviso(n.id, n.enlace)} className="flex min-h-[56px] w-full flex-col items-start gap-0.5 rounded-[var(--w-r-md)] px-3 py-2 text-left hover:bg-[var(--w-surface-sunken)]">
                    <span className={cn('text-[length:var(--w-fs-body)] text-[color:var(--w-text)]', !n.leida && 'font-bold')}>
                      {n.severidad === 'critica' ? '🔴 ' : n.severidad === 'importante' ? '🟠 ' : ''}{n.titulo}
                    </span>
                    <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hace(n.created_at)}{n.detalle ? ` · ${n.detalle}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Modal>

      <RestiPanel open={resti} onClose={() => setResti(false)} />
    </div>
  )
}
