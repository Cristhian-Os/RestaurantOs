/**
 * ResumenIA.tsx — "Resumen con IA" del Asistente de Negocio (Anexo I, 7). El reporte lo redacta la IA, pero TODAS las cifras las calculó
 * la base de datos y el servidor ya comprobó que el texto no trae cifras inventadas. Aquí solo se muestra, con su cifra y su fuente.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Tone } from '../ui/Badge'
import { ModuleHeader } from '../tasks/ModuleHeader'
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
const CONF: Record<Confianza, { t: string; tone: Tone }> = { seguro: { t: 'Seguro', tone: 'success' }, probable: { t: 'Probable', tone: 'warning' }, suposicion: { t: 'Suposición', tone: 'info' } }
const cop = (n: unknown) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('es-CO')}` : '—')
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const rango = (r: Reporte) => `${fecha(r.periodo_desde)} al ${fecha(r.periodo_hasta)}`

const caja: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', padding: '1.25rem', boxShadow: 'var(--w-shadow-sm)', fontFamily: 'var(--w-font)' }

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
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/></svg>}
        title="Resumen con IA"
        subtitle="Generado con inteligencia artificial a partir de tus cifras. Revísalo antes de decidir."
        actions={activa ? <>
          <Button disabled={generando !== null} loading={generando === 'semanal'} onClick={() => generar('semanal')}>
            {generando === 'semanal' ? 'Generando…' : 'Resumen de la semana pasada'}
          </Button>
          <Button variant="secondary" disabled={generando !== null} loading={generando === 'mensual'} onClick={() => generar('mensual')}>
            {generando === 'mensual' ? 'Generando…' : 'Resumen del mes pasado'}
          </Button>
        </> : undefined}
      />

      {!activa && <p className="text-sm text-[color:var(--w-text-2)]" style={{ margin: 0 }}>La IA todavía no está activa para tu restaurante. Cuando se active podrás generar aquí el resumen de la semana y del mes.</p>}
      {aviso && <p role="alert" className="text-sm" style={{ margin: '0 0 0.75rem', color: 'var(--w-danger-text)', fontWeight: 600 }}>{aviso}</p>}

      {actual && (
        <div>
          <p className="text-xs font-bold text-[color:var(--w-text-2)]" style={{ margin: '0 0 0.5rem' }}>
            {actual.tipo === 'mensual' ? 'Resumen mensual' : 'Resumen semanal'} · {rango(actual)}
          </p>

          {r ? (
            <>
              <p className="text-base text-[color:var(--w-text)]" style={{ margin: '0 0 1rem' }}>{r.resumen}</p>
              <h3 className="font-bold text-[color:var(--w-text)]" style={{ margin: '0 0 0.5rem' }}>Qué pasó</h3>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                {r.hallazgos.map((h, i) => (
                  <div key={i} style={{ background: 'var(--w-surface-sunken)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-md)', padding: '0.75rem 1rem' }}>
                    <p className="text-sm text-[color:var(--w-text)]" style={{ margin: 0 }}>{h.texto}</p>
                    <p className="text-xs text-[color:var(--w-text-2)]" style={{ margin: '0.25rem 0 0.5rem' }}><strong>{h.cifra}</strong> · dato: {h.fuente}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Button size="sm" className="min-h-[44px]" variant={votos[i] === true ? 'primary' : 'secondary'} aria-pressed={votos[i] === true} onClick={() => votar(i, true)}>👍 Me sirvió</Button>
                      <Button size="sm" className="min-h-[44px]" variant={votos[i] === false ? 'danger' : 'secondary'} aria-pressed={votos[i] === false} onClick={() => votar(i, false)}>👎 No me sirvió</Button>
                    </div>
                  </div>
                ))}
              </div>
              {r.acciones.length > 0 && (
                <>
                  <h3 className="font-bold text-[color:var(--w-text)]" style={{ margin: '0 0 0.25rem' }}>Qué podrías hacer</h3>
                  <p className="text-xs text-[color:var(--w-text-2)]" style={{ margin: '0 0 0.5rem' }}>Son sugerencias, no cifras. La decisión es tuya.</p>
                  <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
                    {r.acciones.map((a, i) => (
                      <li key={i} className="text-sm text-[color:var(--w-text)]">{a.texto} <Badge tone={CONF[a.confianza].tone}>{CONF[a.confianza].t}</Badge></li>
                    ))}
                  </ul>
                </>
              )}
              {r.datos_faltantes.length > 0 && (
                <div style={{ background: 'var(--w-warning-bg)', color: 'var(--w-warning-text)', borderRadius: 'var(--w-r-md)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <strong className="text-sm">Lo que no se pudo analizar por falta de datos</strong>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>{r.datos_faltantes.map((x, i) => <li key={i} className="text-sm">{x}</li>)}</ul>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: 'var(--w-warning-bg)', color: 'var(--w-warning-text)', borderRadius: 'var(--w-r-md)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <p className="text-sm" style={{ margin: 0 }}>No se pudo redactar este resumen con seguridad (la IA escribió cifras que no coinciden con tus datos y se descartó). Estas son las cifras reales del periodo:</p>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                <li className="text-sm">Ventas: {cop(d?.ventas?.total)} en {d?.ventas?.pedidos ?? 0} pedidos</li>
                <li className="text-sm">Frente al periodo anterior: {d?.comparacion?.periodo_anterior?.variacion_ventas_pct ?? 'sin dato'}%</li>
                <li className="text-sm">Gastos: {cop(d?.gastos?.total)}</li>
              </ul>
            </div>
          )}

          <Button variant="secondary" onClick={() => setDetalle(v => !v)}>{detalle ? 'Ocultar detalle' : 'Ver detalle: las cifras que lo respaldan'}</Button>
          {detalle && <pre style={{ marginTop: '0.75rem', maxHeight: 320, overflow: 'auto', fontSize: '0.75rem', background: 'var(--w-surface-sunken)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-md)', padding: '0.75rem' }}>{JSON.stringify(actual.datos, null, 2)}</pre>}
        </div>
      )}

      {historial.length > 1 && (
        <div style={{ marginTop: '1rem' }}>
          <h3 className="font-bold text-[color:var(--w-text)]" style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>Historial</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {historial.map(h => (
              <Button key={h.id} size="sm" className="min-h-[44px]" variant={actual?.id === h.id ? 'primary' : 'secondary'} onClick={() => setActual(h)} aria-pressed={actual?.id === h.id}>
                {h.tipo === 'mensual' ? 'Mes' : 'Semana'} · {rango(h)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
