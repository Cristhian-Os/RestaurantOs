/**
 * ConexionGoogle.tsx — conecta el buzón de ventas (Google Workspace) con Central para correo y calendario.
 * Aquí solo se establece la conexión: todavía NO se envía ningún correo ni se crea ninguna cita. Se puede desconectar cuando quieras.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { googleOauth, type EstadoGoogle } from '../acciones.ts'
import { AvisoHonesto, ErrorAccion, TituloBloque } from '../ui.tsx'

export function ConexionGoogle() {
  const [est, setEst] = useState<EstadoGoogle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [secreto, setSecreto] = useState('')
  const [pasos, setPasos] = useState(false)
  const leer = useCallback(async () => { const r = await googleOauth<EstadoGoogle>('estado'); if (r.ok === true) { setEst(r.datos); setError(null) } else setError(r.mensaje) }, [])
  useEffect(() => { void leer() }, [leer])
  const accion = async (clave: string, fn: () => Promise<string | null>) => { setOcupado(clave); setError(null); const e = await fn(); setOcupado(null); if (e) setError(e); await leer() }
  const guardar = () => accion('guardar', async () => { const r = await googleOauth('guardar_cliente', { id, secreto }); if (r.ok !== true) return r.mensaje; setId(''); setSecreto(''); return null })
  const conectar = () => accion('conectar', async () => {
    const r = await googleOauth<{ ok: boolean; url: string }>('url')
    if (r.ok !== true) return r.mensaje
    window.open(r.datos.url, '_blank', 'noopener')
    return null
  })
  const desconectar = () => { if (window.confirm('¿Desconectar la cuenta de Google? Central dejará de poder usar ese correo y ese calendario.')) void accion('desconectar', async () => { const r = await googleOauth('desconectar'); return r.ok === true ? null : r.mensaje }) }
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Conexión con Google (correo y calendario)</TituloBloque>
      <AvisoHonesto>Conecta el buzón de ventas de tu Google Workspace. Aquí solo se establece la conexión: todavía no se envía ningún correo ni se crea ninguna cita. Los permisos son los mínimos (enviar y leer correo, y eventos del calendario) y se pueden revocar cuando quieras.</AvisoHonesto>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">Cuenta de Google</p>
          <Badge tone={est?.conectado ? 'success' : 'neutral'}>{est === null ? '…' : est.conectado ? 'Conectada' : 'Sin conectar'}</Badge></div>
        {est?.cuenta && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Cuenta: <b>{est.cuenta}</b></p>}
        <ErrorAccion texto={error} />
        {!est?.conectado && (<>
          <div><Button size="sm" variant="ghost" onClick={() => setPasos(!pasos)}>{pasos ? 'Ocultar los pasos' : 'Ver los pasos para crear la conexión en Google'}</Button></div>
          {pasos && (
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
              <li>Entra a <b>console.cloud.google.com</b> con la cuenta de Workspace del buzón de ventas y crea un proyecto (por ejemplo "RestaurantOS Central").</li>
              <li>En <b>APIs y servicios → Biblioteca</b>, activa <b>Gmail API</b> y <b>Google Calendar API</b>.</li>
              <li>En <b>Pantalla de consentimiento de OAuth</b>, elige tipo de usuario <b>Interno</b> (solo aparece con Workspace) y pon un nombre y tu correo de soporte.</li>
              <li>En <b>Credenciales → Crear credenciales → ID de cliente de OAuth</b>, tipo <b>Aplicación web</b>. En "URI de redireccionamiento autorizados" pega exactamente: <b className="break-all">{est?.redirect_uri ?? '…'}</b></li>
              <li>Copia el <b>ID de cliente</b> y el <b>secreto</b>, pégalos aquí abajo y pulsa Guardar. Luego "Conectar con Google" y acepta los permisos.</li>
            </ol>
          )}
          <Input label="ID de cliente" value={id} onChange={e => setId(e.target.value)} placeholder="123456789012-xxxx.apps.googleusercontent.com" autoComplete="off" />
          <Input label="Secreto del cliente" type="password" value={secreto} onChange={e => setSecreto(e.target.value)} autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={ocupado === 'guardar'} disabled={!id.trim() || !secreto.trim()} onClick={() => void guardar()}>Guardar</Button>
            <Button size="sm" loading={ocupado === 'conectar'} disabled={!est?.cliente} onClick={() => void conectar()}>Conectar con Google</Button>
            <Button size="sm" variant="ghost" onClick={() => void leer()}>Ya la conecté: actualizar</Button>
          </div>
        </>)}
        {est?.conectado && <div><Button size="sm" variant="secondary" loading={ocupado === 'desconectar'} onClick={desconectar}>Desconectar</Button></div>}
      </Card>
    </div>
  )
}
