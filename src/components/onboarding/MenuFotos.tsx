/**
 * MenuFotos.tsx — Paso "Menú" del asistente, parte 2: foto y descripción de cada plato (Anexo D, 3.4).
 * Una tarjeta por plato; fotos en lote que se asignan por el nombre del archivo ("brownie.jpg" -> plato "Brownie")
 * y lo que no se pudo unir se asigna a mano. Los platos sin foto o sin descripción solo llevan un aviso amable.
 */
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { comprimirImagen, validarImagen } from './imagen'

interface Plato { id: string; name: string; category: string | null; price: number; description: string | null; image_url: string | null }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const baseNombre = (archivo: string) => archivo.replace(/\.[^.]+$/, '')
const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

const btn: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem' }
const primary: React.CSSProperties = { ...btn, background: 'var(--w-terra)', color: '#fff' }
const ghost: React.CSSProperties = { ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }
const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '0.875rem' }

export function MenuFotos({ rid, onListo }: { rid: string; onListo: () => void }) {
  const [platos, setPlatos] = useState<Plato[] | null>(null)
  const [subiendo, setSubiendo] = useState<Set<string>>(new Set())
  const [sinUnir, setSinUnir] = useState<File[]>([])

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('dishes').select('id, name, category, price, description, image_url').eq('restaurant_id', rid).order('name')
    if (error) { message.error('No se pudieron cargar los platos: ' + error.message); return }
    setPlatos((data ?? []).map(d => ({ ...d, price: Number(d.price) })) as Plato[])
  }, [rid])
  useEffect(() => { void cargar() }, [cargar])

  const marcar = (id: string, on: boolean) => setSubiendo(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  const subirFoto = async (plato: Plato, file: File): Promise<boolean> => {
    const problema = validarImagen(file)
    if (problema) { message.error(problema); return false }
    marcar(plato.id, true)
    try {
      const blob = await comprimirImagen(file)
      const path = `dishes/${plato.id}.jpg`
      const { error } = await supabase.storage.from('restaurant-assets').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw new Error(error.message)
      const url = supabase.storage.from('restaurant-assets').getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`
      const { error: e2 } = await supabase.from('dishes').update({ image_url: url }).eq('id', plato.id)
      if (e2) throw new Error(e2.message)
      setPlatos(ps => ps?.map(p => p.id === plato.id ? { ...p, image_url: url } : p) ?? ps)
      return true
    } catch (e) {
      message.error(`No se pudo subir la foto de “${plato.name}”: ${e instanceof Error ? e.message : 'error'}`)
      return false
    } finally { marcar(plato.id, false) }
  }

  const fotosEnLote = async (files: FileList | null) => {
    if (!files || !platos) return
    const pendientes: File[] = []
    let unidas = 0
    for (const f of Array.from(files).slice(0, 60)) {
      const problema = validarImagen(f)
      if (problema) { message.error(problema); continue }
      const plato = platos.find(p => norm(p.name) === norm(baseNombre(f.name)))
      if (!plato) { pendientes.push(f); continue }
      if (await subirFoto(plato, f)) unidas++
    }
    if (unidas) message.success(`${unidas} foto${unidas === 1 ? '' : 's'} asignada${unidas === 1 ? '' : 's'} por el nombre del archivo`)
    setSinUnir(s => [...s, ...pendientes])
  }

  const guardarDescripcion = async (plato: Plato, texto: string) => {
    const nueva = texto.trim().slice(0, 500)
    if (nueva === (plato.description ?? '')) return
    const { error } = await supabase.from('dishes').update({ description: nueva || null }).eq('id', plato.id)
    if (error) { message.error('No se pudo guardar la descripción: ' + error.message); return }
    setPlatos(ps => ps?.map(p => p.id === plato.id ? { ...p, description: nueva || null } : p) ?? ps)
  }

  const asignarManual = async (file: File, platoId: string) => {
    const plato = platos?.find(p => p.id === platoId)
    if (!plato) return
    if (await subirFoto(plato, file)) setSinUnir(s => s.filter(x => x !== file))
  }

  if (platos === null) return <p>Cargando tus platos…</p>
  if (platos.length === 0) return (
    <div style={card}>
      <p style={{ margin: '0 0 0.75rem' }}>Todavía no tienes platos. Vuelve a la lista para agregarlos o hazlo después desde Menú.</p>
      <button style={primary} onClick={onListo}>Continuar</button>
    </div>
  )

  const conFoto = platos.filter(p => p.image_url).length
  const conDesc = platos.filter(p => p.description?.trim()).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ ...card, display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '12rem' }}>
          <strong>{conFoto} de {platos.length} con foto · {conDesc} con descripción</strong>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>
            Sube varias fotos juntas: se asignan solas si el archivo se llama como el plato (por ejemplo, “brownie.jpg”).
          </p>
        </div>
        <label style={{ ...ghost, display: 'inline-flex', alignItems: 'center' }}>
          📷 Subir varias fotos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }}
            onChange={e => { void fotosEnLote(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      {sinUnir.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--w-wine)' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Estas fotos no coincidieron con ningún plato. Elige a cuál va cada una:</p>
          {sinUnir.map(f => (
            <div key={f.name + f.size} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.875rem', flex: 1, minWidth: '8rem', wordBreak: 'break-all' }}>{f.name}</span>
              <select defaultValue="" aria-label={`Plato para ${f.name}`} onChange={e => e.target.value && void asignarManual(f, e.target.value)}
                style={{ padding: '0.6rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)' }}>
                <option value="">Elegir plato…</option>
                {platos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button style={ghost} onClick={() => setSinUnir(s => s.filter(x => x !== f))}>Descartar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))', gap: '0.75rem' }}>
        {platos.map(p => (
          <div key={p.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ aspectRatio: '4 / 3', borderRadius: '0.75rem', overflow: 'hidden', background: 'var(--w-bg)', border: '1px dashed var(--w-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w-ink-mut)', fontSize: '0.875rem' }}>
              {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Sin foto todavía'}
            </div>
            <div>
              <strong>{p.name}</strong>
              <div style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>{p.category ?? 'Sin categoría'} · {cop(p.price)}</div>
            </div>
            <textarea defaultValue={p.description ?? ''} rows={2} maxLength={500} placeholder="Descripción corta (opcional)" aria-label={`Descripción de ${p.name}`}
              onBlur={e => void guardarDescripcion(p, e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.9375rem', resize: 'vertical' }} />
            <label style={{ ...ghost, textAlign: 'center', opacity: subiendo.has(p.id) ? 0.6 : 1 }}>
              {subiendo.has(p.id) ? 'Subiendo…' : p.image_url ? '📷 Cambiar foto' : '📷 Agregar foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={subiendo.has(p.id)}
                onChange={e => { const f = e.target.files?.[0]; if (f) void subirFoto(p, f); e.target.value = '' }} />
            </label>
            {(!p.image_url || !p.description?.trim()) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>
                💡 {[!p.image_url && 'una foto', !p.description?.trim() && 'una descripción'].filter(Boolean).join(' y ')} ayuda{!p.image_url && !p.description?.trim() ? 'n' : ''} a vender más. Puedes hacerlo después.
              </span>
            )}
          </div>
        ))}
      </div>

      <div><button style={primary} onClick={onListo}>Continuar</button></div>
    </div>
  )
}
