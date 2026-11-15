/**
 * Mundo.tsx — el globo con tus restaurantes. Un punto por restaurante que TÚ ubicaste (eligiendo su ciudad); el color sale de su
 * estado real (pedidos de hoy, suscripción, activo). Los restaurantes sin ubicación no se dibujan: se listan aparte.
 * "Puntos de demostración" es opcional, está apagado por defecto y siempre se rotula como demostración. Si el equipo no puede con
 * 3D (o el navegador pausa el contexto) se muestra el mismo mapa en plano. Aquí no se suspende ni se cambia ninguna licencia.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { StatePanel } from '../../components/ui/StatePanel'
import { cn } from '../../lib/cn'
import { formatCOP } from '../../config/billing'
import { crearTarea, guardarUbicacion, quitarUbicacion } from '../acciones.ts'
import type { RestauranteCentral } from '../catalogo.ts'
import { CIUDADES } from '../ciudades.ts'
import { useCentral } from '../datos.tsx'
import { webglDisponible, type PreferenciaCalidad } from '../3d/calidad.ts'
import type { Marcador } from '../3d/GloboEscena.ts'
import { COLUMNAS, FILAS, esTierra } from '../3d/tierra.ts'
import { AvisoHonesto, ErrorAccion, Punto, TituloBloque, useAccion, useEscritorio } from '../ui.tsx'

const Globo3D = lazy(() => import('../3d/Globo3D'))

const ESTADOS = {
  pedidos: { color: '#22C55E', texto: 'Con pedidos hoy' },
  sin_pedidos: { color: '#38BDF8', texto: 'Activo, sin pedidos hoy' },
  suscripcion: { color: '#F59E0B', texto: 'Suscripción por revisar' },
  inactivo: { color: '#9CA3AF', texto: 'Inactivo' },
} as const
type EstadoId = keyof typeof ESTADOS

export function estadoDe(r: RestauranteCentral): EstadoId {
  if (!r.activo) return 'inactivo'
  if (r.suscripcion !== 'active') return 'suscripcion'
  return r.pedidos_hoy > 0 ? 'pedidos' : 'sin_pedidos'
}

// Puntos de demostración: lugares reales del mundo, sin datos de restaurantes. Solo sirven para ver cómo luce el globo.
const DEMO = ['Armenia', 'Bogotá', 'Ciudad de México', 'Madrid', 'Miami'].map(n => CIUDADES.find(c => c.nombre === n)).filter((c): c is NonNullable<typeof c> => !!c)
const idDemo = (nombre: string) => `demo:${nombre}`

interface Punto3 { id: string; lat: number; lng: number; r: RestauranteCentral | null; demoNombre?: string }

function MapaPlano({ puntos, seleccion, onSeleccion }: { puntos: Marcador[]; seleccion: string | null; onSeleccion: (id: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = lienzo.current; const g = c?.getContext('2d'); if (!c || !g) return
    c.width = COLUMNAS; c.height = FILAS
    g.fillStyle = '#0A1530'; g.fillRect(0, 0, COLUMNAS, FILAS)
    g.fillStyle = '#6F93C9'
    for (let f = 0; f < FILAS; f++) for (let k = 0; k < COLUMNAS; k++) if (esTierra(f, k)) g.fillRect(k, f, 1, 1)
  }, [])
  return (
    <div className="relative mx-auto aspect-[2/1] w-full max-w-[1100px] overflow-hidden rounded-[var(--w-r-lg)] border border-[var(--w-border)]" role="group" aria-label="Mapa plano con los restaurantes ubicados">
      <canvas ref={lienzo} className="block h-full w-full" style={{ imageRendering: 'pixelated' }} aria-hidden />
      {puntos.map(m => (
        <button key={m.id} type="button" onClick={() => onSeleccion(seleccion === m.id ? null : m.id)} aria-pressed={seleccion === m.id}
          aria-label={m.demo ? `Punto de demostración ${m.id.slice(5)}` : `Restaurante en el mapa ${m.id}`}
          className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{ left: `${((m.lng + 180) / 360) * 100}%`, top: `${((90 - m.lat) / 180) * 100}%` }}>
          <span className={cn('block rounded-full border-2', seleccion === m.id ? 'h-4 w-4' : 'h-2.5 w-2.5', m.demo && 'border-dashed bg-transparent')} style={{ background: m.demo ? 'transparent' : m.color, borderColor: m.color }} />
        </button>
      ))}
    </div>
  )
}

function SelectorCiudad({ onElegir, ocupado, etiqueta }: { onElegir: (i: number) => void; ocupado: boolean; etiqueta: string }) {
  const [i, setI] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={i} onChange={e => setI(e.target.value)} aria-label={etiqueta}
        className="min-h-[44px] min-w-0 flex-1 rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">
        <option value="">Elige una ciudad…</option>
        {CIUDADES.map((c, k) => <option key={`${c.nombre}-${c.pais}`} value={k}>{c.nombre}, {c.pais}</option>)}
      </select>
      <Button size="sm" disabled={i === '' || ocupado} onClick={() => onElegir(Number(i))}>Guardar</Button>
    </div>
  )
}

export function Mundo() {
  const { datos } = useCentral()
  const escritorio = useEscritorio()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [sel, setSel] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [giro, setGiro] = useState(true)
  const [vista, setVista] = useState<'3d' | 'plano'>('3d')
  const [fallo, setFallo] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [enfoque, setEnfoque] = useState<{ lat: number; lng: number; n: number } | null>(null)
  const [avisoTarea, setAvisoTarea] = useState<string | null>(null)
  const soportaWebgl = useMemo(() => webglDisponible(), [])
  const calidad = (typeof datos.config.calidad_grafica === 'string' ? datos.config.calidad_grafica : 'auto') as PreferenciaCalidad

  const ubicados = useMemo<Punto3[]>(() => datos.restaurantes.flatMap(r => {
    const u = datos.ubicaciones.find(x => x.restaurante_id === r.id)
    const lat = Number(r.lat ?? u?.lat), lng = Number(r.lng ?? u?.lng)
    return Number.isFinite(lat) && Number.isFinite(lng) && (r.lat != null || u) ? [{ id: r.id, lat, lng, r }] : []
  }), [datos.restaurantes, datos.ubicaciones])
  const sinUbicar = useMemo(() => datos.restaurantes.filter(r => !ubicados.some(p => p.id === r.id)), [datos.restaurantes, ubicados])
  const puntos = useMemo<Punto3[]>(() => [...ubicados, ...(demo ? DEMO.map(c => ({ id: idDemo(c.nombre), lat: c.lat, lng: c.lng, r: null, demoNombre: c.nombre })) : [])], [ubicados, demo])
  const marcadores = useMemo<Marcador[]>(() => puntos.map(p => p.r
    ? { id: p.id, lat: p.lat, lng: p.lng, color: ESTADOS[estadoDe(p.r)].color, pulso: estadoDe(p.r) === 'pedidos', demo: false }
    : { id: p.id, lat: p.lat, lng: p.lng, color: '#C7D2FE', pulso: false, demo: true }), [puntos])

  const elegido = puntos.find(p => p.id === sel) ?? null
  const en3d = vista === '3d' && soportaWebgl && !fallo
  const elegir = (id: string | null) => { setSel(id); limpiar(); setAvisoTarea(null); const p = puntos.find(x => x.id === id); if (p) setEnfoque(e => ({ lat: p.lat, lng: p.lng, n: (e?.n ?? 0) + 1 })) }
  const ubicar = (r: RestauranteCentral, i: number) => ejecutar(() => guardarUbicacion(r.id, CIUDADES[i]))
  const tarea = async (r: RestauranteCentral) => {
    const ok = await ejecutar(() => crearTarea({ titulo: `Revisar ${r.nombre}`, descripcion: `Tarea creada desde el mundo (solo lectura). Estado: ${ESTADOS[estadoDe(r)].texto}.`, prioridad: 'P3', nivel_requerido: 'N0' }))
    if (ok) setAvisoTarea('Tarea creada. La encuentras en Tareas.')
  }

  const lista = (
    <div className="flex flex-col gap-2">
      <TituloBloque>Estado de los restaurantes</TituloBloque>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{(Object.keys(ESTADOS) as EstadoId[]).map(k => <li key={k} className="flex items-center gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><Punto color={ESTADOS[k].color} />{ESTADOS[k].texto} <b>({ubicados.filter(p => p.r && estadoDe(p.r) === k).length})</b></li>)}</ul>
    </div>
  )

  const ficha = elegido?.r ? (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-start gap-2"><Punto color={ESTADOS[estadoDe(elegido.r)].color} size={12} /><TituloBloque>{elegido.r.nombre}</TituloBloque></div>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{elegido.r.ciudad ?? datos.ubicaciones.find(u => u.restaurante_id === elegido.id)?.ciudad ?? 'Ciudad sin nombre'}{elegido.r.pais ? ` · ${elegido.r.pais}` : ''}</p>
      <div className="flex flex-wrap gap-2"><Badge tone={estadoDe(elegido.r) === 'inactivo' ? 'neutral' : estadoDe(elegido.r) === 'suscripcion' ? 'warning' : 'success'}>{ESTADOS[estadoDe(elegido.r)].texto}</Badge>{elegido.r.plan && <Badge tone="info">Plan {elegido.r.plan}</Badge>}</div>
      <dl className="m-0 grid grid-cols-2 gap-2 text-[length:var(--w-fs-label)]">
        <div><dt className="text-[color:var(--w-text-3)]">Pedidos hoy</dt><dd className="m-0 font-bold text-[color:var(--w-text)]">{elegido.r.pedidos_hoy}</dd></div>
        <div><dt className="text-[color:var(--w-text-3)]">Cobrado hoy</dt><dd className="m-0 font-bold text-[color:var(--w-text)]">{formatCOP(Number(elegido.r.cobrado_hoy) || 0)}</dd></div>
        <div><dt className="text-[color:var(--w-text-3)]">Suscripción</dt><dd className="m-0 text-[color:var(--w-text)]">{elegido.r.suscripcion ?? 'Sin dato'}</dd></div>
      </dl>
      <Button variant="secondary" disabled={ocupado} onClick={() => void tarea(elegido.r as RestauranteCentral)}>Crear tarea de revisión</Button>
      {avisoTarea && <p role="status" className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-success-text)]">✓ {avisoTarea}</p>}
      <div className="flex flex-col gap-1.5"><p className="m-0 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-3)]">Cambiar ubicación</p>
        <SelectorCiudad etiqueta="Ciudad del restaurante" ocupado={ocupado} onElegir={i => void ubicar(elegido.r as RestauranteCentral, i)} />
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void ejecutar(() => quitarUbicacion(elegido.id)).then(ok => { if (ok) setSel(null) })}>Quitar del mapa</Button>
      </div>
      <AvisoHonesto>Aquí solo se mira. Suspender o cambiar la licencia de un restaurante es una acción solo humana y todavía no está en Central.</AvisoHonesto>
      <ErrorAccion texto={error} />
    </div>
  ) : elegido ? (
    <div className="flex flex-col gap-2"><TituloBloque>Demostración · {elegido.demoNombre}</TituloBloque><AvisoHonesto>Es un punto de demostración local: <b>no es un restaurante</b>. Apágalo con «Puntos de demostración».</AvisoHonesto></div>
  ) : (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Toca un punto para ver el restaurante. Arrastra para girar el globo.</p>
      {lista}
    </div>
  )

  return (
    <div className={cn('flex flex-col', escritorio && 'h-[calc(100vh-56px)] flex-row')}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--w-border)] p-3">
          <div className="inline-flex gap-1" role="group" aria-label="Vista">
            {(['3d', 'plano'] as const).map(v => <button key={v} type="button" aria-pressed={vista === v} onClick={() => { setVista(v); setFallo(null) }}
              className={cn('inline-flex min-h-[40px] items-center rounded-[var(--w-r-pill)] px-3.5 font-semibold text-[length:var(--w-fs-label)]', vista === v ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'border border-[var(--w-border-strong)] bg-[var(--w-surface)] text-[color:var(--w-text-2)]')}>{v === '3d' ? 'Globo 3D' : 'Mapa plano'}</button>)}
          </div>
          {en3d && <button type="button" aria-pressed={giro} onClick={() => setGiro(g => !g)} className="inline-flex min-h-[40px] items-center rounded-[var(--w-r-pill)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3.5 font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Giro automático: {giro ? 'sí' : 'no'}</button>}
          <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><input type="checkbox" checked={demo} onChange={e => { setDemo(e.target.checked); if (!e.target.checked && sel?.startsWith('demo:')) setSel(null) }} className="h-5 w-5" />Puntos de demostración</label>
        </div>
        {(vista === '3d' && (!soportaWebgl || fallo)) && (
          <div className="p-3"><AvisoHonesto tono="warning">{!soportaWebgl ? 'Este equipo o navegador no puede mostrar 3D.' : fallo} Se muestra el mapa plano, con lo mismo.{' '}
            {soportaWebgl && <Button size="sm" variant="secondary" onClick={() => { setFallo(null); setIntento(n => n + 1) }}>Reintentar 3D</Button>}</AvisoHonesto></div>
        )}
        {demo && <div className="px-3 pt-3"><AvisoHonesto>Los puntos con borde punteado son <b>demostración local</b>, no restaurantes.</AvisoHonesto></div>}
        <div className={cn('relative min-h-[340px] flex-1 overflow-hidden bg-[var(--w-bg-2)]', !escritorio && 'h-[55vh] flex-none')}>
          {en3d ? (
            <Suspense fallback={<StatePanel kind="loading" title="Cargando el globo…" />}>
              <Globo3D key={intento} marcadores={marcadores} seleccion={sel} enfoque={enfoque} giro={giro && !sel} calidad={calidad} onSeleccion={elegir} onFallo={setFallo} />
            </Suspense>
          ) : <div className="flex h-full items-center p-3"><MapaPlano puntos={marcadores} seleccion={sel} onSeleccion={elegir} /></div>}
          {datos.restaurantes.length === 0 && <p className="pointer-events-none absolute inset-x-0 bottom-3 m-0 text-center text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aún no hay restaurantes para mostrar.</p>}
        </div>
      </div>
      <aside className={cn('shrink-0 overflow-y-auto border-[var(--w-border)] bg-[var(--w-surface)] p-4', escritorio ? 'w-[360px] border-l' : 'border-t pb-28')} aria-label="Ficha del restaurante">
        {ficha}
        {sinUbicar.length > 0 && (
          <div className="mt-5 flex flex-col gap-2 border-t border-[var(--w-border)] pt-4">
            <TituloBloque>Sin ubicación ({sinUbicar.length})</TituloBloque>
            <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">No se dibujan hasta que elijas su ciudad.</p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">{sinUbicar.map(r => <li key={r.id} className="flex flex-col gap-1.5"><span className="font-semibold text-[color:var(--w-text)]">{r.nombre}</span><SelectorCiudad etiqueta={`Ciudad de ${r.nombre}`} ocupado={ocupado} onElegir={i => void ubicar(r, i)} /></li>)}</ul>
          </div>
        )}
      </aside>
    </div>
  )
}
