// Datos de un pedido a domicilio (teléfono y dirección de entrega).
//
// La base valida lo mismo (crear_orden_domicilio y los CHECK de orders); aquí
// solo se adelanta el mensaje para que quien toma el pedido lo corrija antes
// de enviarlo. Si cambias un límite, cámbialo también en
// supabase/migrations/20261007183000_domicilio_telefono_direccion.sql.

export const PHONE_MIN_DIGITS = 7
export const PHONE_MAX_DIGITS = 15
export const ADDRESS_MIN_CHARS = 5
export const ADDRESS_MAX_CHARS = 300

export const soloDigitos = (s: string) => s.replace(/\D/g, '')

/** Deja solo lo que se escribe en un teléfono: dígitos, espacios, + - ( ). */
export const limpiarTelefono = (s: string) => s.replace(/[^\d\s()+-]/g, '')

export interface DatosDomicilio {
  phone:   string
  address: string
}

export const telefonoValido = (phone: string) => {
  const n = soloDigitos(phone).length
  return n >= PHONE_MIN_DIGITS && n <= PHONE_MAX_DIGITS
}

export const direccionValida = (address: string) => address.trim().length >= ADDRESS_MIN_CHARS

/** Mensaje de lo que falta o está mal; null si los datos son válidos. */
export function validarDomicilio({ phone, address }: DatosDomicilio): string | null {
  if (!telefonoValido(phone)) {
    return `El teléfono debe tener entre ${PHONE_MIN_DIGITS} y ${PHONE_MAX_DIGITS} dígitos`
  }
  if (!direccionValida(address)) return 'Escribe la dirección de entrega'
  return null
}

/** 3001234567 → "300 123 4567". Cualquier otro largo se deja como llegó. */
export function formatTelefono(phone: string | null | undefined): string {
  const d = soloDigitos(phone ?? '')
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : (phone ?? '')
}
