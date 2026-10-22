/**
 * EstacionImpresion.tsx — no dibuja nada: si ESTE equipo es la estación de impresión, enciende las comandas automáticas.
 * Los fallos salen como aviso fijo con "Reintentar" (el pedido nunca se bloquea por la impresora).
 */
import { useEffect } from 'react'
import message from 'antd/es/message'
import { iniciarEstacion } from '../../lib/print/comandas'
import { esEstacion } from '../../lib/print/config'

export function EstacionImpresion() {
  useEffect(() => {
    if (!esEstacion()) return
    return iniciarEstacion((texto, reintentar) => {
      const key = 'imp-' + texto
      message.error({
        key, duration: 0,
        content: <span>{texto} <button type="button" style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}
          onClick={() => { message.destroy(key); reintentar() }}>Reintentar</button></span>,
      })
    })
  }, [])
  return null
}
