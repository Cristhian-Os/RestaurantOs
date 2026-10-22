/**
 * storageUrl.ts
 * Evidencias de tareas: el bucket `task-evidence` es PRIVADO, así que las fotos se ven con
 * una URL firmada temporal. En la base puede haber dos formatos:
 *  - nuevo: el path del objeto (`<userId>/<taskId>/<ts>.jpg`)
 *  - antiguo: la URL pública completa `.../object/public/task-evidence/<path>`
 * `evidenciaUrlFirmada` acepta ambos.
 */
import { supabase } from '../services/supabaseClient'

const BUCKET = 'task-evidence'
const EXPIRA_SEG = 3600

/** Extrae el path del objeto desde un path o desde una URL (pública o firmada) del bucket. */
export function pathEvidencia(valor: string): string {
  const m = valor.match(/\/object\/(?:public|sign|authenticated)\/task-evidence\/([^?#]+)/)
  const raw = m ? m[1] : valor.split(/[?#]/)[0].replace(/^\/+/, '')
  try { return decodeURIComponent(raw) } catch { return raw }
}

// Caché en memoria para no firmar la misma foto en cada render (se renueva antes de que venza)
const cache = new Map<string, { url: string; vence: number }>()

/** URL firmada (1 hora) de una evidencia; null si no se pudo firmar. */
export async function evidenciaUrlFirmada(valor: string | null | undefined): Promise<string | null> {
  if (!valor) return null
  const path = pathEvidencia(valor)
  const hit = cache.get(path)
  if (hit && hit.vence > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRA_SEG)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, vence: Date.now() + (EXPIRA_SEG - 300) * 1000 })
  return data.signedUrl
}
