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
  promo_texto:    string | null
  promo_activo:   boolean
  whatsapp_numero:      string | null
  direccion:            string | null
  instagram_url:        string | null
  facebook_url:         string | null
  propina_sugerida_pct: number | null
  portada_url:          string | null
  horario_activo:       boolean
  horario_apertura:     string | null
  horario_cierre:       string | null
  cerrado_manual:       boolean
  cerrado_mensaje:      string | null
}

const DEFAULT_COLOR = '#1D7A46'
const CFG_EMPTY: Config = {
  display_name: '', slogan: '', color_primario: DEFAULT_COLOR, color_acento: '#C97A40', logo_url: null,
  promo_texto: '', promo_activo: false, whatsapp_numero: '', direccion: '', instagram_url: '', facebook_url: '',
  propina_sugerida_pct: null, portada_url: null, horario_activo: false, horario_apertura: '11:00', horario_cierre: '21:00',
  cerrado_manual: false, cerrado_mensaje: '',
}

export default function BrandingManager() {
  const [rid,     setRid]     = useState<string | null>(null)
  const [cfg,     setCfg]     = useState<Config>(CFG_EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingPortada, setUploadingPortada] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
      const restaurantId = prof?.restaurant_id ?? null
      setRid(restaurantId)
      const { data } = await supabase.from('restaurant_config')
        .select('display_name, slogan, color_primario, color_acento, logo_url, promo_texto, promo_activo, whatsapp_numero, direccion, instagram_url, facebook_url, propina_sugerida_pct, portada_url, horario_activo, horario_apertura, horario_cierre, cerrado_manual, cerrado_mensaje')
        .maybeSingle()
      if (data) setCfg({
        display_name:   data.display_name ?? '',
        slogan:         data.slogan ?? '',
        color_primario: data.color_primario ?? DEFAULT_COLOR,
        color_acento:   data.color_acento ?? '#C97A40',
        logo_url:       data.logo_url ?? null,
        promo_texto:    data.promo_texto ?? '',
        promo_activo:   data.promo_activo ?? false,
        whatsapp_numero:      data.whatsapp_numero ?? '',
        direccion:            data.direccion ?? '',
        instagram_url:        data.instagram_url ?? '',
        facebook_url:         data.facebook_url ?? '',
        propina_sugerida_pct: data.propina_sugerida_pct ?? null,
        portada_url:          data.portada_url ?? null,
        horario_activo:       data.horario_activo ?? false,
        horario_apertura:     data.horario_apertura ?? '11:00',
        horario_cierre:       data.horario_cierre ?? '21:00',
        cerrado_manual:       data.cerrado_manual ?? false,
        cerrado_mensaje:      data.cerrado_mensaje ?? '',
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
        promo_texto:    cfg.promo_texto?.trim() || null,
        promo_activo:   cfg.promo_activo,
        whatsapp_numero:      cfg.whatsapp_numero?.replace(/\D/g, '') || null,
        direccion:            cfg.direccion?.trim() || null,
        instagram_url:        cfg.instagram_url?.trim() || null,
        facebook_url:         cfg.facebook_url?.trim() || null,
        propina_sugerida_pct: cfg.propina_sugerida_pct || null,
        horario_activo:       cfg.horario_activo,
        horario_apertura:     cfg.horario_apertura || null,
        horario_cierre:       cfg.horario_cierre || null,
        cerrado_manual:       cfg.cerrado_manual,
        cerrado_mensaje:      cfg.cerrado_mensaje?.trim() || null,
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

  const uploadPortada = useCallback(async (file: File) => {
    if (!rid) return
    setUploadingPortada(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${rid}/portada.${ext}`
      const { error: upErr } = await supabase.storage.from('restaurant-assets').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('restaurant-assets').getPublicUrl(path)
      const url = `${pub.publicUrl}?t=${Date.now()}`
      const { error } = await supabase.from('restaurant_config').update({ portada_url: url }).eq('restaurant_id', rid)
      if (error) throw error
      setCfg(c => ({ ...c, portada_url: url }))
      message.success('Portada actualizada')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Error al subir la portada')
    } finally { setUploadingPortada(false) }
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

      {/* Portada */}
      <div style={card}>
        <span style={label}>Portada del menú</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 120, height: 60, borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--w-line)', background: 'var(--w-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {cfg.portada_url
              ? <img src={cfg.portada_url} alt="portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '0.7rem', color: 'var(--w-ink-mut)' }}>Sin imagen</span>}
          </div>
          <label className="w-press" style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--w-ink)' }}>
            {uploadingPortada ? 'Subiendo…' : 'Subir portada'}
            <input type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPortada(f) }} />
          </label>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.6rem 0 0' }}>
          Foto grande que aparece arriba del menú de tus clientes (opcional).
        </p>
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

      {/* Banner de promoción */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <span style={label as React.CSSProperties}>Banner de promoción</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.promo_activo}
              onChange={e => setCfg(c => ({ ...c, promo_activo: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: cfg.promo_activo ? 'var(--w-olive)' : 'var(--w-ink-mut)' }}>
              {cfg.promo_activo ? 'Activo' : 'Apagado'}
            </span>
          </label>
        </div>
        <input value={cfg.promo_texto ?? ''} onChange={e => setCfg(c => ({ ...c, promo_texto: e.target.value }))}
          style={inputBox} placeholder="Ej: 2x1 en cholados todos los martes" maxLength={120} />
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.6rem 0 0' }}>
          Aparece como una franja arriba del menú de tus clientes. Actívalo o apágalo cuando quieras, sin borrar el texto.
        </p>
      </div>

      {/* Contacto y ubicación */}
      <div style={card}>
        <span style={label}>Contacto y ubicación</span>
        <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem' }}>WhatsApp (con indicativo, ej: 573001234567)</label>
        <input value={cfg.whatsapp_numero ?? ''} onChange={e => setCfg(c => ({ ...c, whatsapp_numero: e.target.value }))} style={inputBox} placeholder="573001234567" />
        <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem', marginTop: '0.9rem' }}>Dirección</label>
        <input value={cfg.direccion ?? ''} onChange={e => setCfg(c => ({ ...c, direccion: e.target.value }))} style={inputBox} placeholder="Ej: Cra 14 # 20-30, Armenia" />
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem' }}>Instagram (link)</label>
            <input value={cfg.instagram_url ?? ''} onChange={e => setCfg(c => ({ ...c, instagram_url: e.target.value }))} style={inputBox} placeholder="https://instagram.com/tu_restaurante" />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem' }}>Facebook (link)</label>
            <input value={cfg.facebook_url ?? ''} onChange={e => setCfg(c => ({ ...c, facebook_url: e.target.value }))} style={inputBox} placeholder="https://facebook.com/tu_restaurante" />
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.9rem 0 0' }}>
          Aparecen como botones/links en el menú de tus clientes. Deja vacío lo que no uses.
        </p>
      </div>

      {/* Horario de atención */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <span style={label as React.CSSProperties}>Horario de atención</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.horario_activo}
              onChange={e => setCfg(c => ({ ...c, horario_activo: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: cfg.horario_activo ? 'var(--w-olive)' : 'var(--w-ink-mut)' }}>
              {cfg.horario_activo ? 'Activo' : 'Apagado'}
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem' }}>Abre</label>
            <input type="time" value={cfg.horario_apertura ?? ''} onChange={e => setCfg(c => ({ ...c, horario_apertura: e.target.value }))} style={inputBox} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...label, fontWeight: 500, fontSize: '0.75rem' }}>Cierra</label>
            <input type="time" value={cfg.horario_cierre ?? ''} onChange={e => setCfg(c => ({ ...c, horario_cierre: e.target.value }))} style={inputBox} />
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.9rem 0 0' }}>
          Si lo activas, tus clientes no podrán hacer pedidos fuera de este horario (se los bloquea automáticamente).
        </p>
      </div>

      {/* Cerrado temporalmente */}
      <div style={{ ...card, ...(cfg.cerrado_manual ? { border: '1px solid #DC2626' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <span style={label as React.CSSProperties}>Cerrado temporalmente</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.cerrado_manual}
              onChange={e => setCfg(c => ({ ...c, cerrado_manual: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: cfg.cerrado_manual ? '#DC2626' : 'var(--w-ink-mut)' }}>
              {cfg.cerrado_manual ? 'Cerrado ahora' : 'Abierto'}
            </span>
          </label>
        </div>
        <input value={cfg.cerrado_mensaje ?? ''} onChange={e => setCfg(c => ({ ...c, cerrado_mensaje: e.target.value }))}
          style={inputBox} placeholder="Ej: Cerrado hoy por mantenimiento, volvemos mañana" maxLength={140} />
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.6rem 0 0' }}>
          Úsalo para bloquear pedidos al instante (emergencia, día libre, etc), sin importar el horario de arriba.
        </p>
      </div>

      {/* Propina sugerida */}
      <div style={card}>
        <label style={label}>Propina sugerida (%)</label>
        <input type="number" min={0} max={30} value={cfg.propina_sugerida_pct ?? ''}
          onChange={e => setCfg(c => ({ ...c, propina_sugerida_pct: e.target.value ? parseInt(e.target.value) : null }))}
          style={{ ...inputBox, maxWidth: 120 }} placeholder="Ej: 10" />
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.6rem 0 0' }}>
          Se muestra como sugerencia al cliente al pedir. Es informativa: no se suma automáticamente al total.
        </p>
      </div>

      <button onClick={save} disabled={saving} className="lg-accent w-press"
        style={{ padding: '0.95rem', border: 'none', borderRadius: '0.9rem', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, background: 'var(--w-terra)', color: '#fff' }}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}
