/**
 * OpcionesRestaurantes.tsx — pestaña "Opciones por restaurante" del panel de plataforma. Solo super admin con 2 pasos.
 * Por restaurante: interruptor de las opciones universales (options_v2), plantillas aplicadas (y aplicar otra)
 * y las respuestas que el administrador dio a las preguntas del asistente.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'

interface Fila { restaurant_id: string; nombre: string; slug: string; activo: boolean; options_v2: boolean; plantillas: string[]; respuestas: number }
interface Respuesta { template_key: string; pregunta_id: string; pregunta: string; respuesta: string; updated_at: string }
interface PlantillaActiva { key: string; nombre: string }

const bg = 'var(--bg, #D8DAE4)', bgSurf = 'var(--bg-surface, #CDD0DC)', txt = 'var(--text-primary, #2D3561)', txtSec = 'var(--text-secondary, #6b7280)'
const caja: React.CSSProperties = { borderRadius: '1rem', padding: '1rem 1.25rem', backgroundColor: bg, boxShadow: 'var(--shadow-out)' }
const boton = (primario = false): React.CSSProperties => ({ border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem', borderRadius: '0.75rem', padding: '0.5rem 0.9rem', minHeight: '2.5rem', background: primario ? 'var(--w-terra, #C2570C)' : bgSurf, color: primario ? '#fff' : txt })
const campo: React.CSSProperties = { padding: '0.45rem 0.6rem', borderRadius: '0.75rem', border: '1px solid var(--w-line, #ccc)', background: 'var(--w-bg, #fff)', color: 'var(--w-ink, #222)', fontSize: '0.875rem', minHeight: '2.5rem' }

export function OpcionesRestaurantes() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [activas, setActivas] = useState<PlantillaActiva[]>([])
  const [todas, setTodas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [elegida, setElegida] = useState<Record<string, string>>({})
  const [abierto, setAbierto] = useState<string | null>(null)
  const [respuestas, setRespuestas] = useState<Respuesta[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data, error: e }, { data: pl }] = await Promise.all([
      supabase.rpc('plataforma_opciones_restaurantes'),
      supabase.from('restaurant_templates').select('key, nombre, activo').order('nombre'),
    ])
    if (e) { setError(e.message); return }
    setError(null); setFilas((data as Fila[]) ?? [])
    const lista = (pl ?? []) as { key: string; nombre: string; activo: boolean }[]
    setActivas(lista.filter(p => p.activo).map(p => ({ key: p.key, nombre: p.nombre })))
    setTodas(Object.fromEntries(lista.map(p => [p.key, p.nombre])))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const interruptor = async (f: Fila) => {
    const pregunta = f.options_v2
      ? `¿Apagar las opciones nuevas de "${f.nombre}"? Vuelve a usar el modelo anterior (solo se puede si ningún plato usa opciones nuevas).`
      : `¿Encender las opciones nuevas de "${f.nombre}"? Se crean sus listas de sabores a partir de las actuales y el administrador ve "Listas y opciones". Los platos y pedidos de hoy no cambian.`
    if (!window.confirm(pregunta)) return
    setBusy(f.restaurant_id)
    const { error: e } = await supabase.rpc('plataforma_activar_opciones_v2', { p_restaurant_id: f.restaurant_id, p_activo: !f.options_v2 })
    setBusy(null)
    if (e) { setAviso(e.message); return }
    setAviso(`${f.nombre}: opciones nuevas ${f.options_v2 ? 'apagadas' : 'encendidas'}`); cargar()
  }

  const aplicar = async (f: Fila) => {
    const key = elegida[f.restaurant_id]
    if (!key) { setAviso('Elige una plantilla'); return }
    if (!window.confirm(`¿Aplicar "${todas[key] ?? key}" a "${f.nombre}"? Agrega categorías, listas y platos de ejemplo (sin precio y agotados). No pisa lo que ya editó.`)) return
    setBusy(f.restaurant_id)
    const { data, error: e } = await supabase.rpc('plataforma_aplicar_plantilla', { p_restaurant_id: f.restaurant_id, p_key: key })
    setBusy(null)
    if (e) { setAviso(e.message); return }
    const r = data as { listas_creadas?: string[]; platos_creados?: string[] }
    setAviso(`${f.nombre}: ${r.listas_creadas?.length ?? 0} listas y ${r.platos_creados?.length ?? 0} platos de ejemplo agregados`); cargar()
  }

  const verRespuestas = async (f: Fila) => {
    if (abierto === f.restaurant_id) { setAbierto(null); return }
    const { data, error: e } = await supabase.rpc('plataforma_respuestas_restaurante', { p_restaurant_id: f.restaurant_id })
    if (e) { setAviso(e.message); return }
    setRespuestas((data as Respuesta[]) ?? []); setAbierto(f.restaurant_id)
  }

  if (error) return <div role="alert" style={{ ...caja, color: 'var(--tag-red-text, #b91c1c)', boxShadow: 'var(--shadow-in)' }}>No se pudo cargar: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: txt }}>Opciones por restaurante</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: txtSec, maxWidth: '42rem' }}>
          Aquí enciendes las listas y opciones nuevas restaurante por restaurante (empiezan apagadas), agregas plantillas y lees lo que cada administrador respondió en el asistente.
        </p>
      </div>
      {aviso && <div style={{ ...caja, boxShadow: 'var(--shadow-in)', color: txt }}>{aviso}</div>}
      {!filas ? <div style={{ padding: '2rem', textAlign: 'center', color: txtSec }}>Cargando…</div> : filas.map(f => (
        <div key={f.restaurant_id} style={{ ...caja, opacity: f.activo ? 1 : 0.6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: txt }}>{f.nombre} <span style={{ fontWeight: 400, color: txtSec, fontSize: '0.8125rem' }}>/{f.slug}</span></div>
              <div style={{ fontSize: '0.8125rem', color: txtSec, marginTop: '0.125rem' }}>
                Opciones nuevas: <strong style={{ color: f.options_v2 ? 'var(--w-olive, #2f6b3d)' : txtSec }}>{f.options_v2 ? 'ENCENDIDAS' : 'apagadas'}</strong>
                {' · '}Plantillas: {f.plantillas.length > 0 ? f.plantillas.map(k => todas[k] ?? k).join(', ') : 'ninguna'}
              </div>
            </div>
            <button style={boton(!f.options_v2)} disabled={busy === f.restaurant_id} onClick={() => interruptor(f)}>
              {f.options_v2 ? 'Apagar opciones nuevas' : 'Encender opciones nuevas'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
            <select style={campo} aria-label={`Plantilla para ${f.nombre}`} value={elegida[f.restaurant_id] ?? ''} onChange={e => setElegida(s => ({ ...s, [f.restaurant_id]: e.target.value }))}>
              <option value="">Elegir plantilla activa…</option>
              {activas.map(p => <option key={p.key} value={p.key}>{p.nombre}</option>)}
            </select>
            <button style={boton()} disabled={busy === f.restaurant_id || activas.length === 0} onClick={() => aplicar(f)}>Aplicar plantilla</button>
            <button style={boton()} onClick={() => verRespuestas(f)}>{abierto === f.restaurant_id ? 'Ocultar respuestas' : `Ver respuestas (${f.respuestas})`}</button>
          </div>
          {abierto === f.restaurant_id && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${bgSurf}`, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {respuestas.length === 0 ? <div style={{ fontSize: '0.875rem', color: txtSec }}>Este administrador todavía no respondió.</div> : respuestas.map(r => (
                <div key={r.template_key + r.pregunta_id} style={{ fontSize: '0.875rem', color: txt }}>
                  <div style={{ color: txtSec, fontSize: '0.75rem' }}>{todas[r.template_key] ?? r.template_key}</div>
                  <div style={{ fontWeight: 600 }}>{r.pregunta}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.respuesta}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
