/**
 * Propuestas.tsx — herramientas y conectores que propone Tomi (Ingeniería). Nada se desarrolla sin tu aprobación.
 * Tú apruebas o rechazas aquí (con tu código de 2 pasos); la base impide que alguien más lo haga o que se salte un paso.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../services/supabaseClient'
import { decidirPropuesta, textoError } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, TituloBloque } from '../ui.tsx'

interface Propuesta {
  id: string; tipo: 'herramienta' | 'conector'; titulo: string; para_que: string; necesita: string; costo: string; riesgo: 'bajo' | 'medio' | 'alto'
  plan_pruebas: string; estado: string; nota_decision: string | null; enlace: string | null; created_at: string
}
const ETQ: Record<string, string> = { propuesta: 'Espera tu decisión', aprobada: 'Aprobada', rechazada: 'Rechazada', en_desarrollo: 'En desarrollo', para_revisar: 'Lista para que la revises', publicada: 'Publicada', cancelada: 'Cancelada' }
const TONO: Record<string, Tone> = { propuesta: 'warning', aprobada: 'success', rechazada: 'danger', en_desarrollo: 'info', para_revisar: 'info', publicada: 'success', cancelada: 'neutral' }
const TONO_RIESGO: Record<string, Tone> = { bajo: 'success', medio: 'warning', alto: 'danger' }

function Tarjeta({ p, recargar }: { p: Propuesta; recargar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const decidir = async (d: 'aprobar' | 'rechazar') => {
    const nota = d === 'rechazar' ? (window.prompt('¿Por qué la rechazas? (opcional)') ?? '') : ''
    if (d === 'aprobar' && !window.confirm(`¿Aprobar «${p.titulo}»? Tomi podrá empezar a desarrollarla. Cualquier cuenta o clave la pones tú.`)) return
    setOcupado(d); setError(null)
    const e = await decidirPropuesta(p.id, d, nota)
    setOcupado(null); setError(e)
    if (!e) await recargar()
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">{p.titulo}</p>
        <Badge tone="neutral">{p.tipo === 'conector' ? 'Conector' : 'Herramienta'}</Badge>
        <Badge tone={TONO[p.estado] ?? 'neutral'}>{ETQ[p.estado] ?? p.estado}</Badge>
      </div>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{p.para_que}</p>
      {p.necesita && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Qué necesita de ti:</b> {p.necesita}</p>}
      <p className="m-0 flex flex-wrap items-center gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><b>Costo:</b> {p.costo || 'Por confirmar'} <Badge tone={TONO_RIESGO[p.riesgo]}>Riesgo {p.riesgo}</Badge></p>
      {p.plan_pruebas && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]"><b>Cómo se prueba:</b> {p.plan_pruebas}</p>}
      {p.nota_decision && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Tu nota: {p.nota_decision}</p>}
      {p.enlace && <p className="m-0 break-all text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Para revisar: {p.enlace}</p>}
      <ErrorAccion texto={error} />
      {p.estado === 'propuesta' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={ocupado === 'aprobar'} onClick={() => void decidir('aprobar')}>Aprobar</Button>
          <Button size="sm" variant="secondary" loading={ocupado === 'rechazar'} onClick={() => void decidir('rechazar')}>Rechazar</Button>
        </div>
      )}
    </Card>
  )
}

export function Propuestas() {
  const [filas, setFilas] = useState<Propuesta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sinInstalar, setSinInstalar] = useState(false)
  const recargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('central_propuestas').select('*').order('created_at', { ascending: true })
    if (e) { if (['42P01', 'PGRST205'].includes(e.code ?? '')) setSinInstalar(true); else setError(textoError(e)); return }
    setError(null); setSinInstalar(false); setFilas((data ?? []) as Propuesta[])
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo(['central_propuestas'], recargar)
  if (sinInstalar) return null
  const pendientes = filas?.filter(f => f.estado === 'propuesta').length ?? 0
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Propuestas de Tomi (herramientas y conectores)</TituloBloque>
      <AvisoHonesto>Nada se desarrolla ni se conecta sin tu aprobación. Aprobar solo autoriza empezar: las cuentas y claves las pones tú, y lo que toque dinero, seguridad o la base de datos se revisa antes de publicarse. {pendientes > 0 ? `Tienes ${pendientes} esperando decisión.` : ''}</AvisoHonesto>
      <ErrorAccion texto={error} />
      {filas?.map(p => <Tarjeta key={p.id} p={p} recargar={recargar} />)}
    </div>
  )
}
