/**
 * DomiciliosPanel.tsx — domicilios abiertos para Caja (administrador y cajero).
 * Comprobante de transferencia (confirmar/rechazar), contra entrega (lo que paga el repartidor)
 * y cierre de la entrega con el código del cliente.
 */
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge, type Tone } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { formatCOP } from '../../config/billing'
import { domiciliosService, type Domicilio, type PagoEstado, type RepartidorLite } from '../../services/domiciliosService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')

const PAGO: Record<PagoEstado, { txt: string; tone: Tone }> = {
  sin_definir:           { txt: 'Pago sin definir', tone: 'neutral' },
  pendiente_comprobante: { txt: 'Falta el comprobante', tone: 'warning' },
  comprobante_enviado:   { txt: 'Comprobante por revisar', tone: 'info' },
  confirmado:            { txt: 'Pagado', tone: 'success' },
  contra_entrega:        { txt: 'Paga al recibir', tone: 'accent' },
  pagado_por_repartidor: { txt: 'Pagado por el repartidor', tone: 'success' },
}
const SIGUIENTE: Record<string, { estado: string; txt: string }> = {
  recibido:            { estado: 'confirmado', txt: 'Confirmar pedido' },
  confirmado:          { estado: 'preparando', txt: 'Pasar a preparación' },
  preparando:          { estado: 'listo', txt: 'Marcar listo' },
  asignado:           { estado: 'recogido', txt: 'El repartidor lo recogió' },
  recogido:            { estado: 'en_camino', txt: 'Va en camino' },
}
const ESTADO_TXT: Record<string, string> = {
  recibido: 'Recibido', confirmado: 'Confirmado', preparando: 'Preparando', listo: 'Listo', buscando_repartidor: 'Buscando repartidor',
  asignado: 'Con repartidor', recogido: 'Recogido', en_camino: 'En camino',
}

type Accion =
  | { tipo: 'rechazar' | 'cancelar' | 'sin_codigo'; d: Domicilio }
  | { tipo: 'codigo'; d: Domicilio }
  | { tipo: 'cobro'; d: Domicilio }

function Comprobante({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let vivo = true; domiciliosService.urlComprobante(path).then(u => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [path])
  if (!url) return <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Cargando comprobante…</p>
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Comprobante de transferencia" className="max-h-56 w-full rounded-[var(--w-r-md)] object-contain" /></a>
}

function ModalAccion({ accion, onClose, onDone }: { accion: Accion | null; onClose: () => void; onDone: () => void }) {
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [cobro, setCobro] = useState<{ pagar_restaurante: number; domicilio: number; cobrar_cliente: number } | null>(null)
  const id = accion?.d.id
  useEffect(() => {
    setTexto(''); setCobro(null)
    if (accion?.tipo === 'cobro') domiciliosService.cobroRepartidor(accion.d.id).then(setCobro).catch(e => message.error(errMsg(e)))
  }, [accion])
  if (!accion || !id) return null

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try { await fn(); message.success(ok); onDone(); onClose() } catch (e) { message.error(errMsg(e)) } finally { setBusy(false) }
  }
  const titulo = { rechazar: 'Rechazar comprobante', cancelar: 'Cancelar domicilio', sin_codigo: 'Entregado sin código', codigo: 'Cerrar entrega', cobro: 'Cobro al repartidor' }[accion.tipo]
  const pedirTexto = accion.tipo === 'rechazar' || accion.tipo === 'cancelar' || accion.tipo === 'sin_codigo'

  const confirmar = () => {
    if (accion.tipo === 'rechazar') return run(() => domiciliosService.rechazarPago(id, texto), 'Comprobante rechazado')
    if (accion.tipo === 'cancelar') return run(() => domiciliosService.cambiarEstado(id, 'cancelado', texto), 'Domicilio cancelado')
    if (accion.tipo === 'sin_codigo') return run(() => domiciliosService.cerrarSinCodigo(id, texto), 'Entrega cerrada')
    if (accion.tipo === 'cobro') return run(() => domiciliosService.cobrarRepartidor(id), 'Pago del repartidor registrado')
    setBusy(true)
    domiciliosService.cerrarConCodigo(id, texto.trim())
      .then(ok => { if (ok) { message.success('Entrega cerrada'); onDone(); onClose() } else message.warning('Código incorrecto') })
      .catch(e => message.error(errMsg(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Modal open onClose={onClose} title={titulo}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Volver</Button>
        <Button loading={busy} disabled={(pedirTexto && texto.trim().length < 3) || (accion.tipo === 'codigo' && texto.trim().length !== 4)} onClick={confirmar}>
          {accion.tipo === 'cobro' ? 'Ya pagó' : 'Confirmar'}
        </Button>
      </div>}>
      <div className="flex flex-col gap-3">
        {accion.tipo === 'cobro' && (cobro ? (
          <>
            <p>El repartidor paga en caja el pedido: <b>{formatCOP(cobro.pagar_restaurante)}</b></p>
            <p>Al cliente le cobra pedido + domicilio: <b>{formatCOP(cobro.cobrar_cliente)}</b> (domicilio {formatCOP(cobro.domicilio)})</p>
          </>
        ) : <StatePanel kind="loading" />)}
        {accion.tipo === 'codigo' && <><p>Escribe el código de 4 números que le dio el cliente al repartidor.</p>
          <Input label="Código" inputMode="numeric" maxLength={4} value={texto} onChange={e => setTexto(e.target.value.replace(/\D/g, ''))} placeholder="0000" />
          <button type="button" className="text-left text-[length:var(--w-fs-label)] underline text-[color:var(--w-text-2)]" onClick={() => onClose()}>
            ¿No hay código? Usa «Entregado sin código» en la tarjeta.
          </button></>}
        {pedirTexto && <><p>{accion.tipo === 'sin_codigo' ? 'Escribe por qué se cierra sin código.' : 'Escribe el motivo.'}</p>
          <Input label="Motivo" value={texto} onChange={e => setTexto(e.target.value)} maxLength={300} /></>}
      </div>
    </Modal>
  )
}

function AsignarRepartidor({ d, reps, busy, onAsignar }: { d: Domicilio; reps: RepartidorLite[]; busy: boolean; onAsignar: (repId: string) => void }) {
  const [sel, setSel] = useState('')
  const activos = reps.filter(r => r.activo)
  if (activos.length === 0) {
    return <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay repartidores: agrégalos en Configuración → WhatsApp y domicilios.</p>
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label="Repartidor" aria-label={`Repartidor del pedido de ${d.contacto_nombre ?? 'cliente'}`} value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">Elegir…</option>
        {activos.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </Select>
      <Button size="sm" loading={busy} disabled={!sel} onClick={() => onAsignar(sel)}>Asignar repartidor</Button>
    </div>
  )
}

function Tarjeta({ d, reps, onAccion, onChanged }: { d: Domicilio; reps: RepartidorLite[]; onAccion: (a: Accion) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const repartidor = reps.find(r => r.id === d.repartidor_id)
  // Contra entrega: el repartidor paga en caja ANTES de llevarse el pedido (la base también lo exige).
  const faltaPagoRepartidor = d.metodo_pago === 'contra_entrega' && d.pago_estado === 'contra_entrega'
  const pago = PAGO[d.pago_estado]
  const sig = SIGUIENTE[d.estado]
  const bloqueado = d.metodo_pago === 'transferencia' && d.pago_estado !== 'confirmado'
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) message.success(ok); onChanged() } catch (e) { message.error(errMsg(e)) } finally { setBusy(false) }
  }
  const total = d.orders?.total ?? 0
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          {d.orders?.order_number_today ? `#${d.orders.order_number_today} · ` : ''}{d.contacto_nombre ?? 'Cliente'}
        </p>
        <div className="flex flex-wrap gap-1.5"><Badge tone="neutral">{ESTADO_TXT[d.estado] ?? d.estado}</Badge><Badge tone={pago.tone}>{pago.txt}</Badge></div>
      </div>
      <div className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
        <p>{d.direccion}{d.referencia ? ` · ${d.referencia}` : ''}</p>
        <p>Pedido {formatCOP(total)} + domicilio {formatCOP(d.costo_envio)} = <b>{formatCOP(total + d.costo_envio)}</b></p>
        {d.codigo_recogida && <p>Código de recogida: <b>{d.codigo_recogida}</b></p>}
        {repartidor && <p>Repartidor: <b>{repartidor.nombre}</b></p>}
      </div>
      {['listo', 'buscando_repartidor'].includes(d.estado) && !bloqueado && (
        <AsignarRepartidor d={d} reps={reps} busy={busy}
          onAsignar={id => run(() => domiciliosService.asignarRepartidor(d.id, id), 'Repartidor asignado')} />
      )}

      {d.pago_rechazo && d.pago_estado === 'pendiente_comprobante' && <p className="text-[color:var(--w-danger-text)]">Comprobante rechazado: {d.pago_rechazo}</p>}
      {d.metodo_pago === 'transferencia' && d.pago_estado === 'comprobante_enviado' && d.comprobante_path && <Comprobante path={d.comprobante_path} />}

      {faltaPagoRepartidor && ['listo', 'buscando_repartidor', 'asignado'].includes(d.estado) && (
        <p className="text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-warning-text)]">
          El repartidor debe pagar en caja antes de llevarse el pedido. Usa «Cobro al repartidor».
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {d.metodo_pago === 'transferencia' && d.pago_estado === 'comprobante_enviado' && (<>
          <Button size="sm" loading={busy} onClick={() => run(() => domiciliosService.confirmarPago(d.id), 'Pago confirmado: el pedido pasa a cocina')}>Confirmar pago</Button>
          <Button size="sm" variant="danger" onClick={() => onAccion({ tipo: 'rechazar', d })}>Rechazar</Button>
        </>)}
        {d.metodo_pago === 'transferencia' && (d.pago_estado === 'pendiente_comprobante' || d.pago_estado === 'comprobante_enviado') && (
          <label className="inline-flex cursor-pointer items-center rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] px-3 py-1.5 text-[length:var(--w-fs-label)] font-semibold">
            {d.pago_estado === 'pendiente_comprobante' ? 'Adjuntar comprobante' : 'Cambiar comprobante'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => domiciliosService.subirComprobante(d, f), 'Comprobante guardado') }} />
          </label>
        )}
        {d.pago_estado === 'contra_entrega' && ['listo', 'buscando_repartidor', 'asignado'].includes(d.estado) && (
          <Button size="sm" variant="secondary" onClick={() => onAccion({ tipo: 'cobro', d })}>Cobro al repartidor</Button>
        )}
        {sig && !bloqueado && <Button size="sm" loading={busy} disabled={faltaPagoRepartidor && ['recogido', 'en_camino'].includes(sig.estado)} onClick={() => run(() => domiciliosService.cambiarEstado(d.id, sig.estado))}>{sig.txt}</Button>}
        {['recogido', 'en_camino'].includes(d.estado) && (<>
          <Button size="sm" onClick={() => onAccion({ tipo: 'codigo', d })}>Cerrar con código</Button>
          <Button size="sm" variant="secondary" onClick={() => onAccion({ tipo: 'sin_codigo', d })}>Entregado sin código</Button>
        </>)}
        {!['recogido', 'en_camino'].includes(d.estado) && <Button size="sm" variant="ghost" onClick={() => onAccion({ tipo: 'cancelar', d })}>Cancelar</Button>}
      </div>
    </Card>
  )
}

export function DomiciliosPanel() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['domicilios_abiertos'], queryFn: () => domiciliosService.abiertos(), refetchInterval: 15000 })
  const reps = useQuery({ queryKey: ['repartidores_lite'], queryFn: () => domiciliosService.repartidores() })
  const [accion, setAccion] = useState<Accion | null>(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['domicilios_abiertos'] })
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" /></svg>}
        title="Domicilios" subtitle="Pagos, repartidor y entrega" />
      {q.isLoading ? <StatePanel kind="loading" />
        : q.isError ? <StatePanel kind="error" />
        : (q.data ?? []).length === 0 ? <StatePanel kind="empty" />
        : (q.data ?? []).map(d => <Tarjeta key={d.id} d={d} reps={reps.data ?? []} onAccion={setAccion} onChanged={refrescar} />)}
      <ModalAccion accion={accion} onClose={() => setAccion(null)} onDone={refrescar} />
    </div>
  )
}
