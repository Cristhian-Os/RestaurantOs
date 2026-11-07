import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Alert from 'antd/es/alert'
import message from 'antd/es/message'
import { useBusinessMetrics } from '../hooks/useBusinessMetrics'
import { Tabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { StatePanel } from '../components/ui/StatePanel'
import { ModuleHeader, StatCard } from '../components/tasks/ModuleHeader'
import { ResumenIA } from '../components/analytics/ResumenIA'
import { analyticsService, UMBRALES_INICIALES, type Cuadrante, type Umbrales } from '../services/analyticsService'

const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

const CUADRANTE: Record<Cuadrante, { titulo: string; texto: string }> = {
  star:          { titulo: 'ESTRELLA', texto: 'Se vende mucho y deja buen margen. Promociónalo y cuida su calidad.' },
  cash_cow:      { titulo: 'VACA LECHERA', texto: 'Se vende poco pero deja buen margen. Mantén el precio.' },
  question_mark: { titulo: 'INTERROGANTE', texto: 'Se vende mucho pero deja poco margen. Revisa su precio o su costo.' },
  dog:           { titulo: 'PERRO', texto: 'Se vende poco y deja poco margen. Evalúa si vale la pena dejarlo en la carta.' },
  sin_receta:    { titulo: 'SIN RECETA', texto: 'No se puede calcular su margen porque no tiene receta cargada.' },
}

function Cargando({ q, children }: { q: { isLoading: boolean; error: unknown }; children: React.ReactNode }) {
  if (q.isLoading) return <StatePanel kind="loading" />
  if (q.error) return <StatePanel kind="error" text={q.error instanceof Error ? q.error.message : String(q.error)} />
  return <>{children}</>
}

export default function BusinessAssistant() {
  const m = useBusinessMetrics()
  const qc = useQueryClient()
  const [umbrales, setUmbrales] = useState<Umbrales>(UMBRALES_INICIALES)
  const [guardando, setGuardando] = useState(false)
  const [seccion, setSeccion] = useState<'menu' | 'costos' | 'revisar' | 'demanda'>('menu')

  useEffect(() => { void analyticsService.cargarUmbrales().then(setUmbrales) }, [])

  const guardar = async () => {
    setGuardando(true)
    const err = await analyticsService.guardarUmbrales(umbrales)
    setGuardando(false)
    if (err) { message.error('No se pudo guardar: ' + err); return }
    message.success('Umbrales guardados')
    void qc.invalidateQueries({ queryKey: ['analytics'] })
  }
  const campo = (k: keyof Umbrales, etiqueta: string) => (
    <label className="text-[length:var(--w-fs-caption)] font-semibold text-[color:var(--w-text-2)] flex flex-col gap-1">
      {etiqueta}
      <input type="number" inputMode="numeric" value={umbrales[k]} onChange={e => setUmbrales(u => ({ ...u, [k]: Number(e.target.value) }))}
        className="rounded-[var(--w-r-md)] px-3 py-2 bg-[var(--w-surface)] text-[color:var(--w-text)] border border-[var(--w-border-strong)] w-full" style={{ minHeight: 44 }} />
    </label>
  )

  const menu = m.menu.data
  return (
    <div className="min-h-screen bg-[var(--w-bg)] px-4 py-5 sm:p-8" style={{ fontFamily: 'var(--w-font)' }}>
      <div className="max-w-6xl mx-auto">
        <ModuleHeader
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>}
          title="Asistente de Negocio"
          subtitle="Cifras reales de tu restaurante, calculadas por el sistema. Nada aquí es una suposición."
        />

        <ResumenIA />

        <div className="mb-6 max-w-full overflow-x-auto">
          <Tabs label="Secciones" value={seccion} onChange={setSeccion} items={[
            { key: 'menu', label: 'Menú', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10"/></svg> },
            { key: 'costos', label: 'Costos', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
            { key: 'revisar', label: 'Revisar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg> },
            { key: 'demanda', label: 'Demanda', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg> },
          ]} />
        </div>

        {/* Rentabilidad del menú */}
        {seccion === 'menu' && (<section className="mb-8">
          <h2 className="text-[length:var(--w-fs-title)] font-bold text-[color:var(--w-text)] mb-1">Rentabilidad del menú (últimos 30 días)</h2>
          <Cargando q={m.menu}>
            {menu && menu.platos.length === 0 && <Alert type="info" message="Todavía no hay ventas completadas en los últimos 30 días." />}
            {menu && menu.platos.length > 0 && (
              <>
                {menu.sin_receta > 0 && (
                  <Alert className="mb-4" type="warning" showIcon
                    message={`${menu.sin_receta} de ${menu.platos.length} platos vendidos no tienen receta`}
                    description="Sin receta no se puede calcular su margen, así que no entran en la clasificación. Cárgalas en la Configuración guiada (paso Recetas)." />
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 mb-4">
                  <StatCard label="Platos vendidos" value={menu.platos.length} tone="accent" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10"/></svg>} />
                  <StatCard label="Estrellas" value={menu.platos.filter(p => p.cuadrante === 'star').length} tone="success" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>} />
                  <StatCard label="Sin receta" value={menu.sin_receta} tone="warning" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {menu.platos.map(p => (
                    <Card key={p.dish_id}>
                      <h3 className="font-bold text-[color:var(--w-text)] mb-2">{p.nombre}</h3>
                      <div className="text-sm text-[color:var(--w-text-2)] mb-3">
                        <div>Precio: {cop(p.precio)}</div>
                        <div>Margen: {p.margen_pct == null ? 'sin receta' : `${p.margen_pct}%`}</div>
                        <div>Vendidos: {p.unidades} unidades · {cop(p.ingresos)}</div>
                        {p.costo_incompleto && <div className="text-[color:var(--w-warning-text)]">Algún ingrediente no tiene costo: el margen real es menor.</div>}
                      </div>
                      <div className="p-3 bg-[var(--w-accent-soft)] rounded-[var(--w-r-md)]">
                        <p className="text-xs font-bold text-[color:var(--w-accent-text)] mb-1">{CUADRANTE[p.cuadrante].titulo}</p>
                        <p className="text-xs text-[color:var(--w-text-2)]">{CUADRANTE[p.cuadrante].texto}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </Cargando>
        </section>)}

        {/* Food cost */}
        {seccion === 'costos' && (<section className="mb-8">
          <h2 className="text-[length:var(--w-fs-title)] font-bold text-[color:var(--w-text)] mb-4">Alertas de costo de ingredientes</h2>
          <Cargando q={m.foodCost}>
            {m.foodCost.data && m.foodCost.data.platos_con_receta === 0 && (
              <Alert type="info" message="Ningún plato tiene receta cargada" description="Con recetas el sistema calcula cuánto cuesta cada plato y te avisa si el margen queda bajo." />
            )}
            {m.foodCost.data && m.foodCost.data.platos_con_receta > 0 && m.foodCost.data.alertas.length === 0 && (
              <Alert type="success" message={`Los ${m.foodCost.data.platos_con_receta} platos con receta tienen margen de ${m.foodCost.data.margen_minimo}% o más`}
                description={m.foodCost.data.platos_con_receta < m.foodCost.data.platos_total ? `Faltan recetas en ${m.foodCost.data.platos_total - m.foodCost.data.platos_con_receta} platos.` : undefined} />
            )}
            <div className="space-y-3">
              {m.foodCost.data?.alertas.map(a => (
                <Alert key={a.dish_id} type={a.critico ? 'error' : 'warning'} message={a.nombre}
                  description={`Cuesta ${cop(a.costo_receta)} y se vende a ${cop(a.precio)}: margen ${a.margen_pct}% (tu mínimo es ${m.foodCost.data!.margen_minimo}%). Para llegar al mínimo tendría que costar ${cop(a.precio_sugerido)}.${a.costo_incompleto ? ' Ojo: algún ingrediente no tiene costo.' : ''}`} />
              ))}
            </div>
          </Cargando>
        </section>)}

        {/* Alertas para revisar */}
        {seccion === 'revisar' && (<section className="mb-8">
          <h2 className="text-[length:var(--w-fs-title)] font-bold text-[color:var(--w-text)] mb-1">Para revisar</h2>
          <p className="text-sm text-[color:var(--w-text-2)] mb-4">Son avisos para mirar con calma, no acusaciones: puede haber una razón normal.</p>
          <Cargando q={m.revision}>
            {m.revision.data && m.revision.data.alertas.length === 0 && <Alert type="success" message="Nada para revisar en los últimos 7 días" />}
            <div className="space-y-3">
              {m.revision.data?.alertas.map((a, i) => a.regla === 'anulaciones_por_persona' ? (
                <Alert key={i} type="warning" message={`Anulaciones de ${a.persona}`}
                  description={`${a.anulados} de ${a.pedidos} pedidos que tomó se anularon (${a.porcentaje}%). Tu límite es ${m.revision.data!.umbral_pct}%.`} />
              ) : (
                <Alert key={i} type="warning" message="Más anulaciones de lo normal en las últimas 24 horas"
                  description={`${a.anulados} anulados, cuando el promedio diario de las últimas 4 semanas es ${a.promedio_diario}.`} />
              ))}
            </div>
          </Cargando>
          <div className="mt-4 p-4 bg-[var(--w-surface)] rounded-[var(--w-r-lg)] border border-[var(--w-border)] shadow-[var(--w-shadow-sm)] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            {campo('anulacion_pct_max', 'Avisar si una persona anula más de (%)')}
            {campo('min_pedidos', 'Solo si tomó al menos (pedidos)')}
            {campo('food_cost_margen_min', 'Margen mínimo esperado por plato (%)')}
            <button onClick={guardar} disabled={guardando} className="rounded-[var(--w-r-md)] font-semibold text-[color:var(--w-on-accent)] bg-[var(--w-accent)] hover:bg-[var(--w-accent-hover)] px-4" style={{ minHeight: 44, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </section>)}

        {/* Demanda */}
        {seccion === 'demanda' && (<section className="mb-8">
          <h2 className="text-[length:var(--w-fs-title)] font-bold text-[color:var(--w-text)] mb-4">Pedidos promedio por día de la semana</h2>
          <Cargando q={m.demanda}>
            {m.demanda.data && !m.demanda.data.suficiente && <Alert type="info" message={m.demanda.data.mensaje} description={`Llevas ${m.demanda.data.dias_de_historial} días de historial.`} />}
            {m.demanda.data?.suficiente && (
              <>
                <p className="text-xs text-[color:var(--w-text-2)] mb-3">Promedio real de pedidos completados entre {m.demanda.data.desde} y {m.demanda.data.hasta}.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  {m.demanda.data.dias.map(d => (
                    <Card key={d.dow}>
                      <h3 className="font-bold text-[color:var(--w-text)] mb-1">{d.nombre}</h3>
                      <div className="text-sm text-[color:var(--w-text-2)]">{d.promedio_pedidos} pedidos</div>
                      <div className="text-xs text-[color:var(--w-text-2)]">en {d.dias_observados} {d.nombre.toLowerCase()}s</div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </Cargando>
        </section>)}
      </div>
    </div>
  )
}
