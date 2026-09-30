/**
 * voiceService.ts
 * Graba con el micrófono, convierte a WAV 16 kHz mono (formato que Gemini acepta
 * sin importar el navegador: Chrome graba webm, Safari mp4) y lo manda a la
 * función `voice-parse`, que devuelve transcripción + datos estructurados.
 */
import { supabase } from './supabaseClient'

export type VoiceKind = 'transcribe' | 'menu' | 'topping' | 'recipe' | 'ingredient' | 'purchase' | 'task'

export const MAX_RECORD_SECONDS = 90
const TARGET_RATE = 16000

export interface Recorder {
  /** Detiene y devuelve el audio WAV en base64. */
  stop: () => Promise<string>
  cancel: () => void
}

export async function startRecording(): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Este dispositivo no permite grabar audio desde la app.')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new Error('No se pudo usar el micrófono. Permite el acceso al micrófono en tu navegador.')
  }
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const release = () => stream.getTracks().forEach(t => t.stop())
  try { rec.start() } catch { release(); throw new Error('No se pudo iniciar la grabación.') }

  return {
    cancel: () => { if (rec.state !== 'inactive') rec.stop(); release() },
    stop: () => new Promise<string>((resolve, reject) => {
      rec.onstop = async () => {
        release()
        try { resolve(await toWavBase64(new Blob(chunks, { type: rec.mimeType }))) } catch (e) { reject(e) }
      }
      rec.stop()
    }),
  }
}

async function toWavBase64(blob: Blob): Promise<string> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()) } finally { void ctx.close() }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE))
  const off = new OfflineAudioContext(1, length, TARGET_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const pcm = (await off.startRendering()).getChannelData(0)

  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)

  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Manda el audio a `voice-parse`. Lanza Error con un mensaje en español. */
export async function parseVoice<T = Record<string, unknown>>(
  kind: VoiceKind, audio: string, context: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('voice-parse', { body: { kind, audio, mime: 'audio/wav', context } })
  if (error) {
    let msg = 'No se pudo procesar el audio. Intenta de nuevo.'
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* sin cuerpo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data.result as T
}
