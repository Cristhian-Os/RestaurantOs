/**
 * DishGroupsEditor.tsx — constructor de grupos de opciones de un plato (modelo universal, Anexo B).
 * Cada grupo: nombre, una o varias, mínimo y máximo, obligatorio, y de dónde salen las opciones
 * (una lista reutilizable o ítems propios del plato, con precio extra). Incluye vista previa.
 */
import { useState, type CSSProperties } from 'react'
import type { ItemSel, OptionGroupV2, OptionItem } from '../../types'
import type { ListMap } from '../../services/menuOptions'
import { OptionGroupsV2 } from '../orders/OptionGroupsV2'

export interface EditorTheme { bg: string; bgSurf: string; acc: string; txt: string; txtLt: string }

const nuevoId = () => `g_${Math.random().toString(36).slice(2, 8)}`

// Devuelve el primer problema que impide guardar los grupos, o null si están bien.
export function validarGrupos(groups: OptionGroupV2[], listas: ListMap): string | null {
  for (const g of groups) {
    if (!g.nombre.trim()) return 'Cada grupo de opciones necesita un nombre'
    const items = 'lista' in g.fuente ? (listas[g.fuente.lista] ?? []) : g.fuente.items
    if (items.length === 0) return `El grupo "${g.nombre}" no tiene opciones: elige una lista con ítems o agrega los tuyos`
    const max = g.max === 'cantidad' ? 1 : g.max
    if (g.min > max) return `En "${g.nombre}" el mínimo no puede ser mayor que el máximo`
    if (new Set(items.map(i => i.label.trim().toLowerCase())).size !== items.length) return `El grupo "${g.nombre}" tiene opciones repetidas`
  }
  return null
}

export function DishGroupsEditor({ groups, onChange, listas, listaNombres, theme }: {
  groups: OptionGroupV2[]; onChange: (g: OptionGroupV2[]) => void
  listas: ListMap; listaNombres: Record<string, string>; theme: EditorTheme
}) {
  const [preview, setPreview] = useState<ItemSel>({})
  const field: CSSProperties = { backgroundColor: theme.bg, color: theme.txt, borderRadius: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', border: `1px solid ${theme.bgSurf}`, minWidth: 0 }
  const smallBtn: CSSProperties = { color: theme.acc, backgroundColor: theme.bg, border: `1px solid ${theme.bgSurf}`, borderRadius: '0.75rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }

  const set = (i: number, patch: Partial<OptionGroupV2>) => onChange(groups.map((g, k) => (k === i ? { ...g, ...patch } : g)))
  const mover = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= groups.length) return
    const c = [...groups]; [c[i], c[j]] = [c[j], c[i]]; onChange(c)
  }
  const agregar = () => onChange([...groups, {
    v: 2, id: nuevoId(), nombre: '', modo: 'single', min: 1, max: 1, requerido: true, fuente: { items: [] },
  }])
  const setItems = (i: number, items: OptionItem[]) => set(i, { fuente: { items } })

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && (
        <p className="text-[0.6875rem]" style={{ color: theme.txtLt }}>
          Este plato no tiene opciones. Agrega un grupo si el cliente debe elegir algo (sabores, tamaño de cono, leche, salsas…).
        </p>
      )}

      {groups.map((g, i) => {
        const esLista = 'lista' in g.fuente
        const items = esLista ? [] : (g.fuente as { items: OptionItem[] }).items
        const max = g.max === 'cantidad' ? 1 : g.max
        return (
          <div key={g.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ backgroundColor: theme.bgSurf }}>
            <div className="flex gap-2 items-center flex-wrap">
              <input value={g.nombre} onChange={e => set(i, { nombre: e.target.value })} placeholder="Nombre del grupo (ej. Sabores, Leche, Salsas)"
                maxLength={60} aria-label="Nombre del grupo" style={{ ...field, flex: '1 1 12rem', fontWeight: 700 }} />
              <button onClick={() => mover(i, -1)} disabled={i === 0} style={smallBtn} aria-label="Subir grupo">▲</button>
              <button onClick={() => mover(i, 1)} disabled={i === groups.length - 1} style={smallBtn} aria-label="Bajar grupo">▼</button>
              <button onClick={() => onChange(groups.filter((_, k) => k !== i))} style={{ ...smallBtn, color: '#EF4444' }} aria-label="Quitar grupo">✕</button>
            </div>

            <div className="flex gap-2 items-center flex-wrap text-xs" style={{ color: theme.txtLt }}>
              <select value={g.modo} aria-label="Una o varias"
                onChange={e => { const modo = e.target.value as 'single' | 'multi'; set(i, modo === 'single' ? { modo, min: Math.min(g.min, 1), max: 1 } : { modo, max: Math.max(2, max) }) }} style={field}>
                <option value="single">Elige una</option>
                <option value="multi">Elige varias</option>
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={g.requerido} onChange={e => set(i, { requerido: e.target.checked, min: e.target.checked ? Math.max(1, g.min) : 0 })} />
                Obligatorio
              </label>
              {g.modo === 'multi' && (
                <>
                  <label className="flex items-center gap-1">Mínimo
                    <input type="number" min={g.requerido ? 1 : 0} max={max} value={g.min} style={{ ...field, width: '4rem' }}
                      onChange={e => set(i, { min: Math.max(g.requerido ? 1 : 0, Math.min(Number(e.target.value) || 0, max)) })} />
                  </label>
                  <label className="flex items-center gap-1">Máximo
                    <input type="number" min={1} max={30} value={max} style={{ ...field, width: '4rem' }}
                      onChange={e => { const m = Math.max(1, Math.min(Number(e.target.value) || 1, 30)); set(i, { max: m, min: Math.min(g.min, m) }) }} />
                  </label>
                </>
              )}
            </div>

            <div className="flex gap-2 items-center flex-wrap text-xs" style={{ color: theme.txtLt }}>
              <span>Opciones:</span>
              <select value={esLista ? (g.fuente as { lista: string }).lista : '__propias'} aria-label="Origen de las opciones"
                onChange={e => set(i, e.target.value === '__propias' ? { fuente: { items: [] } } : { fuente: { lista: e.target.value } })} style={{ ...field, flex: '1 1 10rem' }}>
                <option value="__propias">Opciones propias de este plato</option>
                {Object.keys(listas).filter(k => (listas[k]?.length ?? 0) > 0 || k === (esLista ? (g.fuente as { lista: string }).lista : '')).map(k => (
                  <option key={k} value={k}>Lista: {listaNombres[k] ?? k}</option>
                ))}
              </select>
            </div>

            {esLista ? (
              <p className="text-[0.6875rem]" style={{ color: theme.txtLt }}>
                Los ítems vienen de la lista y se arreglan en “Listas y opciones”. Hoy tiene {(listas[(g.fuente as { lista: string }).lista] ?? []).length}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it, k) => (
                  <div key={k} className="flex gap-2 items-center">
                    <input value={it.label} onChange={e => setItems(i, items.map((x, n) => (n === k ? { ...x, label: e.target.value } : x)))}
                      placeholder="Opción (ej. Doble)" maxLength={60} aria-label="Opción" style={{ ...field, flex: 1 }} />
                    <label className="text-xs flex items-center gap-1" style={{ color: theme.txtLt }}>+$
                      <input type="number" min={0} step={100} value={it.precio_extra ?? 0} aria-label="Precio extra"
                        onChange={e => setItems(i, items.map((x, n) => (n === k ? { ...x, precio_extra: Math.max(0, Number(e.target.value) || 0) } : x)))}
                        style={{ ...field, width: '5.5rem' }} />
                    </label>
                    <button onClick={() => setItems(i, items.filter((_, n) => n !== k))} style={{ ...smallBtn, color: '#EF4444' }} aria-label="Quitar opción">✕</button>
                  </div>
                ))}
                <button onClick={() => setItems(i, [...items, { label: '', activo: true, precio_extra: 0 }])} style={{ ...smallBtn, alignSelf: 'flex-start' }}>+ Agregar opción</button>
              </div>
            )}
          </div>
        )
      })}

      <button onClick={agregar} style={{ ...smallBtn, alignSelf: 'flex-start' }}>+ Agregar grupo de opciones</button>

      {groups.length > 0 && (
        <div className="rounded-2xl p-3" style={{ border: `1px dashed ${theme.bgSurf}` }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: theme.txtLt }}>Vista previa (así lo ve el cliente)</p>
          <OptionGroupsV2 groups={groups.filter(g => g.nombre.trim())} listas={listas} sel={preview} setSel={fn => setPreview(fn)}
            chip={(on) => ({ padding: '0.4rem 0.8rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', border: 'none',
              background: on ? theme.acc : theme.bg, color: on ? '#fff' : theme.txt })}
            kicker={{ className: 'text-xs font-bold uppercase tracking-wider mb-2', style: { color: theme.txtLt } }}
            hint={{ className: 'text-xs', style: { color: theme.txtLt } }} groupGap="0.875rem" />
        </div>
      )}
    </div>
  )
}
