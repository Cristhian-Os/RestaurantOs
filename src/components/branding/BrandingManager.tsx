/**
 * BrandingManager.tsx — Fase 4: personalización por restaurante
 * El admin edita nombre, eslogan, colores y logo. Se aplica al instante.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'

// Aplica el color primario del restaurante como acento de toda la app
export function applyBranding(color?: string | null) {
  if (color) document.documentElement.style.setProperty('--w-terra', color)
}

interface Config {
  display_name:   string
  slogan:         string | null
  color_primario: string | null
  color_acento:   string | null
  logo_url:       string | null
}

const DEFAULT_COLOR = '#1D7A46'

export default function BrandingManager() {
  const [rid,     setRid]     = useState<string | null>(null)
  const [cfg,     setCfg]     = useState<Config>({ display_name: '', slogan: '', color_primario: DEFAULT_COLOR, color_acento: '#C97A40', logo_url: null })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
      const restaurantId = prof?.restaurant_id ?? null
      setRid(restaurantId)
      const { data } = await supabase.from('restaurant_config')
        .select('display_name, slogan, color_primario, color_acento, logo_url').maybeSingle()
      if (data) setCfg({
        display_name:   data.display_name ?? '',
        slogan:         data.slogan ?? '',
        color_primario: data.color_primario ?? DEFAULT_COLOR,
        color_acento:   data.color_acento ?? '#C97A40',
        logo_url:       data.logo_url ?? null,
      })
      setLoading(false)
    })()
  }, [])

  const save = useCallback(async () => {
    if (!rid) return
    setSaving(true)
    try {
      const nombre = cfg.display_name.trim() || 'Mi Restaurante'
      // upsert: funciona aunque el restaurante aún no tenga fila de config
      const { error } = await supabase.from('restaurant_config').upsert({
        restaurant_id:  rid,
        display_name:   nombre,
        slogan:         cfg.slogan?.trim() || null,
        color_primario: cfg.color_primario,
        color_acento:   cfg.color_acento,
      }, { onConflict: 'restaurant_id' })
      if (error) throw error
      applyBranding(cfg.color_primario)
      // Avisar a la app (encabezado, etc.) para que se actualice al instante
      window.dispatchEvent(new CustomEvent('branding-updated', { detail: { name: nombre, color: cfg.color_primario } }))
      message.success('Personalización guardada')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }, [rid, cfg])

  const uploadLogo = useCallback(async (file: File) => {
    if (!rid) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${rid}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from('branding').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('branding').getPublicUrl(path)
      const url = `${pub.publicUrl}?t=${Date.now()}`
      const { error } = await supabase.from('restaurant_config').update({ logo_url: url }).eq('restaurant_id', rid)
      if (error) throw error
      setCfg(c => ({ ...c, logo_url: url }))
      window.dispatchEvent(new CustomEvent('branding-updated', { detail: { logo: url } }))
      message.success('Logo actualizado')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Error al subir el logo')
    } finally { setUploading(false) }
  }, [rid])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--w-ink-mut)' }}>Cargando…</div>

  const label: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--w-ink-soft)', marginBottom: '0.4rem' }
  const inputBox: React.CSSProperties = { width: '100%', padding: '0.7rem 0.9rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }
  const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.5rem' }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Personalización</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>Dale a tu restaurante tu propia marca. Los cambios se aplican al guardar.</p>
      </div>

      {/* Logo */}
      <div style={card}>
        <span style={label}>Logo</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 72, height: 72, borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--w-line)', background: 'var(--w-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {cfg.logo_url
              ? <img src={cfg.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: '1.5rem' }}>🍽️</span>}
          </div>
          <label className="w-press" style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--w-ink)' }}>
            {uploading ? 'Subiendo…' : 'Subir logo'}
            <input type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
          </label>
        </div>
      </div>

      {/* Nombre + eslogan */}
      <div style={card}>
        <label style={label}>Nombre del restaurante</label>
        <input value={cfg.display_name} onChange={e => setCfg(c => ({ ...c, display_name: e.target.value }))} style={inputBox} placeholder="Ej: Cholaos" />
        <label style={{ ...label, marginTop: '1rem' }}>Eslogan (opcional)</label>
        <input value={cfg.slogan ?? ''} onChange={e => setCfg(c => ({ ...c, slogan: e.target.value }))} style={inputBox} placeholder="Ej: El mejor cholao de la ciudad" />
      </div>

      {/* Colores */}
      <div style={card}>
        <span style={label}>Colores de tu marca</span>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {([['color_primario', 'Principal'], ['color_acento', 'Acento']] as const).map(([k, txt]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <input type="color" value={cfg[k] ?? DEFAULT_COLOR}
                onChange={e => setCfg(c => ({ ...c, [k]: e.target.value }))}
                style={{ width: 44, height: 44, border: 'none', borderRadius: '0.6rem', cursor: 'pointer', background: 'none' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--w-ink)' }}>{txt}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>{cfg[k]}</p>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.9rem 0 0' }}>
          El color principal se usa como acento en botones y detalles de la app.
        </p>
      </div>

      <button onClick={save} disabled={saving} className="lg-accent w-press"
        style={{ padding: '0.95rem', border: 'none', borderRadius: '0.9rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, background: 'var(--w-terra)', color: '#fff' }}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}
