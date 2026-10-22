/**
 * OptionListsManager.tsx — "Listas y opciones" (admin). Listas reutilizables del restaurante
 * (sabores, toppings, leches, salsas…): se arreglan una vez y valen para todos los platos que las usan.
 * Cada ítem puede tener precio extra, estar agotado y descontar un ingrediente del inventario.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import type { OptionItem, OptionList } from '../../types'

interface IngredienteRow { id: string; nombre: string; unidad_medida: string }
interface ListRow extends OptionList { id: string }
interface DishUse { name: string; options: unknown }

const card: React.CSSProperties = {
  background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem',
  padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)',
}
const input: React.CSSProperties = {
  boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)',
  background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--w-sans)',
}
const btn = (primary = false): React.CSSProperties => ({
  padding: '0.5rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 600, fontSize: '0.8125rem',
  border: primary ? '1px solid transparent' : '1px solid var(--w-line)',
  background: primary ? 'var(--w-terra)' : 'var(--w-bg)', color: primary ? '#fff' : 'var(--w-ink-soft)',
})

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'lista'

function ListEditor({ list, ingredientes, usadaEn, onSaved, onDeleted }: {
  list: ListRow; ingredientes: IngredienteRow[]; usadaEn: string[]; onSaved: () => void; onDeleted: () => void
}) {
  const [nombre, setNombre] = useState(list.nombre)
  const [items, setItems]   = useState<OptionItem[]>(list.items)
  const [nuevo, setNuevo]   = useState('')
  const [busy, setBusy]     = useState(false)
  const dirty = nombre !== list.nombre || JSON.stringify(items) !== JSON.stringify(list.items)

  const setItem = (i: number, patch: Partial<OptionItem>) => setItems(its => its.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  const mover = (i: number, d: number) => setItems(its => {
    const j = i + d
    if (j < 0 || j >= its.length) return its
    const c = [...its]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const agregar = () => {
    const label = nuevo.trim()
    if (!label) return
    if (items.some(it => it.label.toLowerCase() === label.toLowerCase())) { message.warning('Ese ítem ya está en la lista'); return }
    setItems(its => [...its, { label, activo: true, precio_extra: 0 }]); setNuevo('')
  }

  const guardar = async () => {
    const limpio = items.map(it => ({ ...it, label: it.label.trim() })).filter(it => it.label)
    const dup = limpio.find((it, i) => limpio.findIndex(x => x.label.toLowerCase() === it.label.toLowerCase()) !== i)
    if (dup) { message.error(`"${dup.label}" está repetido`); return }
    if (!nombre.trim()) { message.error('La lista necesita un nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('option_lists').update({ nombre: nombre.trim(), items: limpio, updated_at: new Date().toISOString() }).eq('id', list.id)
    setBusy(false)
    if (error) message.error('No se pudo guardar: ' + error.message)
    else { message.success('Lista guardada'); onSaved() }
  }

  const borrar = async () => {
    const aviso = usadaEn.length > 0
      ? `Esta lista la usan: ${usadaEn.slice(0, 5).join(', ')}${usadaEn.length > 5 ? '…' : ''}. Esos platos quedarán sin opciones para elegir. ¿Borrarla igual?`
      : '¿Borrar esta lista?'
    if (!window.confirm(aviso)) return
    setBusy(true)
    const { error } = await supabase.from('option_lists').delete().eq('id', list.id)
    setBusy(false)
    if (error) message.error('No se pudo borrar: ' + error.message)
    else { message.success('Lista borrada'); onDeleted() }
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} aria-label="Nombre de la lista"
          style={{ ...input, flex: '1 1 14rem', fontWeight: 700, fontSize: '1.0625rem' }} />
        <button onClick={guardar} disabled={!dirty || busy} style={{ ...btn(true), opacity: !dirty || busy ? 0.5 : 1 }}>Guardar cambios</button>
        <button onClick={borrar} disabled={busy} style={btn()}>Borrar lista</button>
      </div>
      <p style={{ margin: '0 0 0.875rem', fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>
        {usadaEn.length > 0 ? `La usan ${usadaEn.length} plato${usadaEn.length === 1 ? '' : 's'}: ${usadaEn.slice(0, 4).join(', ')}${usadaEn.length > 4 ? '…' : ''}` : 'Ningún plato la usa todavía.'}
        {dirty && <strong style={{ color: 'var(--w-terra)' }}> · Cambios sin guardar</strong>}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((it, i) => {
          const ing = ingredientes.find(g => g.id === it.ingrediente_id)
          return (
            <div key={i} style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem', borderRadius: '0.875rem', border: '1px solid var(--w-line)', opacity: it.activo === false ? 0.6 : 1 }}>
              <input value={it.label} onChange={e => setItem(i, { label: e.target.value })} aria-label="Nombre del ítem" maxLength={60} style={{ ...input, flex: '1 1 9rem' }} />
              <label style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', display: 'flex', alignItems: 'center', gap: 4 }}>
                +$
                <input type="number" min={0} step={100} value={it.precio_extra ?? 0} aria-label="Precio extra"
                  onChange={e => setItem(i, { precio_extra: Math.max(0, Number(e.target.value) || 0) })} style={{ ...input, width: '5.5rem' }} />
              </label>
              <select value={it.ingrediente_id ?? ''} aria-label="Ingrediente del inventario"
                onChange={e => setItem(i, e.target.value ? { ingrediente_id: e.target.value, cantidad_consumo: it.cantidad_consumo ?? 1 } : { ingrediente_id: null, cantidad_consumo: null })}
                style={{ ...input, maxWidth: '11rem' }}>
                <option value="">Sin inventario</option>
                {ingredientes.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
              {it.ingrediente_id && (
                <label style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={0} step="any" value={it.cantidad_consumo ?? 1} aria-label="Cantidad que consume"
                    onChange={e => setItem(i, { cantidad_consumo: Math.max(0, Number(e.target.value) || 0) })} style={{ ...input, width: '4.5rem' }} />
                  {ing?.unidad_medida ?? ''}
                </label>
              )}
              <button onClick={() => setItem(i, { activo: it.activo === false })} style={btn()} aria-pressed={it.activo !== false}>
                {it.activo === false ? 'Agotado' : 'Disponible'}
              </button>
              <button onClick={() => mover(i, -1)} disabled={i === 0} style={btn()} aria-label="Subir">▲</button>
              <button onClick={() => mover(i, 1)} disabled={i === items.length - 1} style={btn()} aria-label="Bajar">▼</button>
              <button onClick={() => setItems(its => its.filter((_, k) => k !== i))} style={btn()} aria-label="Quitar ítem">✕</button>
            </div>
          )
        })}
        {items.length === 0 && <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>La lista está vacía. Agrega el primer ítem.</p>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregar() }}
          placeholder="Nuevo ítem (ej. Vainilla)" maxLength={60} style={{ ...input, flex: 1 }} />
        <button onClick={agregar} style={btn(true)}>Agregar</button>
      </div>
    </section>
  )
}

export function OptionListsManager() {
  const [lists, setLists]     = useState<ListRow[]>([])
  const [ings, setIngs]       = useState<IngredienteRow[]>([])
  const [dishes, setDishes]   = useState<DishUse[]>([])
  const [loading, setLoading] = useState(true)
  const [nombreNueva, setNombreNueva] = useState('')

  const cargar = useCallback(async () => {
    const [l, i, d] = await Promise.all([
      supabase.from('option_lists').select('id,key,nombre,items,sort_order').order('sort_order').order('nombre'),
      supabase.from('ingredientes').select('id,nombre,unidad_medida').order('nombre'),
      supabase.from('dishes').select('name,options'),
    ])
    setLists((l.data ?? []) as ListRow[])
    setIngs((i.data ?? []) as IngredienteRow[])
    setDishes((d.data ?? []) as DishUse[])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const usos = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const d of dishes) {
      const keys = new Set<string>()
      for (const g of (Array.isArray(d.options) ? d.options : []) as { v?: number; fuente?: { lista?: string } }[]) {
        if (g?.v === 2 && g.fuente?.lista) keys.add(g.fuente.lista)
      }
      keys.forEach(k => { (m[k] ??= []).push(d.name) })
    }
    return m
  }, [dishes])

  const crear = async () => {
    const nombre = nombreNueva.trim()
    if (!nombre) return
    let key = slug(nombre), n = 2
    while (lists.some(l => l.key === key)) key = `${slug(nombre)}_${n++}`
    const { error } = await supabase.from('option_lists').insert({ key, nombre, items: [], sort_order: lists.length + 1 })
    if (error) { message.error('No se pudo crear: ' + error.message); return }
    setNombreNueva(''); message.success('Lista creada'); cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', margin: 0 }}>Listas y opciones</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
          Arma una lista una sola vez (sabores, leches, salsas, adiciones…) y úsala en todos los platos que quieras. Si cambias un ítem aquí, cambia en todos.
        </p>
      </div>

      <section style={{ ...card, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input value={nombreNueva} onChange={e => setNombreNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crear() }}
          placeholder="Nueva lista (ej. Leches, Salsas, Toppings)" maxLength={80} style={{ ...input, flex: '1 1 14rem' }} />
        <button onClick={crear} style={btn(true)}>Crear lista</button>
      </section>

      {loading ? <p style={{ color: 'var(--w-ink-mut)' }}>Cargando…</p> : lists.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Todavía no hay listas. Crea la primera arriba.</p>
      ) : lists.map(l => (
        <ListEditor key={`${l.id}:${l.items.length}:${l.nombre}`} list={l} ingredientes={ings} usadaEn={usos[l.key] ?? []} onSaved={cargar} onDeleted={cargar} />
      ))}
    </div>
  )
}
