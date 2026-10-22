/**
 * ConfiguracionGuiada.tsx — "Configuración guiada" en el menú del administrador (Anexo D, 3.1).
 * Muestra cuántos pasos del asistente están hechos y cuáles quedaron pendientes; cada uno abre el asistente en ese paso.
 */
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

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: '1rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Configuración guiada</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>{hechos} de {total} pasos hechos. Toca uno para completarlo o repasarlo.</p>
        <div style={{ height: '0.5rem', borderRadius: '999px', background: 'var(--w-line)', marginTop: '0.5rem', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((hechos / total) * 100)}%`, height: '100%', background: 'var(--w-terra)' }} />
        </div>
      </div>
      <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
        {PASOS_ASISTENTE.slice(0, total).map((nombre, i) => {
          const ok = !!hecho[String(i + 1)]
          return (
            <button key={nombre} onClick={() => void abrirEn(i + 1)} className="w-press"
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left', padding: '0.75rem 1rem', minHeight: '3rem', borderRadius: '0.85rem', border: `1px solid ${ok ? '#1D7A46' : 'var(--w-line)'}`, background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
              <span aria-hidden style={{ color: ok ? '#1D7A46' : 'var(--w-ink-mut)' }}>{ok ? '✔' : '○'}</span>
              <span style={{ flex: 1 }}>{i + 1}. {nombre}</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: ok ? '#1D7A46' : 'var(--w-terra)' }}>{ok ? 'Hecho' : 'Pendiente'}</span>
            </button>
          )
        })}
      </div>
      <button onClick={onAbrir} style={{ border: 'none', borderRadius: '0.75rem', padding: '0.8rem 1.2rem', minHeight: '2.75rem', fontWeight: 700, background: 'var(--w-terra)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Abrir el asistente</button>
    </div>
  )
}
