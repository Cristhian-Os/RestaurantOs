/**
 * VoiceMenuModal.tsx
 * Sube platos al menú dictándolos: se habla ("Cholao grande 14 mil, limonada 5 mil…"),
 * se muestra lo entendido en filas editables y, al confirmar, se insertan en `dishes`
 * con el mismo formato del alta manual. Nada se guarda sin pasar por la revisión.
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { VoiceButton } from '../VoiceButton'
import { TranscriptEditor } from '../TranscriptEditor'
import { matchName } from '../../services/voiceMatch'
import { parseVoiceText } from '../../services/voiceService'
import { reemplazarGrupo } from '../../services/voiceText'

interface Category { value: string; label: string }

interface VoiceDish {
  name: string; price: number; category?: string; description?: string
  sizes?: { nombre: string; precio: number }[]
  toppings?: { nombre: string; precio: number }[]
}

interface Row {
  group: number      // dictado del que salió; al corregir su texto solo se reemplazan sus platos
  dirty?: boolean    // la persona ya editó esta fila a mano
  name: string; price: string; category: string; description: string
  sizes: string      // "Grande: 14000, Mediano: 10000"
  toppings: string   // "Limón: 0, Chocolate: 2000"
}

// "Grande: 14000, Mediano 10000" ⇄ [{nombre, precio}]
const fmtPairs = (l?: { nombre: string; precio: number }[]) => (l ?? []).map(x => `${x.nombre}: ${x.precio}`).join(', ')

// Precios en pesos colombianos: "14.000" o "14,000" = 14000 (el punto/coma es separador de miles);
// "2.5" = 2,5 (decimal, solo si no tiene grupos de 3 dígitos).
const parsePrecio = (t: string): number => {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  return Math.max(0, parseFloat(t.replace(',', '.')) || 0)
}

const parsePairs = (s: string) =>
  s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const m = p.match(/(?:^|[\s:=])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)$/)
    if (!m) return { nombre: p.replace(/[\s:=]+$/, ''), precio: 0 }
    const before = p.slice(0, m.index ?? 0)
    const precio = parsePrecio(m[1])
    // Sin ":" ni "=" y con un número chico ("Combo 2", "Menú 3") el número es parte del nombre, no un precio.
    const conSeparador = /^[:=]/.test(m[0]) || /[:=]\s*$/.test(before)
    if (!conSeparador && precio < 100) return { nombre: p, precio: 0 }
    return { nombre: before.replace(/[\s:=]+$/, '').trim(), precio }
  }).filter(x => x.nombre !== '')

/** Nombres repetidos (sin importar mayúsculas) dentro de una lista de pares. */
const duplicados = (l: { nombre: string }[]) => {
  const vistos = new Set<string>(), dup = new Set<string>()
  for (const x of l) { const k = x.nombre.toLowerCase(); if (vistos.has(k)) dup.add(x.nombre); vistos.add(k) }
  return [...dup]
}

export function VoiceMenuModal({ categories, onSaved, onClose }: {
  categories: Category[]
  onSaved:    () => void
  onClose:    () => void
}) {
  const [rows, setRows]             = useState<Row[]>([])
  // `n` = cuántos platos propuso la última interpretación (para avisar si ya quitaron o editaron alguno).
  const [dictados, setDictados]     = useState<{ id: number; text: string; n: number }[]>([])
  const [busyGroup, setBusyGroup]   = useState<number | null>(null)
  const [saving, setSaving]         = useState(false)
  const seq = useRef(1)

  const toRows = (dishes: VoiceDish[], group: number): Row[] => {
    const fallback = categories[0]?.value ?? ''
    return dishes.map(d => {
      const exact = categories.find(c => c.value === d.category)
      const cat = exact ?? matchName(d.category, categories, c => c.label) ?? null
      return {
        group, name: d.name ?? '', price: String(d.price ?? ''), category: cat?.value ?? fallback,
        description: d.description ?? '', sizes: fmtPairs(d.sizes), toppings: fmtPairs(d.toppings),
      }
    })
  }

  const onResult = (r: { transcript: string; dishes: VoiceDish[] }) => {
    const group = seq.current++
    const mapped = toRows(r.dishes ?? [], group)
    // El dictado se queda aunque no haya salido ningún plato: así se corrige el texto y se interpreta de nuevo.
    setDictados(prev => [...prev, { id: group, text: r.transcript ?? '', n: mapped.length }])
    if (mapped.length === 0) { message.warning('No entendí ningún plato. Corrige el texto e interprétalo de nuevo.'); return }
    setRows(prev => [...prev, ...mapped])
  }

  const escribir = () => { const id = seq.current++; setDictados(prev => [...prev, { id, text: '', n: 0 }]) }

  /** Manda el texto corregido de un dictado y cambia SOLO los platos de ese dictado. */
  const interpretar = async (d: { id: number; text: string; n: number }) => {
    if (busyGroup !== null || saving) return
    const mine = rows.filter(r => r.group === d.id)
    if ((mine.length < d.n || mine.some(r => r.dirty)) && !window.confirm('Quitaste o editaste platos de este dictado. Al interpretar de nuevo se reemplazan por lo que salga del texto. ¿Continuar?')) return
    setBusyGroup(d.id)
    try {
      const r = await parseVoiceText<{ transcript: string; dishes: VoiceDish[] }>('menu', d.text, { categories: categories.map(c => ({ value: c.value, label: c.label })) })
      const mapped = toRows(r.dishes ?? [], d.id)
      setRows(prev => reemplazarGrupo(prev, d.id, mapped))
      setDictados(prev => prev.map(x => x.id === d.id ? { ...x, n: mapped.length } : x))
      if (mapped.length === 0) message.warning('No entendí ningún plato con ese texto.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo interpretar el texto')
    } finally {
      setBusyGroup(null)
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows(p => p.map((r, j) => j === i ? { ...r, ...patch, dirty: true } : r))

  const save = async () => {
    const payloads = []
    for (const r of rows) {
      const sizes = parsePairs(r.sizes).filter(s => s.precio > 0)
      const dupSizes = duplicados(sizes)
      if (dupSizes.length) { message.error(`"${r.name || 'plato'}": el tamaño ${dupSizes.join(', ')} está repetido`); return }
      const dupTop = duplicados(parsePairs(r.toppings))
      if (dupTop.length) { message.error(`"${r.name || 'plato'}": el topping ${dupTop.join(', ')} está repetido`); return }
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
          <button type="button" onClick={escribir} disabled={saving || busyGroup !== null}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'underline', color: 'var(--w-terra, #FF5722)', opacity: saving || busyGroup !== null ? 0.5 : 1 }}>
            Escribir en vez de hablar
          </button>
          <VoiceButton<{ transcript: string; dishes: VoiceDish[] }> kind="menu" label={dictados.length ? 'Dictar más' : 'Empezar a dictar'}
            disabled={saving || busyGroup !== null}
            onResult={onResult} context={() => ({ categories: categories.map(c => ({ value: c.value, label: c.label })) })} />
        </div>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6B7280' }}>
          Di por ejemplo: “Cholao grande 14 mil, mediano 10 mil, con toppings limón y sal; limonada 5 mil, categoría bebidas”. Revisa y corrige antes de guardar.
        </p>

        {dictados.map(d => (
          <TranscriptEditor key={d.id} value={d.text} busy={busyGroup === d.id} disabled={saving || (busyGroup !== null && busyGroup !== d.id)}
            onChange={t => setDictados(prev => prev.map(x => x.id === d.id ? { ...x, text: t } : x))}
            onInterpret={() => void interpretar(d)} placeholder="Escribe los platos, por ejemplo: cholao grande 14 mil, limonada 5 mil" />
        ))}

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
