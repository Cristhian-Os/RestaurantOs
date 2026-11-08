/**
 * whatsappCredencialesService.ts
 * Llaves de WhatsApp (Meta) del dueño de la plataforma. Solo se ESCRIBEN: la base nunca las devuelve,
 * solo dice si están cargadas y desde cuándo. Todas las funciones exigen rol super_admin.
 */
import { supabase } from './supabaseClient'

export interface EstadoPlataforma { tiene_app_secret: boolean; tiene_verify_token: boolean; tiene_access_token: boolean; actualizado_at: string | null }
export interface EstadoRestaurante { tiene_token: boolean; usa_plataforma: boolean; actualizado_at: string | null }

function traducir(msg: string): string {
  if (/permission|not allowed|super_admin|forbidden|42501/i.test(msg)) return 'No tienes permiso para esto.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión. Revisa internet e inténtalo de nuevo.'
  return 'No se pudo completar la acción. Inténtalo de nuevo.'
}

async function llamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(traducir(error.message))
  return data as T
}

export const whatsappCredencialesService = {
  estadoPlataforma: () => llamar<EstadoPlataforma>('wa_plataforma_estado'),

  /** Texto vacío = conservar el valor actual. */
  async guardarPlataforma(appSecret: string, verifyToken: string, accessToken: string): Promise<void> {
    await llamar<void>('wa_plataforma_guardar', {
      p_app_secret: appSecret.trim() || null,
      p_verify_token: verifyToken.trim() || null,
      p_access_token: accessToken.trim() || null,
    })
  },

  estadoRestaurante: (restaurantId: string) => llamar<EstadoRestaurante>('wa_credenciales_estado', { p_restaurant_id: restaurantId }),

  async guardarToken(restaurantId: string, token: string): Promise<void> {
    await llamar<void>('wa_credenciales_guardar', { p_restaurant_id: restaurantId, p_access_token: token.trim() })
  },

  async borrarToken(restaurantId: string): Promise<void> {
    await llamar<void>('wa_credenciales_borrar', { p_restaurant_id: restaurantId })
  },
}
