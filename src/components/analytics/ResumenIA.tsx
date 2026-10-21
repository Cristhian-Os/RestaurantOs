/**
 * ResumenIA.tsx — "Resumen con IA" del Asistente de Negocio (Anexo I, 7). El reporte lo redacta la IA, pero TODAS las cifras las calculó
 * la base de datos y el servidor ya comprobó que el texto no trae cifras inventadas. Aquí solo se muestra, con su cifra y su fuente.
 */
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'

type Confianza = 'seguro' | 'probable' | 'suposicion'
interface Resultado {
  resumen: string
  hallazgos: { texto: string; cifra: string; fuente: string }[]
  acciones: { texto: string; confianza: Confianza }[]
  datos_faltantes: string[]
}
interface Reporte {
  id: string; tipo: 'semanal' | 'mensual' | 'pregunta'; periodo_desde: string; periodo_hasta: string
  estado: 'ok' | 'sin_redaccion' | 'error'; resultado: Resultado | null; datos: Record<string, any>; created_at: string
}

const COLS = 'id, tipo, periodo_desde, periodo_hasta, estado, resultado, datos, created_at'
const CONF: Record<Confianza, { t: string; c: string }> = { seguro: { t: 'Seguro', c: '#047857' }, probable: { t: 'Probable', c: '#B45309' }, suposicion: { t: 'Suposición', c: '#7C3AED' } }
const cop = (n: unknown) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('es-CO')}` : '—')
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const rango = (r: Reporte) => `${fecha(r.periodo_desde)} al ${fecha(r.periodo_hasta)}`

const caja: React.CSSProperties = { background: 'var(--bg-surface, #D8DAE4)', borderRadius: '1.5rem', padding: '1.25rem', boxShadow: 'var(--shadow-out)' }
const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', borderRadius: '0.75rem', padding: '0.6rem 1rem', minHeight: '2.75rem', fontFamily: 'inherit' }

async function mensajeDeError(e: unknown): Promise<string> {
  try { const r = (e as { context?: Response }).context; if (r) { const j = await r.json(); if (j?.error) return String(j.error) } } catch { /* sin detalle */ }
  return 'No se pudo generar el resumen ahora. Inténtalo de nuevo en un momento.'
}

export function ResumenIA() {
  const [activa, setActiva] = useState<boolean | null>(null)
  const [historial, setHistorial] = useState<Reporte[]>([])
  const [actual, setActual] = useState<Reporte | null>(null)
  const [generando, setGenerando] = useState<'semanal' | 'mensual' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [votos, setVotos] = useState<Record<number, boolean>>({})
  const [detalle, setDetalle] = useState(false)

  const cargar = useCallback(async () => {
    const [{ data: cfg }, { data: reps }] = await Promise.all([
      supabase.from('ai_restaurant_settings').select('ia_activa').maybeSingle(),
      supabase.from('ai_reports').select(COLS).neq('estado', 'error').order('created_at', { ascending: false }).limit(12),
    ])
    setActiva(Boolean(cfg?.ia_activa))
    const lista = (reps ?? []) as Reporte[]
    setHistorial(lista)
    setActual(a => a ?? lista[0] ?? null)
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    setVotos({}); setDetalle(false)
    if (!actual) return
    void supabase.from('ai_report_feedback').select('hallazgo_idx, util').eq('report_id', actual.id)
      .then(({ data }) => setVotos(Object.fromEntries((data ?? []).map(v => [v.hallazgo_idx as number, v.util as boolean]))))
  }, [actual])

  const generar = async (tipo: 'semanal' | 'mensual') => {
    setGenerando(tipo); setAviso(null)
    const { data, error } = await supabase.functions.invoke('ai-report', { body: { tipo } })
    setGenerando(null)
    if (error) { setAviso(await mensajeDeError(error)); return }
    if (data?.sin_datos) { setAviso(data.mensaje); return }
    if (data?.reporte) { setActual(data.reporte as Reporte); void cargar(); if (data.existente) message.info('Ya tenías este resumen: no se vuelve a generar ni se cobra de nuevo.') }
  }

  const votar = async (idx: number, util: boolean) => {
    if (!actual) return
    const { error } = await supabase.from('ai_report_feedback').upsert({ report_id: actual.id, hallazgo_idx: idx, util }, { onConflict: 'report_id,hallazgo_idx,user_id' })
    if (error) message.error('No se pudo guardar tu opinión'); else setVotos(v => ({ ...v, [idx]: util }))
  }

  if (activa === null) return null
  const r = actual?.resultado
  const d = actual?.datos
  return (
    <section className="mb-8" style={caja} aria-label="Resumen con inteligencia artificial">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 className="text-2xl font-bold text-neo-dark" style={{ margin: 0 }}>Resumen con IA</h2>
        {activa && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button style={{ ...boton, background: 'var(--w-terra, #C2570C)', color: '#fff' }} disabled={generando !== null} onClick={() => generar('semanal')}>
              {generando === 'semanal' ? 'Generando…' : 'Resumen de la semana pasada'}
            </button>
            <button style={{ ...boton, background: 'var(--bg, #E4E6EE)', color: 'inherit' }} disabled={generando !== null} onClick={() => generar('mensual')}>
              {generando === 'mensual' ? 'Generando…' : 'Resumen del mes pasado'}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-neo-mid" style={{ margin: '0 0 0.75rem' }}>Generado con inteligencia artificial a partir de tus cifras. Revísalo antes de decidir.</p>

      {!activa && <p className="text-sm text-neo-mid" style={{ margin: 0 }}>La IA todavía no está activa para tu restaurante. Cuando se active podrás generar aquí el resumen de la semana y del mes.</p>}
      {aviso && <p role="alert" className="text-sm" style={{ margin: '0 0 0.75rem', color: '#B0341D', fontWeight: 600 }}>{aviso}</p>}

      {actual && (
        <div>
          <p className="text-xs font-bold text-neo-mid" style={{ margin: '0 0 0.5rem' }}>
            {actual.tipo === 'mensual' ? 'Resumen mensual' : 'Resumen semanal'} · {rango(actual)}
          </p>

          {r ? (
            <>
              <p className="text-base text-neo-dark" style={{ margin: '0 0 1rem' }}>{r.resumen}</p>
              <h3 className="font-bold text-neo-dark" style={{ margin: '0 0 0.5rem' }}>Qué pasó</h3>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                {r.hallazgos.map((h, i) => (
                  <div key={i} style={{ background: 'var(--bg, #E4E6EE)', borderRadius: '1rem', padding: '0.75rem 1rem' }}>
                    <p className="text-sm text-neo-dark" style={{ margin: 0 }}>{h.texto}</p>
                    <p className="text-xs text-neo-mid" style={{ margin: '0.25rem 0 0.5rem' }}><strong>{h.cifra}</strong> · dato: {h.fuente}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button aria-pressed={votos[i] === true} onClick={() => votar(i, true)} style={{ ...boton, minHeight: '2.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8125rem', background: votos[i] === true ? '#047857' : 'transparent', color: votos[i] === true ? '#fff' : 'inherit', border: '1px solid #9CA3AF' }}>👍 Me sirvió</button>
                      <button aria-pressed={votos[i] === false} onClick={() => votar(i, false)} style={{ ...boton, minHeight: '2.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8125rem', background: votos[i] === false ? '#B0341D' : 'transparent', color: votos[i] === false ? '#fff' : 'inherit', border: '1px solid #9CA3AF' }}>👎 No me sirvió</button>
                    </div>
                  </div>
                ))}
              </div>
              {r.acciones.length > 0 && (
                <>
                  <h3 className="font-bold text-neo-dark" style={{ margin: '0 0 0.25rem' }}>Qué podrías hacer</h3>
                  <p className="text-xs text-neo-mid" style={{ margin: '0 0 0.5rem' }}>Son sugerencias, no cifras. La decisión es tuya.</p>
                  <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
                    {r.acciones.map((a, i) => (
                      <li key={i} className="text-sm text-neo-dark">{a.texto} <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: CONF[a.confianza].c, border: `1px solid ${CONF[a.confianza].c}`, borderRadius: 999, padding: '0.05rem 0.5rem', whiteSpace: 'nowrap' }}>{CONF[a.confianza].t}</span></li>
                    ))}
                  </ul>
                </>
              )}
              {r.datos_faltantes.length > 0 && (
                <div style={{ background: '#FEF3C7', color: '#78350F', borderRadius: '1rem', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <strong className="text-sm">Lo que no se pudo analizar por falta de datos</strong>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>{r.datos_faltantes.map((x, i) => <li key={i} className="text-sm">{x}</li>)}</ul>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: '#FEF3C7', color: '#78350F', borderRadius: '1rem', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <p className="text-sm" style={{ margin: 0 }}>No se pudo redactar este resumen con seguridad (la IA escribió cifras que no coinciden con tus datos y se descartó). Estas son las cifras reales del periodo:</p>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                <li className="text-sm">Ventas: {cop(d?.ventas?.total)} en {d?.ventas?.pedidos ?? 0} pedidos</li>
                <li className="text-sm">Frente al periodo anterior: {d?.comparacion?.periodo_anterior?.variacion_ventas_pct ?? 'sin dato'}%</li>
                <li className="text-sm">Gastos: {cop(d?.gastos?.total)}</li>
              </ul>
            </div>
          )}

          <button style={{ ...boton, background: 'transparent', border: '1px solid #9CA3AF', color: 'inherit' }} onClick={() => setDetalle(v => !v)}>{detalle ? 'Ocultar detalle' : 'Ver detalle: las cifras que lo respaldan'}</button>
          {detalle && <pre style={{ marginTop: '0.75rem', maxHeight: 320, overflow: 'auto', fontSize: '0.75rem', background: 'var(--bg, #E4E6EE)', borderRadius: '1rem', padding: '0.75rem' }}>{JSON.stringify(actual.datos, null, 2)}</pre>}
        </div>
      )}

      {historial.length > 1 && (
        <div style={{ marginTop: '1rem' }}>
          <h3 className="font-bold text-neo-dark" style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>Historial</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {historial.map(h => (
              <button key={h.id} onClick={() => setActual(h)} aria-pressed={actual?.id === h.id}
                style={{ ...boton, minHeight: '2.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8125rem', background: actual?.id === h.id ? 'var(--w-terra, #C2570C)' : 'var(--bg, #E4E6EE)', color: actual?.id === h.id ? '#fff' : 'inherit' }}>
                {h.tipo === 'mensual' ? 'Mes' : 'Semana'} · {rango(h)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
