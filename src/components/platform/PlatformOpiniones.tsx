/**
 * PlatformOpiniones.tsx — pestaña "Opiniones" del panel de plataforma (Anexo F, 3.6).
 * Lista con filtros, cambio de estado, duplicados, nota interna y "Resumen de la semana con IA".
 * Todo pasa por funciones que exigen ser dueño y tener el código de 2 pasos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../services/supabaseClient'

interface Op {
  id: string; numero: number; restaurant_id: string; restaurante: string; user_role: string | null; tipo: string; modulo: string; urgencia: string
  titulo: string; detalle: string; pasos: string | null; pantalla: string | null; dispositivo: string | null; estado: string
  duplicado_de: string | null; nota_interna: string | null; created_at: string
}

const ESTADOS = ['nuevo', 'revisado', 'planeado', 'en_progreso', 'hecho', 'descartado'] as const
const TIPOS = ['fallo', 'mejora', 'personalizacion', 'pregunta', 'otro'] as const
const URGENCIAS = ['alta', 'media', 'baja'] as const
const ETIQUETA: Record<string, string> = { en_progreso: 'en progreso', personalizacion: 'personalización' }
const et = (s: string) => ETIQUETA[s] ?? s

const sel: React.CSSProperties = { padding: '0.5rem 0.6rem', minHeight: '2.5rem', borderRadius: '0.6rem', border: '1px solid var(--w-line, #bbb)', background: 'var(--bg, #fff)', color: 'var(--text-primary, #2D3561)', fontFamily: 'inherit' }
const fecha = (s: string) => new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })

export function PlatformOpiniones() {
  const [items, setItems] = useState<Op[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fTipo, setFTipo] = useState(''); const [fUrg, setFUrg] = useState(''); const [fEstado, setFEstado] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const [resumiendo, setResumiendo] = useState(false)

  const cargar = useCallback(() => {
    supabase.rpc('plataforma_feedback_listar', { p_tipo: fTipo || null, p_urgencia: fUrg || null, p_estado: fEstado || null, p_restaurante: null, p_limite: 200 })
      .then(({ data, error: e }) => { if (e) setError(e.message); else { setError(null); setItems((data ?? []) as Op[]) } })
  }, [fTipo, fUrg, fEstado])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: { p_estado?: string; p_duplicado_de?: string | null; p_quitar_duplicado?: boolean; p_nota_interna?: string }) => {
    const { error: e } = await supabase.rpc('plataforma_feedback_actualizar', { p_id: id, ...cambios })
    if (e) setError(e.message); else cargar()
  }

  const pedirResumen = async () => {
    setResumiendo(true); setResumen(null)
    const { data, error: e } = await supabase.functions.invoke('feedback-resumen', { body: {} })
    setResumiendo(false)
    if (e || !data?.resumen) setResumen('No se pudo generar el resumen ahora. Inténtalo de nuevo en un momento.')
    else setResumen(String(data.resumen))
  }

  const porNumero = useMemo(() => new Map((items ?? []).map(o => [o.id, o])), [items])

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Tipo" value={fTipo} onChange={e => setFTipo(e.target.value)} style={sel}><option value="">Todos los tipos</option>{TIPOS.map(t => <option key={t} value={t}>{et(t)}</option>)}</select>
        <select aria-label="Urgencia" value={fUrg} onChange={e => setFUrg(e.target.value)} style={sel}><option value="">Toda urgencia</option>{URGENCIAS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="Estado" value={fEstado} onChange={e => setFEstado(e.target.value)} style={sel}><option value="">Todos los estados</option>{ESTADOS.map(t => <option key={t} value={t}>{et(t)}</option>)}</select>
        <button onClick={pedirResumen} disabled={resumiendo}
          style={{ marginLeft: 'auto', padding: '0.6rem 1rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: 'none', cursor: resumiendo ? 'wait' : 'pointer', fontWeight: 700, background: 'var(--w-terra, #C2570C)', color: '#fff', fontFamily: 'inherit' }}>
          {resumiendo ? 'Resumiendo…' : 'Resumen de la semana con IA'}
        </button>
      </div>

      {resumen && (
        <div style={{ borderRadius: '1rem', padding: '1rem 1.25rem', background: 'var(--bg, #D8DAE4)', boxShadow: 'var(--shadow-out)', whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: 'var(--text-primary, #2D3561)' }}>
          <strong>Resumen de la última semana</strong>
          <p style={{ margin: '0.5rem 0 0' }}>{resumen}</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.7 }}>Lo genera una IA a partir de los textos; la decisión de qué hacer sigue siendo tuya.</p>
        </div>
      )}

      {error && <div style={{ color: '#b91c1c', fontSize: '0.875rem' }}>{error}</div>}
      {!error && items === null && <div>Cargando…</div>}
      {!error && items?.length === 0 && <div style={{ color: 'var(--text-secondary, #6b7280)' }}>No hay opiniones con esos filtros.</div>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {(items ?? []).map(o => (
          <li key={o.id} style={{ borderRadius: '1rem', padding: '0.8rem 1rem', background: 'var(--bg-surface, #CDD0DC)', borderLeft: o.urgencia === 'alta' ? '4px solid #DC2626' : '4px solid transparent' }}>
            <button onClick={() => setAbierta(abierta === o.id ? null : o.id)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <strong>#{o.numero} · {o.titulo}</strong>
              <div style={{ fontSize: '0.8125rem' }}>
                {o.restaurante} · {et(o.tipo)} · {o.modulo} · urgencia {o.urgencia} · {et(o.estado)} · {fecha(o.created_at)}
                {o.duplicado_de && porNumero.get(o.duplicado_de) ? ` · duplicado de #${porNumero.get(o.duplicado_de)!.numero}` : ''}
              </div>
            </button>
            {abierta === o.id && (
              <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.detalle}</p>
                {o.pasos && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong>Pasos:</strong> {o.pasos}</p>}
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.75 }}>Rol: {o.user_role ?? '—'} · Pantalla: {o.pantalla ?? '—'} · Dispositivo: {o.dispositivo ?? '—'}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select aria-label="Cambiar estado" value={o.estado} onChange={e => void actualizar(o.id, { p_estado: e.target.value })} style={sel}>
                    {ESTADOS.map(s => <option key={s} value={s}>{et(s)}</option>)}
                  </select>
                  <select aria-label="Marcar como duplicado de" value={o.duplicado_de ?? ''} style={sel}
                    onChange={e => void actualizar(o.id, e.target.value ? { p_duplicado_de: e.target.value } : { p_quitar_duplicado: true })}>
                    <option value="">No es duplicado</option>
                    {(items ?? []).filter(x => x.id !== o.id).map(x => <option key={x.id} value={x.id}>Duplicado de #{x.numero} · {x.titulo.slice(0, 40)}</option>)}
                  </select>
                </div>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>Nota interna (solo la ves tú)
                  <textarea defaultValue={o.nota_interna ?? ''} rows={2} style={{ ...sel, width: '100%', boxSizing: 'border-box' }}
                    onBlur={e => { if (e.target.value !== (o.nota_interna ?? '')) void actualizar(o.id, { p_nota_interna: e.target.value }) }} />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
