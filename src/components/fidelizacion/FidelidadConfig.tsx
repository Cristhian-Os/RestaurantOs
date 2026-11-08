/**
 * FidelidadConfig.tsx — "Programa de fidelidad — configuración" (solo administrador).
 * Secciones: Programa (nombre del club, puntos por compra, vencimiento), Niveles, Premios,
 * Canjes (quién y cuándo) y Corte mensual. Los cambios de saldo nunca se hacen aquí: pasan por funciones de la base.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Select, Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { Tabs } from '../ui/Tabs'
import { Toggle } from '../ui/Toggle'
import { formatCOP } from '../../config/billing'
import {
  fidelizacionService,
  type Programa, type Nivel, type Recompensa, type RecompensaForm, type RecompensaTipo, type CanjeHistorial, type Corte,
} from '../../services/fidelizacionService'

type Seccion = 'programa' | 'niveles' | 'premios' | 'canjes' | 'corte'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const mesTexto = (mes: string) => new Date(`${mes}T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
const num = (n: number | undefined | null) => Number(n ?? 0).toLocaleString('es-CO')
const bogota = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) : '')
const ayudaTxt = 'text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]'

/** Último mes terminado, en hora de Colombia: es el que propone el corte. */
function mesAnterior(): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const [y, m] = hoy.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const IconoConfig = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

export function FidelidadConfig() {
  const [seccion, setSeccion] = useState<Seccion>('programa')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ModuleHeader icon={IconoConfig} title="Programa de fidelidad" subtitle="Configuración, premios y corte mensual" />
      <Tabs label="Secciones de configuración" value={seccion} onChange={setSeccion}
        items={[
          { key: 'programa', label: 'Programa' }, { key: 'niveles', label: 'Niveles' }, { key: 'premios', label: 'Premios' },
          { key: 'canjes', label: 'Canjes' }, { key: 'corte', label: 'Corte mensual' },
        ]} />
      {seccion === 'programa' && <ProgramaSec />}
      {seccion === 'niveles' && <NivelesSec />}
      {seccion === 'premios' && <PremiosSec />}
      {seccion === 'canjes' && <CanjesSec />}
      {seccion === 'corte' && <CorteSec />}
    </div>
  )
}

/* ───────────────────────── Programa ───────────────────────── */

function ProgramaSec() {
  const programa = useQuery({ queryKey: ['fid_programa'], queryFn: () => fidelizacionService.getPrograma() })
  if (programa.isLoading) return <StatePanel kind="loading" />
  if (programa.isError) return <StatePanel kind="error" text="No se pudo cargar el programa." />
  return <ProgramaForm actual={programa.data ?? null} />
}

function ProgramaForm({ actual }: { actual: Programa | null }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    nombre_club: actual?.nombre_club ?? '',
    activo: actual?.activo ?? false,
    modo: actual?.modo ?? 'puntos',
    monto_por_punto: String(actual?.monto_por_punto ?? 1000),
    monto_minimo_sello: String(actual?.monto_minimo_sello ?? 0),
    meses_vencimiento: actual?.meses_vencimiento ? String(actual.meses_vencimiento) : '',
  })
  const usaPuntos = f.modo !== 'sellos'
  const usaSellos = f.modo !== 'puntos'
  const valido = Number(f.monto_por_punto) > 0 && Number(f.monto_minimo_sello) >= 0
    && (f.nombre_club.trim() === '' || f.nombre_club.trim().length >= 2)
    && (f.meses_vencimiento === '' || (Number.isInteger(Number(f.meses_vencimiento)) && Number(f.meses_vencimiento) >= 1 && Number(f.meses_vencimiento) <= 60))

  const guardar = useMutation({
    mutationFn: () => fidelizacionService.guardarPrograma(actual, {
      nombre_club: f.nombre_club.trim() || null,
      activo: f.activo,
      modo: f.modo,
      monto_por_punto: Number(f.monto_por_punto),
      monto_minimo_sello: Number(f.monto_minimo_sello),
      meses_vencimiento: f.meses_vencimiento === '' ? null : Number(f.meses_vencimiento),
    }),
    onSuccess: () => { message.success('Programa guardado'); qc.invalidateQueries({ queryKey: ['fid_programa'] }) },
    onError: e => message.error(errMsg(e)),
  })

  return (
    <Card className="flex flex-col gap-4">
      <Input label="Nombre del club" placeholder="Ej: Club Cholao" hint="Es el nombre que ven tus clientes. Si lo dejas vacío se usa “Fidelización”."
        maxLength={60} value={f.nombre_club} onChange={e => setF(v => ({ ...v, nombre_club: e.target.value }))} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[color:var(--w-text)]">Programa activo</p>
          <p className={ayudaTxt}>Si lo pausas no se suman puntos nuevos y la tarjeta del cliente no se muestra.</p>
        </div>
        <Toggle checked={f.activo} onChange={v => setF(x => ({ ...x, activo: v }))} label="Programa activo" />
      </div>
      <Select label="¿Qué gana el cliente?" value={f.modo} onChange={e => setF(v => ({ ...v, modo: e.target.value as Programa['modo'] }))}>
        <option value="puntos">Puntos</option>
        <option value="sellos">Sellos (1 por visita)</option>
        <option value="ambos">Puntos y sellos</option>
      </Select>
      {usaPuntos && (
        <Input label="Pesos por cada punto" type="number" inputMode="numeric" min={1}
          hint={`El cliente gana 1 punto por cada ${formatCOP(Number(f.monto_por_punto) || 0)} que pague.`}
          value={f.monto_por_punto} onChange={e => setF(v => ({ ...v, monto_por_punto: e.target.value }))} />
      )}
      {usaSellos && (
        <Input label="Compra mínima para ganar un sello" type="number" inputMode="numeric" min={0}
          hint="Pon 0 si cualquier compra pagada da un sello."
          value={f.monto_minimo_sello} onChange={e => setF(v => ({ ...v, monto_minimo_sello: e.target.value }))} />
      )}
      {usaPuntos && (
        <Input label="Vencimiento de puntos (meses sin comprar)" type="number" inputMode="numeric" min={1} max={60} placeholder="Sin vencimiento"
          hint="Vacío = los puntos no vencen. Si pones 6, el corte mensual borra los puntos de quien lleva 6 meses sin comprar."
          value={f.meses_vencimiento} onChange={e => setF(v => ({ ...v, meses_vencimiento: e.target.value }))} />
      )}
      <div><Button onClick={() => guardar.mutate()} disabled={!valido} loading={guardar.isPending}>Guardar</Button></div>
    </Card>
  )
}

/* ───────────────────────── Niveles ───────────────────────── */

function NivelesSec() {
  const qc = useQueryClient()
  const niveles = useQuery({ queryKey: ['fid_niveles'], queryFn: () => fidelizacionService.getNiveles() })
  const [edit, setEdit] = useState<Nivel | 'nuevo' | null>(null)
  const n = niveles.data ?? []
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={ayudaTxt}>El nivel sube con los puntos ganados en total (no baja al canjear).</p>
        <Button onClick={() => setEdit('nuevo')}>+ Nivel</Button>
      </div>
      {niveles.isLoading && <StatePanel kind="loading" />}
      {niveles.isError && <StatePanel kind="error" text="No se pudieron cargar los niveles." />}
      {niveles.isSuccess && n.length === 0 && <StatePanel kind="empty" title="Sin niveles" text="Crea el primero, por ejemplo Bronce desde 0 puntos." />}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {n.map(x => (
          <button key={x.id} type="button" onClick={() => setEdit(x)} className="text-left">
            <Card className="flex flex-col gap-1 transition-colors hover:bg-[var(--w-surface-sunken)]">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-bold text-[color:var(--w-text)]">{x.nombre}</p>
                <Badge tone={x.activo ? 'success' : 'neutral'}>{x.activo ? 'Activo' : 'Pausado'}</Badge>
              </div>
              <p className={ayudaTxt}>Desde {num(x.puntos_minimos)} puntos ganados</p>
              {x.beneficios && <p className="text-[length:var(--w-fs-body)] text-[color:var(--w-text-2)]">{x.beneficios}</p>}
            </Card>
          </button>
        ))}
      </div>
      <NivelModal key={edit === null ? 'x' : edit === 'nuevo' ? 'nuevo' : edit.id} edit={edit} onClose={() => setEdit(null)}
        onGuardado={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['fid_niveles'] }); qc.invalidateQueries({ queryKey: ['fid_clientes'] }) }} />
    </>
  )
}

function NivelModal({ edit, onClose, onGuardado }: { edit: Nivel | 'nuevo' | null; onClose: () => void; onGuardado: () => void }) {
  const n = typeof edit === 'object' ? edit : null
  const [f, setF] = useState({ nombre: n?.nombre ?? '', puntos_minimos: String(n?.puntos_minimos ?? 0), beneficios: n?.beneficios ?? '', activo: n?.activo ?? true })
  const valido = f.nombre.trim().length >= 2 && Number.isInteger(Number(f.puntos_minimos)) && Number(f.puntos_minimos) >= 0
  const guardar = useMutation({
    mutationFn: () => fidelizacionService.guardarNivel(n?.id ?? null, {
      nombre: f.nombre.trim(), puntos_minimos: Number(f.puntos_minimos), beneficios: f.beneficios.trim() || null, activo: f.activo,
    }),
    onSuccess: () => { message.success('Nivel guardado'); onGuardado() },
    onError: e => message.error(/duplicate|unique/i.test(errMsg(e)) ? 'Ya existe un nivel con ese nombre' : errMsg(e)),
  })
  return (
    <Modal open={!!edit} onClose={onClose} title={n ? 'Editar nivel' : 'Nuevo nivel'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => guardar.mutate()} disabled={!valido} loading={guardar.isPending}>Guardar</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label="Nombre" required maxLength={40} value={f.nombre} onChange={e => setF(v => ({ ...v, nombre: e.target.value }))} />
        <Input label="Puntos ganados para llegar" type="number" inputMode="numeric" min={0} value={f.puntos_minimos} onChange={e => setF(v => ({ ...v, puntos_minimos: e.target.value }))} />
        <Textarea label="Beneficios (opcional)" maxLength={500} value={f.beneficios} onChange={e => setF(v => ({ ...v, beneficios: e.target.value }))} />
        <div className="flex items-center justify-between"><span className="font-semibold text-[color:var(--w-text)]">Activo</span>
          <Toggle checked={f.activo} onChange={v => setF(x => ({ ...x, activo: v }))} label="Nivel activo" /></div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Premios ───────────────────────── */

const TIPO_TXT: Record<RecompensaTipo, string> = { producto: 'Producto gratis', descuento_pct: 'Descuento en %', descuento_fijo: 'Descuento en pesos', beneficio: 'Otro beneficio' }

function PremiosSec() {
  const qc = useQueryClient()
  const premios = useQuery({ queryKey: ['fid_premios_config'], queryFn: () => fidelizacionService.getRecompensasConfig() })
  const niveles = useQuery({ queryKey: ['fid_niveles'], queryFn: () => fidelizacionService.getNiveles() })
  const [edit, setEdit] = useState<Recompensa | 'nuevo' | null>(null)
  const p = premios.data ?? []
  const nombreNivel = (id: string | null) => niveles.data?.find(n => n.id === id)?.nombre
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={ayudaTxt}>El cajero entrega el premio y lo canjea en el mostrador.</p>
        <Button onClick={() => setEdit('nuevo')}>+ Premio</Button>
      </div>
      {premios.isLoading && <StatePanel kind="loading" />}
      {premios.isError && <StatePanel kind="error" text="No se pudieron cargar los premios." />}
      {premios.isSuccess && p.length === 0 && <StatePanel kind="empty" title="Sin premios" text="Crea el primero, por ejemplo “Helado gratis” por 100 puntos." />}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {p.map(x => (
          <button key={x.id} type="button" onClick={() => setEdit(x)} className="text-left">
            <Card className="flex flex-col gap-1 transition-colors hover:bg-[var(--w-surface-sunken)]">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-bold text-[color:var(--w-text)]">{x.nombre}</p>
                <Badge tone={x.activa ? 'success' : 'neutral'}>{x.activa ? 'Activo' : 'Pausado'}</Badge>
              </div>
              <p className="text-[length:var(--w-fs-body)] font-semibold text-[color:var(--w-text-2)]">{num(x.costo)} {x.unidad}</p>
              <p className={ayudaTxt}>
                {TIPO_TXT[x.tipo]}
                {x.stock !== null && ` · quedan ${x.stock}`}
                {x.limite_por_cliente && ` · máx. ${x.limite_por_cliente} por cliente`}
                {nombreNivel(x.nivel_minimo_id) && ` · nivel ${nombreNivel(x.nivel_minimo_id)}`}
                {x.vigente_hasta && ` · hasta ${bogota(x.vigente_hasta)}`}
              </p>
            </Card>
          </button>
        ))}
      </div>
      <PremioModal key={edit === null ? 'x' : edit === 'nuevo' ? 'nuevo' : edit.id} edit={edit} niveles={niveles.data ?? []} onClose={() => setEdit(null)}
        onGuardado={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['fid_premios_config'] }); qc.invalidateQueries({ queryKey: ['fid_premios'] }) }} />
    </>
  )
}

function PremioModal({ edit, niveles, onClose, onGuardado }: { edit: Recompensa | 'nuevo' | null; niveles: Nivel[]; onClose: () => void; onGuardado: () => void }) {
  const r = typeof edit === 'object' ? edit : null
  const [f, setF] = useState({
    nombre: r?.nombre ?? '', descripcion: r?.descripcion ?? '', tipo: (r?.tipo ?? 'producto') as RecompensaTipo, valor: r?.valor != null ? String(r.valor) : '',
    unidad: r?.unidad ?? 'puntos', costo: r ? String(r.costo) : '', condiciones: r?.condiciones ?? '',
    desde: bogota(r?.vigente_desde ?? null), hasta: bogota(r?.vigente_hasta ?? null),
    limite: r?.limite_por_cliente ? String(r.limite_por_cliente) : '', stock: r?.stock != null ? String(r.stock) : '',
    nivel: r?.nivel_minimo_id ?? '', activa: r?.activa ?? true,
  })
  const conValor = f.tipo === 'descuento_pct' || f.tipo === 'descuento_fijo'
  const entero = (s: string) => Number.isInteger(Number(s))
  const valido = f.nombre.trim().length >= 2 && entero(f.costo) && Number(f.costo) > 0
    && (f.limite === '' || (entero(f.limite) && Number(f.limite) > 0)) && (f.stock === '' || (entero(f.stock) && Number(f.stock) >= 0))
    && (!conValor || Number(f.valor) > 0) && (!f.desde || !f.hasta || f.hasta >= f.desde)

  const guardar = useMutation({
    mutationFn: () => {
      const form: RecompensaForm = {
        nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, tipo: f.tipo, valor: conValor ? Number(f.valor) : null,
        unidad: f.unidad, costo: Number(f.costo), condiciones: f.condiciones.trim() || null,
        vigente_desde: f.desde ? `${f.desde}T00:00:00-05:00` : null, vigente_hasta: f.hasta ? `${f.hasta}T23:59:59-05:00` : null,
        limite_por_cliente: f.limite === '' ? null : Number(f.limite), stock: f.stock === '' ? null : Number(f.stock),
        nivel_minimo_id: f.nivel || null, activa: f.activa,
      }
      return fidelizacionService.guardarRecompensa(r?.id ?? null, form)
    },
    onSuccess: () => { message.success('Premio guardado'); onGuardado() },
    onError: e => message.error(errMsg(e)),
  })

  return (
    <Modal open={!!edit} onClose={onClose} title={r ? 'Editar premio' : 'Nuevo premio'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => guardar.mutate()} disabled={!valido} loading={guardar.isPending}>Guardar</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label="Nombre del premio" required maxLength={80} value={f.nombre} onChange={e => setF(v => ({ ...v, nombre: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Cuesta" required type="number" inputMode="numeric" min={1} value={f.costo} onChange={e => setF(v => ({ ...v, costo: e.target.value }))} />
          <Select label="En" value={f.unidad} onChange={e => setF(v => ({ ...v, unidad: e.target.value as 'puntos' | 'sellos' }))}>
            <option value="puntos">Puntos</option><option value="sellos">Sellos</option>
          </Select>
        </div>
        <Select label="Tipo de premio" value={f.tipo} onChange={e => setF(v => ({ ...v, tipo: e.target.value as RecompensaTipo }))}>
          {(Object.keys(TIPO_TXT) as RecompensaTipo[]).map(k => <option key={k} value={k}>{TIPO_TXT[k]}</option>)}
        </Select>
        {conValor && <Input label={f.tipo === 'descuento_pct' ? 'Porcentaje de descuento' : 'Valor del descuento (pesos)'} type="number" inputMode="numeric" min={1} value={f.valor} onChange={e => setF(v => ({ ...v, valor: e.target.value }))} />}
        <Textarea label="Descripción (opcional)" maxLength={400} value={f.descripcion} onChange={e => setF(v => ({ ...v, descripcion: e.target.value }))} />
        <Input label="Condiciones (opcional)" maxLength={400} placeholder="Ej: no aplica en domicilios" value={f.condiciones} onChange={e => setF(v => ({ ...v, condiciones: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Disponible desde" type="date" value={f.desde} onChange={e => setF(v => ({ ...v, desde: e.target.value }))} />
          <Input label="Disponible hasta" type="date" value={f.hasta} onChange={e => setF(v => ({ ...v, hasta: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Máx. por cliente" type="number" inputMode="numeric" min={1} placeholder="Sin límite" value={f.limite} onChange={e => setF(v => ({ ...v, limite: e.target.value }))} />
          <Input label="Existencias" type="number" inputMode="numeric" min={0} placeholder="Sin límite" value={f.stock} onChange={e => setF(v => ({ ...v, stock: e.target.value }))} />
        </div>
        <Select label="Nivel mínimo" value={f.nivel} onChange={e => setF(v => ({ ...v, nivel: e.target.value }))}>
          <option value="">Todos los clientes</option>
          {niveles.filter(n => n.activo).map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </Select>
        <div className="flex items-center justify-between"><span className="font-semibold text-[color:var(--w-text)]">Activo</span>
          <Toggle checked={f.activa} onChange={v => setF(x => ({ ...x, activa: v }))} label="Premio activo" /></div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Canjes (huella de auditoría) ───────────────────────── */

function CanjesSec() {
  const qc = useQueryClient()
  const canjes = useQuery({ queryKey: ['fid_canjes'], queryFn: () => fidelizacionService.getCanjes() })
  const [anular, setAnular] = useState<CanjeHistorial | null>(null)
  const [motivo, setMotivo] = useState('')
  const mut = useMutation({
    mutationFn: () => fidelizacionService.anularCanje(anular!.id, motivo.trim()),
    onSuccess: () => {
      message.success('Canje anulado y saldo devuelto'); setAnular(null); setMotivo('')
      qc.invalidateQueries({ queryKey: ['fid_canjes'] }); qc.invalidateQueries({ queryKey: ['fid_clientes'] }); qc.invalidateQueries({ queryKey: ['fid_premios_config'] })
    },
    onError: e => message.error(errMsg(e)),
  })
  return (
    <>
      <p className={ayudaTxt}>Cada canje queda con quién lo hizo y cuándo. Los últimos 100.</p>
      {canjes.isLoading && <StatePanel kind="loading" />}
      {canjes.isError && <StatePanel kind="error" text="No se pudo cargar el historial." />}
      {canjes.isSuccess && canjes.data.length === 0 && <StatePanel kind="empty" title="Sin canjes todavía" text="Aparecerán cuando el cajero canjee un premio." />}
      <div className="flex flex-col gap-2">
        {(canjes.data ?? []).map(c => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[color:var(--w-text)]">{c.recompensa} · {c.cliente}</p>
              <p className={ayudaTxt}>{num(c.costo)} {c.unidad} · {c.hecho_por} · {fechaHora(c.created_at)}</p>
              {c.estado === 'anulada' && <p className={ayudaTxt}>Anulado {fechaHora(c.anulada_at)}: {c.motivo_anulacion}</p>}
            </div>
            {c.estado === 'aplicada'
              ? <Button size="sm" variant="secondary" onClick={() => { setMotivo(''); setAnular(c) }}>Anular</Button>
              : <Badge tone="neutral">Anulado</Badge>}
          </Card>
        ))}
      </div>
      <Modal open={!!anular} onClose={() => setAnular(null)} title="Anular canje"
        footer={<><Button variant="secondary" onClick={() => setAnular(null)}>Cancelar</Button><Button onClick={() => mut.mutate()} disabled={motivo.trim().length < 3} loading={mut.isPending}>Anular canje</Button></>}>
        <div className="flex flex-col gap-3">
          <p className="text-[color:var(--w-text)]">Se devuelven {anular && num(anular.costo)} {anular?.unidad} a {anular?.cliente} y el premio vuelve a las existencias.</p>
          <Input label="Motivo" required value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: se canjeó por error" />
        </div>
      </Modal>
    </>
  )
}

/* ───────────────────────── Corte mensual ───────────────────────── */

function CorteSec() {
  const qc = useQueryClient()
  const cortes = useQuery({ queryKey: ['fid_cortes'], queryFn: () => fidelizacionService.getCortes() })
  const programa = useQuery({ queryKey: ['fid_programa'], queryFn: () => fidelizacionService.getPrograma() })
  const [confirmar, setConfirmar] = useState(false)
  const mes = mesAnterior()
  const yaCerrado = (cortes.data ?? []).some(c => c.mes === mes)
  const vence = programa.data?.meses_vencimiento

  const correr = useMutation({
    mutationFn: () => fidelizacionService.correrCorte(mes),
    onSuccess: r => {
      setConfirmar(false)
      message.success(r.ya_existia ? 'Ese mes ya estaba cerrado' : `Corte hecho. Puntos vencidos: ${num(r.puntos_expirados)}`)
      qc.invalidateQueries({ queryKey: ['fid_cortes'] }); qc.invalidateQueries({ queryKey: ['fid_clientes'] })
    },
    onError: e => { setConfirmar(false); message.error(errMsg(e)) },
  })

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div>
          <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">Cierre de {mesTexto(mes)}</p>
          <p className={ayudaTxt}>
            Guarda el resumen del mes, vuelve a calcular el nivel de cada cliente
            {vence ? ` y vence los puntos de quien lleva ${vence} meses sin comprar.` : '. Tus puntos no vencen (puedes activarlo en “Programa”).'}
            {' '}Cada mes se cierra una sola vez.
          </p>
        </div>
        <div>
          <Button onClick={() => setConfirmar(true)} disabled={yaCerrado || !programa.data} loading={correr.isPending}>
            {yaCerrado ? 'Mes ya cerrado' : `Cerrar ${mesTexto(mes)}`}
          </Button>
        </div>
      </Card>

      {cortes.isLoading && <StatePanel kind="loading" />}
      {cortes.isError && <StatePanel kind="error" text="No se pudieron cargar los cortes." />}
      {cortes.isSuccess && cortes.data.length === 0 && <StatePanel kind="empty" title="Aún no hay cortes" text="Aquí quedará el resumen de cada mes cerrado." />}
      <div className="flex flex-col gap-3">
        {(cortes.data ?? []).map(c => <CorteFila key={c.id} c={c} />)}
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Confirmar corte"
        footer={<><Button variant="secondary" onClick={() => setConfirmar(false)}>Cancelar</Button><Button onClick={() => correr.mutate()} loading={correr.isPending}>Sí, cerrar el mes</Button></>}>
        <p className="text-[color:var(--w-text)]">
          Vas a cerrar {mesTexto(mes)}.{vence ? ` Los clientes con ${vence} meses o más sin comprar perderán sus puntos.` : ''} Esto no se puede repetir ni deshacer.
        </p>
      </Modal>
    </>
  )
}

function CorteFila({ c }: { c: Corte }) {
  const r = c.resumen
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold first-letter:uppercase text-[color:var(--w-text)]">{mesTexto(c.mes)}</p>
        <p className={ayudaTxt}>{c.origen === 'automatico' ? 'Automático' : 'Manual'} · {fechaHora(c.ejecutado_at)}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)] sm:grid-cols-4">
        <span><b className="text-[color:var(--w-text)]">{num(r.compras)}</b> compras</span>
        <span><b className="text-[color:var(--w-text)]">{formatCOP(Number(r.ventas ?? 0))}</b> vendidos</span>
        <span><b className="text-[color:var(--w-text)]">{num(r.clientes_activos)}</b> clientes activos</span>
        <span><b className="text-[color:var(--w-text)]">{num(r.clientes_nuevos)}</b> nuevos</span>
        <span><b className="text-[color:var(--w-text)]">{num(r.puntos_emitidos)}</b> puntos dados</span>
        <span><b className="text-[color:var(--w-text)]">{num(r.puntos_canjeados)}</b> puntos canjeados</span>
        <span><b className="text-[color:var(--w-text)]">{num(c.puntos_expirados)}</b> puntos vencidos</span>
        <span><b className="text-[color:var(--w-text)]">{num(c.niveles_cambiados)}</b> cambios de nivel</span>
      </div>
    </Card>
  )
}
