/**
 * Auditoría.tsx — registro de todo lo que pasa en Central (solo lectura; la tabla solo se agrega, no se edita ni se borra).
 * Muestra quién, qué, cuándo, nivel y resultado. Los textos de mensajes y documentos nunca se copian al registro.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { fechaHora, type EventoAuditoria } from '../catalogo.ts'
import { useIndices } from '../datos.tsx'
import { Pagina } from '../ui.tsx'

const POR_PAGINA = 40
const TEXTO: Record<string, string> = {
  acceso_concedido: 'Entrada a Central', acceso_denegado: 'Intento de entrada rechazado',
  insert_tareas: 'Tarea creada', update_tareas: 'Tarea modificada', insert_aprobaciones: 'Aprobación solicitada', update_aprobaciones: 'Aprobación decidida',
  insert_agentes: 'Agente creado', update_agentes: 'Agente modificado', insert_mensajes: 'Mensaje enviado', insert_conversaciones: 'Conversación creada',
  insert_documentos: 'Documento creado', update_documentos: 'Documento modificado', insert_memoria: 'Recuerdo creado', update_memoria: 'Recuerdo modificado',
  update_integraciones: 'Integración modificada', insert_reuniones: 'Reunión creada', update_reuniones: 'Reunión modificada',
  insert_proyectos: 'Proyecto creado', update_proyectos: 'Proyecto modificado', insert_ubicaciones: 'Ubicación guardada', update_ubicaciones: 'Ubicación cambiada', delete_ubicaciones: 'Ubicación quitada',
  update_config: 'Configuración cambiada', insert_config: 'Configuración creada',
}

export function Auditoria() {
  const { agente } = useIndices()
  const [filas, setFilas] = useState<EventoAuditoria[] | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [hayMas, setHayMas] = useState(false)
  const [error, setError] = useState(false)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(async (desde: number, reiniciar: boolean) => {
    let q = supabase.from('central_auditoria').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(desde, desde + POR_PAGINA)
    if (filtro === 'humano' || filtro === 'agente' || filtro === 'sistema') q = q.eq('actor_tipo', filtro)
    if (filtro === 'denegado') q = q.eq('resultado', 'denegado')
    if (filtro === 'aprobaciones') q = q.like('accion', '%aprobaciones')
    const { data, error: e } = await q
    if (e) { setError(true); return }
    const nuevas = (data ?? []) as EventoAuditoria[]
    setHayMas(nuevas.length > POR_PAGINA)
    const pagina = nuevas.slice(0, POR_PAGINA)
    const ids = [...new Set(pagina.flatMap(f => [f.actor_id, f.aprobador_id]).filter((x): x is string => !!x))]
    if (ids.length) {
      const { data: perfiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
      setNombres(n => ({ ...n, ...Object.fromEntries((perfiles ?? []).map(p => [p.id as string, (p.full_name as string | null) || (p.email as string | null) || 'Cuenta sin nombre'])) }))
    }
    setFilas(prev => (reiniciar || !prev ? pagina : [...prev, ...pagina]))
  }, [filtro])

  useEffect(() => { setFilas(null); setError(false); void cargar(0, true) }, [cargar])

  const quien = (f: EventoAuditoria) => (f.agente_id ? `Agente ${agente(f.agente_id)?.nombre ?? f.agente_id}` : f.actor_id ? nombres[f.actor_id] ?? 'Cuenta' : f.actor_tipo === 'sistema' ? 'Sistema' : 'Desconocido')
  return (
    <Pagina titulo="Auditoría" subtitulo="Quién hizo qué, cuándo y con qué resultado. Solo se agrega: nadie puede editarlo ni borrarlo.">
      <div className="max-w-xs"><Select label="Mostrar" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="">Todo</option><option value="humano">Acciones de personas</option><option value="agente">Acciones de agentes</option><option value="sistema">Del sistema</option><option value="aprobaciones">Aprobaciones</option><option value="denegado">Rechazados</option></Select></div>
      {error ? <StatePanel kind="error" title="No se pudo leer el registro" /> : !filas ? <StatePanel kind="loading" /> : filas.length === 0 ? <StatePanel kind="empty" title="Sin movimientos" /> : (
        <Card className="flex flex-col gap-1 !p-2">
          <ul className="m-0 flex list-none flex-col p-0">
            {filas.map(f => (
              <li key={f.id} className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--w-border)] px-2 py-2 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[color:var(--w-text)]">{TEXTO[f.accion] ?? f.accion}</span>
                  <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{fechaHora(f.created_at)} · {quien(f)}{f.aprobador_id ? ` · aprobó ${nombres[f.aprobador_id] ?? 'una persona'}` : ''}{f.recurso ? ` · ${f.recurso.replace('central_', '')}` : ''}</span>
                </span>
                {f.nivel && <Badge tone="info">{f.nivel}</Badge>}
                <Badge tone={f.resultado === 'ok' ? 'success' : f.resultado === 'denegado' ? 'danger' : 'warning'}>{f.resultado === 'ok' ? 'Permitido' : f.resultado === 'denegado' ? 'Rechazado' : f.resultado}</Badge>
              </li>
            ))}
          </ul>
          {hayMas && <div className="p-2"><Button variant="secondary" onClick={() => void cargar(filas.length, false)}>Ver más</Button></div>}
        </Card>
      )}
    </Pagina>
  )
}
