import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { formatCOP } from '../../config/billing'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StatePanel } from '../ui/StatePanel'
import { AgregarSede } from './AgregarSede'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'

interface Cifras {
  ventas_hoy: number; ventas_mes: number
  propinas_hoy: number; propinas_mes: number
  pedidos_hoy: number; pedidos_mes: number
  gastos_hoy: number; gastos_mes: number
  neto_hoy: number; neto_mes: number
  pedidos_en_curso: number; ingredientes_bajos: number
}
interface Corte { fecha: string; creado: string; total: number; neto: number | null; efectivo_esperado: number | null }
interface Sede extends Cifras { id: string; nombre: string; activa: boolean; actual: boolean; ultimo_corte: Corte | null }
interface Resumen { hoy: string; mes: string; sedes: Sede[]; total: Cifras }

type Periodo = 'hoy' | 'mes'
const REFRESCO_MS = 60_000

const chip = (on: boolean) =>
  `inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--w-r-pill)] border px-4 font-semibold transition-colors ${
    on
      ? 'border-[var(--w-accent)] bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]'
      : 'border-[var(--w-border-strong)] bg-[var(--w-surface)] text-[color:var(--w-text-2)] hover:bg-[var(--w-surface-sunken)]'
  }`

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

const hora = (d: Date) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

/**
 * Panel del dueño con varias sedes: ventas, pedidos, gastos y neto de todas juntas o de una sola,
 * más lo que pasa ahora (pedidos en curso, stock bajo) y el último corte de cada sede.
 * Los números salen de resumen_sedes() en el servidor, con las mismas reglas del corte de caja.
 */
export default function MisSedes() {
  const [datos, setDatos] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [sede, setSede] = useState<string>('todas')
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [entrando, setEntrando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('resumen_sedes')
    if (e || !data) { setError(e?.message ?? 'No se pudo cargar el resumen'); setCargando(false); return }
    setDatos(data as Resumen)
    setError(null)
    setActualizado(new Date())
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  async function entrar(id: string) {
    setEntrando(id)
    const { error: e } = await supabase.rpc('cambiar_sede', { p_restaurant_id: id })
    if (e) { setError(e.message); setEntrando(null); return }
    window.location.reload()   // todo el panel se recarga con la sede nueva
  }

  const encabezado = (
    <ModuleHeader
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6"/></svg>}
      title="Mis sedes"
      subtitle="Ventas, pedidos e inventario de todas tus sedes."
      actions={<>
        <AgregarSede />
        <Button variant="secondary" size="sm" onClick={() => { setCargando(true); cargar() }} loading={cargando && !!datos}>Actualizar</Button>
      </>}
    />
  )

  if (cargando && !datos) return <div className="space-y-4">{encabezado}<StatePanel kind="loading" /></div>
  if (error && !datos) {
    const sinPermiso = error.includes('dueño')
    return (
      <div className="space-y-4">
        {encabezado}
        {sinPermiso
          ? <StatePanel kind="empty" title="Tienes una sola sede" text="Toca “Agregar sede” para crear otra. Cuando tengas dos o más, aquí verás todas juntas y cada una por separado." />
          : <StatePanel kind="error" action={<Button variant="secondary" onClick={() => { setCargando(true); cargar() }}>Reintentar</Button>} />}
      </div>
    )
  }
  if (!datos || datos.sedes.length === 0) {
    return <div className="space-y-4">{encabezado}<StatePanel kind="empty" title="Sin sedes" text="Cuando tengas más de una sede, aquí verás todas juntas." /></div>
  }

  const elegida = datos.sedes.find(s => s.id === sede)
  const c: Cifras = elegida ?? datos.total
  const ventas = periodo === 'hoy' ? c.ventas_hoy : c.ventas_mes
  const pedidos = periodo === 'hoy' ? c.pedidos_hoy : c.pedidos_mes
  const gastos = periodo === 'hoy' ? c.gastos_hoy : c.gastos_mes
  const neto = periodo === 'hoy' ? c.neto_hoy : c.neto_mes
  const propinas = periodo === 'hoy' ? c.propinas_hoy : c.propinas_mes
  const cuando = periodo === 'hoy' ? 'hoy' : 'este mes'

  return (
    <div className="space-y-5" style={{ fontFamily: 'var(--w-font)' }}>
      {encabezado}

      {error && <p role="alert" className="text-[color:var(--w-danger-text)]">{error}</p>}

      <div role="group" aria-label="Sede" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" aria-pressed={sede === 'todas'} className={chip(sede === 'todas')} onClick={() => setSede('todas')}>Todas las sedes</button>
        {datos.sedes.map(s => (
          <button key={s.id} type="button" aria-pressed={sede === s.id} className={chip(sede === s.id)} onClick={() => setSede(s.id)}>{s.nombre}</button>
        ))}
      </div>

      <div role="group" aria-label="Periodo" className="flex gap-2">
        <button type="button" aria-pressed={periodo === 'hoy'} className={chip(periodo === 'hoy')} onClick={() => setPeriodo('hoy')}>Hoy</button>
        <button type="button" aria-pressed={periodo === 'mes'} className={chip(periodo === 'mes')} onClick={() => setPeriodo('mes')}>Este mes</button>
      </div>

      <section aria-label={`Resumen ${cuando}`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Ventas ${cuando}`} value={formatCOP(ventas)} />
        <StatCard label="Pedidos" value={pedidos} tone="info" />
        <StatCard label="Gastos" value={formatCOP(gastos)} tone="warning" />
        <StatCard label="Neto (ventas − gastos)" value={formatCOP(neto)} tone={neto >= 0 ? 'success' : 'danger'} />
      </section>
      <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
        Propinas {cuando}: {formatCOP(propinas)} (van aparte, no suman a las ventas). No incluye pedidos de Rappi.
      </p>

      <section aria-label="Ahora mismo" className="grid grid-cols-2 gap-3">
        <StatCard label="Pedidos en curso" value={c.pedidos_en_curso} tone={c.pedidos_en_curso > 0 ? 'warning' : 'success'} />
        <StatCard label="Ingredientes con stock bajo" value={c.ingredientes_bajos} tone={c.ingredientes_bajos > 0 ? 'danger' : 'success'} />
      </section>

      {elegida ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-[length:var(--w-fs-title)] text-[color:var(--w-text)]">{elegida.nombre}</h2>
            {elegida.actual && <Badge tone="accent">Estás aquí</Badge>}
            {!elegida.activa && <Badge tone="neutral">Inactiva</Badge>}
          </div>
          {elegida.ultimo_corte ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[length:var(--w-fs-body)]">
              <dt className="col-span-2 font-semibold text-[color:var(--w-text-2)]">Último corte de caja · {fechaCorta(elegida.ultimo_corte.fecha)}</dt>
              <dt className="text-[color:var(--w-text-2)]">Ventas del corte</dt>
              <dd className="text-right font-semibold text-[color:var(--w-text)]">{formatCOP(Number(elegida.ultimo_corte.total))}</dd>
              {elegida.ultimo_corte.neto != null && (<>
                <dt className="text-[color:var(--w-text-2)]">Neto</dt>
                <dd className="text-right font-semibold text-[color:var(--w-text)]">{formatCOP(Number(elegida.ultimo_corte.neto))}</dd>
              </>)}
              {elegida.ultimo_corte.efectivo_esperado != null && (<>
                <dt className="text-[color:var(--w-text-2)]">Efectivo esperado en el cajón</dt>
                <dd className="text-right font-semibold text-[color:var(--w-text)]">{formatCOP(Number(elegida.ultimo_corte.efectivo_esperado))}</dd>
              </>)}
            </dl>
          ) : (
            <p className="text-[color:var(--w-text-2)]">Esta sede todavía no ha hecho ningún corte de caja.</p>
          )}
          {!elegida.actual && (
            <Button variant="secondary" onClick={() => entrar(elegida.id)} loading={entrando === elegida.id}>Entrar a esta sede</Button>
          )}
        </Card>
      ) : (
        <section aria-label="Por sede" className="space-y-3">
          <h2 className="font-bold text-[length:var(--w-fs-title)] text-[color:var(--w-text)]">Por sede</h2>
          {datos.sedes.map(s => (
            <Card key={s.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-[color:var(--w-text)]">{s.nombre}</h3>
                <div className="flex flex-wrap gap-2">
                  {s.actual && <Badge tone="accent">Estás aquí</Badge>}
                  {!s.activa && <Badge tone="neutral">Inactiva</Badge>}
                  {s.ingredientes_bajos > 0 && <Badge tone="danger">{s.ingredientes_bajos} con stock bajo</Badge>}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div><dt className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Ventas {cuando}</dt>
                  <dd className="font-bold text-[color:var(--w-text)]">{formatCOP(periodo === 'hoy' ? s.ventas_hoy : s.ventas_mes)}</dd></div>
                <div><dt className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Pedidos</dt>
                  <dd className="font-bold text-[color:var(--w-text)]">{periodo === 'hoy' ? s.pedidos_hoy : s.pedidos_mes}</dd></div>
                <div><dt className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">En curso</dt>
                  <dd className="font-bold text-[color:var(--w-text)]">{s.pedidos_en_curso}</dd></div>
              </dl>
              <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                {s.ultimo_corte
                  ? `Último corte: ${fechaCorta(s.ultimo_corte.fecha)} · ${formatCOP(Number(s.ultimo_corte.total))}`
                  : 'Sin cortes de caja todavía'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSede(s.id)}>Ver detalle</Button>
                {!s.actual && <Button variant="ghost" size="sm" onClick={() => entrar(s.id)} loading={entrando === s.id}>Entrar a esta sede</Button>}
              </div>
            </Card>
          ))}
        </section>
      )}

      {actualizado && (
        <p className="text-center text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
          Actualizado a las {hora(actualizado)} · se refresca solo cada minuto
        </p>
      )}
    </div>
  )
}
