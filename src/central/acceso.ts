/**
 * acceso.ts — reglas de acceso a RestaurantOS Central, sin red ni React (se prueban con `node src/central/acceso.test.ts`).
 * La pantalla solo ORIENTA: decide qué mostrar. Quien protege los datos es la base
 * (central_autorizado() en políticas y funciones; ver supabase/migrations/20261114130000_central_acceso_auditoria.sql).
 */
export type Acceso = 'sin_sesion' | 'sin_permiso' | 'requiere_mfa' | 'permitido'

/** Lo que el navegador sabe del usuario. Sirve para elegir la pantalla, nunca para entregar datos. */
export function decidirAcceso(e: { haySesion: boolean; rol: string | null | undefined; aal: string | null | undefined }): Acceso {
  if (!e.haySesion) return 'sin_sesion'
  if (e.rol !== 'super_admin') return 'sin_permiso'
  if (e.aal !== 'aal2') return 'requiere_mfa'
  return 'permitido'
}

export type Verificacion = Acceso | 'no_disponible' | 'error'

/**
 * Respuesta de central_verificar_acceso() → estado. Cerrado por defecto:
 * todo lo que no sea un "sí" explícito del servidor es un "no".
 */
export function interpretarVerificacion(data: unknown, error: { code?: string; message?: string } | null | undefined): Verificacion {
  if (error) {
    // La función no existe en este servidor: Central todavía no está instalado ahí.
    if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '')) return 'no_disponible'
    if (error.code === '42501' || /permission denied/i.test(error.message ?? '')) return 'sin_permiso'
    return 'error'
  }
  if (!data || typeof data !== 'object') return 'no_disponible'
  const r = data as { permitido?: unknown; motivo?: unknown }
  if (r.permitido === true) return 'permitido'
  if (r.motivo === 'requiere_mfa') return 'requiere_mfa'
  if (r.motivo === 'sin_sesion') return 'sin_sesion'
  return 'sin_permiso'
}
