/**
 * CampanasPanel.tsx — campañas de promoción por WhatsApp.
 * El administrador o el cajero PREPARAN; solo el ADMINISTRADOR aprueba, y solo entonces se envía.
 * Aquí no se decide quién recibe: lo calcula la base (consentimiento, BAJA, tope de frecuencia).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge, type Tone } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Select, Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { Tabs } from '../ui/Tabs'
import { fidelizacionService, type ClienteBasico } from '../../services/fidelizacionService'
import {
  campanasService, type Audiencia, type BorradorCampana, type Campana, type EstadoCampana, type PlantillaPromo, type Segmento, type TipoPublico,
} from '../../services/campanasService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '')
const num = (n: number) => n.toLocaleString('es-CO')

const ESTADO: Record<EstadoCampana, { tone: Tone; texto: string }> = {
  borrador: { tone: 'neutral', texto: 'Borrador' },
  pendiente_aprobacion: { tone: 'warning', texto: 'Por aprobar' },
  aprobada: { tone: 'info', texto: 'Aprobada, programada' },
  enviando: { tone: 'info', texto: 'Enviando' },
  enviada: { tone: 'success', texto: 'Enviada' },
  rechazada: { tone: 'danger', texto: 'Rechazada' },
  cancelada: { tone: 'neutral', texto: 'Cancelada' },
}

const PUBLICOS: { key: TipoPublico; label: string }[] = [
  { key: 'todos', label: 'Todos los clientes que aceptaron promociones' },
  { key: 'inactivos', label: 'Clientes que hace tiempo no vienen' },
  { key: 'mejores', label: 'Mis mejores clientes' },
  { key: 'cumple_semana', label: 'Cumpleaños de esta semana' },
  { key: 'manual', label: 'Elegir clientes uno por uno' },
]
const textoPublico = (s: Segmento) => {
  if (s.tipo === 'inactivos') return `Sin venir hace más de ${s.dias ?? 30} días`
  if (s.tipo === 'mejores') return `Mis ${s.limite ?? 20} mejores clientes`
  if (s.tipo === 'manual') return `${s.cliente_ids?.length ?? 0} clientes elegidos`
  return PUBLICOS.find(p => p.key === s.tipo)?.label ?? ''
}

const DATOS = [
  { v: '@nombre', t: 'Nombre del cliente' },
  { v: '@nombre_completo', t: 'Nombre completo' },
  { v: '@restaurante', t: 'Nombre del restaurante' },
  { v: '@puntos', t: 'Puntos del cliente' },
  { v: 'fijo', t: 'Un texto que escribo yo' },
]

const ICONO = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z" /></svg>

const VACIO: BorradorCampana = { id: null, nombre: '', objetivo: '', segmento: { tipo: 'todos' }, plantilla_id: null, variables: {}, programada_para: null }
const aLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

/* ───────────── Cuántas personas recibirán ───────────── */
function ResumenAudiencia({ a, cargando }: { a?: Audiencia; cargando: boolean }) {
  if (cargando && !a) return <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Calculando a quién le llegaría…</p>
  if (!a) return null
  const x = a.excluidos
  const filas: [number, string][] = [
    [x.sin_consentimiento, 'no aceptaron promociones'], [x.baja, 'pidieron no recibir mensajes (BAJA)'], [x.sin_telefono, 'sin teléfono válido'],
    [x.duplicado, 'con teléfono repetido'], [x.tope_frecuencia, 'ya recibieron una promoción hace poco'],
  ]
  return (
    <div className="rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3" aria-live="polite">
      <p className="font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">
        {num(a.elegibles)} {a.elegibles === 1 ? 'persona recibiría' : 'personas recibirían'} esta campaña
      </p>
      {filas.some(f => f[0] > 0) && (
        <ul className="mt-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
          {filas.filter(f => f[0] > 0).map(f => <li key={f[1]}>Se excluyen {num(f[0])}: {f[1]}</li>)}
        </ul>
      )}
    </div>
  )
}

/* ───────────── Crear / editar ───────────── */
function Asistente({ inicial, plantillas, onClose, onGuardado }: {
  inicial: BorradorCampana; plantillas: PlantillaPromo[]; onClose: () => void; onGuardado: () => void
}) {
  const [b, setB] = useState<BorradorCampana>(inicial)
  const [q, setQ] = useState('')
  const [hallados, setHallados] = useState<ClienteBasico[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const set = (p: Partial<BorradorCampana>) => setB(prev => ({ ...prev, ...p }))
  const setSeg = (p: Partial<Segmento>) => setB(prev => ({ ...prev, segmento: { ...prev.segmento, ...p } }))
  const plantilla = plantillas.find(p => p.id === b.plantilla_id) ?? null

  const segClave = JSON.stringify(b.segmento)
  const listo = b.segmento.tipo !== 'manual' || (b.segmento.cliente_ids?.length ?? 0) > 0
  const aud = useQuery({
    queryKey: ['camp_aud', segClave, b.id], enabled: listo, retry: false,
    queryFn: () => campanasService.audiencia(b.segmento, b.id),
  })
  const varClave = JSON.stringify(b.variables)
  const previa = useQuery({
    queryKey: ['camp_prev', b.plantilla_id, varClave], enabled: !!plantilla, retry: false,
    queryFn: () => campanasService.vistaPrevia(b.plantilla_id!, b.variables),
  })

  useEffect(() => {
    if (b.segmento.tipo !== 'manual' || q.trim().length < 2) { setHallados([]); return }
    const t = setTimeout(() => { fidelizacionService.buscar(q.trim()).then(setHallados).catch(() => setHallados([])) }, 300)
    return () => clearTimeout(t)
  }, [q, b.segmento.tipo])

  const guardar = useMutation({
    mutationFn: async (aAprobacion: boolean) => {
      const id = await campanasService.guardar(b)
      if (aAprobacion) await campanasService.enviarAAprobacion(id)
      return aAprobacion
    },
    onSuccess: (ap) => { message.success(ap ? 'Enviada al administrador para aprobación' : 'Borrador guardado'); onGuardado() },
    onError: e => message.error(errMsg(e)),
  })

  const ids = b.segmento.cliente_ids ?? []
  const completo = b.nombre.trim().length >= 2 && !!plantilla && plantilla.variables.every(v => (b.variables[v] ?? '').trim())

  return (
    <Modal open onClose={onClose} title={b.id ? 'Editar campaña' : 'Nueva campaña'}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button variant="secondary" loading={guardar.isPending} disabled={b.nombre.trim().length < 2} onClick={() => guardar.mutate(false)}>Guardar borrador</Button>
          <Button loading={guardar.isPending} disabled={!completo} onClick={() => guardar.mutate(true)}>Enviar a aprobación</Button>
        </div>
      }>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h3 className="font-bold">1. De qué se trata</h3>
          <Input label="Nombre de la campaña" value={b.nombre} maxLength={100} onChange={e => set({ nombre: e.target.value })} placeholder="Ej. Te extrañamos" />
          <Textarea label="Objetivo (opcional)" value={b.objetivo} maxLength={400} onChange={e => set({ objetivo: e.target.value })} hint="Para que el administrador entienda qué buscas." />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-bold">2. A quién le llega</h3>
          <Select label="Público" value={b.segmento.tipo} onChange={e => set({ segmento: { tipo: e.target.value as TipoPublico } })}>
            {PUBLICOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
          {b.segmento.tipo === 'inactivos' && (
            <Input label="Días sin venir" type="number" min={1} max={365} value={b.segmento.dias ?? 30} onChange={e => setSeg({ dias: Number(e.target.value) || 30 })} />
          )}
          {b.segmento.tipo === 'mejores' && (
            <Input label="Cuántos clientes" type="number" min={1} max={500} value={b.segmento.limite ?? 20} onChange={e => setSeg({ limite: Number(e.target.value) || 20 })} hint="Los que más han gastado en los últimos 90 días." />
          )}
          {b.segmento.tipo === 'manual' && (
            <div className="flex flex-col gap-2">
              <Input label="Buscar cliente" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o últimos números del teléfono" />
              {hallados.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border)] px-3 py-2">
                  <span className="min-w-0 truncate">{c.nombre}</span>
                  <Button size="sm" variant="secondary" disabled={ids.includes(c.id)}
                    onClick={() => { setNombres(n => ({ ...n, [c.id]: c.nombre })); setSeg({ cliente_ids: [...ids, c.id] }) }}>
                    {ids.includes(c.id) ? 'Agregado' : 'Agregar'}
                  </Button>
                </div>
              ))}
              {ids.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ids.map(id => (
                    <button key={id} type="button" onClick={() => setSeg({ cliente_ids: ids.filter(x => x !== id) })}
                      className="rounded-[var(--w-r-pill)] bg-[var(--w-accent-soft)] px-3 py-1 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-accent-text)]"
                      aria-label={`Quitar ${nombres[id] ?? 'cliente'}`}>
                      {nombres[id] ?? 'Cliente'} ✕
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {listo ? <ResumenAudiencia a={aud.data} cargando={aud.isFetching} /> : <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Agrega al menos un cliente.</p>}
          {aud.isError && <p role="alert" className="text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">✕ {errMsg(aud.error)}</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-bold">3. El mensaje</h3>
          <Select label="Plantilla aprobada por WhatsApp" value={b.plantilla_id ?? ''}
            onChange={e => set({ plantilla_id: e.target.value || null, variables: {} })}
            hint="WhatsApp solo permite escribirle primero a un cliente con una plantilla aprobada.">
            <option value="">Elige una plantilla…</option>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
          {plantilla && plantilla.variables.map((v, i) => {
            const val = b.variables[v] ?? ''
            const tipo = val.startsWith('@') ? val : 'fijo'
            return (
              <div key={v} className="flex flex-col gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border)] p-3">
                <Select label={`Qué va en {{${i + 1}}} (${v})`} value={val === '' ? '' : tipo}
                  onChange={e => set({ variables: { ...b.variables, [v]: e.target.value === 'fijo' ? ' ' : e.target.value } })}>
                  <option value="">Elige…</option>
                  {DATOS.map(d => <option key={d.v} value={d.v}>{d.t}</option>)}
                </Select>
                {val !== '' && tipo === 'fijo' && (
                  <Input label="Texto" value={val.trim() === '' ? '' : val} maxLength={200}
                    onChange={e => set({ variables: { ...b.variables, [v]: e.target.value || ' ' } })} placeholder="Ej. 2x1 en cholados hasta el domingo" />
                )}
              </div>
            )
          })}
          {plantilla && (
            <div className="rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3">
              <p className="text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-2)]">Así lo vería un cliente (de ejemplo)</p>
              <p className="mt-1 whitespace-pre-wrap text-[length:var(--w-fs-body)] text-[color:var(--w-text)]">{previa.data ?? plantilla.cuerpo}</p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-bold">4. Cuándo</h3>
          <Input label="Enviar el (opcional)" type="datetime-local" value={aLocal(b.programada_para)}
            onChange={e => set({ programada_para: e.target.value ? new Date(e.target.value).toISOString() : null })}
            hint="Vacío: se envía apenas el administrador apruebe. Salen unos 20 mensajes por minuto." />
        </section>
      </div>
    </Modal>
  )
}

/* ───────────── Resultados ───────────── */
function Resultados({ c, onClose }: { c: Campana; onClose: () => void }) {
  const s = useQuery({ queryKey: ['camp_stats', c.id], queryFn: () => campanasService.estadisticas(c.id), refetchInterval: 10000 })
  const d = s.data
  return (
    <Modal open onClose={onClose} title={`Resultados: ${c.nombre}`} footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>}>
      {s.isLoading && <StatePanel kind="loading" />}
      {s.isError && <StatePanel kind="error" text={errMsg(s.error)} />}
      {d && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Le tocaba a" value={num(d.elegibles)} />
            <StatCard label="En espera de salir" value={num(d.en_cola)} tone="info" />
            <StatCard label="Enviados" value={num(d.enviados)} tone="success" />
            <StatCard label="Entregados" value={num(d.entregados)} tone="success" />
            <StatCard label="Leídos" value={num(d.leidos)} tone="success" />
            <StatCard label="No salieron" value={num(d.fallidos)} tone="danger" />
          </div>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
            Pidieron no recibir más mensajes después de esta campaña: <strong>{num(d.bajas_posteriores)}</strong>.
            {d.cancelados > 0 && <> Detenidos por cancelación: <strong>{num(d.cancelados)}</strong>.</>}
          </p>
        </div>
      )}
    </Modal>
  )
}

/* ───────────── Tarjeta de campaña ───────────── */
function Fila({ c, esAdmin, ocupado, puedeEnviar, acciones }: {
  c: Campana; esAdmin: boolean; ocupado: boolean; puedeEnviar: boolean
  acciones: { editar: () => void; aprobacion: () => void; aprobar: () => void; rechazar: () => void; cancelar: () => void; resultados: () => void }
}) {
  const e = ESTADO[c.estado]
  const miBorrador = esAdmin || c.creado_por_yo
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold text-[length:var(--w-fs-body-lg)]">{c.nombre}</p>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{textoPublico(c.segmento)}</p>
        </div>
        <Badge tone={e.tone}>{e.texto}</Badge>
      </div>
      {c.objetivo && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{c.objetivo}</p>}
      <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
        Plantilla: {c.plantilla_nombre ?? 'sin elegir'}
        {c.programada_para && <> · Programada: {cuando(c.programada_para)}</>}
        {c.elegibles_al_aprobar != null && <> · Se encolaron {num(c.elegibles_al_aprobar)}</>}
      </p>
      {c.estado === 'rechazada' && c.rechazo_motivo && <p role="note" className="text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">Motivo del rechazo: {c.rechazo_motivo}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {(c.estado === 'borrador' || c.estado === 'rechazada') && miBorrador && <Button size="sm" variant="secondary" disabled={ocupado} onClick={acciones.editar}>Editar</Button>}
        {c.estado === 'borrador' && miBorrador && <Button size="sm" disabled={ocupado} onClick={acciones.aprobacion}>Enviar a aprobación</Button>}
        {esAdmin && c.estado === 'pendiente_aprobacion' && (
          <>
            <Button size="sm" disabled={ocupado || !puedeEnviar} onClick={acciones.aprobar}>Aprobar</Button>
            <Button size="sm" variant="danger" disabled={ocupado} onClick={acciones.rechazar}>Rechazar</Button>
          </>
        )}
        {['aprobada', 'enviando', 'enviada'].includes(c.estado) && <Button size="sm" variant="secondary" onClick={acciones.resultados}>Ver resultados</Button>}
        {c.estado !== 'cancelada' && c.estado !== 'enviada' && ((esAdmin) || (c.creado_por_yo && ['borrador', 'pendiente_aprobacion', 'rechazada'].includes(c.estado))) && (
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={acciones.cancelar}>Cancelar campaña</Button>
        )}
      </div>
    </Card>
  )
}

/* ───────────── Panel ───────────── */
export function CampanasPanel({ rol }: { rol: 'admin' | 'cashier' }) {
  const qc = useQueryClient()
  const esAdmin = rol === 'admin'
  const [pestana, setPestana] = useState<'campanas' | 'aprobar'>('campanas')
  const [editando, setEditando] = useState<BorradorCampana | null>(null)
  const [aprobando, setAprobando] = useState<Campana | null>(null)
  const [rechazando, setRechazando] = useState<Campana | null>(null)
  const [motivo, setMotivo] = useState('')
  const [viendo, setViendo] = useState<Campana | null>(null)
  const [topeMax, setTopeMax] = useState<number | null>(null)
  const [topeDias, setTopeDias] = useState<number | null>(null)

  const lista = useQuery({ queryKey: ['camp_lista'], queryFn: campanasService.lista, refetchInterval: 30000 })
  const wa = useQuery({ queryKey: ['camp_wa'], queryFn: campanasService.estadoWhatsapp })
  const plantillas = useQuery({ queryKey: ['camp_plantillas'], queryFn: campanasService.plantillas })
  const config = useQuery({ queryKey: ['camp_config'], queryFn: campanasService.config })
  const audAprobar = useQuery({
    queryKey: ['camp_aud_aprobar', aprobando?.id], enabled: !!aprobando, retry: false,
    queryFn: () => campanasService.audiencia(aprobando!.segmento, aprobando!.id),
  })

  const refrescar = () => { qc.invalidateQueries({ queryKey: ['camp_lista'] }); qc.invalidateQueries({ queryKey: ['camp_aud'] }) }
  const useAccion = <T,>(fn: (id: string) => Promise<T>, ok: (r: T) => string) =>
    useMutation({ mutationFn: fn, onSuccess: r => { message.success(ok(r)); refrescar() }, onError: e => message.error(errMsg(e)) })
  const aAprobacion = useAccion(campanasService.enviarAAprobacion, () => 'Enviada al administrador para aprobación')
  const cancelar = useAccion(campanasService.cancelar, r => `Campaña cancelada. Se detuvieron ${r.detenidos} mensajes que seguían en espera.`)
  const aprobar = useMutation({
    mutationFn: (id: string) => campanasService.aprobar(id),
    onSuccess: r => { message.success(r.ya_aprobada ? 'Esta campaña ya estaba aprobada' : `Aprobada: ${r.encolados} mensajes en camino`); setAprobando(null); refrescar() },
    onError: e => message.error(errMsg(e)),
  })
  const rechazar = useMutation({
    mutationFn: () => campanasService.rechazar(rechazando!.id, motivo.trim()),
    onSuccess: () => { message.success('Campaña rechazada'); setRechazando(null); setMotivo(''); refrescar() },
    onError: e => message.error(errMsg(e)),
  })
  const guardarTope = useMutation({
    mutationFn: () => campanasService.guardarConfig(topeMax ?? config.data?.promo_max ?? 1, topeDias ?? config.data?.promo_dias ?? 7),
    onSuccess: () => { message.success('Tope guardado'); qc.invalidateQueries({ queryKey: ['camp_config'] }); qc.invalidateQueries({ queryKey: ['camp_aud'] }) },
    onError: e => message.error(errMsg(e)),
  })

  const campanas = lista.data ?? []
  const porAprobar = useMemo(() => campanas.filter(c => c.estado === 'pendiente_aprobacion'), [campanas])
  const visibles = pestana === 'aprobar' ? porAprobar : campanas
  const ocupado = aAprobacion.isPending || cancelar.isPending || aprobar.isPending
  const sinPlantillas = (plantillas.data?.length ?? 0) === 0 && !plantillas.isLoading
  const puedeEnviar = wa.data?.puede_enviar ?? false

  const abrirEditar = (c: Campana) => setEditando({
    id: c.id, nombre: c.nombre, objetivo: c.objetivo ?? '', segmento: c.segmento, plantilla_id: c.plantilla_id,
    variables: c.variables ?? {}, programada_para: c.programada_para,
  })
  const items = [{ key: 'campanas', label: 'Campañas' }, ...(esAdmin ? [{ key: 'aprobar', label: `Por aprobar${porAprobar.length ? ` (${porAprobar.length})` : ''}` }] : [])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ModuleHeader icon={ICONO} title="Campañas" subtitle="Promociones por WhatsApp, siempre con aprobación"
        actions={<Button disabled={sinPlantillas} onClick={() => setEditando(VACIO)}>Nueva campaña</Button>} />

      {wa.data && !wa.data.puede_enviar && (
        <Card role="alert" className="border-[var(--w-warning)] bg-[var(--w-warning-bg)]">
          <p className="font-semibold text-[color:var(--w-warning-text)]">Por ahora no se pueden enviar campañas</p>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-warning-text)]">{wa.data.motivo} Puedes ir preparando borradores.</p>
        </Card>
      )}

      {sinPlantillas && (
        <StatePanel kind="empty" title="Falta una plantilla de promoción aprobada por WhatsApp"
          text="WhatsApp solo deja escribirle primero a un cliente con una plantilla que Meta haya aprobado. Pasos: 1) crea la plantilla en Meta con categoría Marketing e idioma Español; 2) regístrala en Configuración → WhatsApp con el mismo nombre y las variables en orden; 3) cuando Meta la apruebe aparecerá aquí." />
      )}

      {items.length > 1 && <Tabs label="Secciones de campañas" value={pestana} onChange={setPestana} items={items} />}

      {lista.isLoading && <StatePanel kind="loading" />}
      {lista.isError && <StatePanel kind="error" text={errMsg(lista.error)} />}
      {!lista.isLoading && !lista.isError && visibles.length === 0 && !sinPlantillas && (
        <StatePanel kind="empty" title={pestana === 'aprobar' ? 'Nada por aprobar' : 'Aún no hay campañas'}
          text={pestana === 'aprobar' ? 'Cuando alguien envíe una campaña a aprobación, aparecerá aquí.' : 'Crea la primera con “Nueva campaña”. Nada se envía sin que el administrador la apruebe.'} />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {visibles.map(c => (
          <Fila key={c.id} c={c} esAdmin={esAdmin} ocupado={ocupado} puedeEnviar={puedeEnviar}
            acciones={{
              editar: () => abrirEditar(c), aprobacion: () => aAprobacion.mutate(c.id), aprobar: () => setAprobando(c),
              rechazar: () => { setMotivo(''); setRechazando(c) }, cancelar: () => cancelar.mutate(c.id), resultados: () => setViendo(c),
            }} />
        ))}
      </div>

      {esAdmin && config.data && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">Tope de promociones por cliente</h2>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Para no cansar a tus clientes, cada uno recibe como máximo esta cantidad de promociones en ese periodo.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Máximo de promociones" type="number" min={1} max={20} value={topeMax ?? config.data.promo_max} onChange={e => setTopeMax(Number(e.target.value))} />
            <Input label="En cuántos días" type="number" min={1} max={90} value={topeDias ?? config.data.promo_dias} onChange={e => setTopeDias(Number(e.target.value))} />
          </div>
          <div><Button variant="secondary" loading={guardarTope.isPending} onClick={() => guardarTope.mutate()}>Guardar tope</Button></div>
        </Card>
      )}

      {editando && (
        <Asistente inicial={editando} plantillas={plantillas.data ?? []} onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); refrescar() }} />
      )}

      {aprobando && (
        <Modal open onClose={() => setAprobando(null)} title="Aprobar campaña"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setAprobando(null)}>Volver</Button>
              <Button loading={aprobar.isPending} disabled={!audAprobar.data || audAprobar.data.elegibles === 0 || !puedeEnviar} onClick={() => aprobar.mutate(aprobando.id)}>
                {audAprobar.data ? `Aprobar y enviar a ${num(audAprobar.data.elegibles)}` : 'Aprobar'}
              </Button>
            </div>
          }>
          <div className="flex flex-col gap-3">
            <p><strong>{aprobando.nombre}</strong> · {textoPublico(aprobando.segmento)}</p>
            <ResumenAudiencia a={audAprobar.data} cargando={audAprobar.isFetching} />
            {audAprobar.isError && <p role="alert" className="text-[color:var(--w-danger-text)]">✕ {errMsg(audAprobar.error)}</p>}
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
              Al aprobar, los mensajes empiezan a salir{aprobando.programada_para ? ` el ${cuando(aprobando.programada_para)}` : ' enseguida'}, unos 20 por minuto. Puedes cancelar y se detienen los que sigan en espera; los ya enviados no se pueden deshacer.
            </p>
          </div>
        </Modal>
      )}

      {rechazando && (
        <Modal open onClose={() => setRechazando(null)} title="Rechazar campaña"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setRechazando(null)}>Volver</Button>
              <Button variant="danger" loading={rechazar.isPending} disabled={motivo.trim().length < 3} onClick={() => rechazar.mutate()}>Rechazar</Button>
            </div>
          }>
          <Textarea label="Motivo" value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} hint="Quien la preparó lo verá y podrá corregirla." />
        </Modal>
      )}

      {viendo && <Resultados c={viendo} onClose={() => setViendo(null)} />}
    </div>
  )
}
