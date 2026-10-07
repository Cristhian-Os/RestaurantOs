/**
 * DomicilioForm.tsx
 * ─────────────────────────────────────────────────────────────
 * Teléfono y dirección de entrega de un pedido a domicilio, tomado desde el
 * local por caja o mesero. El nombre del cliente lo pide OrderFlow (es el mismo
 * campo de todos los pedidos). Las reglas están en lib/domicilio.ts.
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import {
  ADDRESS_MAX_CHARS, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS, direccionValida, limpiarTelefono, telefonoValido,
} from '../../lib/domicilio'

const FIELD =
  'w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none ' +
  'placeholder-[#9CA3AF] focus-visible:ring-2 focus-visible:ring-[#FF5722]/40'
const FIELD_INVALID = 'ring-2 ring-red-400'
const NEO_IN = { boxShadow: 'var(--shadow-in)' } as const

// ─── Piezas ──────────────────────────────────────────────────
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">
      {children}
    </label>
  )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} role="alert" className="mt-2 text-xs font-bold text-red-500">{children}</p>
}

export const DomicilioInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, style, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD, className)} style={{ ...NEO_IN, ...style }} {...props} />
  ),
)
DomicilioInput.displayName = 'DomicilioInput'

export const DomicilioTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, ...props }, ref) => (
    <textarea ref={ref} className={cn(FIELD, 'resize-none', className)} style={{ ...NEO_IN, ...style }} {...props} />
  ),
)
DomicilioTextarea.displayName = 'DomicilioTextarea'

// ─── Formulario ──────────────────────────────────────────────
interface DomicilioFormProps {
  phone:            string
  address:          string
  onPhoneChange:    (value: string) => void
  onAddressChange:  (value: string) => void
  /** Marca en rojo lo que falta; se activa al intentar continuar con datos incompletos. */
  showErrors?:      boolean
}

export function DomicilioForm({ phone, address, onPhoneChange, onAddressChange, showErrors = false }: DomicilioFormProps) {
  const phoneBad   = showErrors && !telefonoValido(phone)
  const addressBad = showErrors && !direccionValida(address)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="mt-5 space-y-5">
        <div>
          <FieldLabel htmlFor="domicilio-telefono">Teléfono del cliente (obligatorio)</FieldLabel>
          <DomicilioInput
            id="domicilio-telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            // Solo lo que se escribe en un teléfono; el servidor guarda únicamente los dígitos
            onChange={e => onPhoneChange(limpiarTelefono(e.target.value))}
            placeholder="Ej: 300 123 4567"
            maxLength={20}
            aria-invalid={phoneBad}
            aria-describedby={phoneBad ? 'domicilio-telefono-error' : undefined}
            className={cn(phoneBad && FIELD_INVALID)}
          />
          {phoneBad && (
            <FieldError id="domicilio-telefono-error">
              El teléfono debe tener entre {PHONE_MIN_DIGITS} y {PHONE_MAX_DIGITS} dígitos
            </FieldError>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="domicilio-direccion">Dirección de entrega (obligatoria)</FieldLabel>
          <DomicilioTextarea
            id="domicilio-direccion"
            autoComplete="street-address"
            value={address}
            onChange={e => onAddressChange(e.target.value)}
            placeholder="Ej: Cra 14 # 20-30, barrio Centro, casa azul"
            maxLength={ADDRESS_MAX_CHARS}
            rows={2}
            aria-invalid={addressBad}
            aria-describedby={addressBad ? 'domicilio-direccion-error' : undefined}
            className={cn(addressBad && FIELD_INVALID)}
          />
          {addressBad && <FieldError id="domicilio-direccion-error">Escribe la dirección de entrega</FieldError>}
        </div>
      </div>
    </motion.div>
  )
}
