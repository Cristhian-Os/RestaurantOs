/**
 * RestiPanel.tsx — panel de Resti, el asistente personal de Cristhian (botón flotante en todo Central).
 * Hoy responde en "Simulación local" (sin modelo de IA conectado); la conversación queda guardada como la de cualquier agente.
 */
import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { StatePanel } from '../../components/ui/StatePanel'
import { RestiSprite } from '../../components/resti/RestiSprite'
import { conversacionDirecta } from '../acciones.ts'
import { useCentral, useIndices } from '../datos.tsx'
import { AvisoHonesto, ErrorAccion } from '../ui.tsx'
import { Chat } from './Chat'

export function RestiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hacer } = useCentral()
  const { agente } = useIndices()
  const resti = agente('resti')
  const [conv, setConv] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !resti || conv) return
    let vivo = true
    void conversacionDirecta(resti).then(r => { if (!vivo) return; if ('error' in r) setError(r.error); else { setConv(r.id); void hacer(async () => null) } })
    return () => { vivo = false }
  }, [open, resti, conv]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title="Resti · asistente personal">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3"><RestiSprite estado="saludo" width={64} /><p className="m-0 text-[color:var(--w-text-2)]">Pregúntame por tareas, aprobaciones o restaurantes.</p></div>
        <AvisoHonesto tono="warning">Resti aún no tiene un modelo de IA conectado: responde en <b>simulación local</b>, con los datos reales de Central.</AvisoHonesto>
        {!resti ? <StatePanel kind="empty" title="Resti no está registrada" text="Falta el agente “resti” en el organigrama." />
          : error ? <ErrorAccion texto={error} />
          : conv ? <Chat conversacionId={conv} agente={resti} vacio="Salúdame para empezar." />
          : <StatePanel kind="loading" title="Abriendo la conversación…" />}
      </div>
    </Modal>
  )
}
