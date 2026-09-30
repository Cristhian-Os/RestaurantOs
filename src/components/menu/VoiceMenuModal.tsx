/**
 * VoiceMenuModal.tsx
 * Sube platos al menú dictándolos: se habla ("Cholao grande 14 mil, limonada 5 mil…"),
 * se muestra lo entendido en filas editables y, al confirmar, se insertan en `dishes`
 * con el mismo formato del alta manual. Nada se guarda sin pasar por la revisión.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { VoiceButton } from '../VoiceButton'
import { matchName } from '../../services/voiceMatch'

interface Category { value: string; label: string }

interface VoiceDish {
  name: string; price: number; category?: string; description?: string
  sizes?: { nombre: string; precio: number }[]
  toppings?: { nombre: string; precio: number }[]
}

interface Row {
  name: string; price: string; category: string; description: string
  sizes: string      // "Grande: 14000, Mediano: 10000"
  toppings: string   // "Limón: 0, Chocolate: 2000"
}

// "Grande: 14000, Mediano 10000" ⇄ [{nombre, precio}]
const fmtPairs = (l?: { nombre: string; precio: number }[]) => (l ?? []).map(x => `${x.nombre}: ${x.precio}`).join(', ')
const parsePairs = (s: string) =>
  s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const m = p.match(/^(.*?)[\s:=]*(\d+(?:[.,]\d+)?)?$/)
    return { nombre: (m?.[1] ?? p).trim(), precio: Math.max(0, parseFloat((m?.[2] ?? '0').replace(',', '.')) || 0) }
  }).filter(x => x.nombre !== '')

export function VoiceMenuModal({ categories, onSaved, onClose }: {
  categories: Category[]
  onSaved:    () => void
  onClose:    () => void
}) {
  const [rows, setRows]             = useState<Row[]>([])
  const [transcript, setTranscript] = useState('')
  const [saving, setSaving]         = useState(false)

  const onResult = (r: { transcript: string; dishes: VoiceDish[] }) => {
    setTranscript(r.transcript ?? '')
    const fallback = categories[0]?.value ?? ''
    const mapped: Row[] = (r.dishes ?? []).map(d => {
      const exact = categories.find(c => c.value === d.category)
      const cat = exact ?? matchName(d.category, categories, c => c.label) ?? null
      return {
        name: d.name ?? '', price: String(d.price ?? ''), category: cat?.value ?? fallback,
        description: d.description ?? '', sizes: fmtPairs(d.sizes), toppings: fmtPairs(d.toppings),
      }
    })
    if (mapped.length === 0) { message.warning('No entendí ningún plato. Intenta de nuevo.'); return }
    setRows(prev => [...prev, ...mapped])
  }

  const update = (i: number, patch: Partial<Row>) => setRows(p => p.map((r, j) => j === i ? { ...r, ...patch } : r))

  const save = async () => {
    const payloads = []
    for (const r of rows) {
      const sizes = parsePairs(r.sizes).filter(s => s.precio > 0)
      const price = sizes.length ? Math.min(...sizes.map(s => s.precio)) : parseFloat(r.price)
      if (!r.name.trim() || !Number.isFinite(price) || price < 0) { message.error(`Revisa "${r.name || 'plato sin nombre'}": nombre y precio`); return }
      payloads.push({
        name: r.name.trim(), description: r.description.trim() || null, price, category: r.category,
        tags: [], available: true, availability_status: 'available',
        has_sizes: sizes.length > 0, sizes, options: [],
        toppings: parsePairs(r.toppings).filter((t, i, a) => a.findIndex(x => x.nombre === t.nombre) === i),
        updated_at: new Date().toISOString(),
      })
    }
    if (payloads.length === 0) return
    setSaving(true)
    const { error } = await supabase.from('dishes').insert(payloads)
    setSaving(false)
    if (error) { message.error('Error al guardar: ' + error.message); return }
    message.success(`${payloads.length} ${payloads.length === 1 ? 'plato agregado' : 'platos agregados'} al menú`)
    onSaved()
    onClose()
  }

  const inp: React.CSSProperties = { padding: '0.5rem 0.625rem', borderRadius: '0.625rem', border: '1px solid #CDD0DC', fontSize: '0.875rem', background: '#fff', color: '#2D3561', minWidth: 0, width: '100%' }
  const lab: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2, display: 'block' }

  return createPortal(
    <div onClick={() => !saving && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', background: '#D8DAE4', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontWeight: 700, color: '#2D3561' }}>Subir menú por voz</h3>
          <VoiceButton<{ transcript: string; dishes: VoiceDish[] }> kind="menu" label={rows.length ? 'Dictar más' : 'Empezar a dictar'}
            onResult={onResult} context={() => ({ categories: categories.map(c => ({ value: c.value, label: c.label })) })} />
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6B7280' }}>
          Di por ejemplo: “Cholao grande 14 mil, mediano 10 mil, con toppings limón y sal; limonada 5 mil, categoría bebidas”. Revisa y corrige antes de guardar.
        </p>

        {transcript && (
          <p style={{ margin: 0, fontSize: '0.8125rem', fontStyle: 'italic', color: '#2D3561', background: '#CDD0DC', borderRadius: '0.75rem', padding: '0.5rem 0.75rem' }}>
            Escuché: “{transcript}”
          </p>
        )}

        {rows.map((r, i) => (
          <div key={i} style={{ background: '#E8EAF0', borderRadius: '0.875rem', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', position: 'relative' }}>
            <div><label style={lab}>Nombre</label><input style={inp} value={r.name} onChange={e => update(i, { name: e.target.value })} /></div>
            <div><label style={lab}>Precio</label><input style={inp} type="number" min="0" value={r.price} onChange={e => update(i, { price: e.target.value })} /></div>
            <div><label style={lab}>Categoría</label>
              <select style={inp} value={r.category} onChange={e => update(i, { category: e.target.value })}>
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div><label style={lab}>Descripción</label><input style={inp} value={r.description} onChange={e => update(i, { description: e.target.value })} /></div>
            <div><label style={lab}>Tamaños (Nombre: precio, …)</label><input style={inp} value={r.sizes} onChange={e => update(i, { sizes: e.target.value })} placeholder="Grande: 14000, Mediano: 10000" /></div>
            <div><label style={lab}>Toppings (Nombre: precio, …)</label><input style={inp} value={r.toppings} onChange={e => update(i, { toppings: e.target.value })} placeholder="Limón: 0, Chocolate: 2000" /></div>
            <button onClick={() => setRows(p => p.filter((_, j) => j !== i))} title="Quitar" aria-label="Quitar plato"
              style={{ position: 'absolute', top: 6, right: 8, border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.875rem', border: 'none', fontWeight: 700, cursor: 'pointer', background: '#CDD0DC', color: '#6B7280' }}>Cancelar</button>
          <button onClick={save} disabled={saving || rows.length === 0}
            style={{ flex: 2, padding: '0.75rem', borderRadius: '0.875rem', border: 'none', fontWeight: 700, cursor: 'pointer', background: '#FF5722', color: '#fff', opacity: saving || rows.length === 0 ? 0.5 : 1 }}>
            {saving ? 'Guardando…' : `Guardar ${rows.length || ''} ${rows.length === 1 ? 'plato' : 'platos'} en el menú`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
