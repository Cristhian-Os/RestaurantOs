import { useMemo, useState } from 'react'
import { supabase } from '../../../services/supabaseClient'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { Input, Select, Textarea } from '../../ui/Field'
import { Toggle } from '../../ui/Toggle'
import { formatCOP } from '../../../config/billing'
import {
  DIAS_CORTO, ORDEN_SEMANA, hhmm,
  type DiaEspecialFila, type FranjaFila, type MenuHorarioFila, type ProductoMenuFila,
} from '../../../lib/menuHorario'
import type { PlatoAdmin } from './useMenusHorarioAdmin'

interface FranjaEd { key: string; dias: number[]; especial: string | null; ini: string; fin: string }
interface PrecioEd { especial: string; tamanos: Record<string, string> }

interface Props {
  menu: MenuHorarioFila | null            // null = menú nuevo
  franjas: FranjaFila[]
  productos: ProductoMenuFila[]
  platos: PlatoAdmin[]
  diasEsp: DiaEspecialFila[]
  onClose: () => void
  onSaved: () => void
}

const llave = () => Math.random().toString(36).slice(2)
const num = (s: string): number | null => { const t = s.trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN }
const PRESETS: { label: string; dias: number[] }[] = [
  { label: 'Todos', dias: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Lun a Vie', dias: [1, 2, 3, 4, 5] },
  { label: 'Fin de semana', dias: [6, 0] },
]

export function MenuHorarioEditor({ menu, franjas, productos, platos, diasEsp, onClose, onSaved }: Props) {
  const propias = useMemo(() => (menu ? franjas.filter(f => f.menu_id === menu.id) : []), [menu, franjas])
  const [nombre, setNombre] = useState(menu?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(menu?.descripcion ?? '')
  const [estado, setEstado] = useState<MenuHorarioFila['estado']>(menu?.estado ?? 'activo')
  const [mostrarQr, setMostrarQr] = useState(menu?.mostrar_en_qr ?? true)
  const [fechaIni, setFechaIni] = useState(menu?.fecha_inicio ?? '')
  const [fechaFin, setFechaFin] = useState(menu?.fecha_fin ?? '')
  const [prioridad, setPrioridad] = useState(String(menu?.prioridad ?? 100))
  const [lista, setLista] = useState<FranjaEd[]>(() =>
    propias.length
      ? propias.map(f => ({ key: f.id, dias: f.dias, especial: f.dia_especial_id, ini: hhmm(f.hora_inicio), fin: hhmm(f.hora_fin) }))
      : menu ? [] : [{ key: llave(), dias: [0, 1, 2, 3, 4, 5, 6], especial: null, ini: '06:00', fin: '11:00' }])
  const [sel, setSel] = useState<Record<string, PrecioEd>>(() => {
    const out: Record<string, PrecioEd> = {}
    if (menu) for (const p of productos.filter(x => x.menu_id === menu.id)) {
      out[p.dish_id] = {
        especial: p.precio_especial == null ? '' : String(p.precio_especial),
        tamanos: Object.fromEntries(Object.entries(p.precios_tamano ?? {}).map(([k, v]) => [k, String(v)])),
      }
    }
    return out
  })
  const [todoDia, setTodoDia] = useState<Record<string, boolean>>(() => Object.fromEntries(platos.map(p => [p.id, p.todo_el_dia])))
  const [buscar, setBuscar] = useState('')
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return q ? platos.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : platos
  }, [platos, buscar])

  const cambiaFranja = (key: string, parche: Partial<FranjaEd>) => setLista(l => l.map(f => (f.key === key ? { ...f, ...parche } : f)))
  const alternaDia = (f: FranjaEd, d: number) => cambiaFranja(f.key, { dias: f.dias.includes(d) ? f.dias.filter(x => x !== d) : [...f.dias, d] })
  const alternaPlato = (id: string) => setSel(s => {
    if (s[id]) { const { [id]: _quitado, ...resto } = s; return resto }
    return { ...s, [id]: { especial: '', tamanos: {} } }
  })
  const cambiaPrecio = (id: string, parche: Partial<PrecioEd>) => setSel(s => ({ ...s, [id]: { ...s[id], ...parche } }))

  const guardar = async () => {
    const errs: string[] = []
    if (nombre.trim().length < 2) errs.push('Escribe un nombre para el menú (mínimo 2 letras).')
    if (fechaIni && fechaFin && fechaFin < fechaIni) errs.push('La fecha de fin no puede ser antes que la de inicio.')
    const pr = Number(prioridad)
    if (!Number.isInteger(pr) || pr < 0 || pr > 1000) errs.push('La prioridad debe ser un número entero entre 0 y 1000.')
    lista.forEach((f, i) => {
      if (!f.especial && f.dias.length === 0) errs.push(`Horario ${i + 1}: elige al menos un día.`)
      if (!f.ini || !f.fin) errs.push(`Horario ${i + 1}: completa la hora de inicio y de fin.`)
    })
    const productosPayload: { dish_id: string; precio_especial: number | null; precios_tamano: Record<string, number> }[] = []
    for (const [id, p] of Object.entries(sel)) {
      const plato = platos.find(x => x.id === id)
      const esp = num(p.especial)
      if (esp !== null && (Number.isNaN(esp) || esp < 0)) errs.push(`${plato?.name ?? 'Un plato'}: el precio no es válido.`)
      const tam: Record<string, number> = {}
      for (const [k, v] of Object.entries(p.tamanos)) {
        const n = num(v)
        if (n === null) continue
        if (Number.isNaN(n) || n < 0) errs.push(`${plato?.name ?? 'Un plato'} (${k}): el precio no es válido.`)
        else tam[k] = n
      }
      productosPayload.push({ dish_id: id, precio_especial: plato?.has_sizes ? null : (esp !== null && !Number.isNaN(esp) ? esp : null), precios_tamano: plato?.has_sizes ? tam : {} })
    }
    setErrores(errs)
    if (errs.length) return

    setGuardando(true)
    const { error } = await supabase.rpc('menu_horario_guardar', {
      p_menu: {
        id: menu?.id ?? null, nombre: nombre.trim(), descripcion: descripcion.trim(), estado, mostrar_en_qr: mostrarQr,
        fecha_inicio: fechaIni || null, fecha_fin: fechaFin || null, prioridad: pr,
        franjas: lista.map(f => ({ dias: f.especial ? [] : f.dias, dia_especial_id: f.especial, hora_inicio: f.ini, hora_fin: f.fin })),
        productos: productosPayload,
      },
    })
    if (error) { setGuardando(false); setErrores([error.message]); return }
    // "Disponible todo el día" es del plato (no del menú): se guarda solo lo que cambió
    const cambiados = platos.filter(p => todoDia[p.id] !== p.todo_el_dia)
    for (const p of cambiados) await supabase.from('dishes').update({ todo_el_dia: todoDia[p.id] }).eq('id', p.id)
    setGuardando(false)
    onSaved()
  }

  const seccion = 'space-y-3 rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-4'
  const titulo = 'font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]'

  return (
    <Modal open onClose={onClose} title={menu ? `Editar menú: ${menu.nombre}` : 'Nuevo menú'}
      footer={
        <div className="flex w-full flex-col gap-2">
          {errores.length > 0 && (
            <ul role="alert" className="space-y-0.5 rounded-[var(--w-r-md)] bg-[var(--w-danger-bg)] px-3 py-2 text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">
              {errores.map((e, i) => <li key={i}>✕ {e}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} loading={guardando}>Guardar menú</Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <section className={seccion}>
          <h3 className={titulo}>1. Datos del menú</h3>
          <Input label="Nombre" required value={nombre} maxLength={60} onChange={e => setNombre(e.target.value)} placeholder="Ej: Desayunos" />
          <Textarea label="Descripción (la ve el cliente)" value={descripcion} maxLength={300} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Arranca el día con algo rico" />
          <Select label="Estado" value={estado} onChange={e => setEstado(e.target.value as MenuHorarioFila['estado'])}
            hint="Pausado o desactivado: no se muestra ni se puede pedir, pero queda guardado.">
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="inactivo">Desactivado</option>
          </Select>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--w-fs-body)] text-[color:var(--w-text)]">Mostrar este menú automáticamente en el QR</span>
            <Toggle checked={mostrarQr} onChange={setMostrarQr} label="Mostrar en el menú QR" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input type="date" label="Desde (opcional)" value={fechaIni} onChange={e => setFechaIni(e.target.value)} hint="Vacío = sin fecha de inicio" />
            <Input type="date" label="Hasta (opcional)" value={fechaFin} onChange={e => setFechaFin(e.target.value)} hint="Vacío = sin fecha de fin" />
          </div>
          <details>
            <summary className="cursor-pointer text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-text-2)]">Opciones avanzadas</summary>
            <div className="mt-2">
              <Input type="number" inputMode="numeric" label="Prioridad" min={0} max={1000} value={prioridad} onChange={e => setPrioridad(e.target.value)}
                hint="Solo si dos menús se cruzan y comparten un plato: gana el número más bajo." />
            </div>
          </details>
        </section>

        <section className={seccion}>
          <h3 className={titulo}>2. ¿Cuándo está disponible?</h3>
          {lista.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Sin horarios: este menú solo se usará si lo activas a mano (control manual).</p>}
          {lista.map((f, i) => (
            <div key={f.key} className="space-y-3 rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">Horario {i + 1}</span>
                <Button size="sm" variant="ghost" onClick={() => setLista(l => l.filter(x => x.key !== f.key))}>Quitar</Button>
              </div>
              {diasEsp.length > 0 && (
                <Select label="Aplica a" value={f.especial ?? ''} onChange={e => cambiaFranja(f.key, { especial: e.target.value || null })}>
                  <option value="">Días de la semana</option>
                  {diasEsp.map(d => <option key={d.id} value={d.id}>Día especial: {d.nombre} ({d.fecha})</option>)}
                </Select>
              )}
              {!f.especial && (
                <div>
                  <div role="group" aria-label="Días de la semana" className="flex flex-wrap gap-1.5">
                    {ORDEN_SEMANA.map(d => {
                      const on = f.dias.includes(d)
                      return (
                        <button key={d} type="button" aria-pressed={on} onClick={() => alternaDia(f, d)}
                          className={`min-h-[44px] min-w-[44px] rounded-[var(--w-r-pill)] px-3 text-[length:var(--w-fs-label)] font-semibold ${on ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'border border-[var(--w-border-strong)] bg-[var(--w-surface)] text-[color:var(--w-text-2)]'}`}>
                          {DIAS_CORTO[d]}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {PRESETS.map(p => (
                      <button key={p.label} type="button" onClick={() => cambiaFranja(f.key, { dias: p.dias })}
                        className="min-h-[36px] rounded-[var(--w-r-pill)] px-3 text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-accent-text)] underline">{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input type="time" label="Desde" value={f.ini} onChange={e => cambiaFranja(f.key, { ini: e.target.value })} />
                <Input type="time" label="Hasta" value={f.fin} onChange={e => cambiaFranja(f.key, { fin: e.target.value })} />
              </div>
              {f.ini && f.fin && (f.fin <= f.ini) && (
                <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
                  {f.fin === f.ini ? 'Mismas horas: el menú rige las 24 horas de ese día.' : 'Termina después de la medianoche: sigue activo hasta esa hora del día siguiente.'}
                </p>
              )}
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLista(l => [...l, { key: llave(), dias: [0, 1, 2, 3, 4, 5, 6], especial: null, ini: '06:00', fin: '11:00' }])}>+ Agregar horario</Button>
        </section>

        <section className={seccion}>
          <h3 className={titulo}>3. Productos y precios de este menú</h3>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            Marca los productos de este menú. El precio especial solo vale en este menú; si lo dejas vacío se usa el precio general. Un mismo producto puede estar en varios menús.
          </p>
          <Input label="Buscar producto" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Nombre o categoría" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--w-fs-label)]">
            <span className="text-[color:var(--w-text-2)]">{Object.keys(sel).length} de {platos.length} productos en este menú</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSel(s => ({ ...s, ...Object.fromEntries(visibles.filter(p => !s[p.id]).map(p => [p.id, { especial: '', tamanos: {} }])) }))}>Marcar los de la lista</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(s => { const q = new Set(visibles.map(p => p.id)); return Object.fromEntries(Object.entries(s).filter(([id]) => !q.has(id))) })}>Quitar los de la lista</Button>
            </span>
          </div>
          {platos.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aún no tienes productos. Créalos en Menú.</p>}
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {visibles.map(p => {
              const on = !!sel[p.id]
              return (
                <li key={p.id} className="rounded-[var(--w-r-md)] border border-[var(--w-border)] bg-[var(--w-surface)] p-3">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={on} onChange={() => alternaPlato(p.id)} className="h-5 w-5 accent-[var(--w-accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[color:var(--w-text)]">{p.name}</span>
                      <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{p.category} · {p.has_sizes ? 'por tamaños' : `precio general ${formatCOP(p.price)}`}</span>
                    </span>
                  </label>
                  {on && (
                    <div className="mt-2 space-y-2 border-t border-[var(--w-border)] pt-2">
                      {p.has_sizes ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {p.sizes.map(s => (
                            <Input key={s.nombre} type="text" inputMode="decimal" label={`${s.nombre} (general ${formatCOP(s.precio)})`}
                              value={sel[p.id].tamanos[s.nombre] ?? ''} placeholder="Precio general"
                              onChange={e => cambiaPrecio(p.id, { tamanos: { ...sel[p.id].tamanos, [s.nombre]: e.target.value } })} />
                          ))}
                        </div>
                      ) : (
                        <Input type="text" inputMode="decimal" label="Precio en este menú" value={sel[p.id].especial} placeholder={`Vacío = ${formatCOP(p.price)}`}
                          onChange={e => cambiaPrecio(p.id, { especial: e.target.value })} />
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-2)]">Disponible todo el día (en cualquier menú)</span>
                    <Toggle checked={!!todoDia[p.id]} onChange={v => setTodoDia(t => ({ ...t, [p.id]: v }))} label={`${p.name}: disponible todo el día`} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </Modal>
  )
}
