/**
 * WhatsAppLlaves.tsx — llaves de Meta para WhatsApp (solo super_admin, dentro de MfaGate).
 * Las llaves son de solo escritura: el campo nunca se rellena ni se muestra de vuelta;
 * tras guardar se vacía y solo queda el estado "Cargada ✓ (fecha)" o "Falta".
 */
import { useState } from 'react'
import { message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'
import { whatsappCredencialesService as svc } from '../../services/whatsappCredencialesService'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { tarjeta, suave, etiqueta, campo } from './platformUi'

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/whatsapp-webhook`

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function Estado({ ok, cuando }: { ok: boolean; cuando?: string | null }) {
  return ok
    ? <Badge tone="success">Cargada{cuando ? ` (${fecha(cuando)})` : ''}</Badge>
    : <Badge tone="warning">Falta</Badge>
}

const msgError = (e: unknown) => message.error(e instanceof Error ? e.message : 'No se pudo completar la acción.')

function BloquePlataforma() {
  const qc = useQueryClient()
  const { data: est } = useQuery({ queryKey: ['wa-plataforma-estado'], queryFn: svc.estadoPlataforma })
  const [secret, setSecret] = useState('')
  const [verify, setVerify] = useState('')
  const [acceso, setAcceso] = useState('')
  const [busy, setBusy] = useState(false)

  const guardar = async () => {
    setBusy(true)
    try {
      await svc.guardarPlataforma(secret, verify, acceso)
      setSecret(''); setVerify(''); setAcceso('')
      await qc.invalidateQueries({ queryKey: ['wa-plataforma-estado'] })
      message.success('Llaves guardadas')
    } catch (e) { msgError(e) } finally { setBusy(false) }
  }

  return (
    <section style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 'var(--w-fs-title)', fontWeight: 700 }}>Plataforma (una sola vez para todos)</h2>
        <p style={{ ...suave, margin: '0.25rem 0 0' }}>Estas llaves sirven para todos los restaurantes. Déjalas vacías para conservar la que ya está.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>App Secret</strong><Estado ok={!!est?.tiene_app_secret} cuando={est?.actualizado_at} />
        </div>
        <Input label="Nuevo App Secret" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)}
          hint="En Meta: tu app → Configuración de la app → Básica → Clave secreta de la app." />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Token de verificación del webhook</strong><Estado ok={!!est?.tiene_verify_token} cuando={est?.actualizado_at} />
        </div>
        <Input label="Nuevo token de verificación" type="password" autoComplete="off" value={verify} onChange={e => setVerify(e.target.value)}
          hint="Es una frase que tú inventas. Pégala igual en Meta cuando configures el webhook." />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Token permanente (usuario del sistema)</strong><Estado ok={!!est?.tiene_access_token} cuando={est?.actualizado_at} />
        </div>
        <Input label="Nuevo token permanente" type="password" autoComplete="off" value={acceso} onChange={e => setAcceso(e.target.value)}
          hint="Un solo token de un usuario del sistema de Meta sirve para todos los números de tu negocio en Meta. Pasos: business.facebook.com → Configuración del negocio → Usuarios → Usuarios del sistema → crear uno tipo Administrador → asignarle la app y la cuenta de WhatsApp → Generar token con los permisos whatsapp_business_messaging y whatsapp_business_management." />
      </div>
      <div>
        <Button onClick={guardar} loading={busy} disabled={!secret.trim() && !verify.trim() && !acceso.trim()}>Guardar llaves</Button>
      </div>
      <div>
        <span style={etiqueta}>Dirección del webhook (pégala en Meta)</span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <code style={{ ...campo, flex: '1 1 16rem', display: 'flex', alignItems: 'center', wordBreak: 'break-all', userSelect: 'all' }}>{WEBHOOK_URL}</code>
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(WEBHOOK_URL).then(() => message.success('Dirección copiada'), () => message.error('No se pudo copiar'))}>Copiar</Button>
        </div>
      </div>
    </section>
  )
}

function BloqueRestaurante() {
  const qc = useQueryClient()
  const [rid, setRid] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const { data: lista } = useQuery({
    queryKey: ['wa-restaurantes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plataforma_restaurantes')
      if (error) throw new Error('No se pudo cargar la lista de restaurantes.')
      return ((data ?? []) as { id: string; nombre: string }[]).map(r => ({ id: r.id, nombre: r.nombre }))
    },
  })
  const { data: est } = useQuery({
    queryKey: ['wa-cred-estado', rid], enabled: !!rid, queryFn: () => svc.estadoRestaurante(rid),
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['wa-cred-estado', rid] })

  const elegir = (id: string) => { setRid(id); setToken('') }
  const guardar = async () => {
    setBusy(true)
    try {
      await svc.guardarToken(rid, token)
      setToken(''); await refrescar(); message.success('Token guardado')
    } catch (e) { msgError(e) } finally { setBusy(false) }
  }
  const borrar = async () => {
    setBusy(true)
    try {
      await svc.borrarToken(rid)
      setConfirmar(false); setToken(''); await refrescar(); message.success('Token borrado')
    } catch (e) { msgError(e) } finally { setBusy(false) }
  }
  const nombre = lista?.find(r => r.id === rid)?.nombre ?? ''

  return (
    <section style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 'var(--w-fs-title)', fontWeight: 700 }}>Excepción por restaurante (solo si ese restaurante usa su propia cuenta de Meta)</h2>
        <p style={{ ...suave, margin: '0.25rem 0 0' }}>Si no cargas nada aquí, el restaurante usa el token de la plataforma.</p>
      </div>
      <div>
        <label htmlFor="wa-rest" style={etiqueta}>Restaurante</label>
        <select id="wa-rest" style={campo} value={rid} onChange={e => elegir(e.target.value)}>
          <option value="">Elige un restaurante…</option>
          {(lista ?? []).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>
      {rid && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>Token de {nombre}</strong>
            {est?.tiene_token ? <Badge tone="success">Llave propia{est.actualizado_at ? ` (${fecha(est.actualizado_at)})` : ''}</Badge>
              : est?.usa_plataforma ? <Badge tone="info">Usa la llave de la plataforma</Badge>
              : <Badge tone="warning">Falta</Badge>}
          </div>
          <Input label="Token permanente (usuario del sistema)" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
            hint="Solo si este restaurante usa otra cuenta de Meta. Se guarda sin mostrarse." />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button onClick={guardar} loading={busy} disabled={!token.trim()}>Guardar</Button>
            <Button variant="danger" onClick={() => setConfirmar(true)} disabled={busy || !est?.tiene_token}>Borrar</Button>
          </div>
        </>
      )}
      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="¿Borrar el token?"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmar(false)}>Cancelar</Button>
          <Button variant="danger" onClick={borrar} loading={busy}>Sí, borrar</Button>
        </>}>
        <p style={{ margin: 0 }}>Se borrará el token de <strong>{nombre}</strong>. Ese restaurante volverá a usar la llave de la plataforma (si está cargada).</p>
      </Modal>
    </section>
  )
}

export function WhatsAppLlaves() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <BloquePlataforma />
      <BloqueRestaurante />
    </div>
  )
}
