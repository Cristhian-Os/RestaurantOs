/**
 * PlanSemanal.tsx — el plan de la semana que arma Chef Mayor. Tú quitas, cambias y apruebas; solo lo aprobado se convierte en trabajo para los agentes.
 * Hoy el plan solo incluye lo que un agente puede ejecutar (Mateo busca negocios, Nico redacta borradores) y tareas para ti. Nadie contacta ni publica.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../services/supabaseClient'
import { aprobarPlan, cambiarItemPlan, pedirAlTrabajador, textoError } from '../acciones.ts'
import { useEnVivo } from '../enVivo.ts'
import { AvisoHonesto, ErrorAccion, TituloBloque } from '../ui.tsx'

interface Plan { id: string; semana: string; estado: string; resumen: string }
interface Item { id: string; dia: string; agente_id: string; tipo: string; descripcion: string; estado: string }
const NOMBRE: Record<string, string> = { mateo: 'Mateo', nico: 'Nico', 'chef-mayor': 'Para ti' }
const TONO: Record<string, Tone> = { propuesto: 'neutral', quitado: 'danger', encolado: 'success', para_ti: 'info' }
const ETQ: Record<string, string> = { propuesto: 'Propuesta', quitado: 'Quitada', encolado: 'Programada', para_ti: 'Para ti' }
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function PlanSemanal() {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined)
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [sinInstalar, setSinInstalar] = useState(false)

  const recargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('central_plan_semanal').select('id, semana, estado, resumen').order('semana', { ascending: false }).limit(1)
    if (e) { if (['42P01', 'PGRST205'].includes(e.code ?? '')) setSinInstalar(true); else setError(textoError(e)); return }
    const p = ((data ?? [])[0] as Plan | undefined) ?? null
    setPlan(p)
    if (p) { const r = await supabase.from('central_plan_items').select('id, dia, agente_id, tipo, descripcion, estado').eq('plan_id', p.id).order('dia').order('created_at'); setItems((r.data ?? []) as Item[]) } else setItems([])
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  useEnVivo(['central_plan_semanal', 'central_plan_items'], recargar)

  const hacer = async (clave: string, fn: () => Promise<string | null>) => { setOcupado(clave); setError(null); setAviso(null); const e = await fn(); setOcupado(null); if (e) setError(e); await recargar() }
  const generar = () => hacer('generar', async () => {
    const r = await pedirAlTrabajador('generar_plan')
    if (r.ok !== true) return r.mensaje
    setAviso(r.datos.plan?.ya_existia ? 'Ya hay un plan para esa semana.' : 'Plan armado. Revísalo y apruébalo.')
    return null
  })
  const aprobar = () => { if (plan && window.confirm('¿Aprobar el plan? Las tareas de los agentes se programan para su día. Podrás apagar a los agentes cuando quieras.')) void hacer('aprobar', async () => {
    const r = await aprobarPlan(plan.id)
    if (r.ok !== true) return r.mensaje
    setAviso(`Plan aprobado: ${r.datos.encolados} tarea(s) de agentes programadas y ${r.datos.para_ti} para ti.${r.datos.dias_pasados ? ` ${r.datos.dias_pasados} de días que ya pasaron no se programaron.` : ''}`)
    return null
  }) }
  const editar = (it: Item) => { const nuevo = window.prompt('Cambia el texto de la tarea', it.descripcion); if (nuevo && nuevo.trim().length >= 3 && nuevo !== it.descripcion) void hacer(`e-${it.id}`, () => cambiarItemPlan(it.id, { descripcion: nuevo })) }

  if (sinInstalar) return null
  const borrador = plan?.estado === 'borrador'
  const porDia = items.reduce<Record<string, Item[]>>((a, i) => { (a[i.dia] ??= []).push(i); return a }, {})
  return (
    <div className="flex flex-col gap-3">
      <TituloBloque>Plan de la semana (Chef Mayor)</TituloBloque>
      <AvisoHonesto>Chef Mayor arma la semana con lo que los agentes pueden hacer hoy. Tú quitas o cambias lo que no sirva y apruebas. Solo lo aprobado se programa, y con el interruptor apagado no corre nada.</AvisoHonesto>
      <ErrorAccion texto={error} />
      {aviso && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">{aviso}</p>}
      {plan && (
        <Card className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">Semana del {dia(plan.semana)}</p>
            <Badge tone={borrador ? 'warning' : plan.estado === 'aprobado' ? 'success' : 'neutral'}>{borrador ? 'Espera tu aprobación' : plan.estado === 'aprobado' ? 'Aprobado' : 'Cancelado'}</Badge></div>
          <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{plan.resumen}</p>
        </Card>
      )}
      {Object.entries(porDia).map(([d, lista]) => (
        <Card key={d} className="flex flex-col gap-2">
          <p className="m-0 font-semibold capitalize text-[color:var(--w-text)]">{dia(d)}</p>
          {lista.map(it => (
            <div key={it.id} className="flex flex-col gap-1 border-t border-[color:var(--w-border,transparent)] pt-2 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="neutral">{NOMBRE[it.agente_id] ?? it.agente_id}</Badge><Badge tone={TONO[it.estado] ?? 'neutral'}>{ETQ[it.estado] ?? it.estado}</Badge></div>
              <p className={`m-0 text-[length:var(--w-fs-label)] ${it.estado === 'quitado' ? 'text-[color:var(--w-text-3)] line-through' : 'text-[color:var(--w-text-2)]'}`}>{it.descripcion}</p>
              {borrador && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" loading={ocupado === `q-${it.id}`} onClick={() => void hacer(`q-${it.id}`, () => cambiarItemPlan(it.id, { quitado: it.estado !== 'quitado' }))}>{it.estado === 'quitado' ? 'Volver a poner' : 'Quitar'}</Button>
                  <Button size="sm" variant="ghost" loading={ocupado === `e-${it.id}`} onClick={() => editar(it)}>Cambiar texto</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      ))}
      <div className="flex flex-wrap gap-2">
        {borrador && <Button size="sm" loading={ocupado === 'aprobar'} onClick={aprobar}>Aprobar plan</Button>}
        {(plan === null || !borrador) && <Button size="sm" variant="secondary" loading={ocupado === 'generar'} onClick={() => void generar()}>Armar el plan de la semana</Button>}
      </div>
    </div>
  )
}
