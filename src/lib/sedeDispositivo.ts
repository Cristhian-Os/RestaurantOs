import { supabase } from '../services/supabaseClient'

/**
 * La sede activa es por sesión (por dispositivo). Para que cada aparato recuerde su última sede aunque se
 * cierre sesión, la guardamos también en el propio aparato (por usuario) y la recuperamos al abrir la app.
 * El servidor (cambiar_sede) vuelve a validar que la sede sea de la cuenta del usuario.
 */
const clave = (userId: string) => `ros_sede_${userId}`
const GUARDA_SESION = 'ros_sede_restaurada'

async function usuarioId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Cambia la sede de ESTE dispositivo y la recuerda. Devuelve el mensaje de error, o null si salió bien. */
export async function cambiarSede(sedeId: string): Promise<string | null> {
  const { error } = await supabase.rpc('cambiar_sede', { p_restaurant_id: sedeId })
  if (error) return error.message
  const uid = await usuarioId()
  if (uid) { try { localStorage.setItem(clave(uid), sedeId) } catch { /* sin almacenamiento: no se recuerda */ } }
  return null
}

/** Al abrir la app: si este dispositivo recuerda otra sede, vuelve a ella. Devuelve true si cambió (hay que recargar). */
export async function restaurarSede(): Promise<boolean> {
  const uid = await usuarioId()
  if (!uid) return false
  let guardada: string | null = null
  try { guardada = localStorage.getItem(clave(uid)) } catch { return false }
  if (!guardada) return false
  try { if (sessionStorage.getItem(GUARDA_SESION) === guardada) return false } catch { /* sigue */ }   // evita repetir la recarga
  const { data: actual } = await supabase.rpc('current_restaurant_id')
  if (actual === guardada) return false
  try { sessionStorage.setItem(GUARDA_SESION, guardada) } catch { /* sigue */ }
  const { error } = await supabase.rpc('cambiar_sede', { p_restaurant_id: guardada })
  if (error) {   // la sede ya no es de esta cuenta, o no se puede: se olvida
    try { localStorage.removeItem(clave(uid)) } catch { /* sigue */ }
    return false
  }
  return true
}
