/**
 * FichaRestaurante.tsx — ficha editable de un restaurante para el dueño de la plataforma (Anexo C, sección 6).
 * Estado comercial, notas, próxima acción, origen, historial de contactos (en dos toques), pagos, prueba extendida y
 * activar/desactivar. Todo pasa por funciones que exigen dueño + 2 pasos y dejan registro de cambios.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'

export const SEMAFORO: Record<string, { color: string; texto: string }> = {
  verde: { color: '#2e9e5b', texto: 'Activo' },
  amarillo: { color: '#d9a400', texto: 'Bajando' },
  rojo: { color: '#c93b2b', texto: 'Sin uso' },
  gris: { color: '#8a8a8a', texto: 'Desactivado' },
}
const ESTADOS = ['prospecto', 'demo', 'prueba', 'piloto', 'activo', 'en_riesgo', 'cancelado'] as const
const ORIGENES: Record<string, string> = { vendedor: 'Un vendedor', redes: 'Redes sociales', restaurante: 'Otro restaurante', aliado: 'Contador o proveedor', google: 'Google', evento: 'Visita o evento', otro: 'Otro' }
const CANALES = ['whatsapp', 'llamada', 'visita', 'correo', 'otro'] as const

interface Ficha {
  restaurante: { id: string; nombre: string; slug: string; pais: string | null; activo: boolean; plan: string | null; creado: string; prueba_hasta: string | null }
  suscripcion: { status: string | null; plan: string | null; current_period_end: string | null } | null
  crm: { estado_comercial: string; notas: string | null; proxima_accion: string | null; proxima_accion_fecha: string | null; precio_especial_cop: number | null
         origen: string | null; origen_detalle: string | null; codigo_usado: string | null; codigo_estado: string | null; vendedor: string | null; vendedor_codigo: string | null }
  salud: { pedidos_7d: number; pedidos_30d: number; ultimo_pedido: string | null; usuarios_activos: number; semaforo: string } | null
  contactos: { id: string; fecha: string; canal: string; resumen: string }[]
  pagos: { created_at: string; amount_in_cents: number; status: string | null }[]
  cambios: { created_at: string; accion: string; motivo: string | null }[]
}

const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '0.9375rem', minHeight: '2.75rem', fontFamily: 'inherit' }
const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', borderRadius: '0.75rem', padding: '0.6rem 1rem', minHeight: '2.75rem' }
const etiqueta: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #6b7280)', display: 'block', marginBottom: '0.25rem' }

export function FichaRestaurante({ id, onClose, onCambio }: { id: string; onClose: () => void; onCambio: () => void }) {
  const [f, setF] = useState<Ficha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ estado: 'prueba', notas: '', accion: '', accionFecha: '', precio: '' })
  const [canal, setCanal] = useState<typeof CANALES[number]>('whatsapp')
  const [resumen, setResumen] = useState('')
  const [pruebaHasta, setPruebaHasta] = useState('')
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('plataforma_restaurante_ficha', { p_id: id })
    if (e) { setError(e.message); return }
    const ficha = data as Ficha
    setF(ficha)
    setForm({
      estado: ficha.crm.estado_comercial, notas: ficha.crm.notas ?? '', accion: ficha.crm.proxima_accion ?? '',
      accionFecha: ficha.crm.proxima_accion_fecha ?? '', precio: ficha.crm.precio_especial_cop != null ? String(ficha.crm.precio_especial_cop) : '',
    })
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setBusy(true); setMsg(null)
    const { error: e } = await supabase.rpc('plataforma_actualizar_ficha', {
      p_id: id, p_motivo: null,
      p_cambios: { estado_comercial: form.estado, notas: form.notas, proxima_accion: form.accion, proxima_accion_fecha: form.accionFecha, precio_especial_cop: form.precio.replace(/\D/g, '') },
    })
    setBusy(false)
    if (e) { setMsg(e.message); return }
    setMsg('Guardado'); cargar(); onCambio()
  }
  const agregarContacto = async () => {
    if (!resumen.trim()) { setMsg('Escribe un resumen del contacto'); return }
    setBusy(true); setMsg(null)
    const { error: e } = await supabase.rpc('plataforma_agregar_contacto', { p_id: id, p_canal: canal, p_resumen: resumen.trim() })
    setBusy(false)
    if (e) { setMsg(e.message); return }
    setResumen(''); cargar(); onCambio()
  }
  const extenderPrueba = async () => {
    if (!pruebaHasta || !motivo.trim()) { setMsg('Elige la fecha y escribe el motivo'); return }
    setBusy(true); setMsg(null)
    const { error: e } = await supabase.rpc('plataforma_actualizar_ficha', { p_id: id, p_cambios: { prueba_hasta: pruebaHasta }, p_motivo: motivo.trim() })
    setBusy(false)
    if (e) { setMsg(e.message); return }
    setMsg('Prueba extendida'); setPruebaHasta(''); setMotivo(''); cargar(); onCambio()
  }
  const cambiarActivo = async () => {
    if (!f) return
    const activar = !f.restaurante.activo
    if (!motivo.trim()) { setMsg(`Escribe el motivo para ${activar ? 'activar' : 'desactivar'} el restaurante`); return }
    if (!window.confirm(`¿${activar ? 'Activar' : 'Desactivar'} "${f.restaurante.nombre}"?${activar ? '' : ' Su equipo dejará de poder usar la app.'}`)) return
    setBusy(true); setMsg(null)
    const { error: e } = await supabase.rpc('plataforma_activar_restaurante', { p_id: id, p_activo: activar, p_motivo: motivo.trim() })
    setBusy(false)
    if (e) { setMsg(e.message); return }
    setMotivo(''); setMsg(activar ? 'Restaurante activado' : 'Restaurante desactivado'); cargar(); onCambio()
  }

  const sem = f?.salud ? SEMAFORO[f.salud.semaforo] : null
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg, #D8DAE4)', color: 'var(--text-primary, #2D3561)', borderRadius: '1rem', width: '100%', maxWidth: '44rem', padding: '1.25rem', margin: '1rem 0' }}>
        {error && <p style={{ color: 'var(--tag-red-text, #b91c1c)' }}>No se pudo cargar: {error}</p>}
        {!f && !error && <p>Cargando…</p>}
        {f && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.375rem' }}>{f.restaurante.nombre}</h2>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}>
                  /{f.restaurante.slug} · cliente desde {fecha(f.restaurante.creado)} · plan {f.restaurante.plan ?? '—'}{f.suscripcion?.status ? ` (${f.suscripcion.status})` : ''}
                  {!f.restaurante.activo && ' · DESACTIVADO'}
                </div>
              </div>
              <button style={{ ...boton, background: 'var(--bg-surface, #CDD0DC)', color: 'inherit' }} onClick={onClose}>Cerrar</button>
            </div>

            {f.salud && sem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', margin: '0.875rem 0', flexWrap: 'wrap' }}>
                <span style={{ width: '0.875rem', height: '0.875rem', borderRadius: '50%', background: sem.color, display: 'inline-block' }} aria-hidden />
                <strong>{sem.texto}</strong>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}>
                  {f.salud.pedidos_7d} pedidos en 7 días · {f.salud.pedidos_30d} en 30 · último {fecha(f.salud.ultimo_pedido)} · {f.salud.usuarios_activos} usuarios
                </span>
              </div>
            )}

            <div style={{ fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
              <strong>Origen:</strong> {f.crm.origen ? ORIGENES[f.crm.origen] ?? f.crm.origen : 'sin registrar'}{f.crm.origen_detalle ? ` (${f.crm.origen_detalle})` : ''}
              {f.crm.vendedor && <> · <strong>Vendedor:</strong> {f.crm.vendedor} ({f.crm.vendedor_codigo})</>}
              {f.crm.codigo_usado && !f.crm.vendedor && <> · Código <strong>{f.crm.codigo_usado}</strong>: {f.crm.codigo_estado === 'invalido' ? 'no existe' : f.crm.codigo_estado === 'inactivo' ? 'inactivo o vencido' : 'sin atribuir'}</>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.5rem' }}>
              <div><span style={etiqueta}>Estado comercial</span>
                <select style={campo} value={form.estado} onChange={e => setForm(x => ({ ...x, estado: e.target.value }))}>
                  {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select></div>
              <div><span style={etiqueta}>Próxima acción</span>
                <input style={campo} value={form.accion} maxLength={300} placeholder="Ej: llamar para cerrar" onChange={e => setForm(x => ({ ...x, accion: e.target.value }))} /></div>
              <div><span style={etiqueta}>Fecha de la acción</span>
                <input style={campo} type="date" value={form.accionFecha} onChange={e => setForm(x => ({ ...x, accionFecha: e.target.value }))} /></div>
              <div><span style={etiqueta}>Precio especial (COP/mes)</span>
                <input style={campo} inputMode="numeric" value={form.precio} placeholder="Sin precio especial" onChange={e => setForm(x => ({ ...x, precio: e.target.value }))} /></div>
            </div>
            <div style={{ marginTop: '0.5rem' }}><span style={etiqueta}>Notas (solo tú las ves)</span>
              <textarea style={{ ...campo, minHeight: '5rem' }} value={form.notas} maxLength={4000} onChange={e => setForm(x => ({ ...x, notas: e.target.value }))} /></div>
            <button disabled={busy} style={{ ...boton, marginTop: '0.625rem', background: 'var(--w-terra, #C2570C)', color: '#fff' }} onClick={guardar}>Guardar ficha</button>
            {msg && <span role="status" style={{ marginLeft: '0.75rem', fontSize: '0.8125rem' }}>{msg}</span>}

            <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '1rem' }}>Contactos</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select style={{ ...campo, width: 'auto' }} value={canal} onChange={e => setCanal(e.target.value as typeof CANALES[number])} aria-label="Canal">
                {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input style={{ ...campo, flex: 1, minWidth: '12rem', width: 'auto' }} value={resumen} maxLength={1000} placeholder="¿Qué hablaron?" onChange={e => setResumen(e.target.value)} />
              <button disabled={busy} style={{ ...boton, background: 'var(--bg-surface, #CDD0DC)', color: 'inherit' }} onClick={agregarContacto}>Agregar</button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', fontSize: '0.8125rem' }}>
              {f.contactos.length === 0 && <li style={{ color: 'var(--text-secondary, #6b7280)' }}>Todavía no hay contactos anotados.</li>}
              {f.contactos.map(c => <li key={c.id} style={{ padding: '0.25rem 0', borderTop: '1px solid var(--bg-surface, #CDD0DC)' }}><strong>{fecha(c.fecha)}</strong> · {c.canal} — {c.resumen}</li>)}
            </ul>

            <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '1rem' }}>Prueba y estado del restaurante</h3>
            <p style={{ fontSize: '0.8125rem', margin: '0 0 0.5rem' }}>Prueba hasta: <strong>{fecha(f.restaurante.prueba_hasta)}</strong></p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input style={{ ...campo, width: 'auto' }} type="date" value={pruebaHasta} onChange={e => setPruebaHasta(e.target.value)} aria-label="Extender la prueba hasta" />
              <input style={{ ...campo, flex: 1, minWidth: '12rem', width: 'auto' }} value={motivo} maxLength={500} placeholder="Motivo (obligatorio)" onChange={e => setMotivo(e.target.value)} aria-label="Motivo" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button disabled={busy} style={{ ...boton, background: 'var(--bg-surface, #CDD0DC)', color: 'inherit' }} onClick={extenderPrueba}>Extender prueba</button>
              <button disabled={busy} style={{ ...boton, background: f.restaurante.activo ? '#b3261e' : '#2e7d32', color: '#fff' }} onClick={cambiarActivo}>
                {f.restaurante.activo ? 'Desactivar restaurante' : 'Activar restaurante'}
              </button>
            </div>

            <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '1rem' }}>Pagos de suscripción</h3>
            {f.pagos.length === 0
              ? <p style={{ fontSize: '0.8125rem', margin: 0, color: 'var(--text-secondary, #6b7280)' }}>Sin pagos registrados por Wompi todavía.</p>
              : <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8125rem' }}>
                  {f.pagos.map((p, i) => <li key={i}>{fecha(p.created_at)} · {(p.amount_in_cents / 100).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} · {p.status ?? '—'}</li>)}
                </ul>}

            <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '1rem' }}>Últimos cambios</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)' }}>
              {f.cambios.length === 0 && <li>Sin cambios registrados.</li>}
              {f.cambios.map((c, i) => <li key={i}>{new Date(c.created_at).toLocaleString('es-CO')} · {c.accion.replace(/_/g, ' ')}{c.motivo ? ` — ${c.motivo}` : ''}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
