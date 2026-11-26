/**
 * Mision.tsx — Fase 3: la misión del día del fundador. La elige el servidor POR REGLAS (sin IA) con datos reales de Crecimiento.
 * Aquí solo se lee, se empieza, se completa o se reporta el bloqueo.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { actualizarMision, generarMision, textoError } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, Pagina, TituloBloque } from '../ui.tsx'

interface Cierre { tareas_completadas: number; cambios_de_etapa: number; notas: number; citas_realizadas: number; prospectos_creados: number; pendientes: string[] }
interface MisionFila {
  id: string; fecha: string; mision: string; por_que: string; resultado_esperado: string; minutos: number; primer_paso: string
  agente_apoyo: string | null; tareas: string[]; estado: 'propuesta' | 'en_curso' | 'completada' | 'bloqueada'; bloqueo: string | null; cierre: Cierre | null
}
const TONO: Record<string, Tone> = { propuesta: 'neutral', en_curso: 'info', completada: 'success', bloqueada: 'danger' }
const ETQ: Record<string, string> = { propuesta: 'Por empezar', en_curso: 'En curso', completada: 'Completada', bloqueada: 'Bloqueada' }
const hoyCol = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)
const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

export function Mision() {
  const [filas, setFilas] = useState<MisionFila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [errAccion, setErrAccion] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [bloqueando, setBloqueando] = useState(false)
  const recargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('growth_misiones').select('*').order('fecha', { ascending: false }).limit(7)
    if (e) setError(textoError(e)); else { setError(null); setFilas((data ?? []) as MisionFila[]) }
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo(['growth_misiones'], recargar)
  const hacer = async (fn: () => Promise<string | null>) => {
    setOcupado(true); setErrAccion(null)
    const e = await fn()
    setOcupado(false); setErrAccion(e)
    if (!e) { setBloqueando(false); setMotivo(''); await recargar() }
  }
  const hoy = filas?.find(m => m.fecha === hoyCol())
  const previas = (filas ?? []).filter(m => m.fecha !== hoyCol())
  return (
    <Pagina titulo="Misión del día" subtitulo="Una sola cosa importante para hoy, elegida con datos reales.">
      <AvisoHonesto>La misión se elige por reglas simples (cita de hoy, tareas urgentes, seguimientos vencidos…), sin inteligencia artificial. Se crea sola a las 7:00 a. m. y el cierre llega a las 7:30 p. m. por Telegram, de lunes a sábado.</AvisoHonesto>
      {error && <ErrorAccion texto={error} />}
      {!filas ? <StatePanel kind="loading" title="Cargando…" /> : (<>
        {!hoy ? (
          <Card className="flex flex-col gap-2">
            <p className="m-0 text-[color:var(--w-text-2)]">Todavía no hay misión para hoy.</p>
            <ErrorAccion texto={errAccion} />
            <div><Button size="sm" loading={ocupado} onClick={() => void hacer(generarMision)}>Generar ahora</Button></div>
          </Card>
        ) : (
          <Card className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TituloBloque>{hoy.mision}</TituloBloque><Badge tone={TONO[hoy.estado]}>{ETQ[hoy.estado]}</Badge>
            </div>
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Por qué:</b> {hoy.por_que}</p>
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Resultado esperado:</b> {hoy.resultado_esperado} · {hoy.minutos} min</p>
            <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Primer paso:</b> {hoy.primer_paso}</p>
            {hoy.tareas.length > 0 && <ul className="m-0 pl-5 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{hoy.tareas.map((t, i) => <li key={i}>{t}</li>)}</ul>}
            {hoy.estado === 'bloqueada' && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">Bloqueo: {hoy.bloqueo}</p>}
            <ErrorAccion texto={errAccion} />
            {bloqueando && <Input label="¿Qué te bloqueó?" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500} />}
            <div className="flex flex-wrap gap-2">
              {hoy.estado === 'propuesta' && <Button size="sm" loading={ocupado} onClick={() => void hacer(() => actualizarMision(hoy.id, 'en_curso'))}>Empezar</Button>}
              {hoy.estado !== 'completada' && <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void hacer(() => actualizarMision(hoy.id, 'completada'))}>Completada</Button>}
              {hoy.estado !== 'completada' && !bloqueando && <Button size="sm" variant="ghost" onClick={() => setBloqueando(true)}>Me bloqueé</Button>}
              {bloqueando && <Button size="sm" variant="secondary" loading={ocupado} disabled={motivo.trim().length < 3} onClick={() => void hacer(() => actualizarMision(hoy.id, 'bloqueada', motivo))}>Guardar bloqueo</Button>}
            </div>
            {hoy.cierre && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Cierre: {hoy.cierre.tareas_completadas} tareas cerradas · {hoy.cierre.cambios_de_etapa} cambios de etapa · {hoy.cierre.notas} notas · {hoy.cierre.citas_realizadas} citas realizadas · {hoy.cierre.prospectos_creados} prospectos nuevos</p>}
          </Card>
        )}
        {previas.length > 0 && (
          <div className="flex flex-col gap-2">
            <TituloBloque>Últimos días</TituloBloque>
            {previas.map(m => (
              <Card key={m.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-semibold text-[color:var(--w-text)]">{dia(m.fecha)} · {m.mision}</p><Badge tone={TONO[m.estado]}>{ETQ[m.estado]}</Badge></div>
                {m.cierre && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{m.cierre.tareas_completadas} tareas · {m.cierre.cambios_de_etapa} etapas · {m.cierre.notas} notas · {m.cierre.citas_realizadas} citas</p>}
              </Card>
            ))}
          </div>
        )}
      </>)}
    </Pagina>
  )
}
