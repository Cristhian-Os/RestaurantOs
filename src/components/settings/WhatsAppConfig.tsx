/**
 * WhatsAppConfig.tsx — "WhatsApp y domicilios" (solo administrador).
 * 1) Número de WhatsApp del restaurante. 2) Empresas o personas de reparto con su WhatsApp.
 * Solo guarda números; el bot sigue apagado hasta conectar la API de WhatsApp.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { CerebroBot } from './CerebroBot'
import { CampoTelefono } from '../fidelizacion/CampoTelefono'
import { telefonoLegible } from '../../services/fidelizacionService'
import { whatsappConfigService, type Repartidor, type WaConfig } from '../../services/whatsappConfigService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.2A8 8 0 1121 12z" /></svg>
)

export function WhatsAppConfig() {
  const qc = useQueryClient()
  const cfg = useQuery({ queryKey: ['wa_config'], queryFn: () => whatsappConfigService.getConfig() })
  const reps = useQuery({ queryKey: ['repartidores'], queryFn: () => whatsappConfigService.getRepartidores() })
  const [numero, setNumero] = useState<string | null>(null) // null = sin cambios
  const [edit, setEdit] = useState<Repartidor | 'nuevo' | null>(null)

  const guardarNumero = useMutation({
    mutationFn: () => whatsappConfigService.setNumeroNegocio(cfg.data ?? null, numero || null),
    onSuccess: () => { message.success('Número guardado'); setNumero(null); qc.invalidateQueries({ queryKey: ['wa_config'] }) },
    onError: e => message.error(errMsg(e)),
  })
  const alternar = useMutation({
    mutationFn: (r: Repartidor) => whatsappConfigService.editarRepartidor(r.id, { activo: !r.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repartidores'] }),
    onError: e => message.error(errMsg(e)),
  })

  const guardado = cfg.data?.numero_negocio ?? ''
  const hayCambio = numero !== null && numero !== guardado

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader icon={<ChatIcon />} title="WhatsApp y domicilios" subtitle="El número de tu restaurante y los repartidores a los que se les avisa" />

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">WhatsApp de tu restaurante</p>
          <Badge tone="neutral">Sin conectar</Badge>
        </div>
        {cfg.isLoading ? <StatePanel kind="loading" /> : (
          <>
            <CampoTelefono key={guardado} label="Número" inicial={guardado} onChange={setNumero} />
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
              Es el número por el que tus clientes te escriben. Aquí solo se guarda; el envío automático se activa cuando conectemos WhatsApp.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => guardarNumero.mutate()} disabled={!hayCambio} loading={guardarNumero.isPending}>Guardar número</Button>
            </div>
          </>
        )}
      </Card>

      {!cfg.isLoading && <CerebroBot key={cfg.data?.restaurant_id ?? 'nuevo'} cfg={cfg.data ?? null} />}

      {!cfg.isLoading && <MinutosEntrega key={cfg.data?.minutos_confirmar_entrega ?? 'def'} cfg={cfg.data ?? null} />}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">Empresas de repartidores</p>
          <Button size="sm" onClick={() => setEdit('nuevo')}>Agregar</Button>
        </div>
        {reps.isLoading && <StatePanel kind="loading" />}
        {reps.data?.length === 0 && (
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aún no hay repartidores. Agrega la empresa o persona que lleva tus domicilios.</p>
        )}
        {reps.data?.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--w-border)] pt-3 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <p className="truncate font-semibold">{r.nombre}</p>
              <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{telefonoLegible(r.telefono)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!r.activo && <Badge tone="neutral">Pausado</Badge>}
              <Button size="sm" variant="secondary" onClick={() => setEdit(r)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => alternar.mutate(r)} disabled={alternar.isPending}>{r.activo ? 'Pausar' : 'Activar'}</Button>
            </div>
          </div>
        ))}
      </Card>

      {edit && (
        <RepartidorModal
          key={edit === 'nuevo' ? 'nuevo' : edit.id}
          repartidor={edit === 'nuevo' ? null : edit}
          onClose={() => setEdit(null)}
          onGuardado={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['repartidores'] }) }}
        />
      )}
    </div>
  )
}

function MinutosEntrega({ cfg }: { cfg: WaConfig | null }) {
  const qc = useQueryClient()
  const guardado = cfg?.minutos_confirmar_entrega ?? 20
  const [txt, setTxt] = useState(String(guardado))
  const n = Number(txt)
  const valido = txt.trim() !== '' && Number.isInteger(n) && n >= 5 && n <= 120
  const guardar = useMutation({
    mutationFn: () => whatsappConfigService.setMinutosConfirmar(cfg, n),
    onSuccess: () => { message.success('Tiempo guardado'); qc.invalidateQueries({ queryKey: ['wa_config'] }) },
    onError: e => message.error(errMsg(e)),
  })
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-bold">Confirmar la entrega</p>
      <Input label="Minutos de espera" inputMode="numeric" maxLength={3} value={txt}
        onChange={e => setTxt(e.target.value.replace(/\D/g, ''))}
        hint="Si nadie cierra la entrega, el bot le pregunta al repartidor después de estos minutos. Entre 5 y 120."
        error={txt !== '' && !valido ? 'Escribe un número entre 5 y 120' : undefined} />
      <div className="flex justify-end">
        <Button onClick={() => guardar.mutate()} disabled={!valido || n === guardado} loading={guardar.isPending}>Guardar tiempo</Button>
      </div>
    </Card>
  )
}

function RepartidorModal({ repartidor, onClose, onGuardado }: { repartidor: Repartidor | null; onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(repartidor?.nombre ?? '')
  const [tel, setTel] = useState(repartidor?.telefono ?? '')

  const guardar = useMutation({
    mutationFn: () => repartidor
      ? whatsappConfigService.editarRepartidor(repartidor.id, { nombre: nombre.trim(), telefono: tel })
      : whatsappConfigService.crearRepartidor(nombre, tel),
    onSuccess: () => { message.success('Repartidor guardado'); onGuardado() },
    onError: e => message.error(errMsg(e)),
  })

  return (
    <Modal open onClose={onClose} title={repartidor ? 'Editar repartidor' : 'Nuevo repartidor'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => guardar.mutate()} disabled={nombre.trim().length < 2 || tel.length < 8} loading={guardar.isPending}>Guardar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Input label="Nombre de la empresa o persona" required autoFocus value={nombre} onChange={e => setNombre(e.target.value)} />
        <CampoTelefono label="WhatsApp" inicial={repartidor?.telefono} onChange={setTel} />
      </div>
    </Modal>
  )
}
