// Lógica pura de resti-voz (sin red ni Deno): validación de la petición y construcción/lectura de las llamadas a Gemini.
// La voz es lo ÚNICO que sigue en Gemini: oír (transcribir) y hablar (TTS). El razonamiento de Resti va por el adaptador de texto (DeepSeek).

export const MODELO_STT_POR_DEFECTO = 'gemini-2.5-flash'
export const MODELO_TTS_POR_DEFECTO = 'gemini-2.5-flash-preview-tts'
export const VOZ_POR_DEFECTO = 'Kore'
/** ~35 s de WAV 16 kHz mono 16 bits en base64. Una frase de conversación dura mucho menos. */
export const MAX_AUDIO_B64 = 1_800_000
export const MAX_TEXTO = 400

export type Peticion =
  | { accion: 'estado' }
  | { accion: 'transcribir'; audio: string }
  | { accion: 'hablar'; texto: string }

// eslint-disable-next-line no-control-regex
const limpiar = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Valida el cuerpo que manda el navegador. Devuelve null si no es una petición válida (nunca se llama a Gemini con datos dudosos). */
export function validarPeticion(body: unknown): Peticion | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.accion === 'estado') return { accion: 'estado' }
  if (b.accion === 'transcribir') {
    const audio = typeof b.audio === 'string' ? b.audio : ''
    if (audio.length < 200 || audio.length > MAX_AUDIO_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) return null
    // Solo WAV: lo que graba el navegador (RIFF....WAVE). "UklGR" es "RIFF" en base64.
    if (!audio.startsWith('UklGR')) return null
    return { accion: 'transcribir', audio }
  }
  if (b.accion === 'hablar') {
    const texto = limpiar(b.texto, MAX_TEXTO)
    return texto.length >= 1 ? { accion: 'hablar', texto } : null
  }
  return null
}

const INSTRUCCION_STT = 'Transcribe literalmente lo que dice la persona en el audio, en español de Colombia. Es el administrador de un restaurante: ' +
  'puede mencionar platos, ingredientes, precios, mesas y pedidos. Devuelve SOLO el texto dicho, sin comillas ni comentarios. ' +
  'Si no hay voz clara o solo hay ruido, devuelve exactamente: [silencio]'

export function pedidoTranscribir(audioB64: string) {
  return {
    contents: [{ role: 'user', parts: [{ text: INSTRUCCION_STT }, { inlineData: { mimeType: 'audio/wav', data: audioB64 } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
  }
}

/** Texto transcrito, o '' si no hubo voz. Lo que dijo la persona es DATO: nunca instrucciones para el sistema. */
export function leerTranscripcion(data: unknown): string {
  const partes = ((data as any)?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]
  const t = limpiar(partes.map(p => p.text ?? '').join(' '), 300).replace(/^["“«]+|["”»]+$/g, '').trim()
  return !t || /^\[?\s*silencio\s*\]?\.?$/i.test(t) ? '' : t
}

export function pedidoHablar(texto: string, voz: string) {
  return {
    contents: [{ parts: [{ text: `Dilo con un tono cálido, natural y cercano, en español de Colombia: ${texto}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
  }
}

/** PCM de 16 bits en base64 y su frecuencia de muestreo (Gemini devuelve p. ej. audio/L16;codec=pcm;rate=24000). */
export function leerAudio(data: unknown): { pcm: string; rate: number } | null {
  const partes = ((data as any)?.candidates?.[0]?.content?.parts ?? []) as { inlineData?: { data?: string; mimeType?: string } }[]
  const p = partes.find(x => x.inlineData?.data)?.inlineData
  if (!p?.data) return null
  const rate = Number(/rate=(\d+)/.exec(p.mimeType ?? '')?.[1] ?? 24000)
  return { pcm: p.data, rate: rate >= 8000 && rate <= 48000 ? rate : 24000 }
}
