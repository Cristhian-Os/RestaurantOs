/**
 * EditOrderModal.tsx — Editar los productos de un pedido (caja).
 * Cada producto se reabre en el mismo constructor con el que se armó el pedido
 * (DishOptionsModal), precargado con su cantidad, tamaño, sabores, queso/helado,
 * toppings y comentario. Guardar actualiza ESA línea del pedido (no crea otra)
 * vía editar_items_pedido; el servidor recalcula los precios.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { inventoryService } from '../../services/inventoryService'
import { useMenuConfig } from '../../hooks/useMenuConfig'
import { lineNotes } from '../../services/menuOptions'
import { DishOptionsModal, needsCustomization, type BuilderResult } from './OrderFlow'
import type { Dish, ItemSel } from '../../types'
import type { RecetaShortage } from '../../types/inventory'

export interface OrderItemRow {
  id:        string | null
  name:      string
  price:     number
  quantity:  number
  notes?:    string | null
  size?:     string | null
  toppings?: string[] | null
  sel?:      ItemSel | null
  cancelled?: boolean
}

interface Line {
  idx:       number          // posición de la línea en el pedido original
  dishId:    string | null
  name:      string
  quantity:  number
  unitPrice: number
  notes:     string | null
  size:      string | null
  toppings:  string[]
  sel:       ItemSel | null
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

export function EditOrderModal({ order, onClose, onSaved }: {
  order:   { id: string; items: OrderItemRow[]; paid_at: string | null; total: number }
  onClose: () => void
  onSaved: () => void
}) {
  const menu = useMenuConfig()
  const [dishes, setDishes]       = useState<Record<string, Dish>>({})
  const [shortages, setShortages] = useState<RecetaShortage[]>([])
  const [editing, setEditing]     = useState<number | null>(null)
  const [saving, setSaving]       = useState(false)
  const [lines, setLines] = useState<Line[]>(() => order.items
    .map((it, idx) => ({
      idx, dishId: it.id, name: it.name, quantity: it.quantity, unitPrice: Number(it.price),
      notes: it.notes ?? null, size: it.size ?? null, toppings: it.toppings ?? [], sel: it.sel ?? null,
      cancelled: !!it.cancelled,
    }))
    .filter(l => !l.cancelled))

  useEffect(() => {
    const ids = [...new Set(order.items.map(i => i.id).filter((x): x is string => !!x))]
    if (ids.length) {
      supabase.from('dishes').select('*').in('id', ids)
        .then(({ data }) => setDishes(Object.fromEntries((data ?? []).map((d: Dish) => [d.id, d]))))
    }
    inventoryService.getRecetaShortages().then(setShortages).catch(() => {})
  }, [order.items])

  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const line  = lines.find(l => l.idx === editing)
  const dish  = line?.dishId ? dishes[line.dishId] : undefined

  // Líneas creadas antes de que el pedido guardara la selección: se abre el
  // constructor con lo que se pueda (tamaño/comentario) y se muestra lo que
  // decía el pedido original para volver a marcarlo.
  const initialFor = (l: Line, d: Dish) => l.sel
    ? { qty: l.quantity, sel: l.sel }
    : needsCustomization(d)
      ? { qty: l.quantity, sel: l.size ? { size: l.size } : undefined, previousNotes: l.notes }
      : { qty: l.quantity, sel: { comment: l.notes ?? '' } }

  const applyEdit = (r: BuilderResult) => {
    setLines(prev => prev.map(l => l.idx === editing ? {
      ...l, quantity: r.qty, unitPrice: r.unitPrice, size: r.size, toppings: r.toppings, sel: r.sel,
      notes: lineNotes(r.optsText, r.comment) || null,
    } : l))
    setEditing(null)
  }

  const setQty = (idx: number, q: number) =>
    setLines(prev => prev.map(l => l.idx === idx ? { ...l, quantity: Math.min(50, Math.max(1, q)) } : l))

  const save = async () => {
    if (lines.length === 0) { message.warning('El pedido debe tener al menos un producto. Si ya no quieren nada, cancela el pedido.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('editar_items_pedido', {
      p_order_id: order.id,
      p_items: lines.map(l => ({ idx: l.idx, quantity: l.quantity, size: l.size, toppings: l.toppings, notes: l.notes, sel: l.sel })),
    })
    setSaving(false)
    if (error) { message.error(error.message); return }
    message.success('Pedido actualizado')
    onSaved()
  }

  const btn: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, borderRadius: '0.75rem' }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={() => !saving && onClose()}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'auto', fontFamily: 'var(--w-sans)' }}>
          <h3 className="ed-display" style={{ fontWeight: 600, fontSize: '1.375rem', margin: '0 0 0.25rem', color: 'var(--w-ink)' }}>Editar pedido</h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>
            Toca <b>Editar</b> en un producto para cambiar cantidad, tamaño, sabores, toppings o comentario.
          </p>
          {order.paid_at && (
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--w-wine)', background: 'var(--w-bg)', border: '1px solid var(--w-line)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem' }}>
              Este pedido ya está pagado: puedes cambiar opciones que no muevan el total (ej. el sabor). Si cambia el precio, cancélalo y crea uno nuevo.
            </p>
          )}

          {lines.length === 0 ? (
            <p style={{ color: 'var(--w-ink-mut)', textAlign: 'center', padding: '1.5rem 0' }}>Sin productos</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
              {lines.map(l => {
                const d = l.dishId ? dishes[l.dishId] : undefined
                return (
                  <div key={l.idx} style={{ background: 'var(--w-bg)', border: '1px solid var(--w-line)', borderRadius: '0.875rem', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--w-ink)' }}>{l.quantity}× {l.name}</p>
                        {l.notes && <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>{l.notes}</p>}
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--w-ink)', whiteSpace: 'nowrap' }}>{fmt(l.unitPrice * l.quantity)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem', alignItems: 'center' }}>
                      {d ? (
                        <button onClick={() => setEditing(l.idx)} style={{ ...btn, flex: 1, padding: '0.55rem', background: 'var(--w-saffron)', color: '#fff' }}>
                          Editar
                        </button>
                      ) : l.dishId ? (
                        <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Cargando…</span>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button onClick={() => setQty(l.idx, l.quantity - 1)} style={{ ...btn, width: 34, height: 34, background: 'var(--w-surface)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }}>−</button>
                          <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: 'var(--w-ink)' }}>{l.quantity}</span>
                          <button onClick={() => setQty(l.idx, l.quantity + 1)} style={{ ...btn, width: 34, height: 34, background: 'var(--w-terra)', color: '#fff' }}>+</button>
                        </div>
                      )}
                      <button onClick={() => setLines(prev => prev.filter(x => x.idx !== l.idx))}
                        style={{ ...btn, padding: '0.55rem 0.875rem', background: 'var(--w-wine)', color: '#fff' }}>
                        Quitar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.875rem 1rem', borderRadius: '0.875rem', background: 'var(--w-bg)', border: '1px solid var(--w-line)', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
              Total nuevo {Math.round(total) !== Math.round(order.total) && <span>(antes {fmt(order.total)})</span>}
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--w-terra)' }}>{fmt(total)}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onClose} disabled={saving}
              style={{ ...btn, flex: 1, padding: '0.9rem', background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              style={{ ...btn, flex: 1, padding: '0.9rem', background: 'var(--w-terra)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {line && dish && (
          <DishOptionsModal
            dish={dish}
            menu={menu}
            shortages={shortages.filter(s => s.producto_id === dish.id)}
            initial={initialFor(line, dish)}
            confirmLabel="Guardar"
            onConfirm={applyEdit}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
