/**
 * Mensajes.tsx — Fase 4 (parte 1): bandeja de mensajes por prospecto y canal, en modo BORRADOR.
 * No hay correo ni WhatsApp conectados: nada se envía solo. "Aprobado" = listo para enviar; si lo mandas tú mismo, lo registras como enviado por ti.
 * Las reglas (campaña vigente, no contactar, baja en el correo, sin duplicados) las hace cumplir la base.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { actualizarMensaje, crearMensaje, textoError, type CanalMensaje, type EstadoMensaje } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, Pagina, TituloBloque } from '../ui.tsx'

interface Mensaje {
  id: string; prospecto_id: string; canal: CanalMensaje; paso: number; estado: EstadoMensaje; asunto: string; cuerpo: string; campana_id: string | null
  growth_prospectos: { nombre_comercial: string; es_ficticio: boolean } | null
}
interface P { id: string; nombre_comercial: string; es_ficticio: boolean }
interface Camp { id: string; nombre: string }
const TONO: Record<EstadoMensaje, Tone> = { borrador: 'neutral', aprobado: 'info', enviado: 'success', hecho_manual: 'success', fallido: 'danger', recibido: 'info', cancelado: 'warning' }
const ETQ: Record<EstadoMensaje, string> = { borrador: 'Borrador', aprobado: 'Aprobado (listo)', enviado: 'Enviado', hecho_manual: 'Enviado por ti', fallido: 'Falló', recibido: 'Recibido', cancelado: 'Cancelado' }
const CANAL: Record<CanalMensaje, string> = { correo: 'Correo', whatsapp: 'WhatsApp', telefono: 'Teléfono' }
const PIE_BAJA = '\n\nSi prefiere no recibir más mensajes, responda "baja" y no le escribiremos de nuevo.'

function Fila({ m, camps, recargar }: { m: Mensaje; camps: Camp[]; recargar: () => Promise<void> }) {
  const [editando, setEditando] = useState(false)
  const [asunto, setAsunto] = useState(m.asunto)
  const [cuerpo, setCuerpo] = useState(m.cuerpo)
  const [camp, setCamp] = useState(m.campana_id ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const hacer = async (fn: () => Promise<string | null>, cerrar = false) => {
    setOcupado(true); setError(null)
    const e = await fn()
    setOcupado(false); setError(e)
    if (!e) { if (cerrar) setEditando(false); await recargar() }
  }
  const guardar = () => hacer(() => actualizarMensaje(m.id, { asunto, cuerpo, campana_id: camp || null }), true)
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)] [overflow-wrap:anywhere]">{m.growth_prospectos?.nombre_comercial ?? 'Prospecto'}</p>
        {m.growth_prospectos?.es_ficticio && <Badge tone="warning">Ejemplo</Badge>}
        <Badge tone={TONO[m.estado]}>{ETQ[m.estado]}</Badge>
      </div>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{CANAL[m.canal]} · paso {m.paso}{m.campana_id ? ` · campaña: ${camps.find(c => c.id === m.campana_id)?.nombre ?? 'no vigente'}` : ' · sin campaña'}</p>
      {!editando ? (<>
        {m.asunto && <p className="m-0 text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-text)]">{m.asunto}</p>}
        <p className="m-0 whitespace-pre-wrap text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{m.cuerpo || 'Sin texto todavía.'}</p>
      </>) : (<>
        {m.canal === 'correo' && <Input label="Asunto" value={asunto} onChange={e => setAsunto(e.target.value)} maxLength={200} />}
        <Textarea label="Mensaje" value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={6} maxLength={4000} />
        <Select label="Campaña vigente" value={camp} onChange={e => setCamp(e.target.value)}>
          <option value="">— elige —</option>{camps.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Select>
      </>)}
      <ErrorAccion texto={error} />
      <div className="flex flex-wrap gap-2">
        {m.estado === 'borrador' && !editando && <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>Editar</Button>}
        {editando && <Button size="sm" loading={ocupado} onClick={() => void guardar()}>Guardar</Button>}
        {editando && <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar edición</Button>}
        {m.estado === 'borrador' && !editando && <Button size="sm" loading={ocupado} onClick={() => void hacer(() => actualizarMensaje(m.id, { estado: 'aprobado' }))}>Aprobar</Button>}
        {m.estado === 'aprobado' && <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void hacer(() => actualizarMensaje(m.id, { estado: 'borrador' }))}>Retirar aprobación</Button>}
        {m.estado === 'aprobado' && <Button size="sm" loading={ocupado} onClick={() => void hacer(() => actualizarMensaje(m.id, { estado: 'hecho_manual' }))}>Ya lo envié yo</Button>}
        {(m.estado === 'borrador' || m.estado === 'aprobado') && !editando && <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void hacer(() => actualizarMensaje(m.id, { estado: 'cancelado' }))}>Descartar</Button>}
        {!editando && m.cuerpo && <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(`${m.asunto ? m.asunto + '\n\n' : ''}${m.cuerpo}`).then(() => setCopiado(true)).catch(() => setCopiado(false)) }}>{copiado ? 'Copiado' : 'Copiar'}</Button>}
      </div>
    </Card>
  )
}

export function Mensajes() {
  const [ms, setMs] = useState<Mensaje[] | null>(null)
  const [ps, setPs] = useState<P[]>([])
  const [camps, setCamps] = useState<Camp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('abiertos')
  const [nuevo, setNuevo] = useState(false)
  const [f, setF] = useState({ prospecto: '', canal: 'correo' as CanalMensaje, paso: 1, asunto: '', cuerpo: '' })
  const [ocupado, setOcupado] = useState(false)
  const [errAccion, setErrAccion] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('growth_mensajes').select('*, growth_prospectos(nombre_comercial, es_ficticio)').order('created_at', { ascending: false }).limit(200),
      supabase.from('growth_prospectos').select('id, nombre_comercial, es_ficticio').not('etapa', 'in', '(perdido,no_contactar)').order('nombre_comercial'),
      supabase.from('growth_autorizaciones').select('id, nombre, vigente_hasta').eq('tipo', 'campana').eq('estado', 'vigente'),
    ])
    if (a.error) setError(textoError(a.error)); else { setError(null); setMs((a.data ?? []) as unknown as Mensaje[]) }
    setPs((b.data ?? []) as P[])
    setCamps(((c.data ?? []) as (Camp & { vigente_hasta: string })[]).filter(x => new Date(x.vigente_hasta) > new Date()))
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo(['growth_mensajes', 'growth_prospectos', 'growth_autorizaciones'], recargar)

  /** Arma un borrador con lo que ya hay en el expediente (apertura y mensaje inicial) y la forma de darse de baja. */
  const usarPlantilla = async () => {
    if (!f.prospecto) return
    const { data } = await supabase.from('growth_expedientes').select('ventas').eq('prospecto_id', f.prospecto).maybeSingle()
    const v = (data?.ventas ?? {}) as Record<string, unknown>
    const base = [v.frase_apertura, v.mensaje_inicial].filter(x => typeof x === 'string' && x.trim()).join('\n\n')
    const nombre = ps.find(p => p.id === f.prospecto)?.nombre_comercial ?? ''
    setF(x => ({ ...x, asunto: x.asunto || `RestaurantOS para ${nombre}`.slice(0, 200), cuerpo: base ? base + PIE_BAJA : x.cuerpo }))
  }
  const crear = async () => {
    setOcupado(true); setErrAccion(null)
    const e = await crearMensaje({ prospecto_id: f.prospecto, canal: f.canal, paso: f.paso, asunto: f.canal === 'correo' ? f.asunto : '', cuerpo: f.cuerpo })
    setOcupado(false); setErrAccion(e)
    if (!e) { setNuevo(false); setF(x => ({ ...x, prospecto: '', asunto: '', cuerpo: '' })); await recargar() }
  }
  const visibles = (ms ?? []).filter(m => filtro === 'todos' || (filtro === 'abiertos' ? m.estado === 'borrador' || m.estado === 'aprobado' : m.estado === filtro))
  return (
    <Pagina titulo="Mensajes" subtitulo="Borradores de contacto por prospecto y canal.">
      <AvisoHonesto tono="warning">Todavía no hay un correo ni WhatsApp conectado: nada se envía solo. "Aprobado" significa listo para enviar. Si lo mandas tú mismo, toca "Ya lo envié yo" para dejar constancia en el historial del prospecto.</AvisoHonesto>
      {error && <ErrorAccion texto={error} />}
      {!ms ? <StatePanel kind="loading" title="Cargando…" /> : (<>
        <div className="flex flex-wrap gap-2 items-end">
          <Button size="sm" onClick={() => setNuevo(v => !v)}>{nuevo ? 'Cerrar' : 'Nuevo borrador'}</Button>
          <Select label="Ver" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="abiertos">Por trabajar</option><option value="hecho_manual">Enviados por ti</option><option value="cancelado">Cancelados</option><option value="todos">Todos</option>
          </Select>
        </div>
        {nuevo && (
          <Card className="flex flex-col gap-2">
            <Select label="Prospecto" value={f.prospecto} onChange={e => setF(x => ({ ...x, prospecto: e.target.value }))}>
              <option value="">— elige —</option>{ps.map(p => <option key={p.id} value={p.id}>{p.nombre_comercial}{p.es_ficticio ? ' (ejemplo)' : ''}</option>)}
            </Select>
            <Select label="Canal" value={f.canal} onChange={e => setF(x => ({ ...x, canal: e.target.value as CanalMensaje }))}>
              <option value="correo">Correo</option><option value="whatsapp">WhatsApp</option><option value="telefono">Teléfono (guion)</option>
            </Select>
            <Select label="Paso" value={String(f.paso)} onChange={e => setF(x => ({ ...x, paso: Number(e.target.value) }))}>
              <option value="1">1 · primer contacto</option><option value="2">2 · primer seguimiento</option><option value="3">3 · segundo seguimiento</option>
            </Select>
            {f.canal === 'correo' && <Input label="Asunto" value={f.asunto} onChange={e => setF(x => ({ ...x, asunto: e.target.value }))} maxLength={200} />}
            <Textarea label="Mensaje" value={f.cuerpo} onChange={e => setF(x => ({ ...x, cuerpo: e.target.value }))} rows={6} maxLength={4000} hint='Un correo debe decir cómo darse de baja (la palabra "baja").' />
            <ErrorAccion texto={errAccion} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!f.prospecto} onClick={() => void usarPlantilla()}>Usar lo del expediente</Button>
              <Button size="sm" loading={ocupado} disabled={!f.prospecto} onClick={() => void crear()}>Guardar borrador</Button>
            </div>
          </Card>
        )}
        <TituloBloque>{visibles.length} mensaje(s)</TituloBloque>
        {visibles.length === 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay mensajes en esta vista.</p>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{visibles.map(m => <Fila key={m.id} m={m} camps={camps} recargar={recargar} />)}</div>
      </>)}
    </Pagina>
  )
}
