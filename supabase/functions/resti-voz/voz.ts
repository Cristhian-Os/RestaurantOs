// Lógica pura de resti-voz (sin red ni Deno): validación de la petición y construcción/lectura de las llamadas a Gemini.
// La voz es lo ÚNICO que sigue en Gemini: oír (transcribir) y hablar (TTS). El razonamiento de Resti va por el adaptador de texto (DeepSeek).

// Modelos en orden de preferencia: si uno falla (404 "ya no disponible", 429 cupo, 5xx) se prueba el siguiente.
// Probados con una clave real el 2026-10-22: gemini-2.5-flash YA NO existe para claves nuevas (404).
export const MODELOS_STT_POR_DEFECTO = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']
export const MODELOS_TTS_POR_DEFECTO = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview']
/** Valor de platform_secrets (modelos separados por coma) → lista; si no hay, los de por defecto. */
export const listaModelos = (valor: string | undefined, porDefecto: string[]) => {
  const l = String(valor ?? '').split(',').map(x => x.trim()).filter(x => /^[a-z0-9.\-]{3,80}$/i.test(x))
  return l.length ? l : porDefecto
}
/** ¿Vale la pena probar otro modelo? (no disponible, cupo agotado o fallo del servicio) */
export const esReintentable = (status: number) => [404, 429, 500, 502, 503, 504].includes(status)
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
    generationConfig: { temperature: 0, maxOutputTokens: 300 },
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
    // Solo el texto: con una instrucción de tono delante ("Dilo con un tono cálido…") el modelo LA LEE EN VOZ ALTA (comprobado transcribiendo el audio).
    contents: [{ parts: [{ text: texto }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
  }
}

const aBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const aB64 = (b: Uint8Array) => { let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin) }

/** Si el audio viene en un contenedor WAV (gemini-3.8-flash-tts), devuelve el PCM crudo y la frecuencia de su cabecera. */
export function pcmDeWav(b64: string): { pcm: string; rate: number } | null {
  const b = aBytes(b64), v = new DataView(b.buffer)
  if (b.length < 44 || String.fromCharCode(...b.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...b.subarray(8, 12)) !== 'WAVE') return null
  let rate = 24000, o = 12
  while (o + 8 <= b.length) {
    const id = String.fromCharCode(...b.subarray(o, o + 4)), tam = v.getUint32(o + 4, true)
    if (id === 'fmt ') rate = v.getUint32(o + 12, true)
    if (id === 'data') {
      const ini = o + 8, fin = tam === 0 || tam === 0xffffffff || ini + tam > b.length ? b.length : ini + tam   // cabeceras de "streaming" traen tamaño 0 o máximo
      return { pcm: aB64(b.subarray(ini, fin - ((fin - ini) % 2))), rate: rate >= 8000 && rate <= 48000 ? rate : 24000 }
    }
    o += 8 + tam + (tam % 2)
  }
  return null
}

/** Audio de Gemini → PCM de 16 bits en base64 y su frecuencia. Acepta PCM crudo (audio/L16;rate=24000) y contenedor WAV. */
export function leerAudio(data: unknown): { pcm: string; rate: number } | null {
  const partes = ((data as any)?.candidates?.[0]?.content?.parts ?? []) as { inlineData?: { data?: string; mimeType?: string } }[]
  const p = partes.find(x => x.inlineData?.data)?.inlineData
  if (!p?.data) return null
  if (/wav|wave/i.test(p.mimeType ?? '') || p.data.startsWith('UklGR')) return pcmDeWav(p.data)
  const rate = Number(/rate=(\d+)/.exec(p.mimeType ?? '')?.[1] ?? 24000)
  return { pcm: p.data, rate: rate >= 8000 && rate <= 48000 ? rate : 24000 }
}
