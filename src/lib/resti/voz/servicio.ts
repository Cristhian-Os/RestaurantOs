/** Cliente de la función resti-voz: Gemini transcribe lo que dice la persona y convierte la respuesta de Resti en audio. */
import { supabase } from '../../../services/supabaseClient'

/** ¿Está disponible la voz del servidor (clave de Gemini configurada y sesión de administrador)? */
export async function vozDelServidorDisponible(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('resti-voz', { body: { accion: 'estado' } })
    return !error && !!data?.stt && !!data?.tts
  } catch { return false }
}

export async function transcribirAudio(wavBase64: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('resti-voz', { body: { accion: 'transcribir', audio: wavBase64 } })
  if (error || typeof data?.texto !== 'string') throw new Error('transcripcion')
  return data.texto
}

export async function sintetizarVoz(texto: string): Promise<{ pcm: string; rate: number }> {
  const { data, error } = await supabase.functions.invoke('resti-voz', { body: { accion: 'hablar', texto } })
  if (error || typeof data?.pcm !== 'string') throw new Error('voz')
  return { pcm: data.pcm, rate: Number(data.rate) || 24000 }
}

/**
 * Voz en streaming: pide el audio y lo entrega a medida que llega (el primer sonido sale ~1 s después, sin esperar a que se genere todo).
 * Se usa fetch directo porque `functions.invoke` espera la respuesta completa. Lanza error si no hay sesión o el servidor no puede hablar.
 */
export interface FlujoVoz { rate: number; leer(): Promise<{ done: boolean; value?: Uint8Array }>; cancelar(): void }
export async function abrirVozEnFlujo(texto: string): Promise<FlujoVoz> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('sin-sesion')
  const env = (import.meta as any).env
  const ctl = new AbortController()
  const resp = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/resti-voz`, {
    method: 'POST', signal: ctl.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ accion: 'hablar_stream', texto }),
  })
  if (!resp.ok || !resp.body) throw new Error('voz')
  const lector = resp.body.getReader()
  const rate = Number(resp.headers.get('X-Audio-Rate'))
  return { rate: rate >= 8000 && rate <= 48000 ? rate : 24000, leer: () => lector.read(), cancelar: () => { try { ctl.abort() } catch { /* ya terminó */ } } }
}
