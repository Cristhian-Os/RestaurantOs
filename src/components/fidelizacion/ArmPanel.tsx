/**
 * ArmPanel.tsx — Asistente de clientes (ARM), solo administrador.
 * Muestra las sugerencias que la base arma con reglas fijas (sin IA) y deja aprobar o rechazar.
 * Aprobar solo anota la decisión: no se envía ningún mensaje desde aquí.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge, type Tone } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { fidelizacionService, type ArmAccion } from '../../services/fidelizacionService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const ayuda = 'text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]'

const ESTADO: Record<ArmAccion['estado'], { texto: string; tono: Tone }> = {
  propuesta: { texto: 'Por decidir', tono: 'accent' }, aprobada: { texto: 'Aprobada', tono: 'success' }, rechazada: { texto: 'Rechazada', tono: 'neutral' },
  ejecutada: { texto: 'Hecha', tono: 'success' }, fallida: { texto: 'Falló', tono: 'danger' }, expirada: { texto: 'Venció', tono: 'neutral' },
}

/** Datos reales de los que sale la sugerencia, en palabras sencillas. */
function Evidencia({ e }: { e: Record<string, unknown> }) {
  const total = typeof e.total === 'number' ? e.total : null
  const cons = typeof e.con_consentimiento === 'number' ? e.con_consentimiento : null
  const lista = (Array.isArray(e.mayor_gasto) ? e.mayor_gasto : Array.isArray(e.clientes) ? e.clientes : [])
    .map(x => (typeof x === 'string' ? x : (x as { nombre?: string }).nombre ?? '')).filter(Boolean)
  return (
    <div className={`${ayuda} flex flex-col gap-0.5`}>
      {total !== null && <span>{total} cliente{total === 1 ? '' : 's'} en esta sugerencia</span>}
      {cons !== null && <span>{cons} aceptaron recibir mensajes</span>}
      {lista.length > 0 && <span>Por ejemplo: {lista.slice(0, 5).join(', ')}</span>}
    </div>
  )
}

const IconoArm = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 17l.7 1.8L21.5 19.5l-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z" />
  </svg>
)

export function ArmPanel() {
  const qc = useQueryClient()
  const acciones = useQuery({ queryKey: ['arm_acciones'], queryFn: () => fidelizacionService.getArmAcciones() })
  const [decidiendo, setDecidiendo] = useState<{ a: ArmAccion; aprobar: boolean } | null>(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['arm_acciones'] })

  const generar = useMutation({
    mutationFn: () => fidelizacionService.generarSugerencias(),
    onSuccess: n => { message.success(n === 0 ? 'No hay sugerencias nuevas por ahora' : `${n} sugerencia${n === 1 ? '' : 's'} nueva${n === 1 ? '' : 's'}`); refrescar() },
    onError: e => message.error(errMsg(e)),
  })
  const decidir = useMutation({
    mutationFn: () => fidelizacionService.decidirArm(decidiendo!.a.id, decidiendo!.aprobar),
    onSuccess: () => { message.success(decidiendo?.aprobar ? 'Sugerencia aprobada' : 'Sugerencia rechazada'); setDecidiendo(null); refrescar() },
    onError: e => { message.error(errMsg(e)); setDecidiendo(null); refrescar() },
  })

  const todas = acciones.data ?? []
  const pendientes = todas.filter(a => a.estado === 'propuesta' && new Date(a.expira_at) > new Date())
  const historial = todas.filter(a => !pendientes.includes(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ModuleHeader icon={IconoArm} title="Asistente de clientes" subtitle="Ideas para traer de vuelta a tus clientes"
        actions={<Button onClick={() => generar.mutate()} loading={generar.isPending}>Buscar sugerencias</Button>} />
      <p className={ayuda}>El asistente revisa tus clientes con reglas fijas y te propone qué hacer. Aprobar solo guarda tu decisión: no se envía ningún mensaje.</p>

      {acciones.isLoading && <StatePanel kind="loading" />}
      {acciones.isError && <StatePanel kind="error" text="No se pudieron cargar las sugerencias." />}
      {acciones.isSuccess && pendientes.length === 0 && (
        <StatePanel kind="empty" title="Nada pendiente" text="Pulsa “Buscar sugerencias” para revisar tus clientes ahora." />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pendientes.map(a => (
          <Card key={a.id} className="flex flex-col gap-2">
            <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">{a.titulo}</p>
            <p className="text-[length:var(--w-fs-body)] text-[color:var(--w-text-2)]">{a.razon}</p>
            <Evidencia e={a.evidencia} />
            <p className={ayuda}>Vence el {fecha(a.expira_at)}</p>
            <div className="flex gap-2">
              <Button onClick={() => setDecidiendo({ a, aprobar: true })}>Aprobar</Button>
              <Button variant="secondary" onClick={() => setDecidiendo({ a, aprobar: false })}>Rechazar</Button>
            </div>
          </Card>
        ))}
      </div>

      {historial.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="font-bold text-[color:var(--w-text)]">Anteriores</p>
          {historial.map(a => (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[color:var(--w-text)]">{a.titulo}</p>
                <p className={ayuda}>{a.decidida_at ? `Decidida el ${fecha(a.decidida_at)}` : `Creada el ${fecha(a.created_at)}`}</p>
              </div>
              <Badge tone={ESTADO[a.estado].tono}>{a.estado === 'propuesta' ? 'Venció' : ESTADO[a.estado].texto}</Badge>
            </Card>
          ))}
        </section>
      )}

      <Modal open={!!decidiendo} onClose={() => setDecidiendo(null)} title={decidiendo?.aprobar ? 'Aprobar sugerencia' : 'Rechazar sugerencia'}
        footer={<><Button variant="secondary" onClick={() => setDecidiendo(null)}>Cancelar</Button>
          <Button onClick={() => decidir.mutate()} loading={decidir.isPending}>{decidiendo?.aprobar ? 'Sí, aprobar' : 'Sí, rechazar'}</Button></>}>
        <p className="text-[color:var(--w-text)]">
          {decidiendo?.aprobar
            ? `Se guardará que aprobaste “${decidiendo.a.titulo}”. Por ahora no se envía ningún mensaje.`
            : `“${decidiendo?.a.titulo}” se descartará. No volverá a aparecer en 2 semanas.`}
        </p>
      </Modal>
    </div>
  )
}
