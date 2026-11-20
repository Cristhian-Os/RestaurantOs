import { useMemo } from 'react'
import {
  DIAS_CORTO, DIAS_LARGO, ORDEN_SEMANA, formatoHora, programacionSemanal, solapamientos,
  type FranjaFila, type MenuHorarioFila,
} from '../../../lib/menuHorario'

const PALETA = ['#2563EB', '#16A34A', '#9333EA', '#DB2777', '#0891B2', '#CA8A04', '#4F46E5', '#DC2626']

/** Color de un menú: el que eligió el administrador o uno de la paleta según su posición. */
export function colorDeMenu(menus: MenuHorarioFila[], id: string): string {
  const i = menus.findIndex(m => m.id === id)
  return menus[i]?.color || PALETA[(i < 0 ? 0 : i) % PALETA.length]
}

const minAHora = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

interface Props {
  menus: MenuHorarioFila[]
  franjas: FranjaFila[]
  /** Hora local del restaurante ('YYYY-MM-DDTHH:MM:SS'); resalta el día y la hora de ahora. */
  ahoraLocal?: string
}

/** Qué menú rige en cada momento de la semana (solo franjas semanales de menús activos). */
export function ProgramacionSemanal({ menus, franjas, ahoraLocal }: Props) {
  const sem = useMemo(() => programacionSemanal(menus, franjas), [menus, franjas])
  const pisan = useMemo(() => solapamientos(menus, franjas), [menus, franjas])
  const nombre = (id: string) => menus.find(m => m.id === id)?.nombre ?? 'Menú'
  const hoy = ahoraLocal ? new Date(ahoraLocal.slice(0, 10) + 'T00:00:00Z').getUTCDay() : -1
  const minAhora = ahoraLocal ? Number(ahoraLocal.slice(11, 13)) * 60 + Number(ahoraLocal.slice(14, 16)) : -1
  const usados = menus.filter(m => m.estado === 'activo' && Object.values(sem).some(l => l.some(s => s.menuId === m.id)))

  if (usados.length === 0) {
    return <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay horarios para dibujar. Crea un menú y agrégale una franja.</p>
  }

  return (
    <div className="space-y-3">
      <div aria-hidden className="grid grid-cols-[2.5rem_1fr] items-end gap-2 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
        <span />
        <div className="relative h-4">
          {[0, 6, 12, 18, 24].map(h => (
            <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(h / 24) * 100}%` }}>{h === 24 ? '24' : h}h</span>
          ))}
        </div>
      </div>

      {ORDEN_SEMANA.map(d => (
        <div key={d} className="grid grid-cols-[2.5rem_1fr] items-center gap-2"
          role="img"
          aria-label={`${DIAS_LARGO[d]}: ${sem[d].length ? sem[d].map(s => `${nombre(s.menuId)} de ${formatoHora(minAHora(s.ini))} a ${s.fin >= 1440 ? 'medianoche' : formatoHora(minAHora(s.fin))}`).join(', ') : 'sin menú'}`}>
          <span className={`text-[length:var(--w-fs-label)] ${d === hoy ? 'font-bold text-[color:var(--w-accent-text)]' : 'text-[color:var(--w-text-2)]'}`}>{DIAS_CORTO[d]}</span>
          <div className="relative h-7 overflow-hidden rounded-[var(--w-r-sm)] border border-[var(--w-border)] bg-[var(--w-surface-sunken)]">
            {sem[d].map((s, i) => (
              <div key={i} title={`${nombre(s.menuId)} · ${formatoHora(minAHora(s.ini))} – ${s.fin >= 1440 ? '12:00 a. m.' : formatoHora(minAHora(s.fin))}`}
                className="absolute top-0 h-full opacity-90"
                style={{ left: `${(s.ini / 1440) * 100}%`, width: `${((s.fin - s.ini) / 1440) * 100}%`, background: colorDeMenu(menus, s.menuId), borderRight: '1px solid var(--w-surface)' }} />
            ))}
            {d === hoy && minAhora >= 0 && (
              <div className="absolute top-0 h-full w-0.5 bg-[var(--w-text)]" style={{ left: `${(minAhora / 1440) * 100}%` }} title="Ahora" />
            )}
          </div>
        </div>
      ))}

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
        {usados.map(m => (
          <li key={m.id} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: colorDeMenu(menus, m.id) }} />{m.nombre}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-[3px] border border-[var(--w-border)] bg-[var(--w-surface-sunken)]" />Sin menú (solo "todo el día")</li>
      </ul>

      {pisan.length > 0 && (
        <p role="alert" className="rounded-[var(--w-r-md)] bg-[var(--w-warning-bg)] px-3 py-2 text-[length:var(--w-fs-label)] text-[color:var(--w-warning-text)]">
          ! {pisan.map(p => `${nombre(p.a)} y ${nombre(p.b)} se cruzan el ${DIAS_LARGO[p.dia].toLowerCase()}`).join('; ')}. Se muestran los dos menús; si un plato está en ambos, gana el de menor prioridad.
        </p>
      )}
    </div>
  )
}
