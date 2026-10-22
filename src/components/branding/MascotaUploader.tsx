/** Mascota del restaurante para el menú QR: una imagen fija (opcional). Sin mascota, el menú no muestra ningún personaje. */
import { useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { validarImagen } from '../../lib/imagenSubida'

const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)' }

export function MascotaUploader() {
  const [rid, setRid] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: id } = await supabase.rpc('current_restaurant_id')
      setRid((id as string) ?? null)
      const { data } = await supabase.from('restaurant_config').select('mascota_url').maybeSingle()   // si la columna aún no existe, no se muestra nada
      setUrl((data?.mascota_url as string | null) ?? null)
    })()
  }, [])

  const guardar = async (nueva: string | null) => {
    const { data, error } = await supabase.from('restaurant_config').update({ mascota_url: nueva }).eq('restaurant_id', rid).select('restaurant_id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('No se pudo guardar la mascota (¿no tienes permiso?)')
    setUrl(nueva)
  }

  const subir = async (file: File) => {
    if (!rid) return
    const v = validarImagen(file, 3 * 1024 * 1024)
    if ('error' in v) { message.error(v.error); return }
    setSubiendo(true)
    try {
      const path = `${rid}/mascota.${v.ext}`
      const { error: upErr } = await supabase.storage.from('restaurant-assets').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('restaurant-assets').getPublicUrl(path)
      await guardar(`${pub.publicUrl}?t=${Date.now()}`)
      message.success('Mascota actualizada')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'No se pudo subir la mascota')
    } finally { setSubiendo(false) }
  }

  return (
    <div style={card}>
      <span style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Mascota del menú (opcional)</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ width: 72, height: 72, borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--w-line)', background: 'var(--w-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {url ? <img src={url} alt="mascota" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '0.7rem', color: 'var(--w-ink-mut)' }}>Sin mascota</span>}
        </div>
        <label className="w-press" style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--w-ink)' }}>
          {subiendo ? 'Subiendo…' : 'Subir mascota'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = '' }} />
        </label>
        {url && <button type="button" onClick={() => void guardar(null).catch(() => message.error('No se pudo quitar'))}
          style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--w-wine)' }}>Quitar</button>}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.6rem 0 0' }}>
        Aparece como imagen fija en el encabezado del menú de tus clientes. Mejor un PNG con fondo transparente. Si no subes ninguna, no se muestra ningún personaje.
      </p>
    </div>
  )
}
