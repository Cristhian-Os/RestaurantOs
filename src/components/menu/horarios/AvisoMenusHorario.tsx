import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../services/supabaseClient'
import { Button } from '../../ui/Button'

interface Props {
  /** Abre la pantalla "Menús por horario" (donde está el interruptor grande). */
  onAbrir: () => void
}

/**
 * Aviso visible en las pantallas del administrador: dice si los menús por horario están encendidos
 * y lleva a la pantalla donde se encienden. Así no hay que buscarlos en "Más".
 */
export function AvisoMenusHorario({ onAbrir }: Props) {
  const [activo, setActivo] = useState<boolean | null>(null)
  const [cantidad, setCantidad] = useState(0)

  const leer = useCallback(async () => {
    const r = await supabase.rpc('current_restaurant_id')
    const rid = typeof r.data === 'string' ? r.data : null
    if (!rid) return
    const [cfg, n] = await Promise.all([
      supabase.from('restaurant_config').select('menus_horario_activo').eq('restaurant_id', rid).maybeSingle(),
      supabase.from('menus_horario').select('id', { count: 'exact', head: true }),
    ])
    setActivo(cfg.data?.menus_horario_activo === true)
    setCantidad(n.count ?? 0)
  }, [])

  useEffect(() => {
    void leer()
    const alVolver = () => { if (document.visibilityState === 'visible') void leer() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [leer])

  if (activo === null) return null

  const encendido = activo
  return (
    <section
      aria-label="Menús por horario"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
        padding: '0.875rem 1rem', marginBottom: '1rem', borderRadius: 'var(--w-r-lg)',
        background: encendido ? 'var(--w-surface)' : 'var(--w-accent-soft)',
        border: '1px solid var(--w-border)', fontFamily: 'var(--w-font)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, color: 'var(--w-text)' }}>
          Menús por horario: {encendido ? 'encendidos' : 'apagados'}
        </p>
        <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--w-text-2)' }}>
          {encendido
            ? 'Los clientes ven el menú de cada hora (desayuno, almuerzo, noche…).'
            : cantidad === 0
              ? 'Crea tus menús (desayuno, almuerzo, noche…) y enciéndelos cuando estén listos.'
              : 'Tienes menús listos. Enciéndelos para que el menú cambie solo según la hora.'}
        </p>
      </div>
      <Button size="sm" variant={encendido ? 'secondary' : 'primary'} onClick={onAbrir}>
        {encendido ? 'Ver menús por horario' : cantidad === 0 ? 'Crear menús por horario' : 'Encender menús por horario'}
      </Button>
    </section>
  )
}
