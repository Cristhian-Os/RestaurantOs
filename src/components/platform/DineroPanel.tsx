/**
 * DineroPanel.tsx — "Dinero" (Anexo C, 6.5): ingresos de suscripciones sin IVA, clientes pagando, pruebas por convertir,
 * cancelaciones y lo que se debe a vendedores. Las cifras las calcula el servidor.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { cop, mesLargo, suave, tarjeta } from './platformUi'

interface Dinero {
  ingresos_mes_base: number; iva_mes: number; pagos_mes: number; mrr_base: number; clientes_pagando: number
  pruebas_por_convertir: number; cancelaciones_mes: number; comisiones_por_pagar: number; liquidaciones_por_pagar: number
  serie: { mes: string; ingresos_base: number; pagos: number }[]
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div style={tarjeta}>
      <div style={{ ...suave, fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.125rem 0' }}>{valor}</div>
      {nota && <div style={suave}>{nota}</div>}
    </div>
  )
}

export function DineroPanel() {
  const [d, setD] = useState<Dinero | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('plataforma_dinero').then(({ data, error: e }) => { if (e) setError(e.message); else setD(data as Dinero) })
  }, [])
  if (error) return <div style={{ ...tarjeta, color: 'var(--tag-red-text, #b91c1c)' }}>No se pudo cargar: {error}</div>
  if (!d) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
  const max = Math.max(1, ...d.serie.map(s => s.ingresos_base))

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Dinero</h2>
        <p style={{ ...suave, margin: '0.25rem 0 0' }}>Ingresos de suscripciones sin IVA (el IVA va a la DIAN y no es tuyo). Solo cuentan pagos aprobados.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: '0.75rem' }}>
        <Cifra titulo="Ingreso mensual recurrente" valor={cop(d.mrr_base)} nota={`${d.clientes_pagando} cliente(s) pagando (últimos 35 días)`} />
        <Cifra titulo="Pagos de este mes (sin IVA)" valor={cop(d.ingresos_mes_base)} nota={`${d.pagos_mes} pago(s) · IVA recaudado ${cop(d.iva_mes)}`} />
        <Cifra titulo="Pruebas por convertir" valor={String(d.pruebas_por_convertir)} nota="Restaurantes activos en prospecto, demo o prueba" />
        <Cifra titulo="Cancelaciones del mes" valor={String(d.cancelaciones_mes)} />
        <Cifra titulo="Comisiones por pagar" valor={cop(d.comisiones_por_pagar)} nota="Pendientes y aprobadas sin pagar" />
        <Cifra titulo="Liquidaciones por pagar" valor={cop(d.liquidaciones_por_pagar)} nota="En revisión o aprobadas" />
      </div>
      <div style={tarjeta}>
        <h3 style={{ margin: '0 0 0.75rem' }}>Ingresos de los últimos 6 meses (sin IVA)</h3>
        <div role="img" aria-label="Ingresos por mes" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '10rem' }}>
          {d.serie.map(s => (
            <div key={s.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', fontSize: '0.6875rem' }}>
              <span>{s.ingresos_base > 0 ? cop(s.ingresos_base) : ''}</span>
              <div style={{ width: '100%', maxWidth: '3rem', height: `${Math.max(2, (s.ingresos_base / max) * 100)}%`, background: 'var(--w-terra, #C2570C)', borderRadius: '0.375rem 0.375rem 0 0' }} />
              <span style={{ marginTop: '0.25rem' }}>{mesLargo(s.mes).split(' ')[0].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
