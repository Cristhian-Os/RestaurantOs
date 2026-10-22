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
