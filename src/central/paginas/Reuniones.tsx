/**
 * Reuniones.tsx — agenda de reuniones de Central: se programan, se marcan realizadas y se guarda el acta.
 * Son registros internos: no se crea ningún evento en Google Calendar ni se invita a nadie por fuera (esa integración no está conectada).
 */
import { useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { StatePanel } from '../../components/ui/StatePanel'
import { actualizarReunion, crearReunion } from '../acciones.ts'
import { fechaHora, type Reunion } from '../catalogo.ts'
import { useCentral, useIndices } from '../datos.tsx'
import { AvisoHonesto, ErrorAccion, Pagina, useAccion } from '../ui.tsx'

const TONO: Record<Reunion['estado'], Tone> = { programada: 'info', en_curso: 'accent', realizada: 'success', cancelada: 'neutral' }
const ETQ: Record<Reunion['estado'], string> = { programada: 'Programada', en_curso: 'En curso', realizada: 'Realizada', cancelada: 'Cancelada' }

function Nueva({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [titulo, setTitulo] = useState(''); const [inicio, setInicio] = useState(''); const [agenda, setAgenda] = useState(''); const [parts, setParts] = useState<string[]>([])
  const alternar = (id: string) => setParts(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  return (
    <Modal open={abierto} onClose={() => { limpiar(); onCerrar() }} title="Nueva reunión"
      footer={<Button disabled={titulo.trim().length < 3 || !inicio} loading={ocupado} onClick={async () => {
        if (await ejecutar(() => crearReunion({ titulo, inicio: new Date(inicio).toISOString(), participantes: parts, agenda }))) { setTitulo(''); setInicio(''); setAgenda(''); setParts([]); onCerrar() }
      }}>Programar</Button>}>
      <div className="flex flex-col gap-3">
        <Input label="Título" value={titulo} onChange={e => setTitulo(e.target.value)} required maxLength={160} />
        <Input label="Inicio" type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} required />
        <Textarea label="Agenda" value={agenda} onChange={e => setAgenda(e.target.value)} rows={3} maxLength={4000} />
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">Participantes (agentes)</legend>
          <div className="flex flex-wrap gap-2">
            {datos.agentes.map(a => (
              <label key={a.id} className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[var(--w-r-pill)] border border-[var(--w-border-strong)] px-3 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                <input type="checkbox" checked={parts.includes(a.id)} onChange={() => alternar(a.id)} className="accent-[var(--w-accent)]" />{a.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorAccion texto={error} />
      </div>
    </Modal>
  )
}

function Fila({ r }: { r: Reunion }) {
  const { agente } = useIndices()
  const { ocupado, error, ejecutar } = useAccion()
  const [acta, setActa] = useState(r.acta)
  const [abierta, setAbierta] = useState(false)
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={TONO[r.estado]}>{ETQ[r.estado]}</Badge><span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{fechaHora(r.inicio)}</span></div>
      <p className="m-0 font-bold text-[color:var(--w-text)]">{r.titulo}</p>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{r.participantes.length ? r.participantes.map(id => agente(id)?.nombre ?? id).join(', ') : 'Solo tú'}</p>
      {r.agenda && <p className="m-0 whitespace-pre-wrap text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{r.agenda}</p>}
      {abierta && <Textarea label="Acta de la reunión" value={acta} onChange={e => setActa(e.target.value)} rows={4} maxLength={8000} />}
      <ErrorAccion texto={error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAbierta(a => !a)}>{abierta ? 'Ocultar acta' : r.acta ? 'Ver acta' : 'Escribir acta'}</Button>
        {abierta && <Button size="sm" loading={ocupado} onClick={() => void ejecutar(() => actualizarReunion(r.id, { acta }))}>Guardar acta</Button>}
        {r.estado === 'programada' && <Button size="sm" loading={ocupado} onClick={() => void ejecutar(() => actualizarReunion(r.id, { estado: 'realizada' }))}>Marcar realizada</Button>}
        {r.estado === 'programada' && <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void ejecutar(() => actualizarReunion(r.id, { estado: 'cancelada' }))}>Cancelar</Button>}
      </div>
    </Card>
  )
}

export function Reuniones() {
  const { datos } = useCentral()
  const [nueva, setNueva] = useState(false)
  const proximas = datos.reuniones.filter(r => r.estado === 'programada' || r.estado === 'en_curso').sort((a, b) => a.inicio.localeCompare(b.inicio))
  const pasadas = datos.reuniones.filter(r => r.estado === 'realizada' || r.estado === 'cancelada')
  return (
    <Pagina titulo="Reuniones" subtitulo="Agenda, participantes y actas" acciones={<Button onClick={() => setNueva(true)}>Nueva reunión</Button>}>
      <AvisoHonesto>Son registros internos de Central. Todavía no se conectan con Google Calendar ni envían invitaciones: esa integración está sin conectar.</AvisoHonesto>
      {datos.reuniones.length === 0 ? <StatePanel kind="empty" title="No hay reuniones" text="Programa la primera con “Nueva reunión”." /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3"><h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>Próximas</h2>{proximas.length ? proximas.map(r => <Fila key={r.id} r={r} />) : <p className="m-0 text-[color:var(--w-text-3)]">Ninguna programada.</p>}</div>
          <div className="flex flex-col gap-3"><h2 className="m-0 font-bold text-[color:var(--w-text)]" style={{ fontSize: 'var(--w-fs-title)' }}>Anteriores</h2>{pasadas.length ? pasadas.map(r => <Fila key={r.id} r={r} />) : <p className="m-0 text-[color:var(--w-text-3)]">Todavía ninguna.</p>}</div>
        </div>
      )}
      <Nueva abierto={nueva} onCerrar={() => setNueva(false)} />
    </Pagina>
  )
}
