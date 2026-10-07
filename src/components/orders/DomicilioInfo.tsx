/**
 * DomicilioInfo.tsx
 * ─────────────────────────────────────────────────────────────
 * Teléfono y dirección de un pedido a domicilio, para caja y para el resumen
 * del pedido. El teléfono llama con un toque y la dirección abre el mapa.
 * No pinta nada si el pedido no es DOMICILIO o no trae datos (pedidos viejos).
 * El margen lo pone quien lo usa (className).
 */
import { cn } from '../../lib/cn'
import { formatTelefono, soloDigitos } from '../../lib/domicilio'

interface DomicilioInfoProps {
  order: {
    tipo_pedido?:      string | null
    customer_phone?:   string | null
    delivery_address?: string | null
  }
  className?: string
}

export function DomicilioInfo({ order, className }: DomicilioInfoProps) {
  if (order.tipo_pedido !== 'DOMICILIO') return null
  const phone   = order.customer_phone?.trim()
  const address = order.delivery_address?.trim()
  if (!phone && !address) return null

  return (
    <div className={cn('space-y-0.5 text-xs text-[#2D3561]', className)}>
      {phone && (
        <p className="m-0">
          <span className="font-bold text-[#9CA3AF]">Tel </span>
          <a href={`tel:${soloDigitos(phone)}`} className="font-bold underline decoration-dotted">
            {formatTelefono(phone)}
          </a>
        </p>
      )}
      {address && (
        <p className="m-0">
          <span className="font-bold text-[#9CA3AF]">Dir </span>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
            target="_blank" rel="noopener noreferrer"
            className="font-bold underline decoration-dotted"
          >
            {address}
          </a>
        </p>
      )}
    </div>
  )
}
