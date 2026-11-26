/**
 * Crecimiento.tsx — Fase 1 del plan de crecimiento: fuente de verdad (qué se puede ofrecer), autorizaciones de campaña y lista de "no contactar".
 * Esta pantalla SOLO guarda reglas y permisos: todavía no contacta a nadie ni publica. La base hace cumplir los requisitos.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { activarAutorizacion, agregarNoContactar, crearCampana, guardarFuncion, revocarAutorizacion, textoError, type EstadoFuncion } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, Pagina, TituloBloque } from '../ui.tsx'
import { TrabajoAgentes } from './TrabajoAgentes.tsx'
import { Propuestas } from './Propuestas.tsx'
import { ConexionGoogle } from './ConexionGoogle.tsx'
import { PlanSemanal } from './PlanSemanal.tsx'
import { pedirAlTrabajador } from '../acciones.ts'

interface Funcion { id: string; nombre: string; area: string; estado: EstadoFuncion; limitaciones: string; evidencia: string; verificado_en: string | null }
interface Autorizacion { id: string; tipo: string; nombre: string; alcance: Record<string, unknown>; estado: string; vigente_hasta: string | null; revocada_motivo: string | null }
interface Supresion { id: number; canal: string; valor_norm: string; motivo: string; created_at: string }

const ETQ: Record<EstadoFuncion, string> = { produccion: 'En producción', parcial: 'Parcial', desarrollo: 'En desarrollo', planeada: 'Planeada', no_existe: 'No existe', sin_verificar: 'Sin verificar' }
const TONO: Record<EstadoFuncion, Tone> = { produccion: 'success', parcial: 'warning', desarrollo: 'info', planeada: 'neutral', no_existe: 'danger', sin_verificar: 'neutral' }
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** Carga una tabla de solo lectura; `recargar` la vuelve a pedir tras una acción. */
function useFilas<T>(tabla: string, orden: string, ascendente = true) {
  const [filas, setFilas] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const { data, error: e } = await supabase.from(tabla).select('*').order(orden, { ascending: ascendente })
    if (e) setError(textoError(e)); else { setError(null); setFilas((data ?? []) as T[]) }
  }, [tabla, orden, ascendente])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo([tabla], recargar)
  return { filas, error, recargar }
}

/** Ejecuta una acción, muestra su error y recarga la tabla si salió bien. */
function useHacer(recargar: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hacer = async (fn: () => Promise<string | null>) => {
    setOcupado(true); setError(null)
    const e = await fn()
    setOcupado(false); setError(e)
    if (!e) await recargar()
    return e === null
  }
  return { ocupado, error, hacer }
}

function FilaFuncion({ f, recargar }: { f: Funcion; recargar: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<EstadoFuncion>(f.estado)
  const [evidencia, setEvidencia] = useState(f.evidencia)
  const [limitaciones, setLimitaciones] = useState(f.limitaciones)
  const { ocupado, error, hacer } = useHacer(recargar)
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">{f.nombre}</p>
        <Badge tone={TONO[f.estado]}>{ETQ[f.estado]}</Badge>
      </div>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{f.area}{f.verificado_en ? ` · verificado ${fecha(f.verificado_en)}` : ''}</p>
      {f.limitaciones && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{f.limitaciones}</p>}
      {f.evidencia && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Evidencia: {f.evidencia}</p>}
      {!abierto ? <div><Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>Actualizar</Button></div> : (
        <div className="flex flex-col gap-2">
          <Select label="Estado" value={estado} onChange={e => setEstado(e.target.value as EstadoFuncion)}>
            {(Object.keys(ETQ) as EstadoFuncion[]).map(k => <option key={k} value={k}>{ETQ[k]}</option>)}
          </Select>
          <Textarea label="Evidencia (obligatoria si está en producción o parcial)" value={evidencia} onChange={e => setEvidencia(e.target.value)} rows={2} maxLength={1000} />
          <Textarea label="Limitaciones (qué NO se debe prometer)" value={limitaciones} onChange={e => setLimitaciones(e.target.value)} rows={2} maxLength={1000} />
          <ErrorAccion texto={error} />
          <div className="flex gap-2">
            <Button size="sm" loading={ocupado} onClick={() => void hacer(() => guardarFuncion(f.id, { estado, evidencia, limitaciones })).then(ok => ok && setAbierto(false))}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SincronizarFunciones({ recargar }: { recargar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const correr = async () => {
    setOcupado(true); setMsg(null); setErr(null)
    const r = await pedirAlTrabajador('sincronizar_funciones')
    setOcupado(false)
    if (r.ok === true && r.datos.funciones) { const f = r.datos.funciones; setMsg(`Revisé ${f.total} funciones del código: ${f.nuevas} nueva(s), ${f.actualizadas} actualizada(s), ${f.bajadas} que ya no aparecen, ${f.reverificar} para volver a verificar.`); await recargar() }
    else setErr(r.ok === true ? 'Respuesta inesperada.' : r.mensaje)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">La lista se compara con el código de la app. Lo nuevo entra como "Parcial". Nada pasa a "En producción" sin que tú lo verifiques.</p>
      <div><Button size="sm" variant="secondary" loading={ocupado} onClick={() => void correr()}>Actualizar desde el código</Button></div>
      {msg && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">{msg}</p>}
      <ErrorAccion texto={err} />
    </div>
  )
}

function Funciones() {
  const { filas, error, recargar } = useFilas<Funcion>('growth_funciones', 'nombre')
  const verificadas = filas?.filter(f => f.estado !== 'sin_verificar').length ?? 0
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Qué se puede ofrecer (fuente de verdad)</TituloBloque>
      <AvisoHonesto tono="warning">Los agentes solo deben ofrecer lo que aparece "En producción" con evidencia. Lo que dice "Sin verificar" no se promete a nadie hasta revisarlo.</AvisoHonesto>
      <SincronizarFunciones recargar={recargar} />
      {error && <ErrorAccion texto={error} />}
      {!filas ? <StatePanel kind="loading" title="Cargando…" /> : (
        <>
          <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{verificadas} de {filas.length} funciones con estado verificado.</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{filas.map(f => <FilaFuncion key={f.id} f={f} recargar={recargar} />)}</div>
        </>
      )}
    </div>
  )
}

function TarjetaAutorizacion({ a, recargar }: { a: Autorizacion; recargar: () => Promise<void> }) {
  const { ocupado, error, hacer } = useHacer(recargar)
  const [dias, setDias] = useState('14')
  const vencida = a.estado === 'vigente' && a.vigente_hasta !== null && new Date(a.vigente_hasta) <= new Date()
  const estado = vencida ? 'vencida' : a.estado
  const tono: Tone = estado === 'vigente' ? 'success' : estado === 'borrador' ? 'neutral' : 'danger'
  const al = a.alcance as Record<string, string | number | string[]>
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">{a.nombre}</p><Badge tone={tono}>{estado}</Badge></div>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{String(al.objetivo ?? '')} · {String(al.ciudad ?? '')} · {String(al.segmento ?? '')} · hasta {al.max_prospectos} prospectos, {al.max_contactos_por_prospecto} contactos por prospecto · descuentos: {String(al.descuentos_permitidos ?? '—')}</p>
      {a.vigente_hasta && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Vence: {fecha(a.vigente_hasta)}</p>}
      {a.revocada_motivo && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Motivo de cierre: {a.revocada_motivo}</p>}
      <ErrorAccion texto={error} />
      <div className="flex flex-wrap items-end gap-2">
        {a.estado === 'borrador' && (<>
          <div className="w-28"><Input label="Vigencia (días)" type="number" min={1} max={90} value={dias} onChange={e => setDias(e.target.value)} /></div>
          <Button size="sm" loading={ocupado} onClick={() => void hacer(() => activarAutorizacion(a.id, Math.min(90, Math.max(1, Number(dias) || 14))))}>Activar</Button>
        </>)}
        {(a.estado === 'borrador' || (a.estado === 'vigente' && !vencida)) && (
          <Button size="sm" variant="secondary" loading={ocupado} onClick={() => { if (window.confirm('¿Revocar esta autorización? Todo lo que dependa de ella se detiene de inmediato.')) void hacer(() => revocarAutorizacion(a.id, 'Revocada a mano desde Central')) }}>Revocar</Button>
        )}
      </div>
    </Card>
  )
}

function Autorizaciones() {
  const { filas, error, recargar } = useFilas<Autorizacion>('growth_autorizaciones', 'created_at', false)
  const { ocupado, error: errForm, hacer } = useHacer(recargar)
  const [f, setF] = useState({ nombre: '', objetivo: 'Conseguir demostraciones con restaurantes', ciudad: 'Armenia y alrededores', segmento: '', max: '30' })
  const campo = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Autorizaciones de campaña</TituloBloque>
      <AvisoHonesto>Antes de contactar a un prospecto debe existir una campaña activa con tu aprobación. Se puede revocar en cualquier momento. Central no hace envíos automáticos: activar una campaña no manda nada.</AvisoHonesto>
      {error && <ErrorAccion texto={error} />}
      {filas?.map(a => <TarjetaAutorizacion key={a.id} a={a} recargar={recargar} />)}
      {filas && filas.length === 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay campañas.</p>}
      <Card className="flex flex-col gap-2">
        <p className="m-0 font-bold text-[color:var(--w-text)]">Nueva campaña (queda como borrador)</p>
        <Input label="Nombre" value={f.nombre} onChange={campo('nombre')} maxLength={120} />
        <Input label="Objetivo" value={f.objetivo} onChange={campo('objetivo')} maxLength={200} />
        <Input label="Ciudad o zona" value={f.ciudad} onChange={campo('ciudad')} maxLength={120} />
        <Input label="Segmento (ej. cafeterías, pizzerías)" value={f.segmento} onChange={campo('segmento')} maxLength={120} />
        <Input label="Máximo de prospectos" type="number" min={1} max={500} value={f.max} onChange={campo('max')} />
        <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Reglas predeterminadas: correo, máximo 3 contactos por prospecto, lunes a sábado en horario laboral (Bogotá), planes Esencial y Pro, sin descuentos, seguimiento cada 3 días (máx. 2), excluye clientes actuales y la lista de no contactar.</p>
        <ErrorAccion texto={errForm} />
        <div><Button size="sm" loading={ocupado} disabled={f.nombre.trim().length < 3 || f.segmento.trim().length < 2}
          onClick={() => void hacer(() => crearCampana({ nombre: f.nombre, objetivo: f.objetivo, ciudad: f.ciudad, segmento: f.segmento, max_prospectos: Math.min(500, Math.max(1, Number(f.max) || 30)) })).then(ok => ok && setF(p => ({ ...p, nombre: '', segmento: '' })))}>Guardar borrador</Button></div>
      </Card>
    </div>
  )
}

function NoContactar() {
  const { filas, error, recargar } = useFilas<Supresion>('growth_supresion', 'created_at', false)
  const { ocupado, error: errForm, hacer } = useHacer(recargar)
  const [canal, setCanal] = useState<'correo' | 'whatsapp' | 'telefono' | 'redes'>('correo')
  const [valor, setValor] = useState('')
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>No contactar</TituloBloque>
      <AvisoHonesto>Quien pida la baja queda aquí y nadie le vuelve a escribir. La lista solo se agrega: no se edita ni se borra.</AvisoHonesto>
      {error && <ErrorAccion texto={error} />}
      <Card className="flex flex-col gap-2">
        <Select label="Canal" value={canal} onChange={e => setCanal(e.target.value as typeof canal)}>
          <option value="correo">Correo</option><option value="whatsapp">WhatsApp</option><option value="telefono">Teléfono</option><option value="redes">Redes</option>
        </Select>
        <Input label="Correo, número o usuario" value={valor} onChange={e => setValor(e.target.value)} maxLength={200} />
        <ErrorAccion texto={errForm} />
        <div><Button size="sm" loading={ocupado} disabled={valor.trim().length < 3} onClick={() => void hacer(() => agregarNoContactar(canal, valor, 'manual')).then(ok => ok && setValor(''))}>Agregar a la lista</Button></div>
      </Card>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{filas ? `${filas.length} contacto(s) en la lista.` : 'Cargando…'}</p>
      {filas && filas.slice(0, 30).map(s => <p key={s.id} className="m-0 truncate text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{s.canal} · {s.valor_norm} · {s.motivo.replace('_', ' ')} · {fecha(s.created_at)}</p>)}
    </div>
  )
}

export function Crecimiento() {
  return (
    <Pagina titulo="Crecimiento" subtitulo="Reglas y permisos antes de vender: qué se puede ofrecer, a quién se puede contactar y con qué autorización.">
      <AvisoHonesto tono="warning">Central no envía correos ni publica por sí sola: nadie contacta a un prospecto sin que tú lo hagas. Los agentes investigan, redactan borradores y proponen.</AvisoHonesto>
      <Funciones />
      <Autorizaciones />
      <PlanSemanal />
      <Propuestas />
      <ConexionGoogle />
      <TrabajoAgentes />
      <NoContactar />
    </Pagina>
  )
}
