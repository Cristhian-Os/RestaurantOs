/**
 * PlatformIA.tsx — pestaña "Uso de IA" del panel de plataforma: cuánto gasta cada restaurante este mes, el tope global
 * y el interruptor para encender o apagar la IA de un restaurante (apagada por defecto). Todo exige ser dueño con 2 pasos.
 */
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'

interface Fila { restaurant_id: string; nombre: string; ia_activa: boolean; llamadas: number; tokens_entrada: number; tokens_salida: number; costo_usd: number; ultimo_uso: string | null }
interface Consumo { mes: string; gasto_usd: number; tope_usd: number; uso_pct: number | null; alerta: boolean; restaurantes: Fila[] }

const usd = (n: number) => `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const th: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary, #6B7280)' }
const td: React.CSSProperties = { padding: '0.6rem', fontSize: '0.875rem', borderTop: '1px solid var(--w-line, #CDD0DC)' }

export function PlatformIA() {
  const [c, setC] = useState<Consumo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mes, setMes] = useState<string>('')   // 'YYYY-MM'; vacío = mes actual

  const cargar = useCallback(() => {
    supabase.rpc('plataforma_ai_consumo', { p_mes: mes ? `${mes}-01` : null })
      .then(({ data, error: e }) => { if (e) setError(e.message); else { setError(null); setC(data as Consumo) } })
  }, [mes])
  useEffect(() => { cargar() }, [cargar])

  const cambiar = async (f: Fila) => {
    const motivo = window.prompt(`${f.ia_activa ? 'Apagar' : 'Encender'} la IA de ${f.nombre}. Escribe el motivo (queda en el registro):`)
    if (!motivo?.trim()) return
    const { error: e } = await supabase.rpc('plataforma_ai_activar', { p_restaurant: f.restaurant_id, p_activa: !f.ia_activa, p_motivo: motivo.trim() })
    if (e) message.error(e.message); else { message.success(f.ia_activa ? 'IA apagada' : 'IA encendida'); cargar() }
  }

  if (error) return <p role="alert" style={{ color: '#B0341D', fontWeight: 600 }}>{error}</p>
  if (!c) return <p>Cargando…</p>
  const pct = Math.min(c.uso_pct ?? 0, 100)
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ background: 'var(--bg-surface, #D8DAE4)', borderRadius: '1.25rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.0625rem' }}>Uso de IA · {c.mes}</strong>
          <input type="month" aria-label="Mes" value={mes || c.mes} onChange={e => setMes(e.target.value)} style={{ padding: '0.4rem', borderRadius: '0.5rem', minHeight: 40 }} />
        </div>
        <p style={{ margin: '0.5rem 0' }}>Gastado: <strong>{usd(c.gasto_usd)}</strong> de un tope de {usd(c.tope_usd)} ({c.uso_pct ?? 0}%)</p>
        <div aria-hidden style={{ height: 10, borderRadius: 999, background: '#CDD0DC', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: c.alerta ? '#B0341D' : '#047857' }} />
        </div>
        {c.alerta && <p role="alert" style={{ margin: '0.5rem 0 0', color: '#B0341D', fontWeight: 700 }}>Ya pasaste el nivel de alerta del tope. Al llegar al 100% no se generan más reportes este mes.</p>}
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary, #6B7280)' }}>Costo estimado con los precios por millón de tokens guardados en Condiciones generales. Hoy se mide el consumo de los reportes con IA; el chat y la voz todavía no se contabilizan aquí.</p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr><th style={th}>Restaurante</th><th style={th}>IA</th><th style={th}>Llamadas</th><th style={th}>Tokens (entrada / salida)</th><th style={th}>Costo</th><th style={th}>Último uso</th></tr></thead>
          <tbody>
            {c.restaurantes.map(f => (
              <tr key={f.restaurant_id}>
                <td style={td}>{f.nombre}</td>
                <td style={td}>
                  <button onClick={() => cambiar(f)} aria-pressed={f.ia_activa} style={{ border: 'none', cursor: 'pointer', fontWeight: 700, borderRadius: 999, padding: '0.35rem 0.9rem', minHeight: 36, background: f.ia_activa ? '#047857' : '#9CA3AF', color: '#fff' }}>
                    {f.ia_activa ? 'Encendida' : 'Apagada'}
                  </button>
                </td>
                <td style={td}>{f.llamadas}</td>
                <td style={td}>{f.tokens_entrada.toLocaleString('es-CO')} / {f.tokens_salida.toLocaleString('es-CO')}</td>
                <td style={td}><strong>{usd(f.costo_usd)}</strong></td>
                <td style={td}>{f.ultimo_uso ? new Date(f.ultimo_uso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
