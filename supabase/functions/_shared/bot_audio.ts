// Notas de voz del cliente → texto, reutilizando el mismo "oído" de Resti (resti-voz/voz.ts, siempre Gemini).
// Lo transcrito es DATO del cliente: entra al cerebro como un mensaje más, nunca como instrucciones.
import { MODELOS_STT_POR_DEFECTO, esReintentable, leerTranscripcion, pedidoTranscribir } from '../resti-voz/voz.ts'

export const MAX_AUDIO_BYTES = 1_300_000   // ~1 min de nota de voz de WhatsApp (ogg/opus); el límite de resti-voz en base64 es 1,8 MB

const aB64 = (b: Uint8Array) => { let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin) }

/** Devuelve la transcripción, o '' si no se oyó voz, o null si el servicio falló (el cerebro pide que lo escriba). */
export function crearTranscriptor(clave: string, f: typeof fetch, modelos: string[] = MODELOS_STT_POR_DEFECTO) {
  return async (bytes: Uint8Array, mime: string): Promise<string | null> => {
    if (!clave || bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) return null
    const tipo = mime.split(';')[0].trim().toLowerCase()
    if (!/^audio\/[a-z0-9.+-]+$/.test(tipo)) return null
    const pedido = pedidoTranscribir(aB64(bytes))
    pedido.contents[0].parts[1] = { inlineData: { mimeType: tipo, data: (pedido.contents[0].parts[1] as any).inlineData.data } } as any   // pedidoTranscribir asume WAV: aquí es ogg/opus
    for (const modelo of modelos) {
      try {
        const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: JSON.stringify(pedido), signal: AbortSignal.timeout(10_000),
        })
        if (r.ok) return leerTranscripcion(await r.json())
        if (!esReintentable(r.status)) return null
      } catch { /* tiempo agotado o red: se prueba el siguiente modelo */ }
    }
    return null
  }
}
