/**
 * RendimientoPanel.tsx — "Rendimiento" de vendedores y aliados (Anexo C, 7.6). SOLO PARA TI.
 * Sirve para ver quién vende y cuánto cuesta, no para presionar a nadie: no se muestra a los vendedores, no se usa para sancionar,
 * no hay metas ni bonos por posición. Solo datos reales: prospectos, estados y pagos confirmados (nada de horas ni asistencia).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Campo, botonPrimario, campo, cop, hoyBogotaISO, mesLargo, suave, tarjeta } from './platformUi'

interface Fila {
  id: string; nombre: string; codigo: string; tipo: string; activo: boolean; prospectos: number; demos: number; pruebas_activas: number
  cerrados_periodo: number; clientes_activos: number; ingreso_mensual_base: number; comision_periodo: number; comision_acumulada: number
  retencion_base: number; retencion_ok: number
}
interface Datos { desde: string; hasta: string; vendedores: Fila[]; serie: { mes: string; clientes_nuevos: number; comisiones: number }[] }

const ORDEN: Record<string, keyof Fila> = {
  'Comisión del periodo': 'comision_periodo', 'Comisión acumulada': 'comision_acumulada', 'Clientes activos': 'clientes_activos',
  'Clientes cerrados': 'cerrados_periodo', 'Ingreso mensual que trae': 'ingreso_mensual_base', 'Prospectos': 'prospectos',
}

function rango(p: string): { desde: string; hasta: string } {
  const hoy = hoyBogotaISO(); const [y, m] = hoy.split('-').map(Number)
  if (p === 'trimestre') { const q = Math.floor((m - 1) / 3) * 3 + 1; return { desde: `${y}-${String(q).padStart(2, '0')}-01`, hasta: hoy } }
  if (p === 'todo') return { desde: '2020-01-01', hasta: hoy }
  return { desde: `${y}-${String(m).padStart(2, '0')}-01`, hasta: hoy }
}

function Barras({ items, color }: { items: { etiqueta: string; valor: number; texto: string }[]; color: string }) {
  const max = Math.max(1, ...items.map(i => i.valor))
  return (
    <div style={{ display: 'grid', gap: '0.375rem' }}>
      {items.map(i => (
        <div key={i.etiqueta} style={{ display: 'grid', gridTemplateColumns: 'minmax(5rem, 9rem) 1fr auto', gap: '0.5rem', alignItems: 'center', fontSize: '0.8125rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.etiqueta}</span>
          <div style={{ background: 'var(--bg-surface, #CDD0DC)', borderRadius: '0.375rem', height: '0.875rem' }}>
            <div style={{ width: `${(i.valor / max) * 100}%`, minWidth: i.valor > 0 ? '2px' : 0, height: '100%', background: color, borderRadius: '0.375rem' }} />
          </div>
          <strong>{i.texto}</strong>
        </div>
      ))}
    </div>
  )
}

function Columnas({ serie, campo: k, color, formato }: { serie: Datos['serie']; campo: 'clientes_nuevos' | 'comisiones'; color: string; formato: (n: number) => string }) {
  const max = Math.max(1, ...serie.map(s => s[k]))
  return (
    <div role="img" style={{ display: 'flex', gap: '0.25rem', alignItems: 'flex-end', height: '8rem' }}>
      {serie.map(s => (
        <div key={s.mes} title={`${mesLargo(s.mes)}: ${formato(s[k])}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', fontSize: '0.625rem' }}>
          <span>{s[k] > 0 ? formato(s[k]) : ''}</span>
          <div style={{ width: '100%', height: `${Math.max(2, (s[k] / max) * 100)}%`, background: color, borderRadius: '0.25rem 0.25rem 0 0' }} />
          <span>{mesLargo(s.mes).slice(0, 3)}</span>
        </div>
      ))}
    </div>
  )
}

export function RendimientoPanel() {
  const [preset, setPreset] = useState('mes')
  const [orden, setOrden] = useState('Comisión del periodo')
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = rango(preset)
    const { data, error: e } = await supabase.rpc('plataforma_rendimiento', { p_desde: r.desde, p_hasta: r.hasta })
    if (e) { setError(e.message); return }
    setError(null); setD(data as Datos)
  }, [preset])
  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => {
    if (!d) return []
    const k = ORDEN[orden]
    return [...d.vendedores].sort((a, b) => Number(b[k]) - Number(a[k]) || a.nombre.localeCompare(b.nombre))
  }, [d, orden])

  const excel = async () => {
    if (!d) return
    const XLSX = await import('xlsx')
    const hoja = filas.map((f, i) => ({
      Posición: i + 1, Nombre: f.nombre, Código: f.codigo, Tipo: f.tipo, Prospectos: f.prospectos, Demos: f.demos, 'Pruebas activas': f.pruebas_activas,
      'Clientes cerrados en el periodo': f.cerrados_periodo, 'Clientes activos hoy': f.clientes_activos, 'Ingreso mensual (base sin IVA)': f.ingreso_mensual_base,
      'Comisión del periodo': f.comision_periodo, 'Comisión acumulada': f.comision_acumulada,
      'Retención al mes 3': f.retencion_base > 0 ? `${Math.round((f.retencion_ok / f.retencion_base) * 100)}% (${f.retencion_ok}/${f.retencion_base})` : 'sin datos',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja), 'Rendimiento')
    XLSX.writeFile(wb, `rendimiento_${d.desde}_a_${d.hasta}.xlsx`)
  }

  if (error) return <div style={{ ...tarjeta, color: 'var(--tag-red-text, #b91c1c)' }}>No se pudo cargar: {error}</div>
  if (!d) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Rendimiento</h2>
        <p style={{ ...suave, margin: '0.25rem 0 0' }}>Solo para ti. No se muestra a los vendedores ni se usa para sancionar: no hay metas obligatorias ni bonos por posición. Un ranking usado para presionar se parece a subordinación y pone en riesgo la independencia de la relación.</p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <Campo titulo="Periodo"><select style={{ ...campo, width: 'auto' }} value={preset} onChange={e => setPreset(e.target.value)}><option value="mes">Este mes</option><option value="trimestre">Este trimestre</option><option value="todo">Todo el tiempo</option></select></Campo>
        <Campo titulo="Ordenar por"><select style={{ ...campo, width: 'auto' }} value={orden} onChange={e => setOrden(e.target.value)}>{Object.keys(ORDEN).map(o => <option key={o}>{o}</option>)}</select></Campo>
        <button style={botonPrimario} disabled={filas.length === 0} onClick={excel}>Descargar Excel</button>
      </div>

      {filas.length === 0 && <div style={{ ...tarjeta, ...suave }}>Todavía no hay vendedores ni aliados.</div>}
      {filas.map((f, i) => (
        <div key={f.id} style={{ ...tarjeta, opacity: f.activo ? 1 : 0.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1.0625rem' }}>#{i + 1} {f.nombre} <span style={{ ...suave, fontFamily: 'monospace' }}>{f.codigo}{f.tipo === 'aliado' ? ' · aliado' : ''}{f.activo ? '' : ' · inactivo'}</span></strong>
            <strong>{cop(f.comision_periodo)} <span style={suave}>en el periodo</span></strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(7.5rem, 1fr))', gap: '0.5rem', marginTop: '0.625rem', fontSize: '0.8125rem' }}>
            <span>Prospectos<br /><strong>{f.prospectos}</strong></span>
            <span>Demos<br /><strong>{f.demos}</strong></span>
            <span>Pruebas activas<br /><strong>{f.pruebas_activas}</strong></span>
            <span>Cerrados<br /><strong>{f.cerrados_periodo}</strong></span>
            <span>Clientes activos<br /><strong>{f.clientes_activos}</strong></span>
            <span>Ingreso mensual<br /><strong>{cop(f.ingreso_mensual_base)}</strong></span>
            <span>Acumulado<br /><strong>{cop(f.comision_acumulada)}</strong></span>
            <span>Retención mes 3<br /><strong>{f.retencion_base > 0 ? `${Math.round((f.retencion_ok / f.retencion_base) * 100)}%` : 'sin datos'}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', height: '0.5rem', marginTop: '0.625rem' }} aria-label="Embudo: prospectos, demos, pruebas y cierres">
            {[f.prospectos, f.demos, f.pruebas_activas, f.cerrados_periodo].map((n, j) => (
              <div key={j} title={['Prospectos', 'Demos', 'Pruebas', 'Cerrados'][j]} style={{ flex: Math.max(n, 0.2), background: ['#9aa3c7', '#6f7bb8', '#d9a400', '#2e9e5b'][j], borderRadius: '0.25rem' }} />
            ))}
          </div>
        </div>
      ))}

      {filas.length > 0 && (
        <>
          <div style={tarjeta}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Comisión generada por vendedor (periodo)</h3>
            <Barras color="var(--w-terra, #C2570C)" items={filas.map(f => ({ etiqueta: f.nombre, valor: f.comision_periodo, texto: cop(f.comision_periodo) }))} />
          </div>
          <div style={tarjeta}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Clientes nuevos por mes (todo el equipo)</h3>
            <Columnas serie={d.serie} campo="clientes_nuevos" color="#2e9e5b" formato={n => String(n)} />
          </div>
          <div style={tarjeta}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Comisiones por mes (todo el equipo)</h3>
            <Columnas serie={d.serie} campo="comisiones" color="#6f7bb8" formato={n => cop(n)} />
          </div>
        </>
      )}
    </div>
  )
}
