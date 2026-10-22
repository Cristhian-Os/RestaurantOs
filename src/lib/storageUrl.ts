import { supabase } from '../services/supabaseClient'

const BUCKET = 'task-evidence'
const TTL = 3600
const cache = new Map<string, { url: string; exp: number }>()

/** Extrae la ruta dentro del bucket desde un path o desde la URL pública vieja. */
export function evidenciaPath(valorOPath: string | null | undefined): string | null {
  if (!valorOPath) return null
  const v = valorOPath.trim()
  if (!v) return null
  const m = v.match(/\/object\/(?:public|sign|authenticated)\/task-evidence\/([^?#]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { return m[1] } }
  if (/^https?:\/\//i.test(v)) return null
  return v.replace(/^\/+/, '')
}

/** URL firmada (1 h) de una evidencia; acepta el path o la URL pública antigua. */
export async function evidenciaUrlFirmada(valorOPath: string | null | undefined): Promise<string | null> {
  const path = evidenciaPath(valorOPath)
  if (!path) return null
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, exp: Date.now() + (TTL - 300) * 1000 })
  return data.signedUrl
}
