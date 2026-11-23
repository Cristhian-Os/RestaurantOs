import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/cn'

/** Motivos predefinidos para cancelar un pedido (auditoría antifraude). "Otro" obliga a escribir el motivo. */
export const MOTIVOS_CANCELACION = [
  'El cliente se arrepintió',
  'Error al tomar el pedido',
  'Pedido duplicado',
  'Producto agotado',
  'El cliente se fue sin pagar',
  'Demora en la preparación',
] as const
const OTRO = 'Otro'

/**
 * Pide el motivo antes de cancelar un pedido. Uso:
 *   const { pedirMotivo, modal } = usePedirMotivoCancelacion()
 *   const motivo = await pedirMotivo('¿Cancelar este pedido?'); if (!motivo) return
 *   ... rpc('cancelar_orden', { p_order_id, p_motivo: motivo }) ...
 *   y poner {modal} en el JSX del componente.
 * Devuelve el texto del motivo, o null si la persona se arrepiente y cierra el cuadro.
 */
export function usePedirMotivoCancelacion() {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [opcion, setOpcion] = useState<string | null>(null)
  const [detalle, setDetalle] = useState('')
  const resolver = useRef<((motivo: string | null) => void) | null>(null)

  const pedirMotivo = useCallback((pregunta: string) => new Promise<string | null>(resolve => {
    resolver.current?.(null)   // si había otro cuadro abierto, ese no cancela nada
    resolver.current = resolve
    setTitulo(pregunta); setOpcion(null); setDetalle(''); setAbierto(true)
  }), [])

  const cerrar = useCallback((motivo: string | null) => {
    resolver.current?.(motivo)
    resolver.current = null
    setAbierto(false)
  }, [])

  // Si el componente se desmonta con el cuadro abierto, no queda nada esperando.
  useEffect(() => () => { resolver.current?.(null); resolver.current = null }, [])

  const nota = detalle.trim()
  const valido = opcion !== null && (opcion !== OTRO || nota.length >= 3)
  const motivo = opcion === null ? '' : opcion === OTRO ? nota : [opcion, nota].filter(Boolean).join(': ')

  const modal = (
    <Modal
      open={abierto}
      onClose={() => cerrar(null)}
      title="Cancelar pedido"
      footer={<>
        <Button variant="secondary" onClick={() => cerrar(null)}>No cancelar</Button>
        <Button variant="danger" disabled={!valido} onClick={() => cerrar(motivo)}>Sí, cancelar pedido</Button>
      </>}
    >
      <p className="mb-3 text-[length:var(--w-fs-body)] text-[color:var(--w-text-2)]">{titulo}</p>
      <p className="mb-2 text-[length:var(--w-fs-label)] font-semibold">¿Por qué se cancela?</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[...MOTIVOS_CANCELACION, OTRO].map(m => (
          <button
            key={m}
            type="button"
            aria-pressed={opcion === m}
            onClick={() => setOpcion(m)}
            className={cn(
              'min-h-[44px] rounded-[var(--w-r-md)] border px-3 py-2 text-left text-[length:var(--w-fs-body)] font-semibold',
              opcion === m
                ? 'border-[var(--w-accent)] bg-[var(--w-surface-sunken)] text-[color:var(--w-text)]'
                : 'border-[var(--w-border-strong)] bg-[var(--w-surface)] text-[color:var(--w-text-2)]',
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-[length:var(--w-fs-label)] font-semibold" htmlFor="motivo-cancelacion-detalle">
        {opcion === OTRO ? 'Escribe el motivo (obligatorio)' : 'Detalle (opcional)'}
      </label>
      <textarea
        id="motivo-cancelacion-detalle"
        value={detalle}
        onChange={e => setDetalle(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder="Ej: la mesa 4 pidió por error dos helados"
        className="mt-1 w-full rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3 py-2 text-[length:var(--w-fs-body)] text-[color:var(--w-text)]"
      />
    </Modal>
  )

  return { pedirMotivo, modal }
}
