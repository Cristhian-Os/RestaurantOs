// Claves VAPID de la plataforma, guardadas en `platform_secrets` (solo accesible con la
// service role; RLS activo y sin políticas). La privada nunca sale de la base: ni el
// repo, ni el cliente, ni nadie que despliegue la función la ve.
//
// Se guarda UNA sola fila (`vapid_keys`) con el par completo en JSON. Así, si dos
// solicitudes llegan a la vez la primera vez, solo una fila gana y el par nunca queda
// mezclado (pública de una + privada de otra).

export interface VapidKeys { publicKey: string; privateKey: string }

/** Lo que `loadOrCreateVapid` necesita de la base; se inyecta para poder probarlo sin red. */
export interface VapidStore {
  /** Valor guardado, o null si no existe. */
  read(): Promise<string | null>
  /** Inserta solo si todavía no hay valor (ON CONFLICT DO NOTHING). */
  insertIfAbsent(value: string): Promise<void>
}

export const VAPID_ROW_KEY = 'vapid_keys'

export function parseVapid(raw: string | null | undefined): VapidKeys | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    if (typeof o?.publicKey === 'string' && o.publicKey.length > 20 && typeof o?.privateKey === 'string' && o.privateKey.length > 20) {
      return { publicKey: o.publicKey, privateKey: o.privateKey }
    }
  } catch { /* JSON dañado: se trata como inexistente */ }
  return null
}

/**
 * Devuelve el par guardado; si no hay, genera uno y lo guarda. Si dos instancias generan
 * a la vez, ambas terminan usando el que quedó guardado (se vuelve a leer tras insertar).
 */
export async function loadOrCreateVapid(store: VapidStore, generate: () => VapidKeys): Promise<VapidKeys> {
  const existing = parseVapid(await store.read())
  if (existing) return existing

  await store.insertIfAbsent(JSON.stringify(generate()))
  const stored = parseVapid(await store.read())
  if (!stored) throw new Error('No se pudo guardar la clave VAPID')
  return stored
}
