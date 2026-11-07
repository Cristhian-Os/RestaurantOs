/**
 * ConfiguracionGuiada.tsx — "Configuración guiada" en el menú del administrador (Anexo D, 3.1).
 * Muestra cuántos pasos del asistente están hechos y cuáles quedaron pendientes; cada uno abre el asistente en ese paso.
 */
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { PASOS_ASISTENTE } from './SetupWizard'

export function ConfiguracionGuiada({ onAbrir }: { onAbrir: () => void }) {
  const [hecho, setHecho] = useState<Record<string, boolean> | null>(null)
  const [rid, setRid] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: id } = await supabase.rpc('current_restaurant_id')
      setRid((id as string) ?? null)
      const { data } = await supabase.from('restaurant_onboarding').select('steps_done').maybeSingle()
      const sd = (data?.steps_done ?? {}) as Record<string, boolean>
      // El avance guardado antes de agregar "Recetas" (sin la marca v2) se corre un paso desde el 6.
      const nuevo = sd.v2 === true
      setHecho(Object.fromEntries(Object.entries(sd).filter(([k]) => k !== 'v2').map(([k, v]) => [String(!nuevo && Number(k) >= 6 ? Number(k) + 1 : Number(k)), !!v])))
    })()
  }, [])

  const abrirEn = async (n: number) => {
    if (rid) {
      const { error } = await supabase.from('restaurant_onboarding').upsert({ restaurant_id: rid, current_step: n, steps_done: { ...(hecho ?? {}), v2: true }, updated_at: new Date().toISOString() })
      if (error) { message.error('No se pudo abrir el asistente: ' + error.message); return }
    }
    onAbrir()
  }

  if (hecho === null) return <p>Cargando…</p>
  const total = PASOS_ASISTENTE.length - 1            // el último paso ("Listo") es solo el resumen
  const hechos = PASOS_ASISTENTE.slice(0, total).filter((_, i) => hecho[String(i + 1)]).length
  const pct = Math.round((hechos / total) * 100)
  const svg = (d: React.ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>

  return (
    <div className="mx-auto w-full max-w-[1100px]" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={svg(<path d="M5 12l5 5L20 7" />)}
        title="Configuración guiada"
        subtitle={`${hechos} de ${total} pasos hechos. Toca uno para completarlo o repasarlo.`}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Pasos hechos" value={`${hechos} de ${total}`} icon={svg(<path d="M5 12l5 5L20 7" />)} tone="success" />
        <StatCard label="Avance" value={`${pct}%`} icon={svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)} />
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración"
        style={{ height: '0.5rem', borderRadius: '999px', background: 'var(--w-surface-sunken)', marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--w-accent)' }} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PASOS_ASISTENTE.slice(0, total).map((nombre, i) => {
          const ok = !!hecho[String(i + 1)]
          return (
            <button key={nombre} type="button" onClick={() => void abrirEn(i + 1)} className="w-press flex min-h-[88px] items-center gap-3 rounded-[var(--w-r-lg)] border bg-[var(--w-surface)] p-4 text-left"
              style={{ borderColor: ok ? 'var(--w-success)' : 'var(--w-border)', boxShadow: 'var(--w-shadow-sm)', color: 'var(--w-text)', fontFamily: 'inherit' }}>
              <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold [&>svg]:h-5 [&>svg]:w-5"
                style={{ background: ok ? 'var(--w-success-bg)' : 'var(--w-accent-soft)', color: ok ? 'var(--w-success-text)' : 'var(--w-accent-text)' }}>
                {ok ? svg(<path d="M5 12l5 5L20 7" />) : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[length:var(--w-fs-body)]">{nombre}</span>
                <span className="mt-1 inline-block rounded-[var(--w-r-pill)] px-2 py-0.5 text-[length:var(--w-fs-caption)] font-semibold"
                  style={{ background: ok ? 'var(--w-success-bg)' : 'var(--w-warning-bg)', color: ok ? 'var(--w-success-text)' : 'var(--w-warning-text)' }}>{ok ? 'Hecho' : 'Pendiente'}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Button size="lg" className="mt-5 w-full" onClick={onAbrir}>Abrir el asistente</Button>
    </div>
  )
}
