/**
 * TrabajoAgentes.tsx — interruptor de los agentes, cola de trabajos y botones "Crear el de hoy" / "Ejecutar ahora".
 * Hoy los agentes SOLO investigan (Mateo busca negocios en la web dentro de una campaña vigente) y proponen: no contactan a nadie.
 * Quien decide si pueden correr es la base (interruptor, campaña vigente, tope de gasto); esta pantalla solo lo pide y lo muestra.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../services/supabaseClient'
import { moverInterruptor, pedirAlTrabajador, textoError, type RespuestaTrabajador } from '../acciones.ts'
import { AvisoHonesto, ErrorAccion, TituloBloque } from '../ui.tsx'

interface Trabajo { id: string; tipo: string; agente_id: string; estado: string; intentos: number; error: string | null; costo: number; resultado: Record<string, unknown> | null; created_at: string }

const ETQ: Record<string, string> = {
  pending: 'En espera', scheduled: 'Programado', running: 'Corriendo', waiting_approval: 'Espera tu aprobación', succeeded: 'Terminado', failed: 'Falló',
  retrying: 'Reintentando', cancelled: 'Cancelado', expired: 'Venció', paused: 'En pausa',
}
const TONO: Record<string, Tone> = { succeeded: 'success', running: 'info', pending: 'neutral', scheduled: 'neutral', retrying: 'warning', paused: 'warning', waiting_approval: 'warning', failed: 'danger', cancelled: 'danger', expired: 'neutral' }
const TIPO: Record<string, string> = { investigar_prospectos: 'Buscar negocios', redactar_borrador: 'Redactar borrador', informe_diario: 'Informe diario', prueba: 'Prueba' }
const hora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function resumen(r: RespuestaTrabajador): string {
  if (r.ejecutados) {
    if (!r.ejecutados.length) return 'No había trabajos listos. Si apagaste los agentes, o no hay campaña vigente, es lo esperado.'
    return r.ejecutados.map(e => {
      const d = e.detalle as Record<string, unknown> | string | undefined
      if (e.estado === 'succeeded' && d && typeof d === 'object') return `Terminó: ${d.creados ?? 0} negocio(s) nuevo(s), ${d.duplicados ?? 0} repetido(s), ${d.descartados ?? 0} descartado(s) por no tener fuente verificable.${d.motivo ? ` ${String(d.motivo)}` : ''}`
      return `${ETQ[e.estado] ?? e.estado}: ${typeof d === 'string' ? d : 'sin detalle'}`
    }).join(' · ')
  }
  if (r.trabajos) return r.trabajos.length ? `Trabajo de hoy listo para ${r.trabajos.length} campaña(s) vigente(s).` : `No hay campañas vigentes (${r.campanas ?? 0}). Crea y activa una abajo.`
  return 'Listo.'
}

export function TrabajoAgentes() {
  const [activos, setActivos] = useState<boolean | null>(null)
  const [pausaTipos, setPausaTipos] = useState<string[]>([])
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sinInstalar, setSinInstalar] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [cfg, tr] = await Promise.all([
      supabase.from('central_config').select('clave, valor').in('clave', ['agentes_activos', 'pausa_tipos']),
      supabase.from('central_trabajos').select('id, tipo, agente_id, estado, intentos, error, costo, resultado, created_at').order('created_at', { ascending: false }).limit(10),
    ])
    if (tr.error) { if (['42P01', 'PGRST205'].includes(tr.error.code ?? '')) setSinInstalar(true); else setError(textoError(tr.error)); return }
    setError(null); setSinInstalar(false)
    const c = Object.fromEntries(((cfg.data ?? []) as { clave: string; valor: unknown }[]).map(f => [f.clave, f.valor]))
    setActivos(c.agentes_activos === true)
    setPausaTipos(Array.isArray(c.pausa_tipos) ? (c.pausa_tipos as string[]) : [])
    setTrabajos((tr.data ?? []) as Trabajo[])
  }, [])
  useEffect(() => { void recargar() }, [recargar])

  const correr = async (nombre: string, fn: () => Promise<string | null>) => {
    setOcupado(nombre); setError(null); setAviso(null)
    const e = await fn()
    setOcupado(null)
    if (e) setError(e)
    await recargar()
  }
  const pedir = async (accion: 'encolar' | 'ejecutar') => {
    setOcupado(accion); setError(null); setAviso(null)
    const r = await pedirAlTrabajador(accion)
    setOcupado(null)
    if (r.ok === true) setAviso(resumen(r.datos)); else setError(r.mensaje)
    await recargar()
  }

  if (sinInstalar) return <AvisoHonesto tono="warning">La cola de trabajos todavía no está instalada en la base de datos.</AvisoHonesto>
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Trabajo de los agentes</TituloBloque>
      <AvisoHonesto>Hoy los agentes solo investigan: Mateo busca negocios de tu campaña en la web y los deja como "prospecto identificado" para que tú los verifiques. No escriben ni contactan a nadie. Gastan de tu tope mensual de IA.</AvisoHonesto>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">Interruptor de los agentes</p>
          <Badge tone={activos ? 'success' : 'neutral'}>{activos === null ? '…' : activos ? 'Encendidos' : 'Apagados'}</Badge>
        </div>
        <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{activos ? 'Pueden correr trabajos dentro de campañas vigentes.' : 'No corre ningún trabajo. Es el estado seguro.'} Apagarlos frena también lo que está corriendo.</p>
        <div className="flex flex-wrap gap-2">
          {activos ? (
            <Button size="sm" variant="secondary" loading={ocupado === 'apagar'} onClick={() => void correr('apagar', () => moverInterruptor('agentes_activos', false))}>Apagar todo</Button>
          ) : (
            <Button size="sm" loading={ocupado === 'encender'} disabled={activos === null}
              onClick={() => { if (window.confirm('¿Encender los agentes? Solo investigarán dentro de campañas vigentes y con tu tope de gasto. No contactan a nadie.')) void correr('encender', () => moverInterruptor('agentes_activos', true)) }}>Encender agentes</Button>
          )}
        </div>
        {pausaTipos.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-text)]">Pausado por fallos repetidos</p>
            {pausaTipos.map(t => (
              <div key={t} className="flex items-center gap-2"><span className="flex-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{TIPO[t] ?? t}</span>
                <Button size="sm" variant="secondary" loading={ocupado === `r-${t}`} onClick={() => void correr(`r-${t}`, () => moverInterruptor('pausa_tipos', pausaTipos.filter(x => x !== t)))}>Reanudar</Button></div>
            ))}
          </div>
        )}
      </Card>
      <Card className="flex flex-col gap-2">
        <p className="m-0 font-bold text-[color:var(--w-text)]">Búsqueda de clientes (Mateo)</p>
        <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Primero "Crear el de hoy" (uno por campaña vigente, nunca duplicado) y luego "Ejecutar ahora". Cada corrida cuenta contra tu tope mensual.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={ocupado === 'encolar'} onClick={() => void pedir('encolar')}>Crear el trabajo de hoy</Button>
          <Button size="sm" loading={ocupado === 'ejecutar'} disabled={!activos} onClick={() => void pedir('ejecutar')}>Ejecutar ahora</Button>
        </div>
        {!activos && activos !== null && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Para ejecutar, primero enciende los agentes.</p>}
        {aviso && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">{aviso}</p>}
        <ErrorAccion texto={error} />
      </Card>
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-text)]">Últimos trabajos</p>
        {trabajos && trabajos.length === 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay trabajos.</p>}
        {trabajos?.map(t => (
          <Card key={t.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-semibold text-[color:var(--w-text)]">{TIPO[t.tipo] ?? t.tipo} · {t.agente_id}</p><Badge tone={TONO[t.estado] ?? 'neutral'}>{ETQ[t.estado] ?? t.estado}</Badge></div>
            <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hora(t.created_at)} · intento {t.intentos} · gastó US$ {Number(t.costo).toFixed(2)}</p>
            {t.error && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-2)]">{t.error}</p>}
          </Card>
        ))}
      </div>
    </div>
  )
}
