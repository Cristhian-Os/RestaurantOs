/**
 * Agenda.tsx — Fase 3: agenda comercial INTERNA (citas con prospectos). No hay calendario externo conectado ni se avisa a nadie.
 * Una cita solo se confirma con fecha futura y constancia de cómo/cuándo la aceptó el prospecto; la base lo hace cumplir.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { actualizarCita, crearCita, textoError, type EstadoCita, type TipoCita } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, Pagina, TituloBloque } from '../ui.tsx'

interface Cita {
  id: string; prospecto_id: string; tipo: TipoCita; estado: EstadoCita; fecha_hora: string | null; canal: string; contacto: string; aceptacion: string; resultado: string
  growth_prospectos: { nombre_comercial: string; es_ficticio: boolean } | null
}
interface P { id: string; nombre_comercial: string; es_ficticio: boolean }
const TONO: Record<EstadoCita, Tone> = { propuesta: 'neutral', confirmada: 'info', realizada: 'success', cancelada: 'danger', no_asistio: 'warning' }
const ETQ: Record<EstadoCita, string> = { propuesta: 'Propuesta', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió' }
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Sin fecha')

function FilaCita({ c, recargar }: { c: Cita; recargar: () => Promise<void> }) {
  const [modo, setModo] = useState<null | 'confirmar' | 'realizada'>(null)
  const [fecha, setFecha] = useState('')
  const [acept, setAcept] = useState('')
  const [res, setRes] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hacer = async (cambios: Parameters<typeof actualizarCita>[1]) => {
    setOcupado(true); setError(null)
    const e = await actualizarCita(c.id, cambios)
    setOcupado(false); setError(e)
    if (!e) { setModo(null); await recargar() }
  }
  const abierta = c.estado === 'propuesta' || c.estado === 'confirmada'
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">{c.growth_prospectos?.nombre_comercial ?? 'Prospecto'}</p>
        {c.growth_prospectos?.es_ficticio && <Badge tone="warning">Ejemplo</Badge>}
        <Badge tone={TONO[c.estado]}>{ETQ[c.estado]}</Badge>
      </div>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{c.tipo} · {c.canal} · {cuando(c.fecha_hora)}{c.contacto ? ` · ${c.contacto}` : ''}</p>
      {c.aceptacion && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Aceptó: {c.aceptacion}</p>}
      {c.resultado && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Resultado: {c.resultado}</p>}
      {modo === 'confirmar' && (<>
        <Input label="Fecha y hora que el prospecto aceptó" type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />
        <Input label="¿Cómo y cuándo aceptó?" value={acept} onChange={e => setAcept(e.target.value)} maxLength={300} hint='Ej. "respondió por WhatsApp el 20 nov"' />
      </>)}
      {modo === 'realizada' && <Textarea label="Resultado de la cita" value={res} onChange={e => setRes(e.target.value)} rows={3} maxLength={2000} />}
      <ErrorAccion texto={error} />
      {abierta && (
        <div className="flex flex-wrap gap-2">
          {modo === null && c.estado === 'propuesta' && <Button size="sm" onClick={() => setModo('confirmar')}>Confirmar</Button>}
          {modo === null && c.estado === 'confirmada' && <Button size="sm" onClick={() => setModo('realizada')}>Marcar realizada</Button>}
          {modo === 'confirmar' && <Button size="sm" loading={ocupado} disabled={!fecha || acept.trim().length < 3} onClick={() => void hacer({ estado: 'confirmada', fecha_hora: new Date(fecha).toISOString(), aceptacion: acept })}>Guardar confirmación</Button>}
          {modo === 'realizada' && <Button size="sm" loading={ocupado} disabled={res.trim().length < 3} onClick={() => void hacer({ estado: 'realizada', resultado: res })}>Guardar</Button>}
          {modo !== null && <Button size="sm" variant="ghost" onClick={() => setModo(null)}>Cancelar</Button>}
          {modo === null && c.estado === 'confirmada' && <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void hacer({ estado: 'no_asistio' })}>No asistió</Button>}
          {modo === null && <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void hacer({ estado: 'cancelada' })}>Cancelar cita</Button>}
        </div>
      )}
    </Card>
  )
}

export function Agenda() {
  const [citas, setCitas] = useState<Cita[] | null>(null)
  const [ps, setPs] = useState<P[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  const [f, setF] = useState({ prospecto: '', tipo: 'demostracion' as TipoCita, canal: 'telefono', contacto: '' })
  const [ocupado, setOcupado] = useState(false)
  const [errAccion, setErrAccion] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('growth_citas').select('*, growth_prospectos(nombre_comercial, es_ficticio)').order('fecha_hora', { ascending: true, nullsFirst: false }),
      supabase.from('growth_prospectos').select('id, nombre_comercial, es_ficticio').not('etapa', 'in', '(perdido,no_contactar)').order('nombre_comercial'),
    ])
    if (a.error) setError(textoError(a.error)); else { setError(null); setCitas((a.data ?? []) as unknown as Cita[]) }
    setPs((b.data ?? []) as P[])
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo(['growth_citas', 'growth_prospectos'], recargar)
  const crear = async () => {
    setOcupado(true); setErrAccion(null)
    const e = await crearCita({ prospecto_id: f.prospecto, tipo: f.tipo, canal: f.canal, contacto: f.contacto })
    setOcupado(false); setErrAccion(e)
    if (!e) { setNueva(false); setF(x => ({ ...x, prospecto: '', contacto: '' })); await recargar() }
  }
  const abiertas = (citas ?? []).filter(c => c.estado === 'propuesta' || c.estado === 'confirmada')
  const cerradas = (citas ?? []).filter(c => !abiertas.includes(c))
  return (
    <Pagina titulo="Agenda comercial" subtitulo="Llamadas y demostraciones con prospectos.">
      <AvisoHonesto tono="warning">Es una agenda interna: no hay calendario externo conectado y no se avisa a nadie. Una cita solo se confirma cuando el prospecto ya la aceptó, y lo dejas por escrito.</AvisoHonesto>
      {error && <ErrorAccion texto={error} />}
      {!citas ? <StatePanel kind="loading" title="Cargando…" /> : (<>
        <div><Button size="sm" onClick={() => setNueva(v => !v)}>{nueva ? 'Cerrar' : 'Nueva cita'}</Button></div>
        {nueva && (
          <Card className="flex flex-col gap-2">
            <Select label="Prospecto" value={f.prospecto} onChange={e => setF(x => ({ ...x, prospecto: e.target.value }))}>
              <option value="">— elige —</option>{ps.map(p => <option key={p.id} value={p.id}>{p.nombre_comercial}{p.es_ficticio ? ' (ejemplo)' : ''}</option>)}
            </Select>
            <Select label="Tipo" value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value as TipoCita }))}>
              <option value="llamada">Llamada</option><option value="demostracion">Demostración</option><option value="visita">Visita</option><option value="seguimiento">Seguimiento</option>
            </Select>
            <Select label="Canal" value={f.canal} onChange={e => setF(x => ({ ...x, canal: e.target.value }))}>
              <option value="telefono">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="correo">Correo</option><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="otro">Otro</option>
            </Select>
            <Input label="Persona de contacto (opcional)" value={f.contacto} onChange={e => setF(x => ({ ...x, contacto: e.target.value }))} maxLength={200} />
            <ErrorAccion texto={errAccion} />
            <div><Button size="sm" loading={ocupado} disabled={!f.prospecto} onClick={() => void crear()}>Guardar como propuesta</Button></div>
          </Card>
        )}
        <TituloBloque>Próximas</TituloBloque>
        {abiertas.length === 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay citas abiertas.</p>}
        {abiertas.map(c => <FilaCita key={c.id} c={c} recargar={recargar} />)}
        {cerradas.length > 0 && (<><TituloBloque>Historial</TituloBloque>{cerradas.map(c => <FilaCita key={c.id} c={c} recargar={recargar} />)}</>)}
      </>)}
    </Pagina>
  )
}
