/**
 * BrandingManager.tsx — Fase 4: personalización por restaurante
 * El admin edita nombre, eslogan, colores y logo. Se aplica al instante.
 */
import { useState, useEffect, useCallback } from 'react'
import { aplicarDegradados, degradadosDe } from '../../lib/degradados'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Toggle } from '../ui/Toggle'
import { MascotaUploader } from './MascotaUploader'

// ── Color de marca del restaurante → acento de toda la app ──────────────
// Cada restaurante usa su color; se derivan hover, presionado, texto y fondo suave
// cuidando el contraste (texto de acento ≥ 4,5:1) en claro y oscuro.
type RGB = [number, number, number]
const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
const BLACK: RGB = [0, 0, 0]
const WHITE: RGB = [255, 255, 255]

/** Mueve `c` hacia `to` hasta lograr `min`:1 de contraste contra `bg`. */
function toContrast(c: RGB, bg: RGB, to: RGB, min: number): RGB {
  let out = c
  for (let t = 0; t <= 1 && contrast(out, bg) < min; t += 0.05) out = mix(c, to, t)
  return out
}

export function applyBranding(color?: string | null) {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return
  const c = hexToRgb(color)
  const on = contrast(WHITE, c) >= 3 ? '#FFFFFF' : '#101010'
  const lightText = toContrast(c, [250, 250, 248], BLACK, 4.5)
  const darkText = toContrast(c, [23, 23, 23], WHITE, 4.5)
  const css = `
:root,[data-theme="light"]{--w-accent:${color};--w-accent-hover:${rgbToHex(mix(c, BLACK, 0.12))};--w-accent-press:${rgbToHex(mix(c, BLACK, 0.24))};--w-accent-text:${rgbToHex(lightText)};--w-accent-soft:${rgbToHex(mix(c, WHITE, 0.88))};--w-on-accent:${on};--w-focus:${rgbToHex(lightText)};--w-shadow-terra:0 2px 8px ${color}40}
[data-theme="dark"]{--w-accent:${color};--w-accent-hover:${rgbToHex(mix(c, BLACK, 0.12))};--w-accent-press:${rgbToHex(mix(c, BLACK, 0.24))};--w-accent-text:${rgbToHex(darkText)};--w-accent-soft:${rgbToHex(mix(c, [16, 16, 16], 0.78))};--w-on-accent:${on};--w-focus:${rgbToHex(darkText)};--w-shadow-terra:0 2px 10px ${color}4D}`
  let el = document.getElementById('brand-accent') as HTMLStyleElement | null
  if (!el) { el = document.createElement('style'); el.id = 'brand-accent'; document.head.appendChild(el) }
  el.textContent = css
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

/** Lo que el asistente muestra en la vista previa mientras la persona edita (antes de guardar). */
export interface BorradorMarca { nombre: string; eslogan: string; color: string; logo: string | null; portada: string | null }

const ico = (d: React.ReactNode) => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const Seccion = ({ icono, titulo, children, peligro }: { icono: React.ReactNode; titulo: string; children: React.ReactNode; peligro?: boolean }) => (
  <section className="rounded-[var(--w-r-lg)] border bg-[var(--w-surface)] p-5" style={{ borderColor: peligro ? 'var(--w-danger)' : 'var(--w-border)', boxShadow: 'var(--w-shadow-sm)' }}>
    <h2 className="mb-4 flex items-center gap-2 font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">
      <span aria-hidden className="flex text-[color:var(--w-accent)] [&>svg]:h-5 [&>svg]:w-5">{icono}</span>{titulo}
    </h2>
    {children}
  </section>
)
const Interruptor = ({ titulo, activo, onChange, etiqueta }: { titulo: string; activo: boolean; onChange: (v: boolean) => void; etiqueta: string }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <span style={{ fontSize: 'var(--w-fs-label)', fontWeight: 600, color: activo ? 'var(--w-text)' : 'var(--w-text-3)' }}>{etiqueta}</span>
    <Toggle checked={activo} onChange={onChange} label={titulo} />
  </div>
)

export default function BrandingManager({ onBorrador }: { onBorrador?: (b: BorradorMarca) => void } = {}) {
  const [rid,     setRid]     = useState<string | null>(null)
  const [cfg,     setCfg]     = useState<Config>(CFG_EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingPortada, setUploadingPortada] = useState(false)
  const [degradados, setDegradados] = useState(false)

  // Interruptor de degradados: se guarda al instante en modules_enabled (sin tocar las demás claves) y se aplica en vivo.
  const cambiarDegradados = useCallback(async (v: boolean) => {
    if (!rid) return
    const { data: cur } = await supabase.from('restaurant_config').select('modules_enabled').eq('restaurant_id', rid).maybeSingle()
    const mods = { ...((cur?.modules_enabled as Record<string, unknown> | null) ?? {}), degradados: v }
    const { error } = await supabase.from('restaurant_config').update({ modules_enabled: mods }).eq('restaurant_id', rid)
    if (error) { message.error('No se pudo cambiar los degradados'); return }
    setDegradados(v); aplicarDegradados(v)
    message.success(v ? 'Degradados activados' : 'Degradados desactivados')
  }, [rid])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
      const restaurantId = prof?.restaurant_id ?? null
      setRid(restaurantId)
      const { data: mods } = await supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
      setDegradados(degradadosDe(mods?.modules_enabled))
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

  // Vista previa del asistente: avisa del borrador (nombre, eslogan, color, logo y portada) cada vez que cambia.
  useEffect(() => {
    if (loading) return
    onBorrador?.({ nombre: cfg.display_name, eslogan: cfg.slogan ?? '', color: cfg.color_primario, logo: cfg.logo_url, portada: cfg.portada_url })
  }, [loading, cfg.display_name, cfg.slogan, cfg.color_primario, cfg.logo_url, cfg.portada_url, onBorrador])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--w-text-3)' }}>Cargando…</div>

  const label: React.CSSProperties = { display: 'block', fontSize: 'var(--w-fs-label)', fontWeight: 600, color: 'var(--w-text-2)', marginBottom: '0.4rem' }
  const inputBox: React.CSSProperties = { width: '100%', padding: '0.7rem 0.9rem', minHeight: 44, borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border)', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', fontFamily: 'var(--w-font)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }
  const nota: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--w-text-3)', margin: '0.6rem 0 0' }
  const subir: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 1rem', borderRadius: 'var(--w-r-md)', border: '1px dashed var(--w-border-strong)', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--w-fs-label)', color: 'var(--w-text)', background: 'var(--w-surface)' }


  return (
    <div className="mx-auto w-full max-w-[1100px]" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={ico(<><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></>)}
        title="Marca y datos del restaurante"
        subtitle="Dale a tu restaurante su propia marca. Los cambios se aplican al guardar."
        actions={<Button size="sm" onClick={save} loading={saving} icon={ico(<path d="M5 12l5 5L20 7" />)}>Guardar cambios</Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Seccion icono={ico(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>)} titulo="Información general">
          <label style={label}>Nombre comercial *</label>
          <input value={cfg.display_name} onChange={e => setCfg(c => ({ ...c, display_name: e.target.value }))} style={inputBox} placeholder="Ej: Cholaos" />
          <label style={{ ...label, marginTop: '1rem' }}>Eslogan (opcional)</label>
          <input value={cfg.slogan ?? ''} onChange={e => setCfg(c => ({ ...c, slogan: e.target.value }))} style={inputBox} placeholder="Ej: El mejor cholao de la ciudad" />
        </Seccion>

        <Seccion icono={ico(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>)} titulo="Identidad visual">
          <span style={label}>Logo del restaurante</span>
          <div className="flex items-center gap-4">
            <div style={{ width: 72, height: 72, borderRadius: 'var(--w-r-md)', overflow: 'hidden', border: '1px solid var(--w-border)', background: 'var(--w-surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {cfg.logo_url
                ? <img src={cfg.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: '1.5rem' }}>🍽️</span>}
            </div>
            <label className="w-press" style={subir}>
              {uploading ? 'Subiendo…' : 'Subir logo'}
              <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
            </label>
          </div>
          <span style={{ ...label, marginTop: '1rem' }}>Portada del menú</span>
          <div className="flex items-center gap-4">
            <div style={{ width: 120, height: 60, borderRadius: 'var(--w-r-md)', overflow: 'hidden', border: '1px solid var(--w-border)', background: 'var(--w-surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {cfg.portada_url
                ? <img src={cfg.portada_url} alt="portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '0.7rem', color: 'var(--w-text-3)' }}>Sin imagen</span>}
            </div>
            <label className="w-press" style={subir}>
              {uploadingPortada ? 'Subiendo…' : 'Subir portada'}
              <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadPortada(f) }} />
            </label>
          </div>
          <p style={nota}>Foto grande que aparece arriba del menú de tus clientes (opcional).</p>
        </Seccion>

        <MascotaUploader />

        <Seccion icono={ico(<><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="14" r="2.5" /><path d="M12 22a10 10 0 110-20" /></>)} titulo="Colores de tu marca">
          <div className="flex flex-wrap gap-6">
            {([['color_primario', 'Principal'], ['color_acento', 'Acento']] as const).map(([k, txt]) => (
              <div key={k} className="flex items-center gap-3">
                <input type="color" value={cfg[k] ?? DEFAULT_COLOR}
                  onChange={e => setCfg(c => ({ ...c, [k]: e.target.value }))}
                  style={{ width: 44, height: 44, border: 'none', borderRadius: 'var(--w-r-md)', cursor: 'pointer', background: 'none' }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--w-text)' }}>{txt}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--w-text-3)' }}>{cfg[k]}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={nota}>El color principal se usa como acento en botones y detalles de la app.</p>
        </Seccion>

        <Seccion icono={ico(<><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>)} titulo="Ubicación y contacto">
          <label style={label}>WhatsApp (con indicativo, ej: 573001234567)</label>
          <input value={cfg.whatsapp_numero ?? ''} onChange={e => setCfg(c => ({ ...c, whatsapp_numero: e.target.value }))} style={inputBox} placeholder="573001234567" />
          <label style={{ ...label, marginTop: '0.9rem' }}>Dirección</label>
          <input value={cfg.direccion ?? ''} onChange={e => setCfg(c => ({ ...c, direccion: e.target.value }))} style={inputBox} placeholder="Ej: Cra 14 # 20-30, Armenia" />
          <div className="mt-4 flex flex-wrap gap-3">
            <div style={{ flex: '1 1 200px' }}>
              <label style={label}>Instagram (link)</label>
              <input value={cfg.instagram_url ?? ''} onChange={e => setCfg(c => ({ ...c, instagram_url: e.target.value }))} style={inputBox} placeholder="https://instagram.com/tu_restaurante" />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={label}>Facebook (link)</label>
              <input value={cfg.facebook_url ?? ''} onChange={e => setCfg(c => ({ ...c, facebook_url: e.target.value }))} style={inputBox} placeholder="https://facebook.com/tu_restaurante" />
            </div>
          </div>
          <p style={nota}>Aparecen como botones/links en el menú de tus clientes. Deja vacío lo que no uses.</p>
        </Seccion>

        <Seccion icono={ico(<path d="M3 11l18-8-8 18-2-8-8-2z" />)} titulo="Banner de promoción">
          <Interruptor titulo="Banner de promoción" activo={cfg.promo_activo} onChange={v => setCfg(c => ({ ...c, promo_activo: v }))} etiqueta={cfg.promo_activo ? 'Activo' : 'Apagado'} />
          <input value={cfg.promo_texto ?? ''} onChange={e => setCfg(c => ({ ...c, promo_texto: e.target.value }))}
            style={inputBox} placeholder="Ej: 2x1 en cholados todos los martes" maxLength={120} />
          <p style={nota}>Aparece como una franja arriba del menú de tus clientes. Actívalo o apágalo cuando quieras, sin borrar el texto.</p>
        </Seccion>

        <Seccion icono={ico(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)} titulo="Horario de atención">
          <Interruptor titulo="Horario de atención" activo={cfg.horario_activo} onChange={v => setCfg(c => ({ ...c, horario_activo: v }))} etiqueta={cfg.horario_activo ? 'Activo' : 'Apagado'} />
          <div className="flex gap-3">
            <div style={{ flex: 1 }}>
              <label style={label}>Abre</label>
              <input type="time" value={cfg.horario_apertura ?? ''} onChange={e => setCfg(c => ({ ...c, horario_apertura: e.target.value }))} style={inputBox} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Cierra</label>
              <input type="time" value={cfg.horario_cierre ?? ''} onChange={e => setCfg(c => ({ ...c, horario_cierre: e.target.value }))} style={inputBox} />
            </div>
          </div>
          <p style={nota}>Si lo activas, tus clientes no podrán hacer pedidos fuera de este horario (se los bloquea automáticamente).</p>
        </Seccion>

        <Seccion peligro={cfg.cerrado_manual} icono={ico(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>)} titulo="Cerrado temporalmente">
          <Interruptor titulo="Cerrado temporalmente" activo={cfg.cerrado_manual} onChange={v => setCfg(c => ({ ...c, cerrado_manual: v }))} etiqueta={cfg.cerrado_manual ? 'Cerrado ahora' : 'Abierto'} />
          <input value={cfg.cerrado_mensaje ?? ''} onChange={e => setCfg(c => ({ ...c, cerrado_mensaje: e.target.value }))}
            style={inputBox} placeholder="Ej: Cerrado hoy por mantenimiento, volvemos mañana" maxLength={140} />
          <p style={nota}>Úsalo para bloquear pedidos al instante (emergencia, día libre, etc), sin importar el horario.</p>
        </Seccion>

        <Seccion icono={ico(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18z" /></>)} titulo="Degradados">
          <Interruptor titulo="Degradados" activo={degradados} onChange={cambiarDegradados} etiqueta={degradados ? 'Activos' : 'Apagados'} />
          <p style={nota}>Con esto apagado la app se ve plana, sin degradados de color. Actívalo solo si a este restaurante le gustan. Se aplica al instante, sin pulsar Guardar.</p>
        </Seccion>

        <Seccion icono={ico(<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" />)} titulo="Propina sugerida (%)">
          <input type="number" min={0} max={30} value={cfg.propina_sugerida_pct ?? ''}
            onChange={e => setCfg(c => ({ ...c, propina_sugerida_pct: e.target.value ? parseInt(e.target.value) : null }))}
            style={{ ...inputBox, maxWidth: 140 }} placeholder="Ej: 10" />
          <p style={nota}>Se muestra como sugerencia al cliente al pedir. Es informativa: no se suma automáticamente al total.</p>
        </Seccion>
      </div>

      <Button size="lg" className="mt-5 w-full" onClick={save} loading={saving} icon={ico(<path d="M5 12l5 5L20 7" />)}>Guardar cambios</Button>
    </div>
  )
}
