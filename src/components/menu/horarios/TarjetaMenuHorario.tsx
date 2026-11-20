import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../../services/supabaseClient'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Toggle } from '../../ui/Toggle'

interface Props {
  /** Abre la pantalla "Menús por horario" (crear, editar y programar los menús). */
  onAbrir: () => void
}

/**
 * Tarjeta del panel Menú: enciende o apaga "Menús por horario" en la sede y lleva a sus pantallas.
 * Con el interruptor apagado el menú se ve completo, como siempre.
 */
export function TarjetaMenuHorario({ onAbrir }: Props) {
  const [rid, setRid] = useState<string | null>(null)
  const [activo, setActivo] = useState<boolean | null>(null)
  const [cantidad, setCantidad] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [vacio, setVacio] = useState<{ total: number } | null>(null)

  const leer = useCallback(async (id: string) => {
    const [cfg, n] = await Promise.all([
      supabase.from('restaurant_config').select('menus_horario_activo').eq('restaurant_id', id).maybeSingle(),
      supabase.from('menus_horario').select('id', { count: 'exact', head: true }),
    ])
    setActivo(cfg.data?.menus_horario_activo === true)
    setCantidad(n.count ?? 0)
  }, [])

  useEffect(() => {
    let cancelado = false
    supabase.rpc('current_restaurant_id').then(({ data }) => {
      const id = typeof data === 'string' ? data : null
      if (cancelado || !id) return
      setRid(id)
      void leer(id)
    })
    return () => { cancelado = true }
  }, [leer])

  const cambiar = async (valor: boolean, confirmar = false) => {
    setOcupado(true)
    const { data, error } = await supabase.rpc('menu_horario_interruptor', { p_activo: valor, p_confirmar_vacio: confirmar })
    setOcupado(false)
    if (error) { message.error(error.message); return }
    const r = data as { ok: boolean; motivo?: string; platos_total?: number }
    if (!r.ok && r.motivo === 'menu_vacio') { setVacio({ total: r.platos_total ?? 0 }); return }
    message.success(valor ? 'Menús por horario encendidos' : 'Menús por horario apagados: el menú se ve completo')
    if (rid) void leer(rid)
  }

  if (activo === null) return null
  const sinMenus = cantidad === 0

  return (
    <section aria-label="Menús por horario" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.875rem',
      padding: '1rem 1.125rem', borderRadius: 'var(--w-r-lg)', border: '1px solid var(--w-border)',
      background: activo ? 'var(--w-surface)' : 'var(--w-accent-soft)', fontFamily: 'var(--w-font)',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 16rem' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '1.0625rem', color: 'var(--w-text)' }}>
          Menús por horario: {activo ? 'encendidos' : 'apagados'}
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-text-2)' }}>
          {activo
            ? 'El menú cambia solo según la hora (desayuno, almuerzo, noche…).'
            : sinMenus
              ? 'Crea tus menús por horario y luego enciéndelos. Mientras estén apagados, el menú se ve completo.'
              : 'Tienes menús listos. Enciéndelos para que el menú cambie solo según la hora.'}
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
        <Button variant="secondary" onClick={onAbrir}>{sinMenus ? 'Crear menús por horario' : 'Gestionar menús por horario'}</Button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--w-text)' }}>
          {activo ? 'Encendido' : 'Apagado'}
          <Toggle checked={activo} onChange={v => void cambiar(v)} label="Encender menús por horario" disabled={ocupado || (!activo && sinMenus)} />
        </span>
      </div>
      {!activo && sinMenus && (
        <p style={{ width: '100%', margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>
          Para encenderlo primero crea al menos un menú.
        </p>
      )}

      <Modal open={!!vacio} onClose={() => setVacio(null)} title="El menú de clientes quedaría vacío"
        footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={() => setVacio(null)}>No encender</Button>
          <Button onClick={() => { setVacio(null); void cambiar(true, true) }}>Encender igual</Button>
        </div>}>
        <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--w-text-2)' }}>
          Ahora mismo ningún producto está en un menú vigente ni es “todo el día” (de {vacio?.total ?? 0} productos). Los clientes verían el menú sin productos hasta que empiece una franja.
        </p>
      </Modal>
    </section>
  )
}
