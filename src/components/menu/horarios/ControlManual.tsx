import { useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../../services/supabaseClient'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'
import { Select, Input } from '../../ui/Field'
import { duracionLegible, type MenuHorarioEstado, type MenuHorarioFila } from '../../../lib/menuHorario'
import type { ExcepcionFila } from './useMenusHorarioAdmin'

const TIPOS = [
  { id: 'forzar', titulo: 'Usar solo este menú ahora', ayuda: 'Reemplaza lo que rige ahora (por ejemplo, abrir el brunch antes de hora).' },
  { id: 'extender', titulo: 'Sumar este menú', ayuda: 'Mantiene el menú actual y agrega este (por ejemplo, extender el almuerzo).' },
  { id: 'suspender', titulo: 'Quitar este menú', ayuda: 'Deja de mostrarse este menú aunque sea su horario.' },
] as const
type Tipo = typeof TIPOS[number]['id']

const DURACIONES: { id: string; label: string; min: number | null }[] = [
  { id: '30', label: '30 minutos', min: 30 },
  { id: '60', label: '1 hora', min: 60 },
  { id: '120', label: '2 horas', min: 120 },
  { id: '240', label: '4 horas', min: 240 },
  { id: 'hasta', label: 'Hasta que yo vuelva a automático', min: null },
]

const cuando = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })

interface Props {
  menus: MenuHorarioFila[]
  estado: MenuHorarioEstado | null
  excepciones: ExcepcionFila[]
  nombres: Record<string, string>
  onCambio: () => void
}

/** Control manual del menú: forzar, extender, suspender y volver al modo automático. Todo queda registrado. */
export function ControlManual({ menus, estado, excepciones, nombres, onCambio }: Props) {
  const activos = menus.filter(m => m.estado === 'activo')
  const [menuId, setMenuId] = useState('')
  const [tipo, setTipo] = useState<Tipo>('forzar')
  const [dur, setDur] = useState('60')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const nombreMenu = (id: string) => menus.find(m => m.id === id)?.nombre ?? 'Menú'
  const abiertos = estado?.manual ?? []
  const modoManual = estado?.modo === 'manual'
  const hace = Date.now()

  const aplicar = async () => {
    if (!menuId) { message.warning('Elige un menú'); return }
    const d = DURACIONES.find(x => x.id === dur)
    const hasta = d?.min ? new Date(Date.now() + d.min * 60000).toISOString() : null
    setOcupado(true)
    const { error } = await supabase.rpc('menu_horario_excepcion', { p_tipo: tipo, p_menu_id: menuId, p_hasta: hasta, p_nota: nota || null })
    setOcupado(false)
    if (error) { message.error(error.message); return }
    message.success('Listo: el cambio ya se ve en el menú y en los pedidos')
    setNota('')
    onCambio()
  }

  const automatico = async () => {
    setOcupado(true)
    const { error } = await supabase.rpc('menu_horario_volver_automatico')
    setOcupado(false)
    if (error) { message.error(error.message); return }
    message.success('Volvió al funcionamiento automático')
    onCambio()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={modoManual ? 'warning' : 'success'}>{modoManual ? 'Modo manual' : 'Modo automático'}</Badge>
          <span className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            {modoManual ? 'Un control manual está cambiando lo que ven los clientes.' : 'Los menús cambian solos según sus horarios.'}
          </span>
        </div>
        {modoManual && <Button variant="secondary" onClick={automatico} loading={ocupado}>Volver a automático</Button>}
      </div>

      {abiertos.length > 0 && (
        <ul className="space-y-1.5">
          {abiertos.map(e => {
            const fila = excepciones.find(x => x.id === e.id)
            return (
              <li key={e.id} className="rounded-[var(--w-r-md)] bg-[var(--w-warning-bg)] px-3 py-2 text-[length:var(--w-fs-label)] text-[color:var(--w-warning-text)]">
                <strong>{TIPOS.find(t => t.id === e.tipo)?.titulo}</strong>: {nombreMenu(e.menu_id)}
                {e.hasta ? ` · termina en ${duracionLegible(new Date(e.hasta).getTime() - hace)}` : ' · hasta que vuelvas a automático'}
                {fila && <> · lo hizo {nombres[fila.created_by ?? ''] ?? 'un usuario'} ({cuando(fila.created_at)})</>}
                {e.nota ? ` · “${e.nota}”` : ''}
              </li>
            )
          })}
        </ul>
      )}

      {activos.length === 0 ? (
        <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Para usar el control manual necesitas al menos un menú activo.</p>
      ) : (
        <div className="space-y-3 rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-4">
          <Select label="Menú" value={menuId} onChange={e => setMenuId(e.target.value)}>
            <option value="">Elige un menú</option>
            {activos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Select>
          <div role="radiogroup" aria-label="Qué hacer" className="space-y-2">
            {TIPOS.map(t => (
              <label key={t.id} className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--w-r-md)] border p-3 ${tipo === t.id ? 'border-[var(--w-accent)] bg-[var(--w-accent-soft)]' : 'border-[var(--w-border)]'}`}>
                <input type="radio" name="tipo-control" checked={tipo === t.id} onChange={() => setTipo(t.id)} className="mt-1 h-4 w-4 accent-[var(--w-accent)]" />
                <span>
                  <span className="block font-semibold text-[color:var(--w-text)]">{t.titulo}</span>
                  <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{t.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
          <Select label="Por cuánto tiempo" value={dur} onChange={e => setDur(e.target.value)}>
            {DURACIONES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
          <Input label="Nota (opcional)" value={nota} maxLength={200} onChange={e => setNota(e.target.value)} placeholder="Ej: evento privado" />
          <Button onClick={aplicar} loading={ocupado} disabled={!menuId}>Aplicar ahora</Button>
        </div>
      )}
    </div>
  )
}
